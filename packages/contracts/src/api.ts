import { z } from "zod";
import {
  geoPointSchema,
  issueCategorySchema,
  issueStatusSchema,
  locationPrecisionSchema,
  nycBoroughSchema,
  processingStateSchema,
  submissionKindSchema,
  updateKindSchema,
} from "./enums.js";
import {
  analysisProposalSchema,
  duplicateCandidateSchema,
} from "./proposal.js";
const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });

/**
 * Public API shapes for M1–M3 endpoints in SPEC §10 / §17 / §26.
 */

// --- Public issue detail (GET /api/public/issues/{id}) ---------------------

export const publicEvidenceSchema = z.object({
  id: uuid,
  kind: z.enum(["image", "video", "frame"]),
  /** Public derivative URL only — never a private object key */
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  observedAt: isoDateTime.nullable().optional(),
  summary: z.string().nullable().optional(),
});
export type PublicEvidence = z.infer<typeof publicEvidenceSchema>;

export const publicSourceAttributionSchema = z.object({
  platform: z.string().min(1),
  url: z.string().url(),
  availability: z.enum([
    "unknown",
    "available",
    "unavailable",
    "private",
    "deleted",
  ]),
});
export type PublicSourceAttribution = z.infer<
  typeof publicSourceAttributionSchema
>;

export const publicStatusEventSchema = z.object({
  oldStatus: issueStatusSchema.nullable(),
  newStatus: issueStatusSchema,
  reason: z.string().nullable().optional(),
  createdAt: isoDateTime,
});
export type PublicStatusEvent = z.infer<typeof publicStatusEventSchema>;

export const publicIssueSchema = z.object({
  id: uuid,
  shortId: z.string().min(1),
  slug: z.string().min(1),
  /** Canonical path /r/{slug}-{shortId} */
  path: z.string().min(1),
  category: issueCategorySchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(["open", "fix_pending", "resolved"]),
  borough: nycBoroughSchema,
  location: geoPointSchema,
  precision: locationPrecisionSchema,
  supportCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  lastVerifiedAt: isoDateTime.nullable(),
  resolvedAt: isoDateTime.nullable(),
  /** Days from createdAt to resolvedAt when resolved; for Fixed feed */
  daysToVerifiedFix: z.number().int().nonnegative().nullable().optional(),
  evidence: z.array(publicEvidenceSchema),
  sources: z.array(publicSourceAttributionSchema),
  statusHistory: z.array(publicStatusEventSchema).optional(),
  revision: z.number().int().positive(),
});
export type PublicIssue = z.infer<typeof publicIssueSchema>;

export const publicIssueListItemSchema = publicIssueSchema.pick({
  id: true,
  shortId: true,
  slug: true,
  path: true,
  category: true,
  title: true,
  status: true,
  borough: true,
  location: true,
  supportCount: true,
  createdAt: true,
  resolvedAt: true,
  daysToVerifiedFix: true,
  revision: true,
}).extend({
  thumbnailUrl: z.string().url().nullable().optional(),
});
export type PublicIssueListItem = z.infer<typeof publicIssueListItemSchema>;

export const publicIssueListResponseSchema = z.object({
  items: z.array(publicIssueListItemSchema),
  nextCursor: z.string().nullable(),
});
export type PublicIssueListResponse = z.infer<
  typeof publicIssueListResponseSchema
>;

/** Allowlisted list filters (SPEC §10). */
export const publicIssueListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  category: issueCategorySchema.optional(),
  borough: nycBoroughSchema.optional(),
  /** Public map statuses only — hidden/duplicate never listed */
  status: z.enum(["open", "fix_pending", "resolved"]).optional(),
});
export type PublicIssueListQuery = z.infer<typeof publicIssueListQuerySchema>;

/** Precomputed / dedicated aggregate totals (SPEC §9–10). */
export const publicStatsSchema = z.object({
  openCount: z.number().int().nonnegative(),
  fixPendingCount: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  /** open + fix_pending + resolved (excludes hidden/duplicate) */
  publishedCount: z.number().int().nonnegative(),
  /** Median days from createdAt to resolvedAt among resolved issues */
  medianDaysToVerifiedFix: z.number().nonnegative().nullable(),
  computedAt: isoDateTime,
});
export type PublicStats = z.infer<typeof publicStatsSchema>;

