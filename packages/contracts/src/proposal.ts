import { z } from "zod";
import {
  geoPointSchema,
  issueCategorySchema,
  locationPrecisionSchema,
} from "./enums.js";

const uuid = z.string().uuid();

/** SPEC §8 structured analysis proposal (moderator aid only — never auto-publishes). */
export const analysisActionabilitySchema = z.enum([
  "actionable",
  "uncertain",
  "non_actionable",
]);
export type AnalysisActionability = z.infer<typeof analysisActionabilitySchema>;

export const proposalLocationCandidateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  precision: z.enum(["asset", "intersection", "block", "neighborhood"]),
  evidence_ids: z.array(z.string().min(1)).default([]),
  contradiction_ids: z.array(z.string().min(1)).default([]),
  verification: z.literal("unverified").or(z.string().min(1)),
  label: z.string().max(500).optional(),
  provider: z.string().max(120).optional(),
});
export type ProposalLocationCandidate = z.infer<
  typeof proposalLocationCandidateSchema
>;

export const analysisProposalSchema = z.object({
  schema_version: z.literal(1),
  actionability: analysisActionabilitySchema,
  category: issueCategorySchema,
  title: z.string().min(1).max(200),
  observed_at: z.string().datetime({ offset: true }).nullable(),
  location_candidates: z.array(proposalLocationCandidateSchema).default([]),
  missing_information: z.array(z.string().max(500)).default([]),
  suggested_duplicate_ids: z.array(uuid).default([]),
  needs_human_review: z.boolean(),
  /** Factual evidence summaries only — never model chain-of-thought */
  evidence_summaries: z
    .array(
      z.object({
        type: z.enum([
          "transcript",
          "frame",
          "ocr",
          "user_location",
          "geocode",
          "other",
        ]),
        summary: z.string().max(2000),
        frame_timestamp_ms: z.number().int().nonnegative().optional(),
        content_digest: z.string().optional(),
      }),
    )
    .default([]),
  transcript_excerpt: z.string().max(4000).nullable().optional(),
  provider_versions: z.record(z.string(), z.string()).default({}),
  estimated_cost_cents: z.number().int().nonnegative().optional(),
});
export type AnalysisProposal = z.infer<typeof analysisProposalSchema>;

export const duplicateCandidateSchema = z.object({
  issueId: uuid,
  shortId: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  category: issueCategorySchema,
  status: z.enum(["open", "fix_pending", "resolved"]),
  distanceMeters: z.number().nonnegative(),
  location: geoPointSchema.optional(),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

/** SPEC §14 spend warning thresholds (highest crossed). */
export const spendWarningLevelSchema = z.union([
  z.literal(50),
  z.literal(80),
  z.literal(95),
]);
export type SpendWarningLevel = z.infer<typeof spendWarningLevelSchema>;

export const analysisStatusSchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean(),
  pauseReason: z.string().nullable(),
  dailyCapCents: z.number().int().nonnegative(),
  monthlyCapCents: z.number().int().nonnegative(),
  dailySpendCents: z.number().int().nonnegative(),
  monthlySpendCents: z.number().int().nonnegative(),
  /** Highest daily spend warning threshold crossed, or null under 50%. */
  dailySpendWarning: spendWarningLevelSchema.nullable(),
  /** Highest monthly spend warning threshold crossed, or null under 50%. */
  monthlySpendWarning: spendWarningLevelSchema.nullable(),
  pipelineVersion: z.string().min(1),
});
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const patchAnalysisSettingsRequestSchema = z.object({
  analysisEnabled: z.boolean().optional(),
  analysisPaused: z.boolean().optional(),
  pauseReason: z.string().max(500).nullable().optional(),
  dailyCapCents: z.number().int().nonnegative().max(1_000_000).optional(),
  monthlyCapCents: z.number().int().nonnegative().max(10_000_000).optional(),
});
export type PatchAnalysisSettingsRequest = z.infer<
  typeof patchAnalysisSettingsRequestSchema
>;

/** Precision values that may appear on location_candidates rows from analysis. */
export const analysisLocationPrecisionSchema = locationPrecisionSchema;
