-- Core tables for M1. jobs and outbox are created but unused until M2+.

-- ---------------------------------------------------------------------------
-- profiles: display identity + role. Email stays in auth.users only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role public.profile_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_display_name_nonempty CHECK (char_length(btrim(display_name)) >= 1)
);

COMMENT ON TABLE public.profiles IS
  'App profile for an auth user. Never store email here; public projections must not expose email.';

-- ---------------------------------------------------------------------------
-- source_posts: TikTok (etc.) attribution + dedup key, never a media source.
-- ---------------------------------------------------------------------------
CREATE TABLE public.source_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  availability public.source_availability NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_posts_platform_nonempty CHECK (char_length(btrim(platform)) >= 1),
  CONSTRAINT source_posts_platform_post_unique UNIQUE (platform, platform_post_id)
);

COMMENT ON TABLE public.source_posts IS
  'Canonical platform posts. Unique (platform, platform_post_id) is the unique canonical source identifier.';

-- ---------------------------------------------------------------------------
-- submissions: owner drafts and review queue items.
-- ---------------------------------------------------------------------------
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  kind public.submission_kind NOT NULL DEFAULT 'upload',
  processing_state public.processing_state NOT NULL DEFAULT 'draft',
  category public.issue_category,
  title TEXT,
  description TEXT,
  location_text TEXT,
  -- Longitude before latitude when constructing: ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  location geometry(Point, 4326),
  location_precision public.location_precision,
  source_post_id UUID REFERENCES public.source_posts (id) ON DELETE SET NULL,
  -- Denormalized key matching source_posts uniqueness for fast dedup lookups.
  canonical_source_key TEXT,
  idempotency_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  issue_id UUID,
  rights_attested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT submissions_owner_idempotency_unique UNIQUE (owner_id, idempotency_key)
);

COMMENT ON TABLE public.submissions IS
  'User submissions. Drafts are owner-private. processing_state is independent of issue status.';

COMMENT ON COLUMN public.submissions.canonical_source_key IS
  'Optional unique canonical source string, typically platform:platform_post_id.';

COMMENT ON COLUMN public.submissions.location IS
  'User-supplied pin, SRID 4326. Construct with longitude then latitude.';

-- ---------------------------------------------------------------------------
-- issues: published (or moderated) map entities.
-- ---------------------------------------------------------------------------
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  category public.issue_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  geometry geometry(Point, 4326) NOT NULL,
  -- Stored geography for meter-based ST_DWithin; mirrors geometry.
  geography geography(Point, 4326)
    GENERATED ALWAYS AS ((geometry)::geography) STORED,
  precision public.location_precision NOT NULL DEFAULT 'user_supplied',
  borough public.nyc_borough NOT NULL,
  status public.issue_status NOT NULL DEFAULT 'open',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  support_count INTEGER NOT NULL DEFAULT 0 CHECK (support_count >= 0),
  canonical_issue_id UUID REFERENCES public.issues (id) ON DELETE RESTRICT,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  submission_id UUID REFERENCES public.submissions (id) ON DELETE SET NULL,
  last_verified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issues_short_id_unique UNIQUE (short_id),
  CONSTRAINT issues_slug_nonempty CHECK (char_length(btrim(slug)) >= 1),
  CONSTRAINT issues_title_nonempty CHECK (char_length(btrim(title)) >= 1),
  CONSTRAINT issues_duplicate_canonical_ck CHECK (
    (status = 'duplicate' AND canonical_issue_id IS NOT NULL)
    OR (status <> 'duplicate' AND canonical_issue_id IS NULL)
  ),
  CONSTRAINT issues_resolved_at_ck CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status <> 'resolved')
  )
);

COMMENT ON TABLE public.issues IS
  'Public map/Fixed entities. Hidden and duplicate are excluded from map counts. Public URL: /r/{slug}-{shortId}; slug never contains the brand name.';

COMMENT ON COLUMN public.issues.geometry IS
  'Point SRID 4326. Longitude precedes latitude (ST_MakePoint(lng, lat)).';

COMMENT ON COLUMN public.issues.geography IS
  'Generated geography for meter distance (ST_DWithin).';

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES public.issues (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- issue_sources: many-to-many issues ↔ source_posts
-- ---------------------------------------------------------------------------
CREATE TABLE public.issue_sources (
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  source_post_id UUID NOT NULL REFERENCES public.source_posts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, source_post_id)
);

