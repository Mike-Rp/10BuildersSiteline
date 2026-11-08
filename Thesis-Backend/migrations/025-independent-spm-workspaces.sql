-- Existing evidence ownership and assignment records remain authoritative.
-- No checklist definitions or historical approvals are rewritten.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.project_phase_responsibilities') IS NULL THEN
  RAISE EXCEPTION 'Apply migration 020 before migration 025.';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.project_phase_evidence_files (
  evidence_id bigint NOT NULL REFERENCES public.project_phase_evidence(id),
  file_id uuid NOT NULL REFERENCES public.project_phase_files(id),
  PRIMARY KEY(evidence_id,file_id)
);
INSERT INTO public.project_phase_evidence_files(evidence_id,file_id)
  SELECT id,file_id FROM public.project_phase_evidence WHERE file_id IS NOT NULL
  ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS evidence_owner_latest
  ON public.project_phase_evidence(checklist_item_id,submitted_by,id DESC);
DROP INDEX IF EXISTS public.one_pending_phase_update;
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_spm_phase_update
  ON public.project_phase_updates(project_id,selected_stage_id,submitted_by) WHERE status='pending';
ALTER TABLE public.project_notes ADD COLUMN IF NOT EXISTS project_stage_id smallint REFERENCES public.project_stages(id);
ALTER TABLE public.project_photos ADD COLUMN IF NOT EXISTS project_stage_id smallint REFERENCES public.project_stages(id);
-- Legacy records with unknown phase stay unmodified and remain visible in history.
ALTER TABLE public.project_phase_evidence_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_phase_evidence_files FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.project_phase_evidence_files FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.project_phase_evidence_files FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT ALL ON public.project_phase_evidence_files TO service_role;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='project_phase_evidence_files' AND policyname='service_evidence_files') THEN
   CREATE POLICY service_evidence_files ON public.project_phase_evidence_files FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
 END IF;
END $$;
COMMIT;