// --- Submissions (POST /api/submissions, GET/PATCH /api/submissions/{id}) -

export const createSubmissionRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  kind: submissionKindSchema.default("upload"),
  category: issueCategorySchema,
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  locationText: z.string().min(1).max(500),
  location: geoPointSchema,
  locationPrecision: locationPrecisionSchema.default("user_supplied"),
  /** Optional TikTok (etc.) URL — attribution + dedup only */
  sourceUrl: z.string().url().optional(),
  rightsAttested: z.literal(true),
  mediaIds: z.array(uuid).max(5).default([]),
});
export type CreateSubmissionRequest = z.infer<
  typeof createSubmissionRequestSchema
>;

export const createSubmissionResponseSchema = z.object({
  id: uuid,
  processingState: processingStateSchema,
  revision: z.number().int().positive(),
  /** 202 Accepted when queued for review intake */
  accepted: z.literal(true),
});
export type CreateSubmissionResponse = z.infer<
  typeof createSubmissionResponseSchema
>;

export const patchSubmissionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  category: issueCategorySchema.optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).nullable().optional(),
  locationText: z.string().min(1).max(500).optional(),
  location: geoPointSchema.optional(),
  locationPrecision: locationPrecisionSchema.optional(),
  sourceUrl: z.string().url().nullable().optional(),
  mediaIds: z.array(uuid).max(5).optional(),
});
export type PatchSubmissionRequest = z.infer<typeof patchSubmissionRequestSchema>;

export const submissionStatusResponseSchema = z.object({
  id: uuid,
  processingState: processingStateSchema,
  revision: z.number().int().positive(),
  category: issueCategorySchema.nullable(),
  title: z.string().nullable(),
  issueId: uuid.nullable(),
  needsInputMessage: z.string().nullable().optional(),
  updatedAt: isoDateTime,
});
export type SubmissionStatusResponse = z.infer<
  typeof submissionStatusResponseSchema
>;

// --- Uploads (POST /api/uploads/sign, POST /api/uploads/{id}/complete) -----

export const uploadSignRequestSchema = z.object({
  mimeType: z.string().min(3).max(127),
  byteSize: z.number().int().positive().max(50 * 1024 * 1024),
  /** client-suggested filename for logging only */
  filename: z.string().max(255).optional(),
  submissionId: uuid.optional(),
});
export type UploadSignRequest = z.infer<typeof uploadSignRequestSchema>;

export const uploadSignResponseSchema = z.object({
  mediaId: uuid,
  objectKey: z.string().min(1),
  uploadUrl: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  expiresAt: isoDateTime,
});
export type UploadSignResponse = z.infer<typeof uploadSignResponseSchema>;

export const uploadCompleteRequestSchema = z.object({
  contentDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});
export type UploadCompleteRequest = z.infer<typeof uploadCompleteRequestSchema>;

export const uploadCompleteResponseSchema = z.object({
  mediaId: uuid,
  uploadCompletedAt: isoDateTime,
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
});
export type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;

// --- Support toggle (PUT /api/issues/{id}/support) ------------------------

export const supportToggleRequestSchema = z.object({
  supported: z.boolean(),
});
export type SupportToggleRequest = z.infer<typeof supportToggleRequestSchema>;

export const supportToggleResponseSchema = z.object({
  issueId: uuid,
  supported: z.boolean(),
  supportCount: z.number().int().nonnegative(),
});
export type SupportToggleResponse = z.infer<typeof supportToggleResponseSchema>;

// --- Issue update / fix evidence (POST /api/issues/{id}/updates) ----------

export const createIssueUpdateRequestSchema = z.object({
  kind: updateKindSchema,
  body: z.string().max(4000).optional(),
  observedAt: isoDateTime.optional(),
  proposedStatus: z.enum(["fix_pending", "open"]).optional(),
  mediaIds: z.array(uuid).max(5).default([]),
  rightsAttested: z.literal(true).optional(),
});
export type CreateIssueUpdateRequest = z.infer<
  typeof createIssueUpdateRequestSchema
>;