-- ---------------------------------------------------------------------------
-- media: private R2 object metadata
-- ---------------------------------------------------------------------------
CREATE TABLE public.media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  submission_id UUID REFERENCES public.submissions (id) ON DELETE SET NULL,
  private_object_key TEXT NOT NULL,
  content_digest TEXT,
  mime_type TEXT NOT NULL,
  byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  observed_at TIMESTAMPTZ,
  retention_deadline TIMESTAMPTZ,
  publication_permission public.media_publication_permission NOT NULL DEFAULT 'pending',
  upload_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_private_object_key_unique UNIQUE (private_object_key)
);

COMMENT ON TABLE public.media IS
  'Private upload metadata. Bytes live in R2; this row is not a public media URL.';

-- ---------------------------------------------------------------------------
-- updates: fix claims, reopen requests, evidence additions
-- ---------------------------------------------------------------------------
CREATE TABLE public.updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  kind public.update_kind NOT NULL,
  body TEXT,
  observed_at TIMESTAMPTZ,
  proposed_status public.issue_status,
  moderation_state public.moderation_state NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- evidence: frames, URLs, provenance; visibility gates public exposure
-- ---------------------------------------------------------------------------
CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID REFERENCES public.media (id) ON DELETE SET NULL,
  issue_id UUID REFERENCES public.issues (id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.submissions (id) ON DELETE SET NULL,
  update_id UUID REFERENCES public.updates (id) ON DELETE SET NULL,
  source_url TEXT,
  frame_timestamp_ms INTEGER,
  provenance TEXT NOT NULL,
  relation public.evidence_relation NOT NULL DEFAULT 'supporting',
  visibility public.evidence_visibility NOT NULL DEFAULT 'reviewers_only',
  summary TEXT,
  content_digest TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_has_anchor CHECK (
    media_id IS NOT NULL
    OR source_url IS NOT NULL
    OR frame_timestamp_ms IS NOT NULL
  )
);

COMMENT ON TABLE public.evidence IS
  'Supporting/contradicting observations. Private and reviewers_only rows must never appear in public API projections.';

-- ---------------------------------------------------------------------------
-- location_candidates: private until a moderator publishes a pin
-- ---------------------------------------------------------------------------
CREATE TABLE public.location_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions (id) ON DELETE CASCADE,
  geometry geometry(Point, 4326) NOT NULL,
  precision public.location_precision NOT NULL,
  provider TEXT,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  contradiction_ids UUID[] NOT NULL DEFAULT '{}',
  verification TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.location_candidates IS
  'Private location proposals. Never publicly readable; only reviewed locations become issue.geometry.';

-- ---------------------------------------------------------------------------
-- status_events: append-only audit of issue status transitions
-- ---------------------------------------------------------------------------
CREATE TABLE public.status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  old_status public.issue_status,
  new_status public.issue_status NOT NULL,
  actor_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  reason TEXT,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  revision_after INTEGER NOT NULL CHECK (revision_after >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.status_events IS
  'Append-only. Mutations go through app.transition_issue_status; UPDATE/DELETE are revoked.';

-- ---------------------------------------------------------------------------
-- supports: one support per authenticated user per issue
-- ---------------------------------------------------------------------------
CREATE TABLE public.supports (
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, user_id)
);

-- ---------------------------------------------------------------------------
-- jobs: leased work queue (created for M1; unused until M2)
-- ---------------------------------------------------------------------------
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions (id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  state public.job_state NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  pipeline_version TEXT,
  cost_reservation_cents INTEGER CHECK (cost_reservation_cents IS NULL OR cost_reservation_cents >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.jobs IS
  'Postgres job queue with leases. Present at M1 but unused until Milestone 2.';

-- ---------------------------------------------------------------------------
-- outbox: durable post-transaction side effects (created for M1; unused until projections)
-- ---------------------------------------------------------------------------
CREATE TABLE public.outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  state public.outbox_state NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outbox IS
  'Transactional outbox for projection/purge/share-card work. Present at M1 but unused until hardening/M3.';

-- ---------------------------------------------------------------------------
-- provider_usage: cost reservation ledger (M2+)
-- ---------------------------------------------------------------------------
CREATE TABLE public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  units NUMERIC,
  estimated_cost_cents INTEGER,
  actual_cost_cents INTEGER,
  reservation_state public.provider_reservation_state NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- abuse_flags: private moderation cases; never public accusations
-- ---------------------------------------------------------------------------
CREATE TABLE public.abuse_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  reporter_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolution public.abuse_flag_resolution NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abuse_flags_target_type_nonempty CHECK (char_length(btrim(target_type)) >= 1)
);

COMMENT ON TABLE public.abuse_flags IS
  'Abuse/inaccuracy flags. Never exposed as public accusations.';
