-- Milestone 3 launch-minimum: snapshots, share cards, content reports, takedowns, purge ledger.

-- ---------------------------------------------------------------------------
-- snapshot_versions: immutable map projections (compact public fields only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.snapshot_versions (
  version TEXT PRIMARY KEY,
  feature_count INTEGER NOT NULL DEFAULT 0 CHECK (feature_count >= 0),
  borough_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  object_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purged_at TIMESTAMPTZ
);

COMMENT ON TABLE public.snapshot_versions IS
  'Immutable public map snapshot sets. Manifest points at the current version.';

CREATE TABLE IF NOT EXISTS public.snapshot_manifest (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version TEXT NOT NULL REFERENCES public.snapshot_versions (version),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.snapshot_manifest IS
  'Single-row pointer to the current published snapshot version.';

-- ---------------------------------------------------------------------------
-- share_cards: OG 1200×630 and story 1080×1920 per issue revision
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('og', 'story')),
  object_key TEXT NOT NULL,
  content_digest TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/svg+xml',
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purged_at TIMESTAMPTZ,
  CONSTRAINT share_cards_issue_revision_kind_unique UNIQUE (issue_id, revision, kind),
  CONSTRAINT share_cards_object_key_unique UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS share_cards_issue_id_idx ON public.share_cards (issue_id);

COMMENT ON TABLE public.share_cards IS
  'Background-rendered share assets. Regenerated on meaningful status/revision changes; purged on takedown.';

-- ---------------------------------------------------------------------------
-- content_reports: /report-content no-login intake with urgent clock
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  receipt_token TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'privacy_exposure',
    'ncii',
    'threat_safety',
    'wrong_location',
    'other'
  )),
  issue_id UUID REFERENCES public.issues (id) ON DELETE SET NULL,
  page_url TEXT,
  media_id UUID REFERENCES public.media (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  contact_email TEXT,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  urgent_deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'acknowledged',
    'actioned',
    'closed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_case_number_unique UNIQUE (case_number),
  CONSTRAINT content_reports_receipt_token_unique UNIQUE (receipt_token),
  CONSTRAINT content_reports_description_nonempty CHECK (char_length(btrim(description)) >= 3)
);

CREATE INDEX IF NOT EXISTS content_reports_status_urgent_idx
  ON public.content_reports (status, is_urgent, urgent_deadline_at);

COMMENT ON TABLE public.content_reports IS
  'No-login safety/privacy intake. NCII and threat categories use a separate urgent deadline clock.';

-- ---------------------------------------------------------------------------
-- takedown_cases: copyright / safety removals with purge side effects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.takedown_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('copyright', 'privacy', 'safety', 'admin')),
  content_report_id UUID REFERENCES public.content_reports (id) ON DELETE SET NULL,
  issue_id UUID REFERENCES public.issues (id) ON DELETE SET NULL,
  media_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'restricted',
    'purged',
    'closed'
  )),
  notes TEXT,
  acted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT takedown_cases_case_number_unique UNIQUE (case_number)
);

CREATE INDEX IF NOT EXISTS takedown_cases_status_idx ON public.takedown_cases (status);

COMMENT ON TABLE public.takedown_cases IS
  'Moderator/operator takedown workflow. Triggers projection/share-card/CDN purge via outbox.';

-- ---------------------------------------------------------------------------
-- deletion_ledger: must be reapplied before a restored DB is public
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deletion_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  case_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deletion_ledger_target_type_nonempty CHECK (char_length(btrim(target_type)) >= 1)
);

CREATE INDEX IF NOT EXISTS deletion_ledger_target_idx
  ON public.deletion_ledger (target_type, target_key);

COMMENT ON TABLE public.deletion_ledger IS
  'Record of removed public paths/objects. Reapply before exposing a restored environment.';

-- ---------------------------------------------------------------------------
-- cdn_purge_log: local purge sink + production hook audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdn_purge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paths TEXT[] NOT NULL,
  provider TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'recorded',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: service_role / API only (mirror jobs/outbox)
-- ---------------------------------------------------------------------------
ALTER TABLE public.snapshot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshot_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takedown_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdn_purge_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.snapshot_versions FROM anon, authenticated;
REVOKE ALL ON public.snapshot_manifest FROM anon, authenticated;
REVOKE ALL ON public.share_cards FROM anon, authenticated;
REVOKE ALL ON public.content_reports FROM anon, authenticated;
REVOKE ALL ON public.takedown_cases FROM anon, authenticated;
REVOKE ALL ON public.deletion_ledger FROM anon, authenticated;
REVOKE ALL ON public.cdn_purge_log FROM anon, authenticated;

GRANT ALL ON public.snapshot_versions TO service_role;
GRANT ALL ON public.snapshot_manifest TO service_role;
GRANT ALL ON public.share_cards TO service_role;
GRANT ALL ON public.content_reports TO service_role;
GRANT ALL ON public.takedown_cases TO service_role;
GRANT ALL ON public.deletion_ledger TO service_role;
GRANT ALL ON public.cdn_purge_log TO service_role;
