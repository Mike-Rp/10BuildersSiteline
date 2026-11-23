-- Restore a missing registered slot only from the converted inquiry's confirmed
-- upload, already owned by this project and uploaded by its assigned Office PM.
BEGIN;
WITH confirmed AS (
  SELECT i.project_id, i.opm_id,
         i.details #>> '{opm_workflow,signed_contract,id}' AS signed_id,
         i.details #>> '{opm_workflow,staffing,contract_file_id}' AS staffing_id
  FROM project_inquiries i
  WHERE i.status='converted' AND i.project_id IS NOT NULL
), candidates AS (
  SELECT c.project_id, f.id, f.uploaded_by, f.created_at,
         count(*) OVER (PARTITION BY c.project_id) AS matches
  FROM confirmed c
  JOIN stored_files f ON f.id::text=coalesce(c.signed_id,c.staffing_id)
    AND f.project_id=c.project_id AND f.uploaded_by=c.opm_id
  WHERE (c.signed_id IS NULL OR c.staffing_id IS NULL OR c.signed_id=c.staffing_id)
    AND f.content_type IN ('application/pdf','image/jpeg','image/png')
)
INSERT INTO project_documents(project_id,document_type_id,status,file_ref,uploaded_by,uploaded_at)
SELECT c.project_id,t.id,'uploaded','db://'||c.id,c.uploaded_by,c.created_at
FROM candidates c JOIN document_types t ON t.code='owner_contract'
WHERE c.matches=1
ON CONFLICT(project_id,document_type_id) DO UPDATE
SET status=excluded.status,file_ref=excluded.file_ref,uploaded_by=excluded.uploaded_by,uploaded_at=excluded.uploaded_at
WHERE project_documents.status <> 'uploaded' AND project_documents.file_ref IS NULL;
COMMIT;
