-- Milestone 2: analysis jobs, cost caps, proposals, stage outputs, claim helpers.

-- ---------------------------------------------------------------------------
-- analysis_settings: singleton budget + pause flags (SPEC §14, §16)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analysis_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  analysis_enabled BOOLEAN NOT NULL DEFAULT true,
  analysis_paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  daily_cap_cents INTEGER NOT NULL DEFAULT 500
    CHECK (daily_cap_cents >= 0),
  monthly_cap_cents INTEGER NOT NULL DEFAULT 10000
    CHECK (monthly_cap_cents >= 0),
  pipeline_version TEXT NOT NULL DEFAULT 'm2.v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analysis_settings IS
  'Singleton analysis feature flags and cost caps. When paused/disabled, submissions skip paid analysis and go straight to pending_review.';

INSERT INTO public.analysis_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- job_stage_outputs: durable per-stage results (SPEC §8 idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_stage_outputs (
  job_id UUID NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, stage),
  CONSTRAINT job_stage_outputs_stage_nonempty CHECK (char_length(btrim(stage)) >= 1)
);

COMMENT ON TABLE public.job_stage_outputs IS
  'Unique stage outputs so retries do not redo transcription/geocoding.';

-- ---------------------------------------------------------------------------
-- analysis_proposals: structured moderator proposals (SPEC §8 schema)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analysis_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions (id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  proposal JSONB NOT NULL,
  pipeline_version TEXT NOT NULL,
  estimated_cost_cents INTEGER CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analysis_proposals_submission_unique UNIQUE (submission_id)
);

COMMENT ON TABLE public.analysis_proposals IS
  'AI/assisted analysis proposal for a submission. Never publishes; moderator reviews alongside user-supplied location.';

CREATE INDEX IF NOT EXISTS analysis_proposals_job_id_idx
  ON public.analysis_proposals (job_id);

-- ---------------------------------------------------------------------------
-- Grants / RLS for new tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.analysis_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_stage_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analysis_settings FROM anon, authenticated;
REVOKE ALL ON public.job_stage_outputs FROM anon, authenticated;
REVOKE ALL ON public.analysis_proposals FROM anon, authenticated;
GRANT ALL ON public.analysis_settings TO service_role;
GRANT ALL ON public.job_stage_outputs TO service_role;
GRANT ALL ON public.analysis_proposals TO service_role;

-- Moderators may read proposals through the API (service role); no direct client policies.

-- ---------------------------------------------------------------------------
-- Claim jobs with FOR UPDATE SKIP LOCKED (SPEC §12)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.claim_jobs(
  p_limit INTEGER DEFAULT 1,
  p_lease_seconds INTEGER DEFAULT 120,
  p_worker_id TEXT DEFAULT NULL
) RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID := gen_random_uuid();
  v_lease TIMESTAMPTZ := now() + make_interval(secs => GREATEST(p_lease_seconds, 15));
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.jobs j
    WHERE (
        j.state = 'pending'
        AND j.next_run_at <= now()
      )
      OR (
        j.state = 'leased'
        AND j.lease_until IS NOT NULL
        AND j.lease_until < now()
      )
    ORDER BY j.next_run_at ASC, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.jobs j
  SET
    state = 'leased',
    lease_until = v_lease,
    lease_token = v_token,
    attempts = j.attempts + 1,
    payload = CASE
      WHEN p_worker_id IS NULL THEN j.payload
      ELSE j.payload || jsonb_build_object('worker_id', p_worker_id)
    END,
    updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

COMMENT ON FUNCTION app.claim_jobs IS
  'Claim pending (or expired-lease) jobs in a short transaction using FOR UPDATE SKIP LOCKED.';

