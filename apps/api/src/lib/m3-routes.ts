import type { Hono } from "hono";
import type { ProfileRole } from "@mamdani-ticketer/contracts";
import {
  copyrightAgentFromEnv,
  createContentReportRequestSchema,
  createTakedownRequestSchema,
  evaluateProductionReadiness,
  legalFromEnv,
} from "@mamdani-ticketer/contracts";
import type { ApiConfig } from "../config.js";
import type { ArtifactStore } from "./artifacts.js";
import { caseNumber, randomToken } from "./artifacts.js";
import { HttpError } from "./http-error.js";
import { monitoringStatus, reportEvent } from "./monitoring.js";
import { processOutboxOnce, type Sql } from "./outbox.js";

const MODERATOR_ROLES = new Set(["moderator", "senior_moderator", "admin"]);
const SENIOR_ROLES = new Set(["senior_moderator", "admin"]);

type AuthUser = {
  id: string;
  role: ProfileRole;
  emailVerified: boolean;
};

type AppVars = { user: AuthUser | null };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeBoroughKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      /* fall through */
    }
  }
  return ["citywide"];
}

async function parseJson<T>(
  c: { req: { json: () => Promise<unknown> } },
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "validation_failed", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "validation_failed",
      parsed.error.issues[0]?.message ?? "Invalid request.",
      {
        details: {
          issues: parsed.error.issues.map((issue) => issue.message),
        },
      },
    );
  }
  return parsed.data;
}

