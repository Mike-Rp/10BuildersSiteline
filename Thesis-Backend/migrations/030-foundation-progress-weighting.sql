-- Foundation is worth 15 percentage points of overall verified progress on newly configured projects.
-- Every project that exists when this runs keeps its current calculation ('legacy'), so historical
-- percentages and monthly reports do not change. Re-weighting existing projects needs a separate,
-- approved migration.
BEGIN;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS progress_weighting text NOT NULL DEFAULT 'legacy';
-- Existing rows were filled with 'legacy' above; projects created from now on use the new rule.
ALTER TABLE public.projects ALTER COLUMN progress_weighting SET DEFAULT 'foundation_15';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_progress_weighting_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_progress_weighting_check CHECK (progress_weighting IN ('legacy','foundation_15'));
COMMIT;
