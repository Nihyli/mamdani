import { describe, expect, it } from "vitest";
import { configFromEnv, insideNycBbox } from "../src/config.js";
import { mapDatabaseError } from "../src/lib/http-error.js";
import {
  applySupportToggle,
  dailySubmissionLimit,
  decideIdempotency,
  fingerprintSubmission,
} from "../src/lib/submission-rules.js";
import { canonicalizeTikTokUrl } from "../src/lib/source-url.js";
import { createApp } from "../src/app.js";
import { MemoryObjectStore } from "../src/object-store.js";

const point = { longitude: -73.99, latitude: 40.73 };

describe("TikTok URL canonicalization", () => {
  it("keeps the video id and drops tracking query params", () => {
    const source = canonicalizeTikTokUrl(
      "https://www.tiktok.com/@someone/video/1234567890?is_from_webapp=1",
    );
    expect(source).toEqual({
      platform: "tiktok",
      platformPostId: "1234567890",
      canonicalUrl: "https://www.tiktok.com/video/1234567890",
    });
  });

  it("rejects non-https, internal hosts, and non-TikTok links", () => {
    expect(() => canonicalizeTikTokUrl("http://www.tiktok.com/video/1")).toThrow(/https/);
    expect(() => canonicalizeTikTokUrl("https://127.0.0.1/video/1")).toThrow(/not allowed/);
    expect(() => canonicalizeTikTokUrl("https://169.254.169.254/latest")).toThrow(/not allowed/);
    expect(() => canonicalizeTikTokUrl("https://example.com/video/1")).toThrow(/TikTok/);
  });
});

describe("idempotency", () => {
  const base = {
    kind: "upload" as const,
    category: "pothole" as const,
    locationText: "Atlantic Ave & Flatbush Ave",
    location: point,
    sourceUrl: "https://www.tiktok.com/video/99",
    mediaIds: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"],
  };

  it("replays the same payload and conflicts when the payload differs", () => {
    const first = fingerprintSubmission(base);
    const reordered = fingerprintSubmission({
      ...base,
      mediaIds: [...base.mediaIds].reverse(),
    });
    expect(decideIdempotency(null, first)).toBe("create");
    expect(decideIdempotency(first, reordered)).toBe("replay");
    expect(
      decideIdempotency(first, fingerprintSubmission({ ...base, locationText: "Somewhere else" })),
    ).toBe("conflict");
  });
});

describe("support toggle", () => {
  it("is a no-op when the requested value is already stored", () => {
    expect(applySupportToggle(true, true)).toEqual({ supported: true, changed: false });
    expect(applySupportToggle(false, true)).toEqual({ supported: true, changed: true });
    expect(applySupportToggle(true, false)).toEqual({ supported: false, changed: true });
  });
});

describe("revision conflicts", () => {
  it("maps the transition function's exclusion violation", () => {
    const mapped = mapDatabaseError({
      code: "23P01",
      message: "revision conflict: expected 2, actual 3",
    });
    expect(mapped).toMatchObject({ status: 409, code: "revision_conflict" });
  });

  it("maps an illegal status change separately", () => {
    const mapped = mapDatabaseError({
      code: "23514",
      message: "invalid status transition: resolved → fix_pending",
    });
    expect(mapped?.code).toBe("invalid_status_transition");
  });
});

describe("intake cap", () => {
  it("drops the daily limit to 1 when the backlog exceeds twice capacity", () => {
    expect(dailySubmissionLimit(10, 30)).toBe(3);
    expect(dailySubmissionLimit(61, 30)).toBe(1);
  });
});

describe("HTTP shell without a database", () => {
  const app = createApp({
    sql: null,
    authenticate: async (authorization) =>
      authorization === "Bearer test"
        ? {
            id: "00000000-0000-4000-8000-000000000010",
            role: "user",
            emailVerified: true,
          }
        : null,
    objectStore: new MemoryObjectStore("http://localhost:8787/dev-uploads"),
    config: configFromEnv({ CORS_ORIGINS: "http://localhost:5173", OBJECT_STORE: "mock" }),
  });

  it("rejects anonymous writes", async () => {
    const response = await app.request("/api/submissions", { method: "POST" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthorized" });
  });

  it("rejects an invalid body before touching the database", async () => {
    const response = await app.request("/api/submissions", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "short" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("keeps the pin inside the coarse NYC box", () => {
    const bbox = configFromEnv().bbox;
    expect(insideNycBbox(point.longitude, point.latitude, bbox)).toBe(true);
    expect(insideNycBbox(-118.2, 34.05, bbox)).toBe(false);
  });
});
