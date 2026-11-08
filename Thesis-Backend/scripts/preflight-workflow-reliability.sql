-- Prepared for operator review. Not executed against any hosted database by Codex.
-- Read-only; requires the existing 001/002/009/015 schemas.
BEGIN TRANSACTION READ ONLY;
SELECT to_regclass('public.phase_schema_migrations') AS migration_ledger,
       to_regclass('public.project_phase_responsibilities') AS prerequisite_020,
       to_regclass('public.project_phase_evidence_files') AS migration_025,
       to_regclass('public.project_request_receipts') AS migration_027;
SELECT table_name,column_name,data_type,is_generated FROM information_schema.columns
 WHERE table_schema='public' AND (table_name,column_name) IN
 (('user_licenses','specializations'),('license_renewal_requests','specializations'),
  ('user_licenses','correction_required'),('user_licenses','revoked_at'),('project_phase_evidence','responsibility_id'))
 ORDER BY table_name,column_name;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND tablename IN ('project_phase_updates','project_phase_evidence','project_phase_evidence_files','project_request_receipts');

-- Must be empty before 025. Do not delete reports to clear this result.
SELECT project_id,selected_stage_id,submitted_by,count(*),array_agg(id ORDER BY id) AS report_ids
 FROM project_phase_updates WHERE status='pending'
 GROUP BY project_id,selected_stage_id,submitted_by HAVING count(*)>1;
-- Original values are retained. Resolve through a pending correction + explicit Admin review.
SELECT id,user_id,profession,license_number,verification_status,superseded_at
 FROM user_licenses WHERE license_number IS NULL OR license_number !~ '^[0-9]{7}$'
 ORDER BY user_id,id;
-- Historic mismatches require investigation; the new trigger protects new links.
SELECT e.id AS evidence_id,e.project_id,e.project_stage_id,e.submitted_by,e.file_id,
 f.project_id AS file_project_id,f.project_stage_id AS file_stage_id,f.uploaded_by
 FROM project_phase_evidence e JOIN project_phase_files f ON f.id=e.file_id
 WHERE f.project_id<>e.project_id OR f.project_stage_id<>e.project_stage_id OR f.uploaded_by<>e.submitted_by;
-- Also valid before 027: to_jsonb safely reports an absent provenance column.
SELECT e.id,e.project_id,e.project_stage_id,e.checklist_item_id,e.submitted_by,e.status
 FROM project_phase_evidence e WHERE to_jsonb(e)->>'responsibility_id' IS NULL
 ORDER BY e.project_id,e.project_stage_id,e.id;
SELECT tablename,policyname,roles,cmd FROM pg_policies
 WHERE tablename IN ('project_phase_evidence_files','project_request_receipts');
SELECT 'projects' AS table_name,count(*) FROM projects
 UNION ALL SELECT 'project_phase_team',count(*) FROM project_phase_team
 UNION ALL SELECT 'project_phase_evidence',count(*) FROM project_phase_evidence
 UNION ALL SELECT 'project_phase_files',count(*) FROM project_phase_files
 UNION ALL SELECT 'project_phase_updates',count(*) FROM project_phase_updates
 UNION ALL SELECT 'user_licenses',count(*) FROM user_licenses
 UNION ALL SELECT 'license_renewal_requests',count(*) FROM license_renewal_requests
 UNION ALL SELECT 'project_progress_history',count(*) FROM project_progress_history;
ROLLBACK;
