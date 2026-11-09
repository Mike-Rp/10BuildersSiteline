-- Metadata only. Backup bytes, file names, keys and download paths never enter these tables.
BEGIN;
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('requested','running','success','failed')),
  requested_by uuid REFERENCES public.users(id),
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  database_bytes bigint CHECK (database_bytes >= 0),
  files_changed integer CHECK (files_changed >= 0),
  failure_reason text CHECK (length(failure_reason) <= 300),
  summary jsonb,
  CHECK (status NOT IN ('success','failed') OR finished_at IS NOT NULL),
  CHECK (status <> 'running' OR started_at IS NOT NULL)
);
-- Enforce across tabs, accounts and simultaneous nightly/manual requests.
CREATE UNIQUE INDEX IF NOT EXISTS backup_one_open_run ON public.backup_runs ((true))
  WHERE status IN ('requested','running');
CREATE INDEX IF NOT EXISTS backup_runs_newest ON public.backup_runs(requested_at DESC);
CREATE TABLE IF NOT EXISTS public.backup_restore_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tested_at timestamptz NOT NULL DEFAULT now(),
  passed boolean NOT NULL
);
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_runs, public.backup_restore_tests FROM PUBLIC;
COMMIT;
