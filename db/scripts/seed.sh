#!/usr/bin/env bash
# Idempotent local fixtures for Milestone 1. Never run in production.
# Requires DATABASE_URL (or npm run db:local first).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -x /opt/homebrew/opt/postgresql@16/bin/psql ]]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

if [[ -f "${ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  # Export KEY=VAL lines; skip comments/blank
  while IFS= read -r line || [[ -n "${line}" ]]; do
    trimmed="${line%%#*}"
    trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    [[ -z "${trimmed}" ]] && continue
    [[ "${trimmed}" != *=* ]] && continue
    key="${trimmed%%=*}"
    val="${trimmed#*=}"
    export "${key}=${val}"
  done <"${ROOT}/.env"
  set +a
fi

DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "error: DATABASE_URL is unset. Run npm run db:local first." >&2
  exit 1
fi

DEV_USER_ID="00000000-0000-4000-8000-000000000001"
PLACEHOLDER_SVG="/fixtures/sample-evidence.svg"

# Prefer docker compose exec when the local container is up (no host psql needed).
run_psql() {
  if docker compose ps --status running --format '{{.Name}}' 2>/dev/null | grep -q mamdani-ticketer-db; then
    docker compose exec -T db psql -U postgres -d mamdani -v ON_ERROR_STOP=1 "$@"
  elif command -v psql >/dev/null 2>&1; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 "$@"
  else
    echo "error: neither docker compose db nor host psql is available" >&2
    exit 1
  fi
}

echo "Seeding local fixtures into ${DATABASE_URL} ..."

run_psql <<SQL
BEGIN;

-- Dev admin used by VITE_ALLOW_DEV_AUTH / x-dev-user-id
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES (
  '${DEV_USER_ID}'::uuid,
  'local-dev@example.com',
  '{"display_name":"Local dev"}'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at);

INSERT INTO public.profiles (id, display_name, role)
VALUES ('${DEV_USER_ID}'::uuid, 'Local dev', 'admin')
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, updated_at = now();

-- Stable fixture issue ids (re-runs upsert)
-- created_at must precede resolved_at so daysToVerifiedFix is meaningful on /fixed
WITH fixtures (
  id, short_id, slug, category, title, description, lng, lat, borough, status,
  created_at, resolved_at, support_count
) AS (
  VALUES
    (
      '10000000-0000-4000-8000-000000000001'::uuid,
      'fx01', 'fixture-pothole-manhattan', 'pothole'::public.issue_category,
      '[fixture] Deep pothole on Broadway',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -73.9857, 40.7484, 'manhattan'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '2 days', NULL::timestamptz, 12
    ),
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      'fx02', 'fixture-sidewalk-brooklyn', 'damaged_sidewalk'::public.issue_category,
      '[fixture] Cracked sidewalk near Prospect Park',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -73.9690, 40.6602, 'brooklyn'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '3 days', NULL::timestamptz, 5
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      'fx03', 'fixture-trash-queens', 'overflowing_trash'::public.issue_category,
      '[fixture] Overflowing trash cans on Roosevelt Ave',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -73.8773, 40.7469, 'queens'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '4 days', NULL::timestamptz, 8
    ),
    (
      '10000000-0000-4000-8000-000000000004'::uuid,
      'fx04', 'fixture-streetlight-bronx', 'broken_streetlight'::public.issue_category,
      '[fixture] Dark streetlight on Grand Concourse',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -73.9178, 40.8370, 'bronx'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '5 days', NULL::timestamptz, 3
    ),
    (
      '10000000-0000-4000-8000-000000000005'::uuid,
      'fx05', 'fixture-fountain-si', 'broken_fountain'::public.issue_category,
      '[fixture] Broken drinking fountain in Silver Lake Park',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -74.1090, 40.6260, 'staten_island'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '6 days', NULL::timestamptz, 2
    ),
    (
      '10000000-0000-4000-8000-000000000006'::uuid,
      'fx06', 'fixture-park-brooklyn', 'broken_park_equipment'::public.issue_category,
      '[fixture] Broken swing set in McCarren Park',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -73.9490, 40.7210, 'brooklyn'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '1 day', NULL::timestamptz, 9
    ),
    (
      '10000000-0000-4000-8000-000000000007'::uuid,
      'fx07', 'fixture-other-manhattan', 'other'::public.issue_category,
      '[fixture] Missing curb cut near City Hall',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only.',
      -74.0060, 40.7128, 'manhattan'::public.nyc_borough, 'open'::public.issue_status,
      now() - interval '7 days', NULL::timestamptz, 4
    ),
    (
      '10000000-0000-4000-8000-000000000008'::uuid,
      'fx08', 'fixture-pothole-queens-pending', 'pothole'::public.issue_category,
      '[fixture] Pothole with claimed repair pending review',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only. Status: fix_pending.',
      -73.8300, 40.7600, 'queens'::public.nyc_borough, 'fix_pending'::public.issue_status,
      now() - interval '8 days', NULL::timestamptz, 6
    ),
    (
      '10000000-0000-4000-8000-000000000009'::uuid,
      'fx09', 'fixture-sidewalk-bronx-pending', 'damaged_sidewalk'::public.issue_category,
      '[fixture] Heaved sidewalk slabs (fix pending)',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for map/dev only. Status: fix_pending.',
      -73.8900, 40.8500, 'bronx'::public.nyc_borough, 'fix_pending'::public.issue_status,
      now() - interval '9 days', NULL::timestamptz, 1
    ),
    (
      '10000000-0000-4000-8000-00000000000a'::uuid,
      'fx0a', 'fixture-trash-brooklyn-resolved', 'overflowing_trash'::public.issue_category,
      '[fixture] Cleared trash pile on Bedford Ave',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for /fixed. Status: resolved.',
      -73.9570, 40.6890, 'brooklyn'::public.nyc_borough, 'resolved'::public.issue_status,
      now() - interval '6 days', now() - interval '3 days', 15
    ),
    (
      '10000000-0000-4000-8000-00000000000b'::uuid,
      'fx0b', 'fixture-streetlight-manhattan-resolved', 'broken_streetlight'::public.issue_category,
      '[fixture] Relit streetlight on the High Line',
      'LOCAL SAMPLE DATA — not a real NYC report. Fixture for /fixed. Status: resolved.',
      -74.0050, 40.7480, 'manhattan'::public.nyc_borough, 'resolved'::public.issue_status,
      now() - interval '20 days', now() - interval '10 days', 7
    )
)
INSERT INTO public.issues (
  id, short_id, slug, category, title, description, geometry, borough, status,
  created_at, resolved_at, support_count, created_by, precision
)
SELECT
  id, short_id, slug, category, title, description,
  ST_SetSRID(ST_MakePoint(lng, lat), 4326),
  borough, status, created_at, resolved_at, support_count,
  '${DEV_USER_ID}'::uuid,
  'user_supplied'::public.location_precision
FROM fixtures
ON CONFLICT (id) DO UPDATE
SET
  short_id = EXCLUDED.short_id,
  slug = EXCLUDED.slug,
  category = EXCLUDED.category,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  geometry = EXCLUDED.geometry,
  borough = EXCLUDED.borough,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at,
  resolved_at = EXCLUDED.resolved_at,
  support_count = EXCLUDED.support_count,
  updated_at = now();

-- One shared placeholder media object (unique private_object_key) + public evidence
INSERT INTO public.media (
  id, owner_id, private_object_key, mime_type, byte_size, width, height,
  publication_permission, upload_completed_at
)
VALUES (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '${DEV_USER_ID}'::uuid,
  'fixtures/sample-evidence.svg',
  'image/svg+xml',
  256,
  64,
  64,
  'allowed'::public.media_publication_permission,
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  private_object_key = EXCLUDED.private_object_key,
  mime_type = EXCLUDED.mime_type,
  publication_permission = EXCLUDED.publication_permission,
  upload_completed_at = EXCLUDED.upload_completed_at;

INSERT INTO public.evidence (
  id, media_id, issue_id, provenance, relation, visibility, summary
)
VALUES
  (
    '30000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000001'::uuid,
    'local_fixture',
    'supporting'::public.evidence_relation,
    'public'::public.evidence_visibility,
    'Local placeholder SVG (not a real photo).'
  ),
  (
    '30000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-00000000000a'::uuid,
    'local_fixture',
    'supporting'::public.evidence_relation,
    'public'::public.evidence_visibility,
    'Local placeholder SVG for a resolved fixture.'
  )
ON CONFLICT (id) DO UPDATE
SET
  media_id = EXCLUDED.media_id,
  issue_id = EXCLUDED.issue_id,
  provenance = EXCLUDED.provenance,
  visibility = EXCLUDED.visibility,
  summary = EXCLUDED.summary;

COMMIT;
SQL

# Copy placeholder into API upload dir so thumbnail URLs resolve if served from filesystem store.
# Resolve relative to repo root (matches apps/api/src/node.ts) and also apps/api/.uploads if that
# directory is used when the process cwd differs.
mkdir -p "${ROOT}/.uploads/fixtures" "${ROOT}/apps/api/.uploads/fixtures"
if [[ -f "${ROOT}/apps/web/public/fixtures/sample-evidence.svg" ]]; then
  cp "${ROOT}/apps/web/public/fixtures/sample-evidence.svg" "${ROOT}/.uploads/fixtures/sample-evidence.svg"
  cp "${ROOT}/apps/web/public/fixtures/sample-evidence.svg" "${ROOT}/apps/api/.uploads/fixtures/sample-evidence.svg"
fi

echo "Seed complete."
echo "Dev user id (x-dev-user-id): ${DEV_USER_ID}"
echo "Placeholder evidence path (web): ${PLACEHOLDER_SVG}"
