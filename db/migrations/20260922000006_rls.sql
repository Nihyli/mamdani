-- Row Level Security for tables reachable through Supabase.
-- Policy intent is documented in comments on each table block.
--
-- Public (anon) must NOT see:
--   - email (not stored on profiles; auth.users is not exposed)
--   - private / reviewers_only evidence
--   - location_candidates
--   - other owners' draft submissions
--   - abuse_flags as public accusations
--   - jobs, outbox, provider_usage
--
-- Moderators use authenticated role + role checks via app.is_moderator().
-- Service role bypasses RLS (API/worker).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_flags ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- SELECT: anyone may read display_name/role for attribution (no email column).
-- UPDATE: own row only; role changes are service_role / admin API only.
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_public
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON POLICY profiles_select_public ON public.profiles IS
  'Public may read profiles for display names. Email is not on this table.';

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

COMMENT ON POLICY profiles_update_own ON public.profiles IS
  'Users may update their own profile fields but cannot escalate role via RLS.';

CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'user');

-- ---------------------------------------------------------------------------
-- source_posts
-- Public read of attribution for published linkages; writes via service/mod path.
-- ---------------------------------------------------------------------------
CREATE POLICY source_posts_select_public
  ON public.source_posts
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON POLICY source_posts_select_public ON public.source_posts IS
  'Source attribution URLs are public; media is never fetched from these rows.';

CREATE POLICY source_posts_write_moderator
  ON public.source_posts
  FOR ALL
  TO authenticated
  USING (app.is_moderator())
  WITH CHECK (app.is_moderator());

-- ---------------------------------------------------------------------------
-- submissions
-- Owner: full access to own rows.
-- Moderators: read non-draft / review queue.
-- Public (anon): no access — drafts and in-flight work stay private.
-- ---------------------------------------------------------------------------
CREATE POLICY submissions_select_owner
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR app.is_moderator()
  );

COMMENT ON POLICY submissions_select_owner ON public.submissions IS
  'No anon read. Owners see own submissions; moderators see the review queue. Other owners'' drafts are hidden.';

CREATE POLICY submissions_insert_own
  ON public.submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY submissions_update_own_draft
  ON public.submissions
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR app.is_moderator()
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR app.is_moderator()
  );

-- ---------------------------------------------------------------------------
-- issues
-- Public: open, fix_pending, resolved (map + Fixed). Not hidden/duplicate.
-- Moderators: all rows.
-- ---------------------------------------------------------------------------
CREATE POLICY issues_select_public
  ON public.issues
  FOR SELECT
  TO anon, authenticated
  USING (
    status IN ('open', 'fix_pending', 'resolved')
    OR app.is_moderator()
  );

COMMENT ON POLICY issues_select_public ON public.issues IS
  'Anon/authenticated see published lifecycle states only. Hidden/duplicate require moderator.';

CREATE POLICY issues_write_moderator
  ON public.issues
  FOR ALL
  TO authenticated
  USING (app.is_moderator())
  WITH CHECK (app.is_moderator());

-- ---------------------------------------------------------------------------
-- issue_sources
-- Readable when the linked issue is publicly visible.
-- ---------------------------------------------------------------------------
CREATE POLICY issue_sources_select_public
  ON public.issue_sources
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id
        AND (
          i.status IN ('open', 'fix_pending', 'resolved')
          OR app.is_moderator()
        )
    )
  );

CREATE POLICY issue_sources_write_moderator
  ON public.issue_sources
  FOR ALL
  TO authenticated
  USING (app.is_moderator())
  WITH CHECK (app.is_moderator());

-- ---------------------------------------------------------------------------
-- media
-- Owner always; moderators always; anon never (public delivery is via signed
-- derivative URLs from the API, not raw table reads of private_object_key).
-- ---------------------------------------------------------------------------
CREATE POLICY media_select_owner_or_mod
  ON public.media
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR app.is_moderator());

COMMENT ON POLICY media_select_owner_or_mod ON public.media IS
  'No anon SELECT. Private object keys stay off the public Data API.';

CREATE POLICY media_insert_own
  ON public.media
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY media_update_own_or_mod
  ON public.media
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR app.is_moderator())
  WITH CHECK (owner_id = auth.uid() OR app.is_moderator());

