import { z } from "zod";
import {
  abuseFlagResolutionSchema,
  evidenceRelationSchema,
  evidenceVisibilitySchema,
  geoPointSchema,
  issueCategorySchema,
  issueStatusSchema,
  jobStateSchema,
  locationPrecisionSchema,
  mediaPublicationPermissionSchema,
  moderationStateSchema,
  nycBoroughSchema,
  outboxStateSchema,
  processingStateSchema,
  profileRoleSchema,
  providerReservationStateSchema,
  sourceAvailabilitySchema,
  submissionKindSchema,
  updateKindSchema,
} from "./enums.js";

const isoDateTime = z.string().datetime({ offset: true });
const uuid = z.string().uuid();

/** Row shapes aligned with db/migrations (SPEC §9). */

export const profileRowSchema = z.object({
  id: uuid,
  display_name: z.string().min(1),
  role: profileRoleSchema,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

export const sourcePostRowSchema = z.object({
  id: uuid,
  platform: z.string().min(1),
  platform_post_id: z.string().min(1),
  url: z.string().url(),
  canonical_url: z.string().url(),
  availability: sourceAvailabilitySchema,
  created_at: isoDateTime,
});
export type SourcePostRow = z.infer<typeof sourcePostRowSchema>;

export const submissionRowSchema = z.object({
  id: uuid,
  owner_id: uuid,
  kind: submissionKindSchema,
  processing_state: processingStateSchema,
  category: issueCategorySchema.nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location_text: z.string().nullable(),
  location: geoPointSchema.nullable(),
  location_precision: locationPrecisionSchema.nullable(),
  source_post_id: uuid.nullable(),
  canonical_source_key: z.string().nullable(),
  idempotency_key: z.string().min(1),
  revision: z.number().int().positive(),
  issue_id: uuid.nullable(),
  rights_attested_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type SubmissionRow = z.infer<typeof submissionRowSchema>;

export const issueRowSchema = z.object({
  id: uuid,
  short_id: z.string().min(1),
  slug: z.string().min(1),
  category: issueCategorySchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  location: geoPointSchema,
  precision: locationPrecisionSchema,
  borough: nycBoroughSchema,
  status: issueStatusSchema,
  revision: z.number().int().positive(),
  support_count: z.number().int().nonnegative(),
  canonical_issue_id: uuid.nullable(),
  created_by: uuid.nullable(),
  submission_id: uuid.nullable(),
  last_verified_at: isoDateTime.nullable(),
  resolved_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type IssueRow = z.infer<typeof issueRowSchema>;

export const issueSourceRowSchema = z.object({
  issue_id: uuid,
  source_post_id: uuid,
  created_at: isoDateTime,
});
export type IssueSourceRow = z.infer<typeof issueSourceRowSchema>;

export const mediaRowSchema = z.object({
  id: uuid,
  owner_id: uuid,
  submission_id: uuid.nullable(),
  private_object_key: z.string().min(1),
  content_digest: z.string().nullable(),
  mime_type: z.string().min(1),
  byte_size: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  observed_at: isoDateTime.nullable(),
  retention_deadline: isoDateTime.nullable(),
  publication_permission: mediaPublicationPermissionSchema,
  upload_completed_at: isoDateTime.nullable(),
  created_at: isoDateTime,
});
export type MediaRow = z.infer<typeof mediaRowSchema>;

export const updateRowSchema = z.object({
  id: uuid,
  issue_id: uuid,
  author_id: uuid,
  kind: updateKindSchema,
  body: z.string().nullable(),
  observed_at: isoDateTime.nullable(),
  proposed_status: issueStatusSchema.nullable(),
  moderation_state: moderationStateSchema,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type UpdateRow = z.infer<typeof updateRowSchema>;

export const evidenceRowSchema = z.object({
  id: uuid,
  media_id: uuid.nullable(),
  issue_id: uuid.nullable(),
  submission_id: uuid.nullable(),
  update_id: uuid.nullable(),
  source_url: z.string().url().nullable(),
  frame_timestamp_ms: z.number().int().nonnegative().nullable(),
  provenance: z.string().min(1),
  relation: evidenceRelationSchema,
  visibility: evidenceVisibilitySchema,
  summary: z.string().nullable(),
  content_digest: z.string().nullable(),
  created_at: isoDateTime,
});
export type EvidenceRow = z.infer<typeof evidenceRowSchema>;

export const locationCandidateRowSchema = z.object({
  id: uuid,
  submission_id: uuid,
  location: geoPointSchema,
  precision: locationPrecisionSchema,
  provider: z.string().nullable(),
  evidence_ids: z.array(uuid),
  contradiction_ids: z.array(uuid),
  verification: z.string().min(1),
  created_at: isoDateTime,
});
export type LocationCandidateRow = z.infer<typeof locationCandidateRowSchema>;

export const statusEventRowSchema = z.object({
  id: uuid,
  issue_id: uuid,
  old_status: issueStatusSchema.nullable(),
  new_status: issueStatusSchema,
  actor_id: uuid.nullable(),
  reason: z.string().nullable(),
  evidence_ids: z.array(uuid),
  revision_after: z.number().int().positive(),
  created_at: isoDateTime,
});
export type StatusEventRow = z.infer<typeof statusEventRowSchema>;

export const supportRowSchema = z.object({
  issue_id: uuid,
  user_id: uuid,
  created_at: isoDateTime,
});
export type SupportRow = z.infer<typeof supportRowSchema>;

export const jobRowSchema = z.object({
  id: uuid,
  submission_id: uuid.nullable(),
  stage: z.string().min(1),
  state: jobStateSchema,
  attempts: z.number().int().nonnegative(),
  next_run_at: isoDateTime,
  lease_until: isoDateTime.nullable(),
  lease_token: uuid.nullable(),
  pipeline_version: z.string().nullable(),
  cost_reservation_cents: z.number().int().nonnegative().nullable(),
  payload: z.record(z.string(), z.unknown()),
  last_error: z.string().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type JobRow = z.infer<typeof jobRowSchema>;

export const outboxRowSchema = z.object({
  id: uuid,
  topic: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  state: outboxStateSchema,
  attempts: z.number().int().nonnegative(),
  next_run_at: isoDateTime,
  last_error: z.string().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type OutboxRow = z.infer<typeof outboxRowSchema>;

export const providerUsageRowSchema = z.object({
  id: uuid,
  job_id: uuid.nullable(),
  provider: z.string().min(1),
  units: z.number().nullable(),
  estimated_cost_cents: z.number().int().nullable(),
  actual_cost_cents: z.number().int().nullable(),
  reservation_state: providerReservationStateSchema,
  created_at: isoDateTime,
});
export type ProviderUsageRow = z.infer<typeof providerUsageRowSchema>;

export const abuseFlagRowSchema = z.object({
  id: uuid,
  target_type: z.string().min(1),
  target_id: uuid,
  reason: z.string().min(1),
  reporter_id: uuid.nullable(),
  resolution: abuseFlagResolutionSchema,
  resolved_by: uuid.nullable(),
  resolved_at: isoDateTime.nullable(),
  created_at: isoDateTime,
});
export type AbuseFlagRow = z.infer<typeof abuseFlagRowSchema>;
