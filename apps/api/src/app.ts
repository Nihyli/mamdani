import { Hono } from "hono";
import { cors } from "hono/cors";
import postgres from "postgres";
import {
  adminQueueResponseSchema,
  adminReviewDecisionRequestSchema,
  analysisProposalSchema,
  createIssueFlagRequestSchema,
  createIssueUpdateRequestSchema,
  createSubmissionRequestSchema,
  patchAnalysisSettingsRequestSchema,
  patchSubmissionRequestSchema,
  publicIssueListQuerySchema,
  publicIssueListResponseSchema,
  publicIssueSchema,
  publicStatsSchema,
  supportToggleRequestSchema,
  uploadCompleteRequestSchema,
  uploadSignRequestSchema,
  type AdminReviewDecisionRequest,
  type AnalysisProposal,
  type ProfileRole,
} from "@mamdani-ticketer/contracts";
import type { ApiConfig } from "./config.js";
import { insideNycBbox } from "./config.js";
import { HttpError, mapDatabaseError } from "./lib/http-error.js";
import {
  canAdmitAnalysis,
  initialProcessingState,
  spendWarningLevel,
} from "./lib/analysis-rules.js";
import {
  dailySubmissionLimit,
  decideIdempotency,
  fingerprintSubmission,
  type SubmissionFingerprint,
} from "./lib/submission-rules.js";
import {
  canonicalizeTikTokUrl,
  createShortId,
  decodeCursor,
  encodeCursor,
  slugFromTitle,
} from "./lib/source-url.js";
import {
  assertObjectKey,
  type ObjectStore,
} from "./object-store.js";
import type { ArtifactStore } from "./lib/artifacts.js";
import { registerM3Routes } from "./lib/m3-routes.js";
import { enqueueIssueTransitionOutbox } from "./lib/outbox.js";
import { configureMonitoring, reportEvent } from "./lib/monitoring.js";
export type Sql = ReturnType<typeof postgres>;

export type AuthUser = {
  id: string;
  role: ProfileRole;
  emailVerified: boolean;
};

export type Authenticate = (
  authorization: string | undefined,
  devUser: string | undefined,
  devRole: string | undefined,
) => Promise<AuthUser | null>;