-- ---------------------------------------------------------------------------
-- evidence
-- Public only when visibility = public AND parent issue is publicly listed.
-- Private / reviewers_only: owner (via submission) or moderator.
-- ---------------------------------------------------------------------------
CREATE POLICY evidence_select_public_or_privileged
  ON public.evidence
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      visibility = 'public'
      AND issue_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.issues i
        WHERE i.id = evidence.issue_id
          AND i.status IN ('open', 'fix_pending', 'resolved')
      )
    )
    OR (
      auth.uid() IS NOT NULL
      AND (
        app.is_moderator()
        OR EXISTS (
          SELECT 1 FROM public.submissions s
          WHERE s.id = evidence.submission_id
            AND s.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.media m
          WHERE m.id = evidence.media_id
            AND m.owner_id = auth.uid()
        )
      )
    )
  );

COMMENT ON POLICY evidence_select_public_or_privileged ON public.evidence IS
  'Public reads limited to visibility=public on listed issues. Private evidence never exposed to anon.';

CREATE POLICY evidence_write_privileged
  ON public.evidence
  FOR ALL
  TO authenticated
  USING (
    app.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = evidence.submission_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    app.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = evidence.submission_id AND s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- location_candidates — never public
-- ---------------------------------------------------------------------------
CREATE POLICY location_candidates_select_privileged
  ON public.location_candidates
  FOR SELECT
  TO authenticated
  USING (
    app.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = location_candidates.submission_id
        AND s.owner_id = auth.uid()
    )
  );

COMMENT ON POLICY location_candidates_select_privileged ON public.location_candidates IS
  'No anon access. Candidates stay private until a reviewed pin is published on issues.';

CREATE POLICY location_candidates_write_privileged
  ON public.location_candidates
  FOR ALL
  TO authenticated
  USING (
    app.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = location_candidates.submission_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    app.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = location_candidates.submission_id
        AND s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- updates
-- Public: approved updates on listed issues.
-- Author: own rows; moderators: all.
-- ---------------------------------------------------------------------------
CREATE POLICY updates_select_public_or_own
  ON public.updates
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      moderation_state = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.issues i
        WHERE i.id = updates.issue_id
          AND i.status IN ('open', 'fix_pending', 'resolved')
      )
    )
    OR (auth.uid() IS NOT NULL AND author_id = auth.uid())
    OR app.is_moderator()
  );

CREATE POLICY updates_insert_authenticated
  ON public.updates
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY updates_update_own_or_mod
  ON public.updates
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR app.is_moderator())
  WITH CHECK (author_id = auth.uid() OR app.is_moderator());

-- ---------------------------------------------------------------------------
-- status_events
-- Public history for listed issues; insert only via transition function
-- (table INSERT still needs a policy for SECURITY DEFINER owner — function
-- runs as definer and bypasses RLS when owned by postgres/supabase_admin).
-- ---------------------------------------------------------------------------
CREATE POLICY status_events_select_public
  ON public.status_events
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = status_events.issue_id
        AND (
          i.status IN ('open', 'fix_pending', 'resolved')
          OR app.is_moderator()
        )
    )
  );

COMMENT ON POLICY status_events_select_public ON public.status_events IS
  'Public may read status history for listed issues. Rows are append-only via triggers.';

-- ---------------------------------------------------------------------------
-- supports
-- Users manage their own support rows. Public cannot enumerate who supported;
-- use issues.support_count for totals. Authenticated may read own rows.
-- ---------------------------------------------------------------------------
CREATE POLICY supports_select_own_or_mod
  ON public.supports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR app.is_moderator());

COMMENT ON POLICY supports_select_own_or_mod ON public.supports IS
  'No anon listing of supporters. Totals live on issues.support_count.';

CREATE POLICY supports_insert_own
  ON public.supports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY supports_delete_own
  ON public.supports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- jobs / outbox / provider_usage — service_role only (no policies for anon/auth)
-- Enabling RLS with zero policies denies client access.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.jobs IS
  'RLS enabled with no anon/authenticated policies: client Data API cannot read/write. service_role bypasses RLS. Unused at M1.';

COMMENT ON TABLE public.outbox IS
  'RLS enabled with no anon/authenticated policies. Unused at M1 until projection workers.';

COMMENT ON TABLE public.provider_usage IS
  'RLS enabled with no anon/authenticated policies. Cost ledger for M2+.';

-- ---------------------------------------------------------------------------
-- abuse_flags — never public accusations
-- ---------------------------------------------------------------------------
CREATE POLICY abuse_flags_select_reporter_or_mod
  ON public.abuse_flags
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR app.is_senior_moderator());

COMMENT ON POLICY abuse_flags_select_reporter_or_mod ON public.abuse_flags IS
  'No anon access. Flags are never exposed as public accusations.';

CREATE POLICY abuse_flags_insert_authenticated
  ON public.abuse_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY abuse_flags_update_senior
  ON public.abuse_flags
  FOR UPDATE
  TO authenticated
  USING (app.is_senior_moderator())
  WITH CHECK (app.is_senior_moderator());