export const createIssueUpdateResponseSchema = z.object({
  id: uuid,
  issueId: uuid,
  moderationState: z.enum(["pending", "needs_info"]),
});
export type CreateIssueUpdateResponse = z.infer<
  typeof createIssueUpdateResponseSchema
>;

// --- Abuse flag (POST /api/issues/{id}/flags) — M1 schema ready -----------

export const createIssueFlagRequestSchema = z.object({
  reason: z.string().min(3).max(2000),
});
export type CreateIssueFlagRequest = z.infer<typeof createIssueFlagRequestSchema>;

export const createIssueFlagResponseSchema = z.object({
  id: uuid,
  accepted: z.literal(true),
});
export type CreateIssueFlagResponse = z.infer<
  typeof createIssueFlagResponseSchema
>;

// --- Admin review decision (POST /api/admin/reviews/{id}/decision) --------

export const adminReviewDecisionSchema = z.enum([
  "approve",
  "reject",
  "needs_info",
  "hide",
  "duplicate",
  "verify_fix",
  "reject_fix",
  "reopen",
]);
export type AdminReviewDecision = z.infer<typeof adminReviewDecisionSchema>;

export const adminReviewDecisionRequestSchema = z
  .object({
    decision: adminReviewDecisionSchema,
    expectedRevision: z.number().int().positive(),
    reason: z.string().max(2000).optional(),
    /** Adjusted pin before publish / on verify */
    location: geoPointSchema.optional(),
    locationPrecision: locationPrecisionSchema.optional(),
    borough: nycBoroughSchema.optional(),
    title: z.string().min(1).max(160).optional(),
    category: issueCategorySchema.optional(),
    canonicalIssueId: uuid.optional(),
    evidenceIds: z.array(uuid).default([]),
    needsInfoMessage: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "duplicate" && !val.canonicalIssueId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "canonicalIssueId is required when decision is duplicate",
        path: ["canonicalIssueId"],
      });
    }
    if (val.decision === "needs_info" && !val.needsInfoMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "needsInfoMessage is required when decision is needs_info",
        path: ["needsInfoMessage"],
      });
    }
  });
export type AdminReviewDecisionRequest = z.infer<
  typeof adminReviewDecisionRequestSchema
>;

export const adminReviewDecisionResponseSchema = z.object({
  submissionId: uuid.optional(),
  issueId: uuid.nullable(),
  processingState: processingStateSchema.optional(),
  issueStatus: issueStatusSchema.optional(),
  revision: z.number().int().positive(),
});
export type AdminReviewDecisionResponse = z.infer<
  typeof adminReviewDecisionResponseSchema
>;

// --- Admin review queue (GET /api/admin/queue) ----------------------------

export const adminQueueItemKindSchema = z.enum([
  "submission",
  "fix_claim",
  /** Verified-fixed issues eligible for senior reopen (resolved → open). */
  "resolved",
]);
export type AdminQueueItemKind = z.infer<typeof adminQueueItemKindSchema>;

export const adminQueueMediaSchema = z.object({
  id: uuid,
  url: z.string().url(),
  mimeType: z.string().min(1),
});
export type AdminQueueMedia = z.infer<typeof adminQueueMediaSchema>;

export const adminQueueItemSchema = z.object({
  /** Submission id or update id — use with kind to call the decision endpoint. */
  id: uuid,
  kind: adminQueueItemKindSchema,
  issueId: uuid.nullable(),
  title: z.string().nullable(),
  category: issueCategorySchema.nullable(),
  borough: nycBoroughSchema.nullable(),
  createdAt: isoDateTime,
  /** Submission.revision or issue.revision — pass as expectedRevision on decision. */
  revision: z.number().int().positive(),
  locationText: z.string().nullable().optional(),
  location: geoPointSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  media: z.array(adminQueueMediaSchema).default([]),
  /** M2: structured analysis proposal shown beside the user's location. */
  analysisProposal: analysisProposalSchema.nullable().optional(),
  /** M2: published issues within ~50 m of the user pin. */
  duplicateCandidates: z.array(duplicateCandidateSchema).default([]),
  /** M2: explicit-clue geocode candidates (private until reviewed). */
  locationCandidates: z
    .array(
      z.object({
        id: uuid,
        location: geoPointSchema,
        precision: locationPrecisionSchema,
        provider: z.string().nullable(),
        verification: z.string().min(1),
      }),
    )
    .default([]),
});
export type AdminQueueItem = z.infer<typeof adminQueueItemSchema>;
export const adminQueueResponseSchema = z.object({
  items: z.array(adminQueueItemSchema),
});
export type AdminQueueResponse = z.infer<typeof adminQueueResponseSchema>;

