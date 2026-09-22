import { z } from "zod";

/**
 * Stable machine-readable API error codes (SPEC §10).
 * Clients should branch on `code`; `message` is human-readable.
 */
export const errorCodeSchema = z.enum([
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "revision_conflict",
  "idempotency_conflict",
  "rate_limited",
  "quota_exceeded",
  "intake_capped",
  "unsupported_media",
  "upload_incomplete",
  "invalid_status_transition",
  "duplicate_source",
  "gone",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  /** Present on 429 responses when known */
  retryAfterSeconds: z.number().int().positive().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
