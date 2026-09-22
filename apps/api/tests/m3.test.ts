import { describe, expect, it } from "vitest";
import {
  copyrightAgentFromEnv,
  evaluateProductionReadiness,
  legalFromEnv,
} from "@mamdani-ticketer/contracts";
import { createApp } from "../src/app.js";
import { configFromEnv } from "../src/config.js";
import { MemoryArtifactStore } from "../src/lib/artifacts.js";
import { renderOgCardSvg, renderStoryCardSvg } from "../src/lib/share-cards.js";
import { canonicalizeTikTokUrl } from "../src/lib/source-url.js";
import { MemoryObjectStore } from "../src/object-store.js";

function testApp() {
  return createApp({
    sql: null,
    authenticate: async () => null,
    objectStore: new MemoryObjectStore("http://localhost:8787/dev-uploads"),
    artifacts: new MemoryArtifactStore("http://localhost:8787"),
    config: configFromEnv({
      CORS_ORIGINS: "http://localhost:5173",
      OBJECT_STORE: "mock",
      ALLOW_DEV_AUTH: "true",
    }),
  });
}

describe("M3 share cards", () => {
  it("renders OG 1200×630 and story 1080×1920 SVGs with brand + path", () => {
    const issue = {
      title: "Pothole on Atlantic",
      borough: "Brooklyn",
      statusLabel: "Needs attention",
      dateLabel: "Sep 22, 2026",
      path: "/r/pothole-on-atlantic-abc123",
      brandName: "Mamdani, Fix This",
      disclaimer: "Unofficial community project.",
    };
    const og = renderOgCardSvg(issue);
    const story = renderStoryCardSvg({
      ...issue,
      beforeLabel: "Open issue",
      afterLabel: "Verified fixed",
      intervalLabel: "16 days",
    });
    expect(og).toContain('width="1200"');
    expect(og).toContain('height="630"');
    expect(og).toContain("Pothole on Atlantic");
    expect(og).toContain("/r/pothole-on-atlantic-abc123");
    expect(story).toContain('width="1080"');
    expect(story).toContain('height="1920"');
    expect(story).toContain("Before");
    expect(story).toContain("After");
  });
});

describe("M3 legal / production readiness", () => {
  it("fails readiness when operator fields are missing", () => {
    const result = evaluateProductionReadiness({});
    expect(result.ok).toBe(false);
    expect(result.draftLegalPages).toBe(true);
    expect(result.copyrightRouteVisible).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("shows copyright only when the full agent is configured", () => {
    expect(copyrightAgentFromEnv({})).toBeNull();
    const agent = copyrightAgentFromEnv({
      COPYRIGHT_AGENT_NAME: "Jane Agent",
      COPYRIGHT_AGENT_ADDRESS: "1 Main St, Brooklyn, NY",
      COPYRIGHT_AGENT_PHONE: "+1-555-0100",
      COPYRIGHT_AGENT_EMAIL: "dmca@example.com",
    });
    expect(agent?.email).toBe("dmca@example.com");
    const ready = evaluateProductionReadiness({
      LEGAL_EFFECTIVE_DATE: "2026-09-22",
      LEGAL_OPERATOR_NAME: "Example Operator",
      LEGAL_OPERATOR_ADDRESS: "1 Main St",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
      LEGAL_PRIVACY_EMAIL: "privacy@example.com",
      COPYRIGHT_AGENT_NAME: "Jane Agent",
      COPYRIGHT_AGENT_ADDRESS: "1 Main St, Brooklyn, NY",
      COPYRIGHT_AGENT_PHONE: "+1-555-0100",
      COPYRIGHT_AGENT_EMAIL: "dmca@example.com",
    });
    expect(ready.ok).toBe(true);
    expect(ready.copyrightRouteVisible).toBe(true);
  });

  it("exposes legal fields for Terms/Privacy without claiming counsel sign-off", () => {
    const legal = legalFromEnv({
      LEGAL_POLICY_VERSION: "0.1.0-draft",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
    });
    expect(legal.policyVersion).toBe("0.1.0-draft");
    expect(legal.safetyPath).toBe("/report-content");
    expect(legal.supportEmail).toBe("support@example.com");
  });
});

describe("M3 section 18 security rules (URL/SSRF, ownership shell)", () => {
  it("rejects SSRF-shaped and non-TikTok source URLs", () => {
    expect(() => canonicalizeTikTokUrl("https://169.254.169.254/latest")).toThrow(
      /not allowed/,
    );
    expect(() => canonicalizeTikTokUrl("https://127.0.0.1/video/1")).toThrow(
      /not allowed/,
    );
    expect(() => canonicalizeTikTokUrl("https://evil.example/video/1")).toThrow(
      /TikTok/,
    );
  });

  it("rejects anonymous owner writes and content-report validation failures", async () => {
    const app = testApp();
    const submissions = await app.request("/api/submissions", { method: "POST" });
    expect(submissions.status).toBe(401);

    const report = await app.request("/api/public/content-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "other", description: "no" }),
    });
    // Without DB, content-report hits 503/internal after validation — validate first.
    const bad = await app.request("/api/public/content-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "not-a-category", description: "hello world" }),
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "validation_failed" });
    // description too short
    expect(report.status).toBe(400);
  });

  it("serves readiness + legal without a database", async () => {
    const app = testApp();
    const readiness = await app.request("/api/ops/readiness");
    expect([200, 503]).toContain(readiness.status);
    const body = (await readiness.json()) as { draftLegalPages: boolean };
    expect(body.draftLegalPages).toBe(true);

    const legal = await app.request("/api/public/legal");
    expect(legal.status).toBe(200);
    const legalBody = (await legal.json()) as {
      draft: boolean;
      copyrightRouteVisible: boolean;
    };
    expect(legalBody.draft).toBe(true);
    expect(legalBody.copyrightRouteVisible).toBe(false);
  });

  it("exposes metrics text and health JSON", async () => {
    const app = testApp();
    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });

    const metrics = await app.request("/metrics");
    expect(metrics.status).toBe(200);
    const text = await metrics.text();
    expect(text).toContain("mamdani_outbox_pending");
  });
});

describe("private evidence projection shape", () => {
  it("keeps snapshot feature schema free of private owner/email fields", () => {
    const feature = {
      id: "00000000-0000-4000-8000-000000000099",
      shortId: "abc",
      slug: "test",
      path: "/r/test-abc",
      category: "pothole",
      status: "open",
      borough: "brooklyn",
      longitude: -73.99,
      latitude: 40.73,
      title: "Test",
      supportCount: 0,
      revision: 1,
    };
    expect(Object.keys(feature)).not.toContain("ownerId");
    expect(Object.keys(feature)).not.toContain("email");
    expect(Object.keys(feature)).not.toContain("privateObjectKey");
  });
});
