-- Enums for M1 issue lifecycle, submission processing, and related domains.

CREATE TYPE public.issue_status AS ENUM (
  'open',
  'fix_pending',
  'resolved',
  'hidden',
  'duplicate'
);

COMMENT ON TYPE public.issue_status IS
  'Issue lifecycle: open → fix_pending → resolved; hidden/duplicate are moderator terminal states. Duplicate requires canonical_issue_id.';

CREATE TYPE public.processing_state AS ENUM (
  'draft',
  'queued',
  'processing',
  'needs_input',
  'pending_review',
  'accepted',
  'rejected'
);

COMMENT ON TYPE public.processing_state IS
  'Submission processing: draft → queued → processing → needs_input | pending_review → accepted | rejected. Failed processing retries are jobs concern, not issue status.';

CREATE TYPE public.issue_category AS ENUM (
  'pothole',
  'damaged_sidewalk',
  'broken_park_equipment',
  'broken_fountain',
  'overflowing_trash',
  'broken_streetlight',
  'other'
);

COMMENT ON TYPE public.issue_category IS
  'Launch categories (section 3). "other" enters review only, never auto-publication.';

CREATE TYPE public.location_precision AS ENUM (
  'user_supplied',
  'asset',
  'intersection',
  'block',
  'neighborhood'
);

CREATE TYPE public.profile_role AS ENUM (
  'user',
  'moderator',
  'senior_moderator',
  'admin'
);

CREATE TYPE public.nyc_borough AS ENUM (
  'manhattan',
  'brooklyn',
  'queens',
  'bronx',
  'staten_island'
);

CREATE TYPE public.submission_kind AS ENUM (
  'upload',
  'link_only'
);

CREATE TYPE public.update_kind AS ENUM (
  'note',
  'fix_claim',
  'reopen_request',
  'evidence_add'
);

CREATE TYPE public.moderation_state AS ENUM (
  'pending',
  'approved',
  'rejected',
  'needs_info'
);

CREATE TYPE public.evidence_visibility AS ENUM (
  'public',
  'reviewers_only',
  'private'
);

CREATE TYPE public.evidence_relation AS ENUM (
  'supporting',
  'contradicting',
  'neutral'
);

CREATE TYPE public.media_publication_permission AS ENUM (
  'pending',
  'allowed',
  'denied',
  'takedown'
);

CREATE TYPE public.job_state AS ENUM (
  'pending',
  'leased',
  'completed',
  'failed',
  'dead'
);

CREATE TYPE public.outbox_state AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TYPE public.provider_reservation_state AS ENUM (
  'reserved',
  'settled',
  'expired',
  'cancelled'
);

CREATE TYPE public.abuse_flag_resolution AS ENUM (
  'pending',
  'dismissed',
  'actioned'
);

CREATE TYPE public.source_availability AS ENUM (
  'unknown',
  'available',
  'unavailable',
  'private',
  'deleted'
);
