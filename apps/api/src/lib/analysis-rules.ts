/**
 * Pure helpers for M2 analysis cost caps and job transitions (SPEC §12, §14).
 */

export type AnalysisBudgetState = {
  enabled: boolean;
  paused: boolean;
  dailyCapCents: number;
  monthlyCapCents: number;
  dailySpendCents: number;
  monthlySpendCents: number;
};

export type BudgetDecision =
  | { admit: true }
  | { admit: false; reason: "disabled" | "paused" | "daily_cap" | "monthly_cap" };

/** Whether a new paid analysis reservation of `estimateCents` may be admitted. */
export function canAdmitAnalysis(
  state: AnalysisBudgetState,
  estimateCents: number,
): BudgetDecision {
  if (!state.enabled) return { admit: false, reason: "disabled" };
  if (state.paused) return { admit: false, reason: "paused" };
  if (estimateCents < 0) return { admit: false, reason: "daily_cap" };
  if (state.dailySpendCents + estimateCents > state.dailyCapCents) {
    return { admit: false, reason: "daily_cap" };
  }
  if (state.monthlySpendCents + estimateCents > state.monthlyCapCents) {
    return { admit: false, reason: "monthly_cap" };
  }
  return { admit: true };
}

/**
 * SPEC §14: warn at 50%, 80%, 95% of a budget window before the hard stop.
 * Returns the highest crossed threshold, or null when under 50%.
 */
export type SpendWarningLevel = 50 | 80 | 95;

export function spendWarningLevel(
  spendCents: number,
  capCents: number,
): SpendWarningLevel | null {
  if (capCents <= 0) return spendCents > 0 ? 95 : null;
  const ratio = spendCents / capCents;
  if (ratio >= 0.95) return 95;
  if (ratio >= 0.8) return 80;
  if (ratio >= 0.5) return 50;
  return null;
}

/** Initial submission processing state when analysis may or may not run. */
export function initialProcessingState(analysisAdmitted: boolean): "queued" | "pending_review" {
  return analysisAdmitted ? "queued" : "pending_review";
}

export type JobTransition =
  | { from: "pending"; to: "leased" }
  | { from: "leased"; to: "completed" }
  | { from: "leased"; to: "pending" }
  | { from: "leased"; to: "dead" };

export function nextJobStateAfterFailure(
  attempts: number,
  maxAttempts = 3,
): "pending" | "dead" {
  return attempts >= maxAttempts ? "dead" : "pending";
}

/** Backoff seconds before retry (exponential with optional jitter fraction 0–1). */
export function retryBackoffSeconds(
  attempts: number,
  jitterFraction = 0,
): number {
  const base = Math.max(5, 2 ** attempts);
  const jitter = Math.floor(base * 0.5 * Math.min(Math.max(jitterFraction, 0), 1));
  return base + jitter;
}

/** Haversine distance in meters (for unit tests of 50 m duplicate radius). */
export function distanceMeters(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinDuplicateRadius(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
  radiusMeters = 50,
): boolean {
  return distanceMeters(a, b) <= radiusMeters;
}

/** Extract spoken/intersection-style address clues from free text (explicit clues). */
export function extractExplicitLocationClues(text: string): string[] {
  const clues: string[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return clues;

  // "at X and Y" / "X & Y" intersection patterns
  const andPattern =
    /\b(?:at|near|on)\s+([A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.']*){0,4})\s+(?:and|&)\s+([A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.']*){0,4})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = andPattern.exec(normalized)) !== null) {
    const left = match[1]?.trim();
    const right = match[2]?.trim();
    if (left && right) clues.push(`${left} and ${right}`);
  }

  // Street number + street name
  const streetPattern =
    /\b(\d{1,5}\s+(?:[NEWS]\.?\s+)?[A-Z][\w.'-]*(?:\s+[A-Z][\w.']*){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Pl|Place|Ln|Lane|Way|Dr|Drive)\.?)\b/gi;
  while ((match = streetPattern.exec(normalized)) !== null) {
    const street = match[1]?.trim();
    if (street) clues.push(street);
  }

  return [...new Set(clues)].slice(0, 5);
}