type AppVars = { user: AuthUser | null };

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME = new Set(["video/mp4"]);
const MODERATOR_ROLES = new Set<ProfileRole>(["moderator", "senior_moderator", "admin"]);
const SENIOR_ROLES = new Set<ProfileRole>(["senior_moderator", "admin"]);

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function createApp(deps: {
  sql: Sql | null;
  authenticate: Authenticate;
  objectStore: ObjectStore;
  artifacts: ArtifactStore;
  config: ApiConfig;
}) {
  const { config, objectStore, artifacts } = deps;
  const app = new Hono<{ Variables: AppVars }>();
  configureMonitoring(process.env);

  app.use(
    "*",
    cors({
      origin: config.corsOrigins,
      allowHeaders: ["authorization", "content-type", "x-dev-user-id", "x-dev-role"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    }),
  );

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.retryAfterSeconds) {
        c.header("Retry-After", String(err.retryAfterSeconds));
      }
      return c.json(
        {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
          ...(err.retryAfterSeconds
            ? { retryAfterSeconds: err.retryAfterSeconds }
            : {}),
        },
        err.status as 400,
      );
    }
    const mapped = mapDatabaseError(err);
    if (mapped) {
      return c.json({ code: mapped.code, message: mapped.message }, mapped.status as 409);
    }
    void reportEvent({
      level: "error",
      message: "unhandled_api_error",
      code: "internal_error",
      extra: { error: err instanceof Error ? err.message : "unknown" },
    });
    console.error(err);
    return c.json(
      { code: "internal_error", message: "Something went wrong." },
      500,
    );
  });

  app.get("/", (c) =>
    c.json({ name: config.brandName, disclaimer: config.disclaimer }),
  );

  registerM3Routes(app, {
    sql: deps.sql,
    artifacts,
    config,
    publicApiBaseUrl: config.publicApiBaseUrl,
  });

  // Crawler/OG HTML for /r/{slug}-{shortId}; social bots do not run the React SPA.
  app.get("/r/:slug", async (c) => {
    const sql = requireSql(deps.sql);
    const slugParam = c.req.param("slug");
    const rows = await sql<(ShareIssueRow & { id: string })[]>`
      SELECT i.id, i.title, i.status, i.borough, i.slug, i.short_id
      FROM public.issues i
      WHERE (i.slug || '-' || i.short_id) = ${slugParam}
        AND i.status IN ('open', 'fix_pending', 'resolved')
      LIMIT 1
    `;
    const issue = rows[0];
    const reportPath = `/r/${slugParam}`;
    const appUrl = `${config.publicAppUrl}${reportPath}`;

    if (!issue) {
      const html = shareHtmlDocument({
        title: "Report not found",
        description: config.disclaimer,
        url: appUrl,
        brandName: config.brandName,
        bodyLink: appUrl,
        bodyText: "This report was not found.",
      });
      c.header("Cache-Control", "public, max-age=30");
      return c.html(html, 404);
    }

    const [ogCard] = await sql<{ object_key: string }[]>`
      SELECT object_key FROM public.share_cards
      WHERE issue_id = ${issue.id}::uuid
        AND kind = 'og'
        AND purged_at IS NULL
      ORDER BY revision DESC
      LIMIT 1
    `;
    const imageUrl = ogCard
      ? artifacts.publicUrl(ogCard.object_key)
      : undefined;

    const statusLabel = SHARE_STATUS_LABELS[issue.status] ?? issue.status;
    const boroughLabel = SHARE_BOROUGH_LABELS[issue.borough] ?? issue.borough;
    const description = `${statusLabel}. ${boroughLabel}. ${config.disclaimer}`;
    const html = shareHtmlDocument({
      title: issue.title,
      description,
      url: appUrl,
      brandName: config.brandName,
      bodyLink: appUrl,
      bodyText: "Open this report on the map.",
      imageUrl,
    });
    c.header("Cache-Control", "public, max-age=30");
    return c.html(html, 200);
  });

  app.put("/dev-uploads/*", async (c) => {
    const objectKey = c.req.path.replace(/^\/dev-uploads\//, "");
    try {
      assertObjectKey(objectKey);
    } catch {
      throw new HttpError(400, "validation_failed", "Invalid upload path.");
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    await objectStore.put(objectKey, bytes);
    return c.body(null, 204);
  });

  app.get("/dev-uploads/*", async (c) => {
    const objectKey = decodeURIComponent(
      c.req.path.replace(/^\/dev-uploads\//, ""),
    );
    let stored;
    try {
      stored = await objectStore.get(objectKey);
    } catch {
      throw new HttpError(400, "validation_failed", "Invalid upload path.");
    }
    if (!stored) {
      return c.body("Not found", 404);
    }
    return new Response(stored.bytes, {
      status: 200,
      headers: {
        "Content-Type": stored.contentType,
        "Cache-Control": "public, max-age=60",
      },
    });
  });

  app.use("/api/*", async (c, next) => {
    const user = await deps.authenticate(
      c.req.header("authorization"),
      c.req.header("x-dev-user-id"),
      c.req.header("x-dev-role"),
    );
    c.set("user", user);
    await next();
  });

  app.get("/api/public/issues", async (c) => {
    const sql = requireSql(deps.sql);
    const parsed = publicIssueListQuerySchema.safeParse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit") ?? undefined,
      category: c.req.query("category"),
      borough: c.req.query("borough"),
      status: c.req.query("status"),
    });
    if (!parsed.success) {
      throw new HttpError(400, "validation_failed", "Invalid list filters.", {
        details: { issues: parsed.error.issues.map((issue) => issue.message) },
      });
    }
    const query = parsed.data;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      throw new HttpError(400, "validation_failed", "Invalid cursor.");
    }
    const rows = await sql<IssueListRow[]>`
      SELECT
        i.id, i.short_id, i.slug, i.category, i.title, i.status, i.borough,
        ST_X(i.geometry) AS longitude, ST_Y(i.geometry) AS latitude,
        i.support_count, i.created_at, i.resolved_at, i.revision,
        (
          SELECT ${config.publicUploadBaseUrl} || '/' || m.private_object_key
          FROM public.evidence e
          JOIN public.media m ON m.id = e.media_id
          WHERE e.issue_id = i.id
            AND e.visibility = 'public'
            AND m.publication_permission = 'allowed'
          ORDER BY e.created_at
          LIMIT 1
        ) AS thumbnail_url
      FROM public.issues i
      WHERE i.status IN ('open', 'fix_pending', 'resolved')
        AND (${query.category ?? null}::public.issue_category IS NULL OR i.category = ${query.category ?? null}::public.issue_category)
        AND (${query.borough ?? null}::public.nyc_borough IS NULL OR i.borough = ${query.borough ?? null}::public.nyc_borough)
        AND (${query.status ?? null}::public.issue_status IS NULL OR i.status = ${query.status ?? null}::public.issue_status)
        AND (
          ${cursor?.createdAt ?? null}::timestamptz IS NULL
          OR (i.created_at, i.id) < (${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
        )
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${query.limit + 1}
    `;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const body = publicIssueListResponseSchema.parse({
      items: page.map((row) => listItem(row)),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor(iso(last.created_at), last.id)
          : null,
    });
    return c.json(body);
  });

  app.get("/api/public/issues/:id", async (c) => {
    const sql = requireSql(deps.sql);
    const id = c.req.param("id");
    const rows = await sql<IssueDetailRow[]>`
      SELECT
        i.id, i.short_id, i.slug, i.category, i.title, i.description, i.status,
        i.borough, ST_X(i.geometry) AS longitude, ST_Y(i.geometry) AS latitude,
        i.precision, i.support_count, i.created_at, i.last_verified_at,
        i.resolved_at, i.revision
      FROM public.issues i
      WHERE i.id = ${id}::uuid
        AND i.status IN ('open', 'fix_pending', 'resolved')
    `;
    const issue = rows[0];
    if (!issue) throw new HttpError(404, "not_found", "Report not found.");
    const evidence = await sql<EvidenceRow[]>`
      SELECT e.id, m.mime_type, m.private_object_key, m.width, m.height,
             e.summary, m.observed_at
      FROM public.evidence e
      JOIN public.media m ON m.id = e.media_id
      WHERE e.issue_id = ${issue.id}::uuid
        AND e.visibility = 'public'
        AND m.publication_permission = 'allowed'
      ORDER BY e.created_at
    `;
    const sources = await sql<SourceRow[]>`
      SELECT sp.platform, sp.canonical_url, sp.availability
      FROM public.issue_sources links
      JOIN public.source_posts sp ON sp.id = links.source_post_id
      WHERE links.issue_id = ${issue.id}::uuid
    `;
    const history = await sql<HistoryRow[]>`
      SELECT old_status, new_status, reason, created_at
      FROM public.status_events
      WHERE issue_id = ${issue.id}::uuid
      ORDER BY created_at
    `;
    const body = publicIssueSchema.parse({
      ...listItem(issue),
      description: issue.description,
      precision: issue.precision,
      lastVerifiedAt: issue.last_verified_at ? iso(issue.last_verified_at) : null,
      evidence: evidence.map((row) => ({
        id: row.id,
        kind: row.mime_type.startsWith("video/") ? "video" : "image",
        url: `${config.publicUploadBaseUrl}/${row.private_object_key}`,
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
        observedAt: row.observed_at ? iso(row.observed_at) : null,
        summary: row.summary,
      })),
      sources: sources.map((row) => ({
        platform: row.platform,
        url: row.canonical_url,
        availability: row.availability,
      })),
      statusHistory: history.map((row) => ({
        oldStatus: row.old_status,
        newStatus: row.new_status,
        reason: row.reason,
        createdAt: iso(row.created_at),
      })),
    });
    return c.json(body);
  });

  app.get("/api/public/stats", async (c) => {
    const sql = requireSql(deps.sql);
    const rows = await sql<StatsRow[]>`
      SELECT
        count(*) FILTER (WHERE status = 'open')::int AS open_count,
        count(*) FILTER (WHERE status = 'fix_pending')::int AS fix_pending_count,
        count(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400.0
        ) FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL)
          AS median_days
      FROM public.issues
      WHERE status IN ('open', 'fix_pending', 'resolved')
    `;
    const row = rows[0];
    const openCount = row?.open_count ?? 0;
    const fixPendingCount = row?.fix_pending_count ?? 0;
    const resolvedCount = row?.resolved_count ?? 0;
    const body = publicStatsSchema.parse({
      openCount,
      fixPendingCount,
      resolvedCount,
      publishedCount: openCount + fixPendingCount + resolvedCount,
      medianDaysToVerifiedFix:
        row?.median_days == null ? null : Number(row.median_days),
      computedAt: new Date().toISOString(),
    });
    return c.json(body);
  });

  app.post("/api/submissions", async (c) => {
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, createSubmissionRequestSchema);
    assertInNyc(input.location.longitude, input.location.latitude, config);
    const sql = requireSql(deps.sql);
    if (input.kind === "upload" && input.mediaIds.length === 0) {
      throw new HttpError(400, "validation_failed", "Upload a photo or video before submitting.");
    }
    const source = input.sourceUrl ? parseSource(input.sourceUrl) : null;
    const incoming = fingerprintSubmission({
      ...input,
      sourceUrl: source?.canonicalUrl,
    });

    const created = await sql.begin(async (tx) => {
      const existing = await loadFingerprint(tx, user.id, input.idempotencyKey);
      const decision = decideIdempotency(existing?.fingerprint ?? null, incoming);
      if (decision === "conflict") {
        throw new HttpError(
          409,
          "idempotency_conflict",
          "This idempotency key was already used with a different payload.",
        );
      }
      if (decision === "replay" && existing) {
        return existing;
      }

      if (source) {
        const published = await tx<{ id: string; slug: string; short_id: string }[]>`
          SELECT i.id, i.slug, i.short_id
          FROM public.source_posts sp
          JOIN public.issue_sources links ON links.source_post_id = sp.id
          JOIN public.issues i ON i.id = links.issue_id
          WHERE sp.platform = ${source.platform}
            AND sp.platform_post_id = ${source.platformPostId}
            AND i.status IN ('open', 'fix_pending', 'resolved')
          LIMIT 1
        `;
        const match = published[0];
        if (match) {
          throw new HttpError(409, "duplicate_source", "This TikTok already has a published report.", {
            details: {
              issueId: match.id,
              path: `/r/${match.slug}-${match.short_id}`,
            },
          });
        }
      }

      const [usage] = await tx<{ today: number; pending: number }[]>`
        SELECT
          (
            SELECT count(*)::int FROM public.submissions
            WHERE owner_id = ${user.id}::uuid
              AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc')
          ) AS today,
          (
            SELECT count(*)::int FROM public.submissions
            WHERE processing_state = 'pending_review'
          ) AS pending
      `;
      const limit = dailySubmissionLimit(usage?.pending ?? 0, config.dailyReviewCapacity);
      if ((usage?.today ?? 0) >= limit) {
        throw new HttpError(
          429,
          (usage?.pending ?? 0) > 2 * config.dailyReviewCapacity
            ? "intake_capped"
            : "quota_exceeded",
          limit === 1
            ? "Review is backed up. You can submit 1 report today."
            : "You can submit 3 reports today.",
          { retryAfterSeconds: 3600 },
        );
      }

      await assertOwnedMedia(tx, user.id, input.mediaIds);

      const [settings] = await tx<{
        analysis_enabled: boolean;
        analysis_paused: boolean;
        daily_cap_cents: number;
        monthly_cap_cents: number;
        pipeline_version: string;
      }[]>`
        SELECT analysis_enabled, analysis_paused, daily_cap_cents, monthly_cap_cents, pipeline_version
        FROM public.analysis_settings WHERE id = 1
      `;
      const [spend] = await tx<{ daily: number; monthly: number }[]>`
        SELECT
          app.analysis_spend_cents(date_trunc('day', now() AT TIME ZONE 'utc')) AS daily,
          app.analysis_spend_cents(date_trunc('month', now() AT TIME ZONE 'utc')) AS monthly
      `;
      const budgetDecision = canAdmitAnalysis(
        {
          enabled: settings?.analysis_enabled ?? config.analysisEnabledDefault,
          paused: settings?.analysis_paused ?? false,
          dailyCapCents: settings?.daily_cap_cents ?? 500,
          monthlyCapCents: settings?.monthly_cap_cents ?? 10_000,
          dailySpendCents: spend?.daily ?? 0,
          monthlySpendCents: spend?.monthly ?? 0,
        },
        config.analysisEstimateCents,
      );
      const processingState = initialProcessingState(budgetDecision.admit);
      const pipelineVersion = settings?.pipeline_version ?? "m2.v1";

      let sourcePostId: string | null = null;
      if (source) {
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO public.source_posts (platform, platform_post_id, url, canonical_url)
          VALUES (${source.platform}, ${source.platformPostId}, ${input.sourceUrl!}, ${source.canonicalUrl})
          ON CONFLICT (platform, platform_post_id)
          DO UPDATE SET url = EXCLUDED.url
          RETURNING id
        `;
        sourcePostId = inserted[0]?.id ?? null;
      }

      const rows = await tx<SubmissionRow[]>`
        INSERT INTO public.submissions (
          owner_id, kind, processing_state, category, title, description,
          location_text, location, location_precision, source_post_id,
          canonical_source_key, idempotency_key, rights_attested_at
        ) VALUES (
          ${user.id}::uuid,
          ${input.kind}::public.submission_kind,
          ${processingState}::public.processing_state,
          ${input.category}::public.issue_category,
          ${input.title ?? null},
          ${input.description ?? null},
          ${input.locationText},
          ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326),
          ${input.locationPrecision}::public.location_precision,
          ${sourcePostId}::uuid,
          ${source ? `${source.platform}:${source.platformPostId}` : null},
          ${input.idempotencyKey},
          now()
        )
        RETURNING id, processing_state, revision
      `;
      const submission = rows[0];
      if (!submission) throw new HttpError(500, "internal_error", "Submission was not saved.");

      await tx`
        INSERT INTO public.location_candidates (submission_id, geometry, precision, provider, verification)
        VALUES (
          ${submission.id}::uuid,
          ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326),
          ${input.locationPrecision}::public.location_precision,
          'user',
          'unverified'
        )
      `;
      if (input.mediaIds.length > 0) {
        await tx`
          UPDATE public.media
          SET submission_id = ${submission.id}::uuid
          WHERE owner_id = ${user.id}::uuid
            AND id = ANY(${input.mediaIds}::uuid[])
        `;
      }

      if (budgetDecision.admit) {
        await tx`
          INSERT INTO public.jobs (
            submission_id, stage, state, pipeline_version, payload
          ) VALUES (
            ${submission.id}::uuid,
            'analyze',
            'pending',
            ${pipelineVersion},
            ${JSON.stringify({
              estimate_cents: config.analysisEstimateCents,
              category: input.category,
              location_text: input.locationText,
            })}::jsonb
          )
        `;
        await tx`
          INSERT INTO public.outbox (topic, payload)
          VALUES (
            'analysis.enqueued',
            ${JSON.stringify({ submission_id: submission.id })}::jsonb
          )
        `;
      }

      return {
        id: submission.id,
        processing_state: submission.processing_state,
        revision: submission.revision,
        fingerprint: incoming,
      };
    });
    return c.json(
      {
        id: created.id,
        processingState: created.processing_state,
        revision: created.revision,
        accepted: true,
      },
      202,
    );
  });

  app.get("/api/submissions/:id", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const rows = await sql<OwnerSubmissionRow[]>`
      SELECT id, processing_state, revision, category, title, issue_id,
             needs_input_message, updated_at
      FROM public.submissions
      WHERE id = ${c.req.param("id")}::uuid AND owner_id = ${user.id}::uuid
    `;
    const row = rows[0];
    if (!row) throw new HttpError(404, "not_found", "Submission not found.");
    return c.json({
      id: row.id,
      processingState: row.processing_state,
      revision: row.revision,
      category: row.category,
      title: row.title,
      issueId: row.issue_id,
      needsInputMessage: row.needs_input_message,
      updatedAt: iso(row.updated_at),
    });
  });

  app.patch("/api/submissions/:id", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, patchSubmissionRequestSchema);
    if (input.location) {
      assertInNyc(input.location.longitude, input.location.latitude, config);
    }
    const source = input.sourceUrl ? parseSource(input.sourceUrl) : null;
    const rows = await sql<SubmissionRow[]>`
      UPDATE public.submissions
      SET
        category = COALESCE(${input.category ?? null}::public.issue_category, category),
        title = COALESCE(${input.title ?? null}, title),
        description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE description END,
        location_text = COALESCE(${input.locationText ?? null}, location_text),
        location = CASE
          WHEN ${input.location ? input.location.longitude : null}::float8 IS NULL THEN location
          ELSE ST_SetSRID(ST_MakePoint(${input.location?.longitude ?? 0}, ${input.location?.latitude ?? 0}), 4326)
        END,
        location_precision = COALESCE(${input.locationPrecision ?? null}::public.location_precision, location_precision),
        revision = revision + 1,
        updated_at = now()
      WHERE id = ${c.req.param("id")}::uuid
        AND owner_id = ${user.id}::uuid
        AND revision = ${input.expectedRevision}
        AND processing_state IN ('draft', 'needs_input', 'pending_review')
      RETURNING id, processing_state, revision
    `;
    if (!rows[0]) {
      const owned = await sql<{ revision: number }[]>`
        SELECT revision FROM public.submissions
        WHERE id = ${c.req.param("id")}::uuid AND owner_id = ${user.id}::uuid
      `;
      if (!owned[0]) throw new HttpError(404, "not_found", "Submission not found.");
      throw new HttpError(409, "revision_conflict", "This draft changed. Reload and try again.");
    }
    if (source) {
      await sql`
        INSERT INTO public.source_posts (platform, platform_post_id, url, canonical_url)
        VALUES (${source.platform}, ${source.platformPostId}, ${input.sourceUrl!}, ${source.canonicalUrl})
        ON CONFLICT (platform, platform_post_id) DO UPDATE SET url = EXCLUDED.url
      `;
    }
    return c.json({
      id: rows[0].id,
      processingState: rows[0].processing_state,
      revision: rows[0].revision,
      accepted: true,
    });
  });

  app.post("/api/uploads/sign", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, uploadSignRequestSchema);
    const max = maxBytes(input.mimeType);
    if (!max) {
      throw new HttpError(400, "unsupported_media", "Upload a JPEG, PNG, WebP, or MP4.");
    }
    if (input.byteSize > max) {
      throw new HttpError(
        400,
        "unsupported_media",
        IMAGE_MIME.has(input.mimeType)
          ? "Photos must be 10 MB or smaller."
          : "Videos must be 50 MB or smaller and 60 seconds or less.",
      );
    }
    const [pending] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.media
      WHERE owner_id = ${user.id}::uuid AND upload_completed_at IS NULL
    `;
    if ((pending?.n ?? 0) >= 2) {
      throw new HttpError(429, "quota_exceeded", "Finish or discard your pending uploads first.", {
        retryAfterSeconds: 60,
      });
    }
    const mediaId = crypto.randomUUID();
    const objectKey = `uploads/${user.id}/${mediaId}`;
    const signed = await objectStore.signUpload(objectKey, input.mimeType);
    await sql`
      INSERT INTO public.media (
        id, owner_id, submission_id, private_object_key, mime_type, byte_size
      ) VALUES (
        ${mediaId}::uuid,
        ${user.id}::uuid,
        ${input.submissionId ?? null}::uuid,
        ${objectKey},
        ${input.mimeType},
        ${input.byteSize}
      )
    `;
    return c.json({
      mediaId,
      objectKey,
      uploadUrl: signed.uploadUrl,
      headers: signed.headers,
      expiresAt: signed.expiresAt,
    });
  });

  app.post("/api/uploads/:id/complete", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, uploadCompleteRequestSchema);
    const rows = await sql<MediaRow[]>`
      SELECT id, private_object_key, mime_type, byte_size, upload_completed_at
      FROM public.media
      WHERE id = ${c.req.param("id")}::uuid AND owner_id = ${user.id}::uuid
    `;
    const media = rows[0];
    if (!media) throw new HttpError(404, "not_found", "Upload not found.");
    const actual = await objectStore.size(media.private_object_key);
    if (actual == null || actual <= 0) {
      throw new HttpError(400, "upload_incomplete", "The file has not finished uploading.");
    }
    const max = maxBytes(media.mime_type);
    if (!max || actual > max || (media.byte_size != null && actual > num(media.byte_size))) {
      throw new HttpError(400, "unsupported_media", "Uploaded file is larger than the signed limit.");
    }
    const updated = await sql<{ upload_completed_at: Date; byte_size: number; mime_type: string }[]>`
      UPDATE public.media
      SET upload_completed_at = COALESCE(upload_completed_at, now()),
          byte_size = ${actual},
          content_digest = COALESCE(${input.contentDigest ?? null}, content_digest)
      WHERE id = ${media.id}::uuid
      RETURNING upload_completed_at, byte_size, mime_type
    `;
    const done = updated[0];
    if (!done?.upload_completed_at) {
      throw new HttpError(500, "internal_error", "Upload could not be marked complete.");
    }
    return c.json({
      mediaId: media.id,
      uploadCompletedAt: iso(done.upload_completed_at),
      mimeType: done.mime_type,
      byteSize: num(done.byte_size),
    });
  });

  app.put("/api/issues/:id/support", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, supportToggleRequestSchema);
    const [issue] = await sql<{ id: string }[]>`
      SELECT id FROM public.issues
      WHERE id = ${c.req.param("id")}::uuid
        AND status IN ('open', 'fix_pending', 'resolved')
    `;
    if (!issue) throw new HttpError(404, "not_found", "Report not found.");
    const [toggled] = await sql<{ supported: boolean }[]>`
      SELECT app.set_issue_support(
        ${issue.id}::uuid, ${user.id}::uuid, ${input.supported}
      ) AS supported
    `;
    const [count] = await sql<{ support_count: number }[]>`
      SELECT support_count FROM public.issues WHERE id = ${issue.id}::uuid
    `;
    const result = toggled && count
      ? { supported: toggled.supported, support_count: count.support_count }
      : null;
    if (!result) throw new HttpError(500, "internal_error", "Support was not saved.");
    return c.json({
      issueId: issue.id,
      supported: result.supported,
      supportCount: result.support_count,
    });
  });

  app.post("/api/issues/:id/updates", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, createIssueUpdateRequestSchema);
    if (input.kind === "fix_claim" && input.rightsAttested !== true) {
      throw new HttpError(400, "validation_failed", "Confirm you have the rights to submit this evidence.");
    }
    if (input.kind === "fix_claim" && !input.observedAt) {
      throw new HttpError(400, "validation_failed", "Add the date you saw the repair.");
    }
    const issueId = c.req.param("id");
    const update = await sql.begin(async (tx) => {
      const [issue] = await tx<{ id: string; status: string; revision: number }[]>`
        SELECT id, status, revision FROM public.issues
        WHERE id = ${issueId}::uuid
          AND status IN ('open', 'fix_pending', 'resolved')
        FOR UPDATE
      `;
      if (!issue) throw new HttpError(404, "not_found", "Report not found.");
      if (input.mediaIds.length > 0) {
        await assertOwnedMedia(tx, user.id, input.mediaIds);
      }
      const inserted = await tx<{ id: string; moderation_state: string }[]>`
        INSERT INTO public.updates (issue_id, author_id, kind, body, observed_at, proposed_status)
        VALUES (
          ${issue.id}::uuid,
          ${user.id}::uuid,
          ${input.kind}::public.update_kind,
          ${input.body ?? null},
          ${input.observedAt ?? null}::timestamptz,
          ${input.kind === "fix_claim" ? "fix_pending" : (input.proposedStatus ?? null)}::public.issue_status
        )
        RETURNING id, moderation_state
      `;
      const row = inserted[0];
      if (!row) throw new HttpError(500, "internal_error", "Update was not saved.");
      if (input.mediaIds.length > 0) {
        await tx`
          INSERT INTO public.evidence (
            media_id, issue_id, update_id, provenance, visibility
          )
          SELECT
            m.id,
            ${issue.id}::uuid,
            ${row.id}::uuid,
            'user_upload',
            'reviewers_only'
          FROM public.media m
          WHERE m.owner_id = ${user.id}::uuid
            AND m.id = ANY(${input.mediaIds}::uuid[])
            AND m.upload_completed_at IS NOT NULL
        `;
      }
      if (input.kind === "fix_claim" && issue.status === "open") {
        await tx`
          SELECT app.transition_issue_status(
            ${issue.id}::uuid,
            ${issue.revision}::int,
            'fix_pending'::public.issue_status,
            ${user.id}::uuid,
            ${"Fix evidence submitted"},
            ${input.mediaIds}::uuid[],
            NULL::uuid
          )
        `;
      }
      return row;
    });
    return c.json({
      id: update.id,
      issueId,
      moderationState: update.moderation_state === "needs_info" ? "needs_info" : "pending",
    });
  });

  app.post("/api/issues/:id/flags", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    const input = await parseJson(c, createIssueFlagRequestSchema);
    const [issue] = await sql<{ id: string }[]>`
      SELECT id FROM public.issues WHERE id = ${c.req.param("id")}::uuid
    `;
    if (!issue) throw new HttpError(404, "not_found", "Report not found.");
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO public.abuse_flags (target_type, target_id, reason, reporter_id)
      VALUES ('issue', ${issue.id}::uuid, ${input.reason}, ${user.id}::uuid)
      RETURNING id
    `;
    const flag = inserted[0];
    if (!flag) throw new HttpError(500, "internal_error", "Flag was not saved.");
    return c.json({ id: flag.id, accepted: true });
  });

  app.get("/api/admin/queue", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    if (!MODERATOR_ROLES.has(user.role)) {
      throw new HttpError(403, "forbidden", "Moderator role required.");
    }

    const submissionRows = await sql<QueueSubmissionRow[]>`
      SELECT
        s.id,
        s.title,
        s.category,
        s.description,
        s.location_text,
        ST_X(s.location) AS longitude,
        ST_Y(s.location) AS latitude,
        s.revision,
        s.created_at,
        sp.canonical_url AS source_url
      FROM public.submissions s
      LEFT JOIN public.source_posts sp ON sp.id = s.source_post_id
      WHERE s.processing_state = 'pending_review'
      ORDER BY s.created_at DESC, s.id DESC
    `;

    const fixRows = await sql<QueueFixRow[]>`
      SELECT
        u.id AS update_id,
        i.id AS issue_id,
        i.title,
        i.category,
        i.borough,
        i.revision,
        u.created_at,
        u.body AS description,
        ST_X(i.geometry) AS longitude,
        ST_Y(i.geometry) AS latitude
      FROM public.updates u
      JOIN public.issues i ON i.id = u.issue_id
      WHERE u.kind = 'fix_claim'
        AND u.moderation_state = 'pending'
      ORDER BY u.created_at DESC, u.id DESC
    `;

    // Senior mods also see verified-fixed issues so they can reopen (SPEC §19 M1).
    const resolvedRows = SENIOR_ROLES.has(user.role)
      ? await sql<QueueResolvedRow[]>`
          SELECT
            i.id AS issue_id,
            i.title,
            i.category,
            i.borough,
            i.revision,
            COALESCE(i.resolved_at, i.updated_at, i.created_at) AS created_at,
            i.description,
            ST_X(i.geometry) AS longitude,
            ST_Y(i.geometry) AS latitude
          FROM public.issues i
          WHERE i.status = 'resolved'
          ORDER BY COALESCE(i.resolved_at, i.updated_at, i.created_at) DESC, i.id DESC
          LIMIT 50
        `
      : [];

    const submissionIds = submissionRows.map((row) => row.id);
    const updateIds = fixRows.map((row) => row.update_id);
    const resolvedIds = resolvedRows.map((row) => row.issue_id);

    const submissionMedia =
      submissionIds.length === 0
        ? []
        : await sql<QueueMediaRow[]>`
            SELECT m.id, m.submission_id AS owner_key, m.mime_type, m.private_object_key
            FROM public.media m
            WHERE m.submission_id = ANY(${submissionIds}::uuid[])
              AND m.upload_completed_at IS NOT NULL
            ORDER BY m.created_at
          `;

    const fixMedia =
      updateIds.length === 0
        ? []
        : await sql<QueueMediaRow[]>`
            SELECT m.id, e.update_id AS owner_key, m.mime_type, m.private_object_key
            FROM public.evidence e
            JOIN public.media m ON m.id = e.media_id
            WHERE e.update_id = ANY(${updateIds}::uuid[])
              AND m.upload_completed_at IS NOT NULL
            ORDER BY e.created_at
          `;

    const resolvedMedia =
      resolvedIds.length === 0
        ? []
        : await sql<QueueMediaRow[]>`
            SELECT m.id, e.issue_id AS owner_key, m.mime_type, m.private_object_key
            FROM public.evidence e
            JOIN public.media m ON m.id = e.media_id
            WHERE e.issue_id = ANY(${resolvedIds}::uuid[])
              AND e.visibility = 'public'
              AND m.publication_permission = 'allowed'
              AND m.upload_completed_at IS NOT NULL
            ORDER BY e.created_at
          `;

    const mediaByOwner = new Map<string, QueueMediaRow[]>();
    for (const row of [...submissionMedia, ...fixMedia, ...resolvedMedia]) {
      if (!row.owner_key) continue;
      const list = mediaByOwner.get(row.owner_key) ?? [];
      list.push(row);
      mediaByOwner.set(row.owner_key, list);
    }

    const toMedia = (ownerKey: string) =>
      (mediaByOwner.get(ownerKey) ?? []).map((row) => ({
        id: row.id,
        url: `${config.publicUploadBaseUrl}/${row.private_object_key}`,
        mimeType: row.mime_type,
      }));

    // Triage: fix evidence, then new submissions, then reopen candidates (SPEC §12 / §19).
    const proposalBySubmission = new Map<string, AnalysisProposal>();
    const locationCandidatesBySubmission = new Map<
      string,
      {
        id: string;
        location: { longitude: number; latitude: number };
        precision: string;
        provider: string | null;
        verification: string;
      }[]
    >();
    const duplicatesBySubmission = new Map<
      string,
      {
        issueId: string;
        shortId: string;
        slug: string;
        path: string;
        title: string;
        category: string;
        status: "open" | "fix_pending" | "resolved";
        distanceMeters: number;
      }[]
    >();

    if (submissionIds.length > 0) {
      const proposals = await sql<
        { submission_id: string; proposal: unknown }[]
      >`
        SELECT submission_id, proposal
        FROM public.analysis_proposals
        WHERE submission_id = ANY(${submissionIds}::uuid[])
      `;
      for (const row of proposals) {
        const parsed = analysisProposalSchema.safeParse(row.proposal);
        if (parsed.success) {
          proposalBySubmission.set(row.submission_id, parsed.data);
        }
      }

      const locRows = await sql<
        {
          id: string;
          submission_id: string;
          longitude: number;
          latitude: number;
          precision: string;
          provider: string | null;
          verification: string;
        }[]
      >`
        SELECT
          id,
          submission_id,
          ST_X(geometry) AS longitude,
          ST_Y(geometry) AS latitude,
          precision::text,
          provider,
          verification
        FROM public.location_candidates
        WHERE submission_id = ANY(${submissionIds}::uuid[])
        ORDER BY created_at
      `;
      for (const row of locRows) {
        const list = locationCandidatesBySubmission.get(row.submission_id) ?? [];
        list.push({
          id: row.id,
          location: {
            longitude: num(row.longitude),
            latitude: num(row.latitude),
          },
          precision: row.precision,
          provider: row.provider,
          verification: row.verification,
        });
        locationCandidatesBySubmission.set(row.submission_id, list);
      }

      for (const row of submissionRows) {
        if (row.longitude == null || row.latitude == null) {
          duplicatesBySubmission.set(row.id, []);
          continue;
        }
        const nearby = await sql<
          {
            issue_id: string;
            short_id: string;
            slug: string;
            title: string;
            category: string;
            status: string;
            distance_m: number;
          }[]
        >`
          SELECT * FROM app.nearby_issue_candidates(
            ${num(row.longitude)}::float8,
            ${num(row.latitude)}::float8,
            50::float8,
            ${row.category}::public.issue_category,
            10
          )
        `;
        duplicatesBySubmission.set(
          row.id,
          nearby.map((n) => ({
            issueId: n.issue_id,
            shortId: n.short_id,
            slug: n.slug,
            path: `/r/${n.slug}-${n.short_id}`,
            title: n.title,
            category: n.category,
            status: n.status as "open" | "fix_pending" | "resolved",
            distanceMeters: Math.round(num(n.distance_m) * 10) / 10,
          })),
        );
      }
    }

    const items = [
      ...fixRows.map((row) => ({
        id: row.update_id,
        kind: "fix_claim" as const,
        issueId: row.issue_id,
        title: row.title,
        category: row.category,
        borough: row.borough,
        createdAt: iso(row.created_at),
        revision: row.revision,
        locationText: null,
        location:
          row.longitude != null && row.latitude != null
            ? { longitude: num(row.longitude), latitude: num(row.latitude) }
            : null,
        description: row.description,
        sourceUrl: null,
        media: toMedia(row.update_id),
        analysisProposal: null,
        duplicateCandidates: [],
        locationCandidates: [],
      })),
      ...submissionRows.map((row) => ({
        id: row.id,
        kind: "submission" as const,
        issueId: null,
        title: row.title,
        category: row.category,
        borough: null,
        createdAt: iso(row.created_at),
        revision: row.revision,
        locationText: row.location_text,
        location:
          row.longitude != null && row.latitude != null
            ? { longitude: num(row.longitude), latitude: num(row.latitude) }
            : null,
        description: row.description,
        sourceUrl: row.source_url,
        media: toMedia(row.id),
        analysisProposal: proposalBySubmission.get(row.id) ?? null,
        duplicateCandidates: duplicatesBySubmission.get(row.id) ?? [],
        locationCandidates: locationCandidatesBySubmission.get(row.id) ?? [],
      })),
      ...resolvedRows.map((row) => ({
        id: row.issue_id,
        kind: "resolved" as const,
        issueId: row.issue_id,
        title: row.title,
        category: row.category,
        borough: row.borough,
        createdAt: iso(row.created_at),
        revision: row.revision,
        locationText: null,
        location:
          row.longitude != null && row.latitude != null
            ? { longitude: num(row.longitude), latitude: num(row.latitude) }
            : null,
        description: row.description,
        sourceUrl: null,
        media: toMedia(row.issue_id),
        analysisProposal: null,
        duplicateCandidates: [],
        locationCandidates: [],
      })),
    ];

    return c.json(adminQueueResponseSchema.parse({ items }));
  });

  app.get("/api/admin/analysis", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    if (!MODERATOR_ROLES.has(user.role)) {
      throw new HttpError(403, "forbidden", "Moderator role required.");
    }
    const status = await loadAnalysisStatus(sql, config);
    return c.json(status);
  });

  app.patch("/api/admin/analysis", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    if (user.role !== "admin") {
      throw new HttpError(403, "forbidden", "Admin role required.");
    }
    const input = await parseJson(c, patchAnalysisSettingsRequestSchema);
    await sql`
      UPDATE public.analysis_settings
      SET
        analysis_enabled = COALESCE(${input.analysisEnabled ?? null}::boolean, analysis_enabled),
        analysis_paused = COALESCE(${input.analysisPaused ?? null}::boolean, analysis_paused),
        pause_reason = CASE
          WHEN ${input.pauseReason !== undefined} THEN ${input.pauseReason ?? null}
          WHEN ${input.analysisPaused === false} THEN NULL
          ELSE pause_reason
        END,
        daily_cap_cents = COALESCE(${input.dailyCapCents ?? null}::int, daily_cap_cents),
        monthly_cap_cents = COALESCE(${input.monthlyCapCents ?? null}::int, monthly_cap_cents),
        updated_at = now()
      WHERE id = 1
    `;
    return c.json(await loadAnalysisStatus(sql, config));
  });

  app.post("/api/admin/reviews/:id/decision", async (c) => {
    const sql = requireSql(deps.sql);
    const user = requireVerified(c.get("user"));
    if (!MODERATOR_ROLES.has(user.role)) {
      throw new HttpError(403, "forbidden", "Moderator role required.");
    }
    const input = await parseJson(c, adminReviewDecisionRequestSchema);
    if (input.location) {
      assertInNyc(input.location.longitude, input.location.latitude, config);
    }
    const id = c.req.param("id");
    if (input.decision === "approve" || input.decision === "reject" || input.decision === "needs_info") {
      return c.json(await decideSubmission(sql, user, id, input, config));
    }
    return c.json(await decideIssue(sql, user, id, input));
  });

  return app;
}

async function loadAnalysisStatus(sql: Sql, config: ApiConfig) {
  const [settings] = await sql<{
    analysis_enabled: boolean;
    analysis_paused: boolean;
    pause_reason: string | null;
    daily_cap_cents: number;
    monthly_cap_cents: number;
    pipeline_version: string;
  }[]>`
    SELECT analysis_enabled, analysis_paused, pause_reason,
           daily_cap_cents, monthly_cap_cents, pipeline_version
    FROM public.analysis_settings WHERE id = 1
  `;
  const [spend] = await sql<{ daily: number; monthly: number }[]>`
    SELECT
      app.analysis_spend_cents(date_trunc('day', now() AT TIME ZONE 'utc')) AS daily,
      app.analysis_spend_cents(date_trunc('month', now() AT TIME ZONE 'utc')) AS monthly
  `;
  const dailyCapCents = settings?.daily_cap_cents ?? 500;
  const monthlyCapCents = settings?.monthly_cap_cents ?? 10_000;
  const dailySpendCents = spend?.daily ?? 0;
  const monthlySpendCents = spend?.monthly ?? 0;
  return {
    enabled: settings?.analysis_enabled ?? config.analysisEnabledDefault,
    paused: settings?.analysis_paused ?? false,
    pauseReason: settings?.pause_reason ?? null,
    dailyCapCents,
    monthlyCapCents,
    dailySpendCents,
    monthlySpendCents,
    dailySpendWarning: spendWarningLevel(dailySpendCents, dailyCapCents),
    monthlySpendWarning: spendWarningLevel(monthlySpendCents, monthlyCapCents),
    pipelineVersion: settings?.pipeline_version ?? "m2.v1",
  };
}
async function decideSubmission(
  sql: Sql,
  user: AuthUser,
  id: string,
  input: AdminReviewDecisionRequest,
  config: ApiConfig,
) {
  return sql.begin(async (tx) => {
    const [submission] = await tx<FullSubmission[]>`
      SELECT id, owner_id, processing_state, category, title, description,
             location_text, ST_X(location) AS longitude, ST_Y(location) AS latitude,
             location_precision, source_post_id, revision
      FROM public.submissions
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    if (!submission) throw new HttpError(404, "not_found", "Submission not found.");
    if (submission.revision !== input.expectedRevision) {
      throw new HttpError(409, "revision_conflict", "This submission changed. Reload and try again.");
    }
    if (input.decision === "needs_info") {
      const [row] = await tx<{ revision: number; processing_state: string }[]>`
        UPDATE public.submissions
        SET processing_state = 'needs_input',
            needs_input_message = ${input.needsInfoMessage ?? null},
            revision = revision + 1,
            updated_at = now()
        WHERE id = ${submission.id}::uuid
        RETURNING revision, processing_state
      `;
      return {
        submissionId: submission.id,
        issueId: null,
        processingState: row?.processing_state,
        revision: row?.revision,
      };
    }
    if (input.decision === "reject") {
      const [row] = await tx<{ revision: number; processing_state: string }[]>`
        UPDATE public.submissions
        SET processing_state = 'rejected', revision = revision + 1, updated_at = now()
        WHERE id = ${submission.id}::uuid
        RETURNING revision, processing_state
      `;
      return {
        submissionId: submission.id,
        issueId: null,
        processingState: row?.processing_state,
        revision: row?.revision,
      };
    }

    if (!input.borough) {
      throw new HttpError(400, "validation_failed", "Choose a borough before publishing.");
    }
    const category = input.category ?? submission.category;
    const title = input.title ?? submission.title ?? submission.location_text ?? "NYC report";
    if (!category || submission.longitude == null || submission.latitude == null) {
      throw new HttpError(400, "validation_failed", "Category and a location pin are required to publish.");
    }
    const longitude = input.location?.longitude ?? num(submission.longitude);
    const latitude = input.location?.latitude ?? num(submission.latitude);
    const precision = input.locationPrecision ?? submission.location_precision ?? "user_supplied";
    const slug = slugFromTitle(title);
    const shortId = createShortId();
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO public.issues (
        short_id, slug, category, title, description, geometry, precision,
        borough, status, created_by, submission_id, last_verified_at
      ) VALUES (
        ${shortId},
        ${slug},
        ${category}::public.issue_category,
        ${title},
        ${submission.description},
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
        ${precision}::public.location_precision,
        ${input.borough}::public.nyc_borough,
        'open',
        ${submission.owner_id}::uuid,
        ${submission.id}::uuid,
        now()
      )
      RETURNING id
    `;
    const issueId = inserted[0]?.id;
    if (!issueId) throw new HttpError(500, "internal_error", "Report was not published.");

    await tx`
      INSERT INTO public.status_events (issue_id, old_status, new_status, actor_id, reason, revision_after)
      VALUES (${issueId}::uuid, NULL, 'open', ${user.id}::uuid, ${input.reason ?? "Published"}, 1)
    `;
    if (submission.source_post_id) {
      await tx`
        INSERT INTO public.issue_sources (issue_id, source_post_id)
        VALUES (${issueId}::uuid, ${submission.source_post_id}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }
    await tx`
      INSERT INTO public.evidence (media_id, issue_id, submission_id, provenance, visibility, summary)
      SELECT m.id, ${issueId}::uuid, ${submission.id}::uuid, 'user_upload', 'public', NULL
      FROM public.media m
      WHERE m.submission_id = ${submission.id}::uuid
        AND m.owner_id = ${submission.owner_id}::uuid
        AND m.upload_completed_at IS NOT NULL
    `;
    await tx`
      UPDATE public.media
      SET publication_permission = 'allowed'
      WHERE submission_id = ${submission.id}::uuid AND upload_completed_at IS NOT NULL
    `;
    const [updated] = await tx<{ revision: number; processing_state: string }[]>`
      UPDATE public.submissions
      SET processing_state = 'accepted', issue_id = ${issueId}::uuid, revision = revision + 1, updated_at = now()
      WHERE id = ${submission.id}::uuid
      RETURNING revision, processing_state
    `;
    await enqueueIssueTransitionOutbox(tx as unknown as Sql, issueId, "issue.published");
    void config;
    return {
      submissionId: submission.id,
      issueId,
      processingState: updated?.processing_state,
      issueStatus: "open" as const,
      revision: 1,
    };
  });
}

