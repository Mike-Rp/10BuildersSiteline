BEGIN;
CREATE TABLE IF NOT EXISTS project_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  details jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','offered','returned','consulting','approved','withdrawn','dropped','converted')),
  admin_id uuid NOT NULL REFERENCES users(id),
  opm_id uuid REFERENCES users(id),
  project_id uuid UNIQUE REFERENCES projects(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_inquiries FROM PUBLIC;
CREATE INDEX IF NOT EXISTS project_inquiries_opm_idx ON project_inquiries(opm_id, updated_at);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS inquiry_intake jsonb;

COMMIT;