// --- M3: public snapshots / manifest (SPEC §10–11) ------------------------

export const publicSnapshotFeatureSchema = z.object({
  id: uuid,
  shortId: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  category: issueCategorySchema,
  status: z.enum(["open", "fix_pending", "resolved"]),
  borough: nycBoroughSchema,
  longitude: z.number(),
  latitude: z.number(),
  title: z.string().min(1),
  supportCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdAt: isoDateTime.optional(),
  resolvedAt: isoDateTime.nullable().optional(),
});
export type PublicSnapshotFeature = z.infer<typeof publicSnapshotFeatureSchema>;

export const publicSnapshotSchema = z.object({
  version: z.string().min(1),
  borough: z.union([nycBoroughSchema, z.literal("citywide")]),
  generatedAt: isoDateTime,
  features: z.array(publicSnapshotFeatureSchema),
});
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;

export const publicManifestSchema = z.object({
  version: z.string().min(1),
  publishedAt: isoDateTime,
  featureCount: z.number().int().nonnegative(),
  boroughs: z.array(
    z.object({
      key: z.union([nycBoroughSchema, z.literal("citywide")]),
      path: z.string().min(1),
    }),
  ),
  updatedLabel: z.string().min(1),
});
export type PublicManifest = z.infer<typeof publicManifestSchema>;

// --- M3: content reports /report-content (SPEC §26) -----------------------

export const contentReportCategorySchema = z.enum([
  "privacy_exposure",
  "ncii",
  "threat_safety",
  "wrong_location",
  "other",
]);
export type ContentReportCategory = z.infer<typeof contentReportCategorySchema>;

export const createContentReportRequestSchema = z.object({
  category: contentReportCategorySchema,
  description: z.string().min(3).max(4000),
  pageUrl: z.string().url().optional(),
  issueId: uuid.optional(),
  mediaId: uuid.optional(),
  contactEmail: z.string().email().optional(),
});
export type CreateContentReportRequest = z.infer<
  typeof createContentReportRequestSchema
>;

export const createContentReportResponseSchema = z.object({
  caseNumber: z.string().min(1),
  receiptToken: z.string().min(1),
  statusPath: z.string().min(1),
  isUrgent: z.boolean(),
  urgentDeadlineAt: isoDateTime.nullable(),
  accepted: z.literal(true),
});
export type CreateContentReportResponse = z.infer<
  typeof createContentReportResponseSchema
>;

export const contentReportStatusResponseSchema = z.object({
  caseNumber: z.string().min(1),
  category: contentReportCategorySchema,
  status: z.enum(["open", "acknowledged", "actioned", "closed"]),
  isUrgent: z.boolean(),
  urgentDeadlineAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type ContentReportStatusResponse = z.infer<
  typeof contentReportStatusResponseSchema
>;

// --- M3: admin takedown ---------------------------------------------------

export const createTakedownRequestSchema = z.object({
  kind: z.enum(["copyright", "privacy", "safety", "admin"]),
  issueId: uuid.optional(),
  mediaIds: z.array(uuid).default([]),
  contentReportId: uuid.optional(),
  notes: z.string().max(4000).optional(),
  /** Hide the issue from public maps when true (default for issue-scoped). */
  hideIssue: z.boolean().default(true),
  expectedRevision: z.number().int().positive().optional(),
});
export type CreateTakedownRequest = z.infer<typeof createTakedownRequestSchema>;

export const createTakedownResponseSchema = z.object({
  caseNumber: z.string().min(1),
  status: z.enum(["open", "restricted", "purged", "closed"]),
  issueId: uuid.nullable(),
});
export type CreateTakedownResponse = z.infer<typeof createTakedownResponseSchema>;
