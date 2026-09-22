import { describe, expect, it } from "vitest";
import {
  canAdmitAnalysis,
  extractExplicitLocationClues,
  initialProcessingState,
  isWithinDuplicateRadius,
  nextJobStateAfterFailure,
  retryBackoffSeconds,
  spendWarningLevel,
} from "../src/lib/analysis-rules.js";

describe("analysis cost caps", () => {
  const base = {
    enabled: true,
    paused: false,
    dailyCapCents: 500,
    monthlyCapCents: 10_000,
    dailySpendCents: 0,
    monthlySpendCents: 0,
  };

  it("admits when under both caps", () => {
    expect(canAdmitAnalysis(base, 5)).toEqual({ admit: true });
  });

  it("blocks when disabled, paused, or over a cap", () => {
    expect(canAdmitAnalysis({ ...base, enabled: false }, 5)).toEqual({
      admit: false,
      reason: "disabled",
    });
    expect(canAdmitAnalysis({ ...base, paused: true }, 5)).toEqual({
      admit: false,
      reason: "paused",
    });
    expect(canAdmitAnalysis({ ...base, dailySpendCents: 496 }, 5)).toEqual({
      admit: false,
      reason: "daily_cap",
    });
    expect(canAdmitAnalysis({ ...base, monthlySpendCents: 9996 }, 5)).toEqual({
      admit: false,
      reason: "monthly_cap",
    });
  });

  it("maps admit decision to initial processing state", () => {
    expect(initialProcessingState(true)).toBe("queued");
    expect(initialProcessingState(false)).toBe("pending_review");
  });

  it("emits §14 spend warnings at 50 / 80 / 95 percent", () => {
    expect(spendWarningLevel(0, 500)).toBeNull();
    expect(spendWarningLevel(249, 500)).toBeNull();
    expect(spendWarningLevel(250, 500)).toBe(50);
    expect(spendWarningLevel(400, 500)).toBe(80);
    expect(spendWarningLevel(475, 500)).toBe(95);
    expect(spendWarningLevel(500, 500)).toBe(95);
  });
});

describe("job transitions", () => {
  it("retries until max attempts then goes dead", () => {
    expect(nextJobStateAfterFailure(1)).toBe("pending");
    expect(nextJobStateAfterFailure(2)).toBe("pending");
    expect(nextJobStateAfterFailure(3)).toBe("dead");
  });

  it("uses exponential backoff", () => {
    expect(retryBackoffSeconds(1)).toBe(5);
    expect(retryBackoffSeconds(3)).toBe(8);
    expect(retryBackoffSeconds(4, 0)).toBe(16);
  });
});

describe("explicit-clue extraction", () => {
  it("pulls intersection phrases from transcript-like text", () => {
    const clues = extractExplicitLocationClues(
      "There's a pothole at Atlantic Avenue and Flatbush Avenue in Brooklyn.",
    );
    expect(clues.some((c) => /atlantic/i.test(c) && /flatbush/i.test(c))).toBe(
      true,
    );
  });

  it("returns empty for text without addresses", () => {
    expect(extractExplicitLocationClues("just a joke")).toEqual([]);
  });
});

describe("50 m duplicate radius", () => {
  const pin = { longitude: -73.98, latitude: 40.68 };

  it("treats nearby points as duplicates and distant ones as not", () => {
    const near = { longitude: -73.9801, latitude: 40.6801 };
    const far = { longitude: -73.99, latitude: 40.69 };
    expect(isWithinDuplicateRadius(pin, near, 50)).toBe(true);
    expect(isWithinDuplicateRadius(pin, far, 50)).toBe(false);
  });
});
