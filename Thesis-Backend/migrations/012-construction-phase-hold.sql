-- Additive; no evidence, scope, approval or history is rewritten.
BEGIN;
ALTER TABLE public.project_phase_checklists ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false;
COMMIT;
