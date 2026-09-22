-- Indexes required by section 9.

-- Spatial: GiST on geometry; GiST on geography for meter ST_DWithin.
CREATE INDEX issues_geometry_gix ON public.issues USING GIST (geometry);
CREATE INDEX issues_geography_gix ON public.issues USING GIST (geography);

-- Filter / list keyset helpers
CREATE INDEX issues_status_idx ON public.issues (status);
CREATE INDEX issues_category_idx ON public.issues (category);
CREATE INDEX issues_borough_idx ON public.issues (borough);
CREATE INDEX issues_created_at_id_idx ON public.issues (created_at DESC, id DESC);

-- Active map: exclude hidden/duplicate from common scans
CREATE INDEX issues_active_map_idx
  ON public.issues (created_at DESC, id DESC)
  WHERE status IN ('open', 'fix_pending');

-- Fixed feed
CREATE INDEX issues_resolved_at_idx
  ON public.issues (resolved_at DESC, id DESC)
  WHERE status = 'resolved';

-- Unique canonical source on submissions (partial — nulls allowed for link-less drafts)
CREATE UNIQUE INDEX submissions_canonical_source_key_uidx
  ON public.submissions (canonical_source_key)
  WHERE canonical_source_key IS NOT NULL;

CREATE INDEX submissions_owner_created_at_idx
  ON public.submissions (owner_id, created_at DESC);

CREATE INDEX submissions_processing_state_idx
  ON public.submissions (processing_state);

-- supports uniqueness is the PRIMARY KEY (issue_id, user_id)
CREATE INDEX supports_user_id_idx ON public.supports (user_id);

-- jobs / outbox claim indexes (unused at M1, required by schema)
CREATE INDEX jobs_state_next_run_at_idx ON public.jobs (state, next_run_at);
CREATE INDEX outbox_state_next_run_at_idx ON public.outbox (state, next_run_at);

CREATE INDEX media_owner_id_idx ON public.media (owner_id);
CREATE INDEX media_submission_id_idx ON public.media (submission_id);

CREATE INDEX evidence_issue_id_idx ON public.evidence (issue_id);
CREATE INDEX evidence_submission_id_idx ON public.evidence (submission_id);

CREATE INDEX location_candidates_submission_id_idx
  ON public.location_candidates (submission_id);

CREATE INDEX status_events_issue_id_created_at_idx
  ON public.status_events (issue_id, created_at);

CREATE INDEX updates_issue_id_idx ON public.updates (issue_id);
CREATE INDEX abuse_flags_resolution_idx ON public.abuse_flags (resolution)
  WHERE resolution = 'pending';
