-- Privileges for Supabase API roles. RLS still filters rows.
-- service_role bypasses RLS; anon/authenticated rely on policies.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA app TO authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Tighten tables that must not be client-writable even if a policy were added later.
REVOKE INSERT, UPDATE, DELETE ON public.status_events FROM authenticated, anon;
REVOKE ALL ON public.jobs FROM anon, authenticated;
REVOKE ALL ON public.outbox FROM anon, authenticated;
REVOKE ALL ON public.provider_usage FROM anon, authenticated;
GRANT ALL ON public.jobs TO service_role;
GRANT ALL ON public.outbox TO service_role;
GRANT ALL ON public.provider_usage TO service_role;

-- status_events: SELECT for clients (RLS); INSERT only via SECURITY DEFINER transition fn
GRANT SELECT ON public.status_events TO anon, authenticated;
GRANT ALL ON public.status_events TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
