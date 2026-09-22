-- M1: PostGIS for issue geometry (SRID 4326) and meter-distance queries.
-- Apply with Supabase CLI or psql; see db/README.md.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Privileged helpers live here so SECURITY DEFINER is not in the exposed API surface.
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO postgres, service_role;
