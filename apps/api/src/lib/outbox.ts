import type postgres from "postgres";
import type { ApiConfig } from "../config.js";
import {
  caseNumber,
  digestBytes,
  purgeCdnPaths,
  type ArtifactStore,
} from "./artifacts.js";
import { reportEvent } from "./monitoring.js";
import { renderOgCardSvg, renderStoryCardSvg } from "./share-cards.js";

export type Sql = ReturnType<typeof postgres>;

const BOROUGHS = [
  "manhattan",
  "brooklyn",
  "queens",
  "bronx",
  "staten_island",
] as const;

const BOROUGH_LABEL: Record<string, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "Bronx",
  staten_island: "Staten Island",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Needs attention",
  fix_pending: "Reported fixed",
  resolved: "Verified fixed",
  hidden: "Hidden",
  duplicate: "Duplicate",
};

export type OutboxDeps = {
  sql: Sql;
  artifacts: ArtifactStore;
  config: ApiConfig;
  publicApiBaseUrl: string;
};

/**
 * Claim and process pending outbox rows (projection / share-card / purge).
 * Analysis topics from M2 are acknowledged as no-ops so the queue drains.
 */
export async function processOutboxOnce(
  deps: OutboxDeps,
  limit = 25,
): Promise<{ processed: number; errors: number }> {
  const claimed = await deps.sql<{
    id: string;
    topic: string;
    payload: Record<string, unknown>;
    attempts: number;
  }[]>`
    WITH next AS (
      SELECT id
      FROM public.outbox
      WHERE state = 'pending'
        AND next_run_at <= now()
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE public.outbox o
    SET state = 'processing',
        attempts = o.attempts + 1,
        updated_at = now()
    FROM next
    WHERE o.id = next.id
    RETURNING o.id, o.topic, o.payload, o.attempts
  `;

  let processed = 0;
  let errors = 0;
  for (const row of claimed) {
    try {
      const payload = normalizePayload(row.payload);
      await handleTopic(deps, row.topic, payload);
      await deps.sql`
        UPDATE public.outbox
        SET state = 'completed', last_error = NULL, updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      processed += 1;
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : "outbox failed";
      await reportEvent({
        level: "error",
        message: "outbox_handler_failed",
        jobId: row.id,
        code: "outbox_error",
        extra: { topic: row.topic, error: message },
      });
      const retry = row.attempts < 8;
      await deps.sql`
        UPDATE public.outbox
        SET state = ${retry ? "pending" : "failed"},
            last_error = ${message},
            next_run_at = now() + make_interval(secs => ${Math.min(300, 5 * row.attempts)}),
            updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
    }
  }
  return { processed, errors };
}

async function handleTopic(
  deps: OutboxDeps,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (topic) {
    case "issue.published":
    case "issue.transitioned":
      await enqueueIssueSideEffects(deps, String(payload.issue_id ?? ""));
      break;
    case "projection.refresh":
      await rebuildSnapshots(deps);
      break;
    case "share_card.render":
      await renderShareCards(deps, String(payload.issue_id ?? ""));
      break;
    case "cdn.purge":
      await runCdnPurge(deps, asStringArray(payload.paths));
      break;
    case "takedown.purge":
      await runTakedownPurge(deps, payload);
      break;
    case "analysis.enqueued":
    case "analysis.completed":
      // M2 topics — no M3 side effect; acknowledge so the queue drains.
      break;
    default:
      await reportEvent({
        level: "warn",
        message: "outbox_unknown_topic",
        code: "outbox_unknown_topic",
        extra: { topic },
      });
  }
}

async function enqueueIssueSideEffects(
  deps: OutboxDeps,
  issueId: string,
): Promise<void> {
  if (!issueId) return;
  await deps.sql`
    INSERT INTO public.outbox (topic, payload)
    VALUES ('projection.refresh', '{}'::jsonb)
  `;
  await deps.sql`
    INSERT INTO public.outbox (topic, payload)
    VALUES (
      'share_card.render',
      ${JSON.stringify({ issue_id: issueId })}::jsonb
    )
  `;
}