export function registerM3Routes(
  app: Hono<{ Variables: AppVars }>,
  deps: {
    sql: Sql | null;
    artifacts: ArtifactStore;
    config: ApiConfig;
    publicApiBaseUrl: string;
  },
) {
  const requireSql = (): Sql => {
    if (!deps.sql) {
      throw new HttpError(
        503,
        "internal_error",
        "Database is not configured.",
      );
    }
    return deps.sql;
  };

  app.get("/health", async (c) => {
    const mon = monitoringStatus();
    let dbOk = false;
    if (deps.sql) {
      try {
        await deps.sql`SELECT 1`;
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }
    return c.json({
      ok: true,
      database: dbOk,
      monitoring: mon,
      readiness: evaluateProductionReadiness(
        process.env as Record<string, string | undefined>,
      ),
    });
  });

  app.get("/metrics", async (c) => {
    const sql = deps.sql;
    const mon = monitoringStatus();
    let pendingOutbox = 0;
    let urgentOpen = 0;
    if (sql) {
      const [o] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.outbox WHERE state = 'pending'
      `;
      const [u] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.content_reports
        WHERE is_urgent AND status IN ('open', 'acknowledged')
      `;
      pendingOutbox = o?.n ?? 0;
      urgentOpen = u?.n ?? 0;
    }
    const body = [
      "# HELP mamdani_outbox_pending Pending outbox rows",
      "# TYPE mamdani_outbox_pending gauge",
      `mamdani_outbox_pending ${pendingOutbox}`,
      "# HELP mamdani_urgent_content_reports Open urgent content reports",
      "# TYPE mamdani_urgent_content_reports gauge",
      `mamdani_urgent_content_reports ${urgentOpen}`,
      `# monitoring_provider ${mon.provider}`,
    ].join("\n");
    return c.text(body + "\n", 200, {
      "content-type": "text/plain; version=0.0.4",
    });
  });

  app.get("/api/ops/readiness", (c) => {
    const result = evaluateProductionReadiness(process.env as Record<string, string | undefined>);
    return c.json(
      {
        ...result,
        legal: legalFromEnv(process.env as Record<string, string | undefined>),
        copyrightAgentConfigured: copyrightAgentFromEnv(process.env as Record<string, string | undefined>) !== null,
        monitoring: monitoringStatus(),
        note: "Terms and Privacy remain DRAFT until counsel review. This check does not claim legal sign-off.",
      },
      result.ok ? 200 : 503,
    );
  });

  app.get("/api/public/legal", (c) => {
    const legal = legalFromEnv(process.env as Record<string, string | undefined>);
    const agent = copyrightAgentFromEnv(process.env as Record<string, string | undefined>);
    return c.json({
      draft: true as const,
      legal,
      copyrightRouteVisible: agent !== null,
      copyrightAgent: agent,
    });
  });

  app.get("/api/public/manifest", async (c) => {
    const sql = requireSql();
    const [row] = await sql<{
      version: string;
      published_at: Date;
      feature_count: number;
      borough_keys: unknown;
    }[]>`
      SELECT m.version, m.published_at, v.feature_count, v.borough_keys
      FROM public.snapshot_manifest m
      JOIN public.snapshot_versions v ON v.version = m.version
      WHERE m.id = 1 AND v.purged_at IS NULL
    `;
    if (!row) {
      c.header("Cache-Control", "public, max-age=5");
      return c.json({
        version: "none",
        publishedAt: new Date(0).toISOString(),
        featureCount: 0,
        boroughs: [],
        updatedLabel: "Updated — no snapshot yet",
      });
    }
    const keys = normalizeBoroughKeys(row.borough_keys);
    c.header("Cache-Control", "public, max-age=30");
    return c.json({
      version: row.version,
      publishedAt: iso(row.published_at),
      featureCount: row.feature_count,
      boroughs: keys.map((key) => ({
        key,
        path: `/api/public/snapshots/${row.version}/${key}.json`,
      })),
      updatedLabel: `Updated ${iso(row.published_at)}`,
    });
  });

  app.get("/api/public/snapshots/:version/:boroughJson", async (c) => {
    const sql = requireSql();
    const version = c.req.param("version");
    const boroughJson = c.req.param("boroughJson");
    const borough = boroughJson.replace(/\.json$/i, "");
    const allowed = new Set([
      "citywide",
      "manhattan",
      "brooklyn",
      "queens",
      "bronx",
      "staten_island",
    ]);
    if (!allowed.has(borough)) {
      throw new HttpError(404, "not_found", "Unknown snapshot borough.");
    }
    const [ver] = await sql<{ purged_at: Date | null; object_prefix: string }[]>`
      SELECT purged_at, object_prefix FROM public.snapshot_versions
      WHERE version = ${version}
    `;
    if (!ver || ver.purged_at) {
      throw new HttpError(404, "not_found", "Snapshot version not found or purged.");
    }
    const objectKey = `${ver.object_prefix}/${borough}.json`;
    const stored = await deps.artifacts.get(objectKey);
    if (!stored) {
      throw new HttpError(404, "not_found", "Snapshot object missing.");
    }
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    c.header("Content-Type", "application/json; charset=utf-8");
    return c.body(Buffer.from(stored.bytes));
  });

  app.get("/artifacts/*", async (c) => {
    const objectKey = c.req.path.replace(/^\/artifacts\//, "");
    const stored = await deps.artifacts.get(objectKey);
    if (!stored) {
      throw new HttpError(404, "not_found", "Artifact not found.");
    }
    if (objectKey.startsWith("share-cards/") && deps.sql) {
      const [row] = await deps.sql<{ purged_at: Date | null }[]>`
        SELECT purged_at FROM public.share_cards
        WHERE object_key = ${objectKey}
        LIMIT 1
      `;
      if (row?.purged_at) {
        throw new HttpError(410, "gone", "This share card was removed.");
      }
    }
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    c.header("Content-Type", stored.contentType);
    return c.body(Buffer.from(stored.bytes));
  });

  app.get("/api/public/issues/:id/share-cards", async (c) => {
    const sql = requireSql();
    const id = c.req.param("id");
    const rows = await sql<{
      kind: string;
      object_key: string;
      width: number;
      height: number;
      revision: number;
    }[]>`
      SELECT kind, object_key, width, height, revision
      FROM public.share_cards
      WHERE issue_id = ${id}::uuid AND purged_at IS NULL
      ORDER BY revision DESC, kind ASC
    `;
    const seen = new Set<string>();
    const items = [];
    for (const row of rows) {
      if (seen.has(row.kind)) continue;
      seen.add(row.kind);
      items.push({
        kind: row.kind,
        revision: row.revision,
        width: row.width,
        height: row.height,
        url: deps.artifacts.publicUrl(row.object_key),
      });
    }
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ items });
  });

  app.post("/api/public/content-reports", async (c) => {
    const input = await parseJson(c, createContentReportRequestSchema);
    const sql = requireSql();
    const isUrgent =
      input.category === "ncii" || input.category === "threat_safety";
    const urgentDeadlineAt = isUrgent
      ? new Date(Date.now() + 48 * 60 * 60 * 1000)
      : null;
    const number = caseNumber(isUrgent ? "URG" : "RPT");
    const receipt = randomToken(24);
    const [row] = await sql<{
      case_number: string;
      receipt_token: string;
      is_urgent: boolean;
      urgent_deadline_at: Date | null;
    }[]>`
      INSERT INTO public.content_reports (
        case_number, receipt_token, category, issue_id, page_url, media_id,
        description, contact_email, is_urgent, urgent_deadline_at, status
      ) VALUES (
        ${number},
        ${receipt},
        ${input.category},
        ${input.issueId ?? null}::uuid,
        ${input.pageUrl ?? null},
        ${input.mediaId ?? null}::uuid,
        ${input.description},
        ${input.contactEmail ?? null},
        ${isUrgent},
        ${urgentDeadlineAt},
        'open'
      )
      RETURNING case_number, receipt_token, is_urgent, urgent_deadline_at
    `;
    if (!row) {
      throw new HttpError(500, "internal_error", "Could not create content report.");
    }
    if (isUrgent) {
      await reportEvent({
        level: "warn",
        message: "urgent_content_report",
        code: "urgent_content_report",
        extra: {
          caseNumber: row.case_number,
          category: input.category,
          deadline: urgentDeadlineAt?.toISOString(),
        },
      });
    }
    return c.json(
      {
        caseNumber: row.case_number,
        receiptToken: row.receipt_token,
        statusPath: `/report-content/status?case=${encodeURIComponent(row.case_number)}&token=${encodeURIComponent(row.receipt_token)}`,
        isUrgent: row.is_urgent,
        urgentDeadlineAt: row.urgent_deadline_at
          ? iso(row.urgent_deadline_at)
          : null,
        accepted: true as const,
      },
      202,
    );
  });

  app.get("/api/public/content-reports/:caseNumber", async (c) => {
    const sql = requireSql();
    const caseNumberParam = c.req.param("caseNumber");
    const token = c.req.query("token");
    if (!token) {
      throw new HttpError(401, "unauthorized", "Receipt token required.");
    }
    const [row] = await sql<{
      case_number: string;
      category: string;
      status: string;
      is_urgent: boolean;
      urgent_deadline_at: Date | null;
      created_at: Date;
      updated_at: Date;
      receipt_token: string;
    }[]>`
      SELECT case_number, category, status, is_urgent, urgent_deadline_at,
             created_at, updated_at, receipt_token
      FROM public.content_reports
      WHERE case_number = ${caseNumberParam}
      LIMIT 1
    `;
    if (!row || row.receipt_token !== token) {
      throw new HttpError(404, "not_found", "Case not found.");
    }
    c.header("Cache-Control", "private, no-store");
    return c.json({
      caseNumber: row.case_number,
      category: row.category,
      status: row.status,
      isUrgent: row.is_urgent,
      urgentDeadlineAt: row.urgent_deadline_at
        ? iso(row.urgent_deadline_at)
        : null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    });
  });

  app.post("/api/admin/takedowns", async (c) => {
    const sql = requireSql();
    const user = c.get("user");
    if (!user || !user.emailVerified) {
      throw new HttpError(401, "unauthorized", "Sign in required.");
    }
    if (!MODERATOR_ROLES.has(user.role)) {
      throw new HttpError(403, "forbidden", "Moderator role required.");
    }
    const input = await parseJson(c, createTakedownRequestSchema);
    if (!input.issueId && input.mediaIds.length === 0) {
      throw new HttpError(
        400,
        "validation_failed",
        "Provide an issueId and/or mediaIds to take down.",
      );
    }
    if (input.kind === "copyright" && !SENIOR_ROLES.has(user.role)) {
      throw new HttpError(
        403,
        "forbidden",
        "A senior moderator has to complete copyright takedowns.",
      );
    }

    const number = caseNumber("TD");
    const result = await sql.begin(async (tx) => {
      if (input.issueId && input.hideIssue) {
        const [issue] = await tx<{ id: string; revision: number; status: string }[]>`
          SELECT id, revision, status FROM public.issues
          WHERE id = ${input.issueId}::uuid FOR UPDATE
        `;
        if (!issue) {
          throw new HttpError(404, "not_found", "Report not found.");
        }
        if (
          input.expectedRevision != null &&
          issue.revision !== input.expectedRevision
        ) {
          throw new HttpError(
            409,
            "revision_conflict",
            "This report changed. Reload and try again.",
          );
        }
        if (issue.status !== "hidden") {
          await tx`
            SELECT status, revision FROM app.transition_issue_status(
              ${issue.id}::uuid,
              ${issue.revision}::int,
              'hidden'::public.issue_status,
              ${user.id}::uuid,
              ${input.notes ?? "takedown"},
              ${[]}::uuid[],
              NULL::uuid
            )
          `;
        }
      }

      if (input.mediaIds.length > 0) {
        await tx`
          UPDATE public.media
          SET publication_permission = 'denied'
          WHERE id = ANY(${input.mediaIds}::uuid[])
        `;
        await tx`
          UPDATE public.evidence
          SET visibility = 'private'
          WHERE media_id = ANY(${input.mediaIds}::uuid[])
        `;
      }

      const [row] = await tx<{ id: string; case_number: string; status: string }[]>`
        INSERT INTO public.takedown_cases (
          case_number, kind, content_report_id, issue_id, media_ids, status, notes, acted_by
        ) VALUES (
          ${number},
          ${input.kind},
          ${input.contentReportId ?? null}::uuid,
          ${input.issueId ?? null}::uuid,
          ${input.mediaIds}::uuid[],
          'restricted',
          ${input.notes ?? null},
          ${user.id}::uuid
        )
        RETURNING id, case_number, status
      `;
      if (!row) {
        throw new HttpError(500, "internal_error", "Could not create takedown case.");
      }

      await tx`
        INSERT INTO public.outbox (topic, payload)
        VALUES (
          'takedown.purge',
          ${JSON.stringify({
            case_id: row.id,
            issue_id: input.issueId ?? null,
            media_ids: input.mediaIds,
          })}::jsonb
        )
      `;

      return row;
    });

    if (!result) {
      throw new HttpError(500, "internal_error", "Could not create takedown case.");
    }

    await reportEvent({
      level: "warn",
      message: "takedown_created",
      code: "takedown_created",
      extra: { caseNumber: result.case_number, kind: input.kind },
    });

    return c.json({
      caseNumber: result.case_number,
      status: result.status,
      issueId: input.issueId ?? null,
    });
  });

  app.post("/api/ops/outbox/run", async (c) => {
    if (!deps.config.allowDevAuth && process.env.ALLOW_OPS_OUTBOX !== "true") {
      throw new HttpError(403, "forbidden", "Outbox runner disabled.");
    }
    const sql = requireSql();
    const result = await processOutboxOnce({
      sql,
      artifacts: deps.artifacts,
      config: deps.config,
      publicApiBaseUrl: deps.publicApiBaseUrl,
    });
    return c.json(result);
  });
}
