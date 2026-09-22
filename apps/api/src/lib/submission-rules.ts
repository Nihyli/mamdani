import type { CreateSubmissionRequest } from "@mamdani-ticketer/contracts";

/** Fields that define "the same submission" for an idempotency key. */
export type SubmissionFingerprint = {
  kind: string;
  category: string;
  locationText: string;
  longitude: number;
  latitude: number;
  sourceUrl: string | null;
  mediaIds: string[];
};

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function fingerprintSubmission(
  input: Pick<
    CreateSubmissionRequest,
    | "kind"
    | "category"
    | "locationText"
    | "location"
    | "sourceUrl"
    | "mediaIds"
  >,
): SubmissionFingerprint {
  return {
    kind: input.kind,
    category: input.category,
    locationText: input.locationText.trim(),
    longitude: round6(input.location.longitude),
    latitude: round6(input.location.latitude),
    sourceUrl: input.sourceUrl ?? null,
    mediaIds: [...input.mediaIds].sort(),
  };
}

export function sameSubmissionPayload(
  existing: SubmissionFingerprint,
  incoming: SubmissionFingerprint,
): boolean {
  return JSON.stringify(existing) === JSON.stringify(incoming);
}

export type IdempotencyDecision = "create" | "replay" | "conflict";

export function decideIdempotency(
  existing: SubmissionFingerprint | null,
  incoming: SubmissionFingerprint,
): IdempotencyDecision {
  if (!existing) return "create";
  return sameSubmissionPayload(existing, incoming) ? "replay" : "conflict";
}

/**
 * SPEC §12: 3 new submissions/account/day, dropping to 1 when the review
 * backlog exceeds 2× measured daily capacity.
 */
export function dailySubmissionLimit(
  pendingReviewCount: number,
  dailyReviewCapacity: number,
): number {
  if (dailyReviewCapacity > 0 && pendingReviewCount > 2 * dailyReviewCapacity) {
    return 1;
  }
  return 3;
}

/** Idempotent support toggle. Matches app.set_issue_support. */
export function applySupportToggle(
  currentlySupported: boolean,
  requested: boolean,
): { supported: boolean; changed: boolean } {
  if (currentlySupported === requested) {
    return { supported: requested, changed: false };
  }
  return { supported: requested, changed: true };
}