REVOKE ALL ON FUNCTION app.claim_jobs(INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_jobs(INTEGER, INTEGER, TEXT) TO service_role;

-- Heartbeat: extend lease only when token matches (fence stale workers)
CREATE OR REPLACE FUNCTION app.heartbeat_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 120
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.jobs
  SET
    lease_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 15)),
    updated_at = now()
  WHERE id = p_job_id
    AND state = 'leased'
    AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.heartbeat_job(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.heartbeat_job(UUID, UUID, INTEGER) TO service_role;

-- Complete job only with matching lease token
CREATE OR REPLACE FUNCTION app.complete_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_result JSONB DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.jobs
  SET
    state = 'completed',
    lease_until = NULL,
    payload = payload || jsonb_build_object('result', COALESCE(p_result, '{}'::jsonb)),
    last_error = NULL,
    updated_at = now()
  WHERE id = p_job_id
    AND state = 'leased'
    AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.complete_job(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_job(UUID, UUID, JSONB) TO service_role;

-- Fail / retry with exponential backoff + jitter; dead after 3 attempts
CREATE OR REPLACE FUNCTION app.fail_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error TEXT,
  p_max_attempts INTEGER DEFAULT 3
) RETURNS public.job_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts INTEGER;
  v_state public.job_state;
  v_delay_seconds INTEGER;
BEGIN
  SELECT attempts INTO v_attempts
  FROM public.jobs
  WHERE id = p_job_id
    AND state = 'leased'
    AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_attempts >= GREATEST(p_max_attempts, 1) THEN
    v_state := 'dead';
    UPDATE public.jobs
    SET
      state = 'dead',
      lease_until = NULL,
      last_error = left(COALESCE(p_error, 'unknown'), 2000),
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    v_state := 'pending';
    -- Exponential backoff with jitter: ~2^attempts seconds ± 25%
    v_delay_seconds := GREATEST(
      5,
      (POWER(2, v_attempts)::INTEGER) + (floor(random() * POWER(2, v_attempts) * 0.5))::INTEGER
    );
    UPDATE public.jobs
    SET
      state = 'pending',
      lease_until = NULL,
      lease_token = NULL,
      next_run_at = now() + make_interval(secs => v_delay_seconds),
      last_error = left(COALESCE(p_error, 'unknown'), 2000),
      updated_at = now()
    WHERE id = p_job_id;
  END IF;

  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION app.fail_job(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fail_job(UUID, UUID, TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Cost reservation against daily/monthly caps (SPEC §14)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.analysis_spend_cents(
  p_since TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN reservation_state = 'settled' THEN COALESCE(actual_cost_cents, estimated_cost_cents, 0)
      WHEN reservation_state = 'reserved' THEN COALESCE(estimated_cost_cents, 0)
      ELSE 0
    END
  ), 0)::INTEGER
  FROM public.provider_usage
  WHERE created_at >= p_since
    AND reservation_state IN ('reserved', 'settled');
$$;

REVOKE ALL ON FUNCTION app.analysis_spend_cents(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.analysis_spend_cents(TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION app.reserve_analysis_budget(
  p_job_id UUID,
  p_provider TEXT,
  p_estimated_cost_cents INTEGER,
  p_units NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.analysis_settings;
  v_daily INTEGER;
  v_monthly INTEGER;
  v_id UUID;
BEGIN
  IF p_estimated_cost_cents IS NULL OR p_estimated_cost_cents < 0 THEN
    RAISE EXCEPTION 'estimated_cost_cents required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_settings
  FROM public.analysis_settings
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'analysis_settings missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_settings.analysis_enabled OR v_settings.analysis_paused THEN
    RAISE EXCEPTION 'analysis_paused'
      USING ERRCODE = 'check_violation';
  END IF;

  v_daily := app.analysis_spend_cents(date_trunc('day', now() AT TIME ZONE 'utc'));
  v_monthly := app.analysis_spend_cents(date_trunc('month', now() AT TIME ZONE 'utc'));

  IF v_daily + p_estimated_cost_cents > v_settings.daily_cap_cents
     OR v_monthly + p_estimated_cost_cents > v_settings.monthly_cap_cents THEN
    UPDATE public.analysis_settings
    SET
      analysis_paused = true,
      pause_reason = CASE
        WHEN v_daily + p_estimated_cost_cents > v_settings.daily_cap_cents
          THEN 'daily_cap_reached'
        ELSE 'monthly_cap_reached'
      END,
      updated_at = now()
    WHERE id = 1;
    RAISE EXCEPTION 'budget_exhausted'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.provider_usage (
    job_id, provider, units, estimated_cost_cents, reservation_state
  ) VALUES (
    p_job_id, p_provider, p_units, p_estimated_cost_cents, 'reserved'
  )
  RETURNING id INTO v_id;

  UPDATE public.jobs
  SET
    cost_reservation_cents = COALESCE(cost_reservation_cents, 0) + p_estimated_cost_cents,
    updated_at = now()
  WHERE id = p_job_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION app.reserve_analysis_budget IS
  'Atomically reserve spend against daily/monthly caps. Auto-pauses analysis when a cap would be exceeded.';

REVOKE ALL ON FUNCTION app.reserve_analysis_budget(UUID, TEXT, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_analysis_budget(UUID, TEXT, INTEGER, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION app.settle_provider_usage(
  p_usage_id UUID,
  p_actual_cost_cents INTEGER,
  p_units NUMERIC DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.provider_usage
  SET
    actual_cost_cents = p_actual_cost_cents,
    units = COALESCE(p_units, units),
    reservation_state = 'settled'
  WHERE id = p_usage_id
    AND reservation_state = 'reserved';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.settle_provider_usage(UUID, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.settle_provider_usage(UUID, INTEGER, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION app.cancel_provider_usage(
  p_usage_id UUID
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.provider_usage
  SET reservation_state = 'cancelled'
  WHERE id = p_usage_id
    AND reservation_state = 'reserved';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.cancel_provider_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cancel_provider_usage(UUID) TO service_role;

-- Expire stale reservations (crashed workers) older than p_max_age
CREATE OR REPLACE FUNCTION app.expire_stale_reservations(
  p_max_age_seconds INTEGER DEFAULT 3600
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE public.provider_usage
    SET reservation_state = 'expired'
    WHERE reservation_state = 'reserved'
      AND created_at < now() - make_interval(secs => GREATEST(p_max_age_seconds, 60))
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app.expire_stale_reservations(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_stale_reservations(INTEGER) TO service_role;

-- Nearby published issues within radius meters (duplicate candidates)
CREATE OR REPLACE FUNCTION app.nearby_issue_candidates(
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_radius_m DOUBLE PRECISION DEFAULT 50,
  p_category public.issue_category DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  issue_id UUID,
  short_id TEXT,
  slug TEXT,
  title TEXT,
  category public.issue_category,
  status public.issue_status,
  distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.short_id,
    i.slug,
    i.title,
    i.category,
    i.status,
    ST_Distance(
      i.geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m
  FROM public.issues i
  WHERE i.status IN ('open', 'fix_pending', 'resolved')
    AND ST_DWithin(
      i.geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      GREATEST(p_radius_m, 1)
    )
    AND (p_category IS NULL OR i.category = p_category)
  ORDER BY distance_m ASC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION app.nearby_issue_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, public.issue_category, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.nearby_issue_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, public.issue_category, INTEGER
) TO service_role;
