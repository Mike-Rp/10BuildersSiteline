-- Additive follow-up. 025/026 are intentionally unchanged.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.project_phase_evidence_files') IS NULL OR NOT EXISTS
 (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_licenses' AND column_name='specializations') THEN
  RAISE EXCEPTION 'Apply migrations 025 and 026 before migration 027.';
 END IF;
END $$;
ALTER TABLE project_phase_evidence ADD COLUMN IF NOT EXISTS responsibility_id bigint REFERENCES project_phase_responsibilities(id);
-- Only unambiguous provenance is backfilled, including recorded replacements.
WITH candidates AS (
 SELECT e.id,min(r.id) AS responsibility_id FROM project_phase_evidence e
 JOIN project_phase_responsibilities r ON r.project_id=e.project_id AND r.project_stage_id=e.project_stage_id
 WHERE e.responsibility_id IS NULL AND (r.user_id=e.submitted_by OR EXISTS (
  SELECT 1 FROM audit_log a WHERE a.table_name='project_phase_responsibilities' AND a.record_id=r.id::text
  AND a.new_values->>'_archive_event'='replace' AND a.new_values->'previous'->>'user_id'=e.submitted_by::text))
 GROUP BY e.id HAVING count(*)=1
) UPDATE project_phase_evidence e SET responsibility_id=c.responsibility_id FROM candidates c WHERE e.id=c.id;
CREATE INDEX IF NOT EXISTS evidence_responsibility_latest ON project_phase_evidence(checklist_item_id,responsibility_id,id DESC);
CREATE INDEX IF NOT EXISTS evidence_pending_review ON project_phase_evidence(project_id,project_stage_id,id) WHERE status='pending';
CREATE OR REPLACE FUNCTION validate_evidence_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.responsibility_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM project_phase_responsibilities r WHERE r.id=NEW.responsibility_id
  AND r.project_id=NEW.project_id AND r.project_stage_id=NEW.project_stage_id) THEN
  RAISE EXCEPTION 'Evidence responsibility belongs to another project or phase' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.project_id,NEW.project_stage_id,NEW.checklist_item_id,NEW.submitted_by,NEW.submitted_at,NEW.file_id)
  IS DISTINCT FROM ROW(OLD.project_id,OLD.project_stage_id,OLD.checklist_item_id,OLD.submitted_by,OLD.submitted_at,OLD.file_id)
  OR (OLD.responsibility_id IS NOT NULL AND NEW.responsibility_id IS DISTINCT FROM OLD.responsibility_id)) THEN
  RAISE EXCEPTION 'Original evidence ownership and file references are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS evidence_provenance ON project_phase_evidence;
CREATE TRIGGER evidence_provenance BEFORE INSERT OR UPDATE ON project_phase_evidence FOR EACH ROW EXECUTE FUNCTION validate_evidence_provenance();
CREATE OR REPLACE FUNCTION validate_evidence_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM project_phase_evidence e JOIN project_phase_files f
  ON f.project_id=e.project_id AND f.project_stage_id=e.project_stage_id AND f.uploaded_by=e.submitted_by
  WHERE e.id=NEW.evidence_id AND f.id=NEW.file_id) THEN
  RAISE EXCEPTION 'Attachment must belong to the original submitter, project and phase' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS evidence_attachment_scope ON project_phase_evidence_files;
CREATE TRIGGER evidence_attachment_scope BEFORE INSERT OR UPDATE ON project_phase_evidence_files FOR EACH ROW EXECUTE FUNCTION validate_evidence_attachment();

-- A persistent response receipt makes retries safe even after review. APIs lock
-- the project first; a receipt and its writes commit or roll back together.
CREATE TABLE IF NOT EXISTS project_request_receipts (
 project_id uuid NOT NULL REFERENCES projects(id), user_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, operation text NOT NULL, fingerprint text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,user_id,request_id)
);
ALTER TABLE project_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_request_receipts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON project_request_receipts FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON project_request_receipts FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT ALL ON project_request_receipts TO service_role;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='project_request_receipts' AND policyname='service_request_receipts') THEN
   CREATE POLICY service_request_receipts ON project_request_receipts FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
 END IF;
END $$;

ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id);
ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS revocation_note text;
-- Derived, so flagging historical values does not fire updated_at/audit triggers.
-- No license number, original timestamp, verification or reviewer is rewritten.
ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS correction_required boolean
 GENERATED ALWAYS AS (license_number IS NULL OR license_number !~ '^[0-9]{7}$' OR verification_status<>'verified') STORED;
CREATE OR REPLACE FUNCTION invalidate_changed_credential() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.license_number,NEW.profession,NEW.upload_file_ref,NEW.license_expiry,NEW.user_id)
  IS DISTINCT FROM ROW(OLD.license_number,OLD.profession,OLD.upload_file_ref,OLD.license_expiry,OLD.user_id) THEN
  -- The existing audit trigger records the old verification and full before/after.
  NEW.verification_status := 'needs_review';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS credential_reverification ON user_licenses;
CREATE TRIGGER credential_reverification BEFORE UPDATE ON user_licenses FOR EACH ROW EXECUTE FUNCTION invalidate_changed_credential();

CREATE OR REPLACE VIEW engineer_qualified_scopes AS
SELECT DISTINCT l.user_id,d.id AS discipline_id
FROM user_licenses l
JOIN (VALUES ('Civil','Civil','Civil Engineer'),('Structural','Structural','Civil Engineer'),('Geotechnical','Geotechnical','Civil Engineer'),('Mechanical','Mechanical','Mechanical Engineer'),('Electrical','Electrical','Electrical Engineer'),('Plumbing','Sanitary','Sanitary Engineer'),('Interior/Finishes','Civil','Civil Engineer'),('Landscape','Civil','Civil Engineer')) AS mapping(requirement,specialization,profession)
 ON mapping.profession=l.profession
JOIN disciplines d ON d.code=mapping.requirement
WHERE l.superseded_at IS NULL AND l.verification_status='verified' AND l.verified_by IS NOT NULL AND l.verified_at IS NOT NULL
 AND l.revoked_at IS NULL AND NOT l.correction_required
 AND l.upload_status='uploaded' AND l.upload_file_ref IS NOT NULL
 AND l.license_number ~ '^[0-9]{7}$'
 AND l.license_expiry > (current_timestamp AT TIME ZONE 'Asia/Manila')::date + 30
 AND (mapping.specialization=ANY(l.specializations) OR (l.specializations IS NULL AND EXISTS(
  SELECT 1 FROM engineer_specializations e WHERE e.user_id=l.user_id AND e.specialization=mapping.specialization)));
REVOKE ALL ON engineer_qualified_scopes FROM PUBLIC;
COMMIT;