async function decideIssue(
  sql: Sql,
  user: AuthUser,
  id: string,
  input: AdminReviewDecisionRequest,
) {
  const nextStatus =
    input.decision === "verify_fix"
      ? "resolved"
      : input.decision === "reject_fix"
        ? "open"
        : input.decision === "hide"
          ? "hidden"
          : input.decision === "duplicate"
            ? "duplicate"
            : "open";
  if (
    (nextStatus === "hidden" || nextStatus === "duplicate" || input.decision === "reopen") &&
    !SENIOR_ROLES.has(user.role)
  ) {
    throw new HttpError(403, "forbidden", "A senior moderator has to make that decision.");
  }
  const [issue] = await sql<{ id: string; status: string; revision: number }[]>`
    SELECT id, status, revision FROM public.issues WHERE id = ${id}::uuid
  `;
  if (!issue) throw new HttpError(404, "not_found", "Report not found.");
  if (issue.revision !== input.expectedRevision) {
    throw new HttpError(409, "revision_conflict", "This report changed. Reload and try again.");
  }
  if (input.decision === "verify_fix" && issue.status !== "fix_pending") {
    throw new HttpError(409, "invalid_status_transition", "Only a possibly-fixed report can be verified.");
  }
  if (input.decision === "reject_fix" && issue.status !== "fix_pending") {
    throw new HttpError(409, "invalid_status_transition", "There is no pending fix to reject.");
  }
  if (input.decision === "reopen" && issue.status !== "resolved") {
    throw new HttpError(409, "invalid_status_transition", "Only a verified fix can be reopened.");
  }
  const [updated] = await sql<{ status: string; revision: number }[]>`
    SELECT status, revision FROM app.transition_issue_status(
      ${issue.id}::uuid,
      ${input.expectedRevision}::int,
      ${nextStatus}::public.issue_status,
      ${user.id}::uuid,
      ${input.reason ?? null},
      ${input.evidenceIds}::uuid[],
      ${input.canonicalIssueId ?? null}::uuid
    )
  `;
  if (!updated) throw new HttpError(500, "internal_error", "Status was not updated.");
  if (input.decision === "verify_fix" || input.decision === "reject_fix") {
    await sql`
      UPDATE public.updates
      SET moderation_state = ${
        input.decision === "verify_fix" ? "approved" : "rejected"
      }::public.moderation_state,
          updated_at = now()
      WHERE issue_id = ${issue.id}::uuid
        AND kind = 'fix_claim'
        AND moderation_state = 'pending'
    `;
    if (input.decision === "verify_fix") {
      await sql`
        UPDATE public.media m
        SET publication_permission = 'allowed'
        FROM public.evidence e
        JOIN public.updates u ON u.id = e.update_id
        WHERE e.media_id = m.id
          AND u.issue_id = ${issue.id}::uuid
          AND u.kind = 'fix_claim'
          AND u.moderation_state = 'approved'
      `;
      await sql`
        UPDATE public.evidence e
        SET visibility = 'public'
        FROM public.updates u
        WHERE e.update_id = u.id
          AND u.issue_id = ${issue.id}::uuid
          AND u.kind = 'fix_claim'
          AND u.moderation_state = 'approved'
      `;
    }
  }
  await enqueueIssueTransitionOutbox(sql, issue.id, "issue.transitioned");
  return {
    issueId: issue.id,
    issueStatus: updated.status,
    revision: updated.revision,
  };
}

