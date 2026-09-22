-- LOCAL DOCKER ONLY — do not apply against hosted Supabase.
-- Supabase already provides auth.users, auth.uid(), and API roles.
-- This stub lets plain PostGIS Postgres accept the production migrations.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  email_confirmed_at TIMESTAMPTZ
);

-- RLS policies call auth.uid(); local API uses the postgres role, so null is fine.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;

-- Roles referenced by db/migrations grants + RLS (Supabase JWT roles).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;