export async function rebuildSnapshots(deps: OutboxDeps): Promise<string> {
  const rows = await deps.sql<{
    id: string;
    short_id: string;
    slug: string;
    category: string;
    status: string;
    borough: string;
    title: string;
    support_count: number;
    revision: number;
    longitude: number;
    latitude: number;
    created_at: Date;
    resolved_at: Date | null;
  }[]>`
    SELECT i.id, i.short_id, i.slug, i.category, i.status, i.borough, i.title,
           i.support_count, i.revision, i.created_at, i.resolved_at,
           ST_X(i.geometry) AS longitude, ST_Y(i.geometry) AS latitude
    FROM public.issues i
    WHERE i.status IN ('open', 'fix_pending', 'resolved')
    ORDER BY i.created_at DESC, i.id DESC
  `;

  const version = `v${Date.now().toString(36)}`;
  const generatedAt = new Date().toISOString();
  const byBorough = new Map<string, typeof rows>();
  for (const b of BOROUGHS) byBorough.set(b, [] as unknown as typeof rows);
  for (const row of rows) {
    const list = byBorough.get(row.borough);
    if (list) {
      (list as unknown as Array<(typeof rows)[number]>).push(row);
    }
  }

  type IssueRow = (typeof rows)[number];
  const featuresOf = (list: readonly IssueRow[]) =>
    list.map((row) => ({
      id: row.id,
      shortId: row.short_id,
      slug: row.slug,
      path: `/r/${row.slug}-${row.short_id}`,
      category: row.category,
      status: row.status,
      borough: row.borough,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      title: row.title,
      supportCount: row.support_count,
      revision: row.revision,
      createdAt: isoDate(row.created_at),
      resolvedAt: row.resolved_at ? isoDate(row.resolved_at) : null,
    }));

  const boroughKeys: string[] = ["citywide", ...BOROUGHS];
  const prefix = `snapshots/${version}`;

  for (const key of boroughKeys) {
    const features =
      key === "citywide"
        ? featuresOf(rows)
        : featuresOf((byBorough.get(key) as unknown as IssueRow[]) ?? []);
    // Sanitize: never include private fields (email, private evidence, owner ids).
    const body = {
      version,
      borough: key,
      generatedAt,
      features,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    await deps.artifacts.put(
      `${prefix}/${key}.json`,
      bytes,
      "application/json",
    );
  }

  await deps.sql.begin(async (tx) => {
    await tx`
      INSERT INTO public.snapshot_versions (version, feature_count, borough_keys, object_prefix)
      VALUES (
        ${version},
        ${rows.length},
        ${tx.json(boroughKeys)},
        ${prefix}
      )
    `;
    const existing = await tx<{ version: string }[]>`
      SELECT version FROM public.snapshot_manifest WHERE id = 1
    `;
    if (existing[0]) {
      await tx`
        UPDATE public.snapshot_manifest
        SET version = ${version}, published_at = now(), updated_at = now()
        WHERE id = 1
      `;
    } else {
      await tx`
        INSERT INTO public.snapshot_manifest (id, version, published_at, updated_at)
        VALUES (1, ${version}, now(), now())
      `;
    }
  });

  const paths = boroughKeys.map(
    (key) =>
      `${deps.publicApiBaseUrl}/api/public/snapshots/${version}/${key}.json`,
  );
  paths.push(`${deps.publicApiBaseUrl}/api/public/manifest`);
  await deps.sql`
    INSERT INTO public.outbox (topic, payload)
    VALUES ('cdn.purge', ${JSON.stringify({ paths })}::jsonb)
  `;

  return version;
}

async function renderShareCards(
  deps: OutboxDeps,
  issueId: string,
): Promise<void> {
  if (!issueId) return;
  const [issue] = await deps.sql<{
    id: string;
    title: string;
    borough: string;
    status: string;
    slug: string;
    short_id: string;
    revision: number;
    created_at: Date;
    resolved_at: Date | null;
  }[]>`
    SELECT id, title, borough, status, slug, short_id, revision, created_at, resolved_at
    FROM public.issues
    WHERE id = ${issueId}::uuid
  `;
  if (!issue) return;
  if (issue.status === "hidden" || issue.status === "duplicate") return;

  const path = `/r/${issue.slug}-${issue.short_id}`;
  const dateLabel = new Date(issue.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  let intervalLabel: string | null = null;
  let beforeLabel: string | null = null;
  let afterLabel: string | null = null;
  if (issue.resolved_at) {
    const days = Math.max(
      0,
      Math.round(
        (new Date(issue.resolved_at).getTime() -
          new Date(issue.created_at).getTime()) /
          86_400_000,
      ),
    );
    intervalLabel = `Reported ${dateLabel} → Verified fixed ${new Date(issue.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${days} days)`;
    beforeLabel = "Open issue";
    afterLabel = "Verified fixed";
  }

  const cardInput = {
    title: issue.title,
    borough: BOROUGH_LABEL[issue.borough] ?? issue.borough,
    statusLabel: STATUS_LABEL[issue.status] ?? issue.status,
    dateLabel,
    path,
    brandName: deps.config.brandName,
    disclaimer: deps.config.disclaimer,
    beforeLabel,
    afterLabel,
    intervalLabel,
  };

  const ogSvg = renderOgCardSvg(cardInput);
  const storySvg = renderStoryCardSvg(cardInput);
  const ogKey = `share-cards/${issue.id}/r${issue.revision}-og.svg`;
  const storyKey = `share-cards/${issue.id}/r${issue.revision}-story.svg`;
  const ogBytes = new TextEncoder().encode(ogSvg);
  const storyBytes = new TextEncoder().encode(storySvg);
  await deps.artifacts.put(ogKey, ogBytes, "image/svg+xml");
  await deps.artifacts.put(storyKey, storyBytes, "image/svg+xml");

  await deps.sql`
    INSERT INTO public.share_cards (
      issue_id, revision, kind, object_key, content_digest, mime_type, width, height
    ) VALUES
      (
        ${issue.id}::uuid, ${issue.revision}, 'og', ${ogKey},
        ${digestBytes(ogBytes)}, 'image/svg+xml', 1200, 630
      ),
      (
        ${issue.id}::uuid, ${issue.revision}, 'story', ${storyKey},
        ${digestBytes(storyBytes)}, 'image/svg+xml', 1080, 1920
      )
    ON CONFLICT (issue_id, revision, kind) DO UPDATE
    SET object_key = EXCLUDED.object_key,
        content_digest = EXCLUDED.content_digest,
        purged_at = NULL
  `;

  const paths = [
    deps.artifacts.publicUrl(ogKey),
    deps.artifacts.publicUrl(storyKey),
    `${deps.publicApiBaseUrl}/r/${issue.slug}-${issue.short_id}`,
  ];
  await deps.sql`
    INSERT INTO public.outbox (topic, payload)
    VALUES ('cdn.purge', ${JSON.stringify({ paths })}::jsonb)
  `;
}

async function runCdnPurge(deps: OutboxDeps, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const result = await purgeCdnPaths(paths);
  await deps.sql`
    INSERT INTO public.cdn_purge_log (paths, provider, status, detail)
    VALUES (
      ${paths},
      ${result.provider},
      ${result.status},
      ${JSON.stringify(result.detail)}::jsonb
    )
  `;
}

async function runTakedownPurge(
  deps: OutboxDeps,
  payload: Record<string, unknown>,
): Promise<void> {
  const issueId = payload.issue_id ? String(payload.issue_id) : null;
  const caseId = payload.case_id ? String(payload.case_id) : null;
  const paths: string[] = [];

  if (issueId) {
    const cards = await deps.sql<{ object_key: string }[]>`
      SELECT object_key FROM public.share_cards
      WHERE issue_id = ${issueId}::uuid AND purged_at IS NULL
    `;
    for (const card of cards) {
      await deps.artifacts.delete(card.object_key);
      paths.push(deps.artifacts.publicUrl(card.object_key));
      await deps.sql`
        INSERT INTO public.deletion_ledger (target_type, target_key, reason, case_id)
        VALUES (
          'share_card',
          ${card.object_key},
          'takedown',
          ${caseId}::uuid
        )
      `;
    }
    await deps.sql`
      UPDATE public.share_cards
      SET purged_at = now()
      WHERE issue_id = ${issueId}::uuid AND purged_at IS NULL
    `;

    const [issue] = await deps.sql<{ slug: string; short_id: string }[]>`
      SELECT slug, short_id FROM public.issues WHERE id = ${issueId}::uuid
    `;
    if (issue) {
      paths.push(
        `${deps.publicApiBaseUrl}/r/${issue.slug}-${issue.short_id}`,
        `${deps.config.publicAppUrl}/r/${issue.slug}-${issue.short_id}`,
      );
      await deps.sql`
        INSERT INTO public.deletion_ledger (target_type, target_key, reason, case_id)
        VALUES (
          'issue_path',
          ${`/r/${issue.slug}-${issue.short_id}`},
          'takedown',
          ${caseId}::uuid
        )
      `;
    }
  }

  // Rebuild projections so removed issues leave active snapshots.
  await rebuildSnapshots(deps);
  paths.push(`${deps.publicApiBaseUrl}/api/public/manifest`);

  if (caseId) {
    await deps.sql`
      UPDATE public.takedown_cases
      SET status = 'purged', resolved_at = coalesce(resolved_at, now())
      WHERE id = ${caseId}::uuid
    `;
  }

  await runCdnPurge(deps, [...new Set(paths)]);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Enqueue projection + share work after a status change (call inside same TX when possible). */
export async function enqueueIssueTransitionOutbox(
  sql: Sql,
  issueId: string,
  topic: "issue.published" | "issue.transitioned" = "issue.transitioned",
): Promise<void> {
  await sql`
    INSERT INTO public.outbox (topic, payload)
    VALUES (
      ${topic},
      ${JSON.stringify({ issue_id: issueId })}::jsonb
    )
  `;
}

export { caseNumber };
