-- Role helpers and optimistic-concurrency issue status transitions.
-- status_events is append-only: no UPDATE/DELETE grants for app roles.

CREATE OR REPLACE FUNCTION app.current_profile_role()
RETURNS public.profile_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION app.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('moderator', 'senior_moderator', 'admin')
     FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app.is_senior_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('senior_moderator', 'admin')
     FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION app.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_moderator() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_senior_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_profile_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_moderator() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_senior_moderator() TO authenticated, service_role;

-- Allowed issue status edges (section 9 + 4D).
CREATE OR REPLACE FUNCTION app.issue_transition_allowed(
  p_old public.issue_status,
  p_new public.issue_status
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_old IS NOT DISTINCT FROM p_new THEN false
    WHEN p_old = 'open' AND p_new IN ('fix_pending', 'resolved', 'hidden', 'duplicate') THEN true
    WHEN p_old = 'fix_pending' AND p_new IN ('open', 'resolved', 'hidden', 'duplicate') THEN true
    WHEN p_old = 'resolved' AND p_new IN ('open', 'hidden', 'duplicate') THEN true
    WHEN p_old = 'hidden' AND p_new IN ('open', 'fix_pending', 'resolved', 'duplicate') THEN true
    -- duplicate is terminal for map purposes; un-duplicating requires senior path to open
    WHEN p_old = 'duplicate' AND p_new = 'open' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION app.transition_issue_status(
  p_issue_id UUID,
  p_expected_revision INTEGER,
  p_new_status public.issue_status,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_evidence_ids UUID[] DEFAULT '{}',
  p_canonical_issue_id UUID DEFAULT NULL
) RETURNS public.issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.issues;
  v_old public.issue_status;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'expected_revision required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_issue
  FROM public.issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue not found: %', p_issue_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_issue.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'revision conflict: expected %, actual %',
      p_expected_revision, v_issue.revision
      USING ERRCODE = 'exclusion_violation';
  END IF;

  v_old := v_issue.status;

  IF NOT app.issue_transition_allowed(v_old, p_new_status) THEN
    RAISE EXCEPTION 'invalid status transition: % → %', v_old, p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_new_status = 'duplicate' THEN
    IF p_canonical_issue_id IS NULL THEN
      RAISE EXCEPTION 'canonical_issue_id required for duplicate'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_canonical_issue_id = p_issue_id THEN
      RAISE EXCEPTION 'canonical_issue_id cannot equal issue id'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.issues
  SET
    status = p_new_status,
    revision = revision + 1,
    canonical_issue_id = CASE
      WHEN p_new_status = 'duplicate' THEN p_canonical_issue_id
      ELSE NULL
    END,
    resolved_at = CASE
      WHEN p_new_status = 'resolved' THEN COALESCE(resolved_at, now())
      WHEN p_new_status = 'open' AND v_old = 'resolved' THEN NULL
      WHEN p_new_status IN ('hidden', 'duplicate') THEN resolved_at
      ELSE resolved_at
    END,
    last_verified_at = CASE
      WHEN p_new_status IN ('fix_pending', 'resolved', 'open') THEN now()
      ELSE last_verified_at
    END,
    updated_at = now()
  WHERE id = p_issue_id
  RETURNING * INTO v_issue;

  INSERT INTO public.status_events (
    issue_id,
    old_status,
    new_status,
    actor_id,
    reason,
    evidence_ids,
    revision_after
  ) VALUES (
    p_issue_id,
    v_old,
    p_new_status,
    p_actor_id,
    p_reason,
    COALESCE(p_evidence_ids, '{}'),
    v_issue.revision
  );

  RETURN v_issue;
END;
$$;

COMMENT ON FUNCTION app.transition_issue_status IS
  'Checked issue status transition with optimistic concurrency (expected revision). Appends status_events.';

REVOKE ALL ON FUNCTION app.transition_issue_status(
  UUID, INTEGER, public.issue_status, UUID, TEXT, UUID[], UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transition_issue_status(
  UUID, INTEGER, public.issue_status, UUID, TEXT, UUID[], UUID
) TO service_role;

-- Public RPC wrapper for moderators (API may also call app.* via service role).
CREATE OR REPLACE FUNCTION public.transition_issue_status(
  p_issue_id UUID,
  p_expected_revision INTEGER,
  p_new_status public.issue_status,
  p_reason TEXT DEFAULT NULL,
  p_evidence_ids UUID[] DEFAULT '{}',
  p_canonical_issue_id UUID DEFAULT NULL
) RETURNS public.issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_new_status IN ('hidden', 'duplicate') OR (p_new_status = 'open' AND (
    SELECT status FROM public.issues WHERE id = p_issue_id
  ) IN ('resolved', 'hidden', 'duplicate')) THEN
    IF NOT app.is_senior_moderator() THEN
      RAISE EXCEPTION 'senior_moderator or admin required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT app.is_moderator() THEN
    RAISE EXCEPTION 'moderator role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN app.transition_issue_status(
    p_issue_id,
    p_expected_revision,
    p_new_status,
    auth.uid(),
    p_reason,
    p_evidence_ids,
    p_canonical_issue_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_issue_status(
  UUID, INTEGER, public.issue_status, TEXT, UUID[], UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_issue_status(
  UUID, INTEGER, public.issue_status, TEXT, UUID[], UUID
) TO authenticated, service_role;

-- Keep status_events append-only for table owners other than superuser paths.
CREATE OR REPLACE FUNCTION app.deny_status_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'status_events is append-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER status_events_deny_update
  BEFORE UPDATE ON public.status_events
  FOR EACH ROW
  EXECUTE FUNCTION app.deny_status_events_mutation();

CREATE TRIGGER status_events_deny_delete
  BEFORE DELETE ON public.status_events
  FOR EACH ROW
  EXECUTE FUNCTION app.deny_status_events_mutation();

-- Profile bootstrap from auth.users
CREATE OR REPLACE FUNCTION app.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'display_name'), ''),
      split_part(NEW.email, '@', 1),
      'user'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION app.handle_new_user();

-- Support count maintenance (idempotent toggle helper for API layer)
CREATE OR REPLACE FUNCTION app.set_issue_support(
  p_issue_id UUID,
  p_user_id UUID,
  p_supported boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.supports
    WHERE issue_id = p_issue_id AND user_id = p_user_id
  ) INTO v_exists;

  IF p_supported AND NOT v_exists THEN
    INSERT INTO public.supports (issue_id, user_id) VALUES (p_issue_id, p_user_id);
    UPDATE public.issues
    SET support_count = support_count + 1, updated_at = now()
    WHERE id = p_issue_id;
    RETURN true;
  ELSIF NOT p_supported AND v_exists THEN
    DELETE FROM public.supports
    WHERE issue_id = p_issue_id AND user_id = p_user_id;
    UPDATE public.issues
    SET support_count = GREATEST(support_count - 1, 0), updated_at = now()
    WHERE id = p_issue_id;
    RETURN false;
  END IF;

  RETURN p_supported;
END;
$$;

REVOKE ALL ON FUNCTION app.set_issue_support(UUID, UUID, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_issue_support(UUID, UUID, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.set_issue_support(
  p_issue_id UUID,
  p_supported boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN app.set_issue_support(p_issue_id, auth.uid(), p_supported);
END;
$$;

REVOKE ALL ON FUNCTION public.set_issue_support(UUID, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_issue_support(UUID, boolean) TO authenticated, service_role;
