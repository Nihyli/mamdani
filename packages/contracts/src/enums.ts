import { z } from "zod";

/** Issue lifecycle (SPEC §9). */
export const issueStatusSchema = z.enum([
  "open",
  "fix_pending",
  "resolved",
  "hidden",
  "duplicate",
]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

/** Submission processing pipeline (SPEC §9). Independent of issue status. */
export const processingStateSchema = z.enum([
  "draft",
  "queued",
  "processing",
  "needs_input",
  "pending_review",
  "accepted",
  "rejected",
]);
export type ProcessingState = z.infer<typeof processingStateSchema>;

/** Launch categories (SPEC §3). `other` is review-only for publication. */
export const issueCategorySchema = z.enum([
  "pothole",
  "damaged_sidewalk",
  "broken_park_equipment",
  "broken_fountain",
  "overflowing_trash",
  "broken_streetlight",
  "other",
]);
export type IssueCategory = z.infer<typeof issueCategorySchema>;

export const locationPrecisionSchema = z.enum([
  "user_supplied",
  "asset",
  "intersection",
  "block",
  "neighborhood",
]);
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>;

export const profileRoleSchema = z.enum([
  "user",
  "moderator",
  "senior_moderator",
  "admin",
]);
export type ProfileRole = z.infer<typeof profileRoleSchema>;

export const nycBoroughSchema = z.enum([
  "manhattan",
  "brooklyn",
  "queens",
  "bronx",
  "staten_island",
]);
export type NycBorough = z.infer<typeof nycBoroughSchema>;

export const submissionKindSchema = z.enum(["upload", "link_only"]);
export type SubmissionKind = z.infer<typeof submissionKindSchema>;

export const updateKindSchema = z.enum([
  "note",
  "fix_claim",
  "reopen_request",
  "evidence_add",
]);
export type UpdateKind = z.infer<typeof updateKindSchema>;

export const moderationStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "needs_info",
]);
export type ModerationState = z.infer<typeof moderationStateSchema>;

export const evidenceVisibilitySchema = z.enum([
  "public",
  "reviewers_only",
  "private",
]);
export type EvidenceVisibility = z.infer<typeof evidenceVisibilitySchema>;

export const evidenceRelationSchema = z.enum([
  "supporting",
  "contradicting",
  "neutral",
]);
export type EvidenceRelation = z.infer<typeof evidenceRelationSchema>;

export const mediaPublicationPermissionSchema = z.enum([
  "pending",
  "allowed",
  "denied",
  "takedown",
]);
export type MediaPublicationPermission = z.infer<
  typeof mediaPublicationPermissionSchema
>;

export const jobStateSchema = z.enum([
  "pending",
  "leased",
  "completed",
  "failed",
  "dead",
]);
export type JobState = z.infer<typeof jobStateSchema>;

export const outboxStateSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);
export type OutboxState = z.infer<typeof outboxStateSchema>;

export const providerReservationStateSchema = z.enum([
  "reserved",
  "settled",
  "expired",
  "cancelled",
]);
export type ProviderReservationState = z.infer<
  typeof providerReservationStateSchema
>;

export const abuseFlagResolutionSchema = z.enum([
  "pending",
  "dismissed",
  "actioned",
]);
export type AbuseFlagResolution = z.infer<typeof abuseFlagResolutionSchema>;

export const sourceAvailabilitySchema = z.enum([
  "unknown",
  "available",
  "unavailable",
  "private",
  "deleted",
]);
export type SourceAvailability = z.infer<typeof sourceAvailabilitySchema>;

/** WGS84 longitude in degrees (construct points as lng, lat). */
export const longitudeSchema = z.number().min(-180).max(180);
/** WGS84 latitude in degrees. */
export const latitudeSchema = z.number().min(-90).max(90);

export const geoPointSchema = z.object({
  longitude: longitudeSchema,
  latitude: latitudeSchema,
});
export type GeoPoint = z.infer<typeof geoPointSchema>;
