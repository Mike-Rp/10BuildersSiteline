BEGIN;

-- Each existing activity retains its identity, evidence, and required flag.
-- No missing phase scope or historical approvals are inferred by this migration.
ALTER TABLE public.phase_checklist_templates
  ADD COLUMN IF NOT EXISTS weight double precision NOT NULL DEFAULT 10
    CHECK (weight > 0 AND weight < 'Infinity'::double precision);
ALTER TABLE public.project_phase_checklist_items
  ADD COLUMN IF NOT EXISTS weight double precision NOT NULL DEFAULT 10
    CHECK (weight > 0 AND weight < 'Infinity'::double precision);

COMMIT;