function requireSql(sql: Sql | null): Sql {
  if (!sql) {
    throw new HttpError(503, "internal_error", "Database is not configured.");
  }
  return sql;
}

function requireVerified(user: AuthUser | null): AuthUser {
  if (!user) throw new HttpError(401, "unauthorized", "Sign in to continue.");
  if (!user.emailVerified) {
    throw new HttpError(403, "forbidden", "Verify your email before submitting.");
  }
  return user;
}

function assertInNyc(longitude: number, latitude: number, config: ApiConfig): void {
  if (!insideNycBbox(longitude, latitude, config.bbox)) {
    throw new HttpError(400, "validation_failed", "The pin has to be inside New York City.");
  }
}

function parseSource(raw: string) {
  try {
    return canonicalizeTikTokUrl(raw);
  } catch (error) {
    throw new HttpError(
      400,
      "validation_failed",
      error instanceof Error ? error.message : "Invalid source URL.",
    );
  }
}

function maxBytes(mime: string): number | null {
  if (IMAGE_MIME.has(mime)) return 10 * 1024 * 1024;
  if (VIDEO_MIME.has(mime)) return 50 * 1024 * 1024;
  return null;
}

async function assertOwnedMedia(
  sql: Sql,
  ownerId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM public.media
    WHERE owner_id = ${ownerId}::uuid
      AND upload_completed_at IS NOT NULL
      AND id = ANY(${mediaIds}::uuid[])
  `;
  if (rows.length !== mediaIds.length) {
    throw new HttpError(400, "upload_incomplete", "Every photo or video must finish uploading first.");
  }
}

async function loadFingerprint(
  sql: Sql,
  ownerId: string,
  idempotencyKey: string,
): Promise<{ id: string; processing_state: string; revision: number; fingerprint: SubmissionFingerprint } | null> {
  const rows = await sql<FingerprintRow[]>`
    SELECT s.id, s.kind, s.category, s.location_text, s.processing_state, s.revision,
           ST_X(s.location) AS longitude, ST_Y(s.location) AS latitude,
           sp.canonical_url
    FROM public.submissions s
    LEFT JOIN public.source_posts sp ON sp.id = s.source_post_id
    WHERE s.owner_id = ${ownerId}::uuid AND s.idempotency_key = ${idempotencyKey}
  `;
  const row = rows[0];
  if (!row || !row.category) return null;
  const media = await sql<{ id: string }[]>`
    SELECT id FROM public.media WHERE submission_id = ${row.id}::uuid ORDER BY id
  `;
  return {
    id: row.id,
    processing_state: row.processing_state,
    revision: row.revision,
    fingerprint: {
      kind: row.kind,
      category: row.category,
      locationText: row.location_text?.trim() ?? "",
      longitude: Math.round(num(row.longitude) * 1e6) / 1e6,
      latitude: Math.round(num(row.latitude) * 1e6) / 1e6,
      sourceUrl: row.canonical_url,
      mediaIds: media.map((item) => item.id).sort(),
    },
  };
}

async function parseJson<T>(
  c: { req: { json: () => Promise<unknown> } },
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "validation_failed", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "validation_failed", parsed.error.issues[0]?.message ?? "Invalid request.", {
      details: { issues: parsed.error.issues.map((issue) => issue.message) },
    });
  }
  return parsed.data;
}

type IssueListRow = {
  id: string;
  short_id: string;
  slug: string;
  category: string;
  title: string;
  status: "open" | "fix_pending" | "resolved";
  borough: string;
  longitude: number;
  latitude: number;
  support_count: number;
  created_at: Date;
  resolved_at: Date | null;
  revision: number;
  thumbnail_url?: string | null;
  description?: string | null;
  precision?: string;
  last_verified_at?: Date | null;
};

type IssueDetailRow = IssueListRow & {
  description: string | null;
  precision: string;
  last_verified_at: Date | null;
};

type EvidenceRow = {
  id: string;
  mime_type: string;
  private_object_key: string;
  width: number | null;
  height: number | null;
  summary: string | null;
  observed_at: Date | null;
};

type SourceRow = { platform: string; canonical_url: string; availability: string };
type HistoryRow = {
  old_status: string | null;
  new_status: string;
  reason: string | null;
  created_at: Date;
};
type StatsRow = {
  open_count: number;
  fix_pending_count: number;
  resolved_count: number;
  median_days: number | null;
};
type SubmissionRow = { id: string; processing_state: string; revision: number };
type OwnerSubmissionRow = SubmissionRow & {
  category: string | null;
  title: string | null;
  issue_id: string | null;
  needs_input_message: string | null;
  updated_at: Date;
};
type MediaRow = {
  id: string;
  private_object_key: string;
  mime_type: string;
  byte_size: number | null;
  upload_completed_at: Date | null;
};
type FingerprintRow = {
  id: string;
  kind: string;
  category: string | null;
  location_text: string | null;
  processing_state: string;
  revision: number;
  longitude: number;
  latitude: number;
  canonical_url: string | null;
};
type FullSubmission = {
  id: string;
  owner_id: string;
  processing_state: string;
  category: string | null;
  title: string | null;
  description: string | null;
  location_text: string | null;
  longitude: number | null;
  latitude: number | null;
  location_precision: string | null;
  source_post_id: string | null;
  revision: number;
};

type QueueSubmissionRow = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  location_text: string | null;
  longitude: number | null;
  latitude: number | null;
  revision: number;
  created_at: Date;
  source_url: string | null;
};

type QueueFixRow = {
  update_id: string;
  issue_id: string;
  title: string;
  category: string;
  borough: string;
  revision: number;
  created_at: Date;
  description: string | null;
  longitude: number | null;
  latitude: number | null;
};

type QueueResolvedRow = {
  issue_id: string;
  title: string;
  category: string;
  borough: string;
  revision: number;
  created_at: Date;
  description: string | null;
  longitude: number | null;
  latitude: number | null;
};

type QueueMediaRow = {
  id: string;
  owner_key: string | null;
  mime_type: string;
  private_object_key: string;
};

type ShareIssueRow = {
  title: string;
  status: string;
  borough: string;
  slug: string;
  short_id: string;
};

const SHARE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  fix_pending: "Possibly fixed",
  resolved: "Verified fixed",
};

const SHARE_BOROUGH_LABELS: Record<string, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "Bronx",
  staten_island: "Staten Island",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shareHtmlDocument(opts: {
  title: string;
  description: string;
  url: string;
  brandName: string;
  bodyLink: string;
  bodyText: string;
  imageUrl?: string;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  const url = escapeHtml(opts.url);
  const brandName = escapeHtml(opts.brandName);
  const bodyLink = escapeHtml(opts.bodyLink);
  const bodyText = escapeHtml(opts.bodyText);
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${escapeHtml(opts.imageUrl)}"/>`
    : `<meta name="twitter:card" content="summary"/>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title} · ${brandName}</title>
<meta name="description" content="${description}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:url" content="${url}"/>
${imageMeta}
<meta http-equiv="refresh" content="0;url=${bodyLink}"/>
<link rel="canonical" href="${bodyLink}"/>
</head>
<body>
<p><a href="${bodyLink}">${bodyText}</a></p>
</body>
</html>`;
}

function listItem(row: IssueListRow) {
  const days =
    row.resolved_at == null
      ? null
      : Math.max(
          0,
          Math.round(
            (new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()) /
              86_400_000,
          ),
        );
  return {
    id: row.id,
    shortId: row.short_id,
    slug: row.slug,
    path: `/r/${row.slug}-${row.short_id}`,
    category: row.category,
    title: row.title,
    status: row.status,
    borough: row.borough,
    location: { longitude: num(row.longitude), latitude: num(row.latitude) },
    supportCount: row.support_count,
    createdAt: iso(row.created_at),
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
    daysToVerifiedFix: days,
    revision: row.revision,
    ...(row.thumbnail_url ? { thumbnailUrl: row.thumbnail_url } : {}),
  };
}
