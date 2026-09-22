# Database migrations

Versioned SQL for Supabase Postgres + PostGIS. Schema matches SPEC v1.2 §9 and M1 launch-minimum (§19).

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) **or** `psql` against a Postgres instance with the `auth` schema (Supabase local/linked project)
- PostGIS available (`CREATE EXTENSION postgis`)

This repo keeps migrations under `db/migrations/` (SPEC §20). Supabase CLI defaults to `supabase/migrations/`; either symlink, copy, or point config at this directory.

## Local Docker (Milestone 1 map data, no Supabase cloud)

If you do not have a Supabase project, use plain PostGIS via Docker Compose:

```bash
npm run db:local   # starts compose, applies db/local/00_auth_stub.sql then db/migrations/*
npm run db:seed    # idempotent “[fixture]” sample issues + local admin user
```

- Compose file: `docker-compose.yml` (`postgis/postgis`, db `mamdani`, user/password `postgres`/`postgres`).
- Host port **5432** by default; if that port is taken, `db:local` uses **5433** and prints a note.
- `db/local/00_auth_stub.sql` is **local Docker only** — minimal `auth.users` + `auth.uid()` + Supabase role names so production migrations apply. **Do not** run it against hosted Supabase (which already has Auth).
- Seed data is **never** in `db/migrations/` and never applied on API boot. Titles are prefixed `[fixture]`.
- Local admin for `x-dev-user-id` / Sign In page: `00000000-0000-4000-8000-000000000001` (`ALLOW_DEV_AUTH` + `VITE_ALLOW_DEV_AUTH`).
- `db:local` writes a gitignored root `.env` and `apps/web/.env` when missing (`DATABASE_URL`, `ALLOW_DEV_AUTH=true`, `VITE_ALLOW_DEV_AUTH=true`).

Requires a working Docker daemon (`docker info`). Without Docker, `npm run db:local` falls back to host `psql` (for example after `brew install postgresql@16 postgis && brew services start postgresql@16`).

**Note:** `db/local/00_auth_stub.sql` must never be applied to hosted Supabase. Production RLS and migrations are unchanged; the stub only satisfies `auth.users` / `auth.uid()` / role names for plain PostGIS.

## Apply with Supabase CLI

```bash
# From a linked or local Supabase project
supabase start   # local only
supabase db reset   # applies all migrations (destructive local reset)

# Or push to a linked remote
supabase db push
```

If your CLI project uses the default folder, mirror these files:

```bash
mkdir -p supabase/migrations
cp db/migrations/*.sql supabase/migrations/
supabase db reset
```

## Apply with psql

Order matters — filenames are timestamp-prefixed.

```bash
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'

for f in db/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Local Supabase typically exposes Postgres on port `54322`. Confirm with `supabase status`.

On local Docker Compose, prefer `npm run db:local` (uses `psql` inside the container). Manual equivalent:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/mamdani'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/local/00_auth_stub.sql
for f in db/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

## What these migrations create

| Area | Contents |
|---|---|
| Extensions | `postgis`, `pgcrypto`; private `app` schema for SECURITY DEFINER helpers |
| Tables | profiles, submissions, source_posts, issues, issue_sources, media, evidence, location_candidates, updates, status_events, supports, jobs, outbox, provider_usage, abuse_flags |
| Geometry | SRID 4326 points; GiST on `issues.geometry` and generated `issues.geography`; longitude before latitude |
| Transitions | `app.transition_issue_status` / `public.transition_issue_status` with expected revision; append-only `status_events` |
| RLS | Enabled on all listed tables; policy comments document public vs private access |

## Intentionally deferred (not in M1 schema work)

- Seed data / fake public reports (forbidden for production seeds; use `npm run db:seed` for local fixtures only)
- Public snapshot projection tables and outbox consumers
- Job claim/lease workers and provider adapters (tables exist, unused)
- Vector issue tiles, Redis, Kafka, Elasticsearch
- API app, web app, and Python media worker
- Restore drills and load tests

## Geometry reminder

```sql
-- Correct: longitude, latitude
ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)

-- Meter distance
ST_DWithin(geography, ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography, 50)
```
