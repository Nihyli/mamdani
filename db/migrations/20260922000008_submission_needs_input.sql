-- Moderator "needs more info" note. Not a public column.

ALTER TABLE public.submissions
  ADD COLUMN needs_input_message TEXT;

COMMENT ON COLUMN public.submissions.needs_input_message IS
  'Set when a moderator moves the submission to needs_input. Owner-visible only.';
