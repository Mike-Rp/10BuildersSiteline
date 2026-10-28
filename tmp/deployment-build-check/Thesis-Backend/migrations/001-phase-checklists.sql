BEGIN;

CREATE TABLE IF NOT EXISTS phase_checklist_templates (
  id BIGSERIAL PRIMARY KEY,
  project_stage_id SMALLINT NOT NULL REFERENCES project_stages(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL,
  UNIQUE (project_stage_id, code)
);

CREATE TABLE IF NOT EXISTS project_phase_checklists (
  project_id UUID NOT NULL REFERENCES projects(id),
  project_stage_id SMALLINT NOT NULL REFERENCES project_stages(id),
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, project_stage_id)
);

CREATE TABLE IF NOT EXISTS project_phase_checklist_items (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  project_stage_id SMALLINT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (project_id, project_stage_id)
    REFERENCES project_phase_checklists(project_id, project_stage_id),
  UNIQUE (project_id, project_stage_id, code),
  UNIQUE (id, project_id, project_stage_id)
);

-- Files are private: the API serves them after a project permission check.
CREATE TABLE IF NOT EXISTS project_phase_files (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  project_stage_id SMALLINT NOT NULL REFERENCES project_stages(id),
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  content BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, project_id, project_stage_id)
);

CREATE TABLE IF NOT EXISTS project_phase_evidence (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  project_stage_id SMALLINT NOT NULL,
  checklist_item_id BIGINT NOT NULL,
  file_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  FOREIGN KEY (checklist_item_id, project_id, project_stage_id)
    REFERENCES project_phase_checklist_items(id, project_id, project_stage_id),
  FOREIGN KEY (file_id, project_id, project_stage_id)
    REFERENCES project_phase_files(id, project_id, project_stage_id),
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS phase_evidence_latest
  ON project_phase_evidence(checklist_item_id, id DESC);
CREATE INDEX IF NOT EXISTS phase_files_project
  ON project_phase_files(project_id, project_stage_id);

INSERT INTO phase_checklist_templates (project_stage_id, code, title, required, sort_order)
SELECT s.id, t.code, t.title, true, t.sort_order
FROM project_stages s
CROSS JOIN (VALUES
  ('work_inspection', 'Activity/Work Inspection Checklist (rebar & formwork per level)', 1),
  ('inspection_testing', 'Inspection and Testing Records (concrete cylinder tests)', 2),
  ('method_statement', 'Method Statement (structural pour/lifting)', 3),
  ('quality_control', 'Quality Control/QA-QC Checklist', 4),
  ('previous_acceptance', 'Previous Activity Acceptance/Clearance (Foundation)', 5)
) AS t(code, title, sort_order)
WHERE lower(s.code) = 'structure'
  AND NOT EXISTS (SELECT 1 FROM phase_checklist_templates existing WHERE existing.project_stage_id = s.id)
ON CONFLICT (project_stage_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_phase_update_files (
  history_id BIGINT NOT NULL REFERENCES project_progress_history(id),
  file_id UUID NOT NULL REFERENCES project_phase_files(id),
  PRIMARY KEY (history_id, file_id)
);

-- Initialize existing active projects that never acquired a current phase.
UPDATE projects p
SET current_stage_id = (
  SELECT t.project_stage_id FROM project_phase_team t
  JOIN project_stages s ON s.id = t.project_stage_id
  WHERE t.project_id = p.id AND t.status = 'confirmed'
  ORDER BY s.sort_order LIMIT 1
), current_pct = 0
WHERE p.lifecycle_status = 'active' AND p.current_stage_id IS NULL
  AND COALESCE(p.is_deleted, false) = false;

-- Snapshot the seeded checklist for existing active phases.
WITH initialized AS (
  INSERT INTO project_phase_checklists (project_id, project_stage_id)
  SELECT p.id, p.current_stage_id FROM projects p
  WHERE p.lifecycle_status = 'active' AND COALESCE(p.is_deleted, false) = false
    AND EXISTS (SELECT 1 FROM phase_checklist_templates t WHERE t.project_stage_id = p.current_stage_id AND t.required)
  ON CONFLICT DO NOTHING RETURNING project_id, project_stage_id
)
INSERT INTO project_phase_checklist_items (project_id, project_stage_id, code, title, required, sort_order)
SELECT i.project_id, i.project_stage_id, t.code, t.title, t.required, t.sort_order
FROM initialized i JOIN phase_checklist_templates t ON t.project_stage_id = i.project_stage_id;

-- Existing manual percentages become checklist percentages; safe on reruns.
UPDATE projects p SET current_pct = COALESCE((
  SELECT round(100.0 * count(*) FILTER (WHERE e.status = 'approved') / NULLIF(count(*), 0))::smallint
  FROM project_phase_checklist_items i
  LEFT JOIN LATERAL (
    SELECT status FROM project_phase_evidence WHERE checklist_item_id = i.id ORDER BY id DESC LIMIT 1
  ) e ON true
  WHERE i.project_id = p.id AND i.project_stage_id = p.current_stage_id AND i.required
), 0)
WHERE EXISTS (
  SELECT 1 FROM project_phase_checklists c WHERE c.project_id = p.id AND c.project_stage_id = p.current_stage_id
);

COMMIT;