BEGIN;

CREATE TABLE IF NOT EXISTS project_phase_updates (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  selected_stage_id SMALLINT NOT NULL REFERENCES project_stages(id),
  prior_stage_id SMALLINT REFERENCES project_stages(id),
  prior_pct SMALLINT,
  note TEXT,
  issue_categories TEXT[] NOT NULL DEFAULT '{}',
  issue_reason TEXT,
  submitted_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  history_id BIGINT REFERENCES project_progress_history(id),
  CHECK (issue_categories <@ ARRAY['failed_inspection','material_defect','rework_required','design_change',
    'weather_delay','manpower_shortage','safety_incident','other']::text[]),
  CHECK ((status = 'pending' AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status <> 'pending' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_phase_update
  ON project_phase_updates(project_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS project_phase_submission_files (
  update_id BIGINT NOT NULL REFERENCES project_phase_updates(id),
  file_id UUID NOT NULL REFERENCES project_phase_files(id),
  PRIMARY KEY (update_id, file_id)
);

ALTER TABLE project_phase_evidence ALTER COLUMN file_id DROP NOT NULL;
ALTER TABLE project_phase_evidence ADD COLUMN IF NOT EXISTS submission_note TEXT;
ALTER TABLE project_phase_evidence ADD COLUMN IF NOT EXISTS phase_update_id BIGINT REFERENCES project_phase_updates(id);

ALTER TABLE project_progress_history ADD COLUMN IF NOT EXISTS issue_categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE project_progress_history ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'update';
ALTER TABLE pending_rework_requests ADD COLUMN IF NOT EXISTS issue_categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE pending_rework_requests ADD COLUMN IF NOT EXISTS phase_update_id BIGINT REFERENCES project_phase_updates(id);
ALTER TABLE pending_rework_requests ADD COLUMN IF NOT EXISTS resulting_history_id BIGINT REFERENCES project_progress_history(id);

-- Add only missing lookup stages; never renumber existing IDs.
WITH wanted(code, ord) AS (VALUES
  ('Mobilization', 1), ('Design', 2), ('Foundation', 3), ('Structure', 4),
  ('MEP Rough-in', 5), ('Finishes', 6), ('Closeout', 7)
), missing AS (
  SELECT code, ord FROM wanted
  WHERE NOT EXISTS (SELECT 1 FROM project_stages s WHERE lower(s.code) = lower(wanted.code))
)
INSERT INTO project_stages(id, code, sort_order)
SELECT (SELECT COALESCE(max(id), 0) FROM project_stages) + row_number() OVER (ORDER BY ord), code, ord
FROM missing;

-- Preserve the distinction between older standalone issues and combined update history.
UPDATE project_progress_history h SET entry_type = 'issue'
WHERE h.is_issue = true AND h.entry_type = 'update'
  AND NOT EXISTS (SELECT 1 FROM project_phase_updates u WHERE u.history_id = h.id);

COMMIT;
