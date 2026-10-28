-- Existing projects retain their original allocation. New intakes use verified multi-company coverage.
BEGIN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subcontractor_allocation_version smallint NOT NULL DEFAULT 0;
ALTER TABLE projects ALTER COLUMN subcontractor_allocation_version SET DEFAULT 1;
DROP INDEX IF EXISTS one_current_subcontractor_selection;
-- Accepted selections reserve capacity before activation; the application locks company rows
-- before checking capacity and recording acceptances. Phase scope is versioned in workspace metadata.
CREATE INDEX IF NOT EXISTS accepted_subcontractor_commitments
    ON project_subcontractor_selections(subcontractor_id, project_id) WHERE status = 'accepted';
COMMIT;
