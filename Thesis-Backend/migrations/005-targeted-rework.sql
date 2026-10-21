BEGIN;
ALTER TABLE public.project_phase_evidence DROP CONSTRAINT IF EXISTS project_phase_evidence_status_check;
ALTER TABLE public.project_phase_evidence ADD CONSTRAINT project_phase_evidence_status_check
  CHECK(status IN ('pending','approved','rejected','rework_required'));
ALTER TABLE public.project_phase_evidence ADD COLUMN IF NOT EXISTS rework_request_id uuid
  REFERENCES public.pending_rework_requests(id);
CREATE UNIQUE INDEX IF NOT EXISTS pending_rework_request_scope ON public.pending_rework_requests(id,project_id,project_stage_id);
CREATE TABLE IF NOT EXISTS public.project_rework_activities(
  request_id uuid NOT NULL,
  project_id uuid NOT NULL,
  project_stage_id smallint NOT NULL,
  checklist_item_id bigint NOT NULL,
  withdrawn_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  correction_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  PRIMARY KEY(request_id,checklist_item_id),
  FOREIGN KEY(request_id,project_id,project_stage_id) REFERENCES public.pending_rework_requests(id,project_id,project_stage_id),
  FOREIGN KEY(checklist_item_id,project_id,project_stage_id) REFERENCES public.project_phase_checklist_items(id,project_id,project_stage_id)
);
ALTER TABLE public.project_rework_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_rework_activities FROM public;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.project_rework_activities FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.project_rework_activities FROM authenticated; END IF;
END $$;
COMMIT;
