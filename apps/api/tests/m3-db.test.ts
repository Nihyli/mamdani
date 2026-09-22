import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { createApp } from "../src/app.js";
import { configFromEnv } from "../src/config.js";
import { MemoryArtifactStore } from "../src/lib/artifacts.js";
import { processOutboxOnce } from "../src/lib/outbox.js";
import { MemoryObjectStore } from "../src/object-store.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("M3 DB-backed security + outbox", () => {
  const sql = postgres(databaseUrl!, { max: 2, prepare: false });
  const artifacts = new MemoryArtifactStore("http://localhost:8787");
  const config = configFromEnv({
    ALLOW_DEV_AUTH: "true",
    OBJECT_STORE: "mock",
    CORS_ORIGINS: "http://localhost:5173",
  });

  const ownerId = "00000000-0000-4000-8000-000000000010";
  const otherId = "00000000-0000-4000-8000-000000000011";

  async function ensureProfiles() {
    await sql`
      INSERT INTO auth.users (id) VALUES (${ownerId}::uuid), (${otherId}::uuid)
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO public.profiles (id, display_name, role)
      VALUES
        (${ownerId}::uuid, 'Owner', 'user'),
        (${otherId}::uuid, 'Other', 'user')
      ON CONFLICT (id) DO NOTHING
    `;
  }

  it("blocks another user from reading an owner submission (ownership)", async () => {
    await ensureProfiles();
    const [submission] = await sql<{ id: string }[]>`
      INSERT INTO public.submissions (
        owner_id, kind, processing_state, category, title, location_text,
        location, location_precision, idempotency_key, rights_attested_at
      ) VALUES (
        ${ownerId}::uuid, 'upload', 'pending_review', 'pothole', 'Own only',
        'Test & Test',
        ST_SetSRID(ST_MakePoint(-73.99, 40.73), 4326),
        'user_supplied',
        ${`m3-own-${Date.now()}`},
        now()
      )
      RETURNING id
    `;
    expect(submission?.id).toBeTruthy();
    const app = createApp({
      sql,
      authenticate: async (_a, devUser) =>
        devUser
          ? { id: devUser, role: "user", emailVerified: true }
          : null,
      objectStore: new MemoryObjectStore("http://localhost:8787/dev-uploads"),
      artifacts,
      config,
    });
    const denied = await app.request(`/api/submissions/${submission!.id}`, {
      headers: { "x-dev-user-id": otherId },
    });
    expect(denied.status).toBe(404);

    const allowed = await app.request(`/api/submissions/${submission!.id}`, {
      headers: { "x-dev-user-id": ownerId },
    });
    expect(allowed.status).toBe(200);
  });

  it("keeps private evidence out of public issue payloads", async () => {
    await ensureProfiles();
    const [issue] = await sql<{ id: string; slug: string; short_id: string }[]>`
      INSERT INTO public.issues (
        short_id, slug, category, title, geometry, precision, borough, status, created_by
      ) VALUES (
        ${`m3${Date.now().toString(36).slice(-5)}`},
        'm3-private-ev',
        'pothole',
        'Private evidence check',
        ST_SetSRID(ST_MakePoint(-73.98, 40.74), 4326),
        'user_supplied',
        'manhattan',
        'open',
        ${ownerId}::uuid
      )
      RETURNING id, slug, short_id
    `;
    const [media] = await sql<{ id: string }[]>`
      INSERT INTO public.media (
        owner_id, private_object_key, mime_type, byte_size, publication_permission, upload_completed_at
      ) VALUES (
        ${ownerId}::uuid,
        ${`uploads/${ownerId}/${crypto.randomUUID()}`},
        'image/jpeg',
        12,
        'pending',
        now()
      )
      RETURNING id
    `;
    expect(issue?.id).toBeTruthy();
    expect(media?.id).toBeTruthy();
    await sql`
      INSERT INTO public.evidence (
        media_id, issue_id, provenance, visibility, summary
      ) VALUES (
        ${media!.id}::uuid, ${issue!.id}::uuid, 'user_upload', 'private', 'secret frame'
      )
    `;
    const app = createApp({
      sql,
      authenticate: async () => null,
      objectStore: new MemoryObjectStore("http://localhost:8787/dev-uploads"),
      artifacts,
      config,
    });
    const res = await app.request(`/api/public/issues/${issue!.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { evidence: { summary?: string }[] };
    expect(body.evidence.every((e) => e.summary !== "secret frame")).toBe(true);
  });

  it("rejects stale revision on admin decision", async () => {
    await ensureProfiles();
    await sql`
      UPDATE public.profiles SET role = 'admin' WHERE id = ${ownerId}::uuid
    `;
    const [issue] = await sql<{ id: string; revision: number }[]>`
      INSERT INTO public.issues (
        short_id, slug, category, title, geometry, precision, borough, status, created_by, revision
      ) VALUES (
        ${`rv${Date.now().toString(36).slice(-5)}`},
        'm3-stale-rev',
        'pothole',
        'Stale revision',
        ST_SetSRID(ST_MakePoint(-73.97, 40.75), 4326),
        'user_supplied',
        'manhattan',
        'open',
        ${ownerId}::uuid,
        3
      )
      RETURNING id, revision
    `;
    expect(issue?.id).toBeTruthy();
    const app = createApp({
      sql,
      authenticate: async (_a, devUser) =>
        devUser
          ? { id: devUser, role: "admin", emailVerified: true }
          : null,
      objectStore: new MemoryObjectStore("http://localhost:8787/dev-uploads"),
      artifacts,
      config,
    });
    const res = await app.request(`/api/admin/reviews/${issue!.id}/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-user-id": ownerId,
      },
      body: JSON.stringify({
        decision: "hide",
        expectedRevision: 1,
      }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "revision_conflict" });
  });

  it("rebuilds snapshots and share cards from outbox", async () => {
    await ensureProfiles();
    const [issue] = await sql<{ id: string }[]>`
      INSERT INTO public.issues (
        short_id, slug, category, title, geometry, precision, borough, status, created_by
      ) VALUES (
        ${`ob${Date.now().toString(36).slice(-5)}`},
        'm3-outbox-card',
        'pothole',
        'Outbox share card',
        ST_SetSRID(ST_MakePoint(-73.96, 40.76), 4326),
        'user_supplied',
        'manhattan',
        'open',
        ${ownerId}::uuid
      )
      RETURNING id
    `;
    expect(issue?.id).toBeTruthy();
    await sql`
      INSERT INTO public.outbox (topic, payload)
      VALUES ('projection.refresh', '{}'::jsonb)
    `;
    await sql`
      INSERT INTO public.outbox (topic, payload)
      VALUES (
        'share_card.render',
        ${JSON.stringify({ issue_id: issue!.id })}::jsonb
      )
    `;
    for (let i = 0; i < 8; i += 1) {
      await processOutboxOnce({
        sql,
        artifacts,
        config,
        publicApiBaseUrl: config.publicApiBaseUrl,
      });
    }
    const [manifest] = await sql<{ version: string }[]>`
      SELECT version FROM public.snapshot_manifest WHERE id = 1
    `;
    expect(manifest?.version).toBeTruthy();
    const cards = await sql<{ kind: string }[]>`
      SELECT kind FROM public.share_cards
      WHERE issue_id = ${issue!.id}::uuid AND purged_at IS NULL
    `;
    expect(cards.map((c) => c.kind).sort()).toEqual(["og", "story"]);
  });
});
