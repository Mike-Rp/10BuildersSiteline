-- Opt-in contract v1. Existing projects retain their current allocation and handoff behavior.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siteline-intake-monitoring-v1'));
DO $$ BEGIN
 IF to_regclass('public.inquiry_engineer_specialties') IS NULL OR
    to_regclass('public.project_request_receipts') IS NULL THEN
  RAISE EXCEPTION 'Apply migrations 027, 031 and 032 before migration 033.';
 END IF;
END $$;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS intake_monitoring_version smallint CHECK (intake_monitoring_version=1);
CREATE TABLE IF NOT EXISTS public.project_company_allocations (
 project_id uuid PRIMARY KEY REFERENCES public.projects(id),
 revision integer NOT NULL CHECK(revision>0),
 status text NOT NULL CHECK(status IN ('awaiting_decision','accepted','declined','no_eligible_company')),
 company_id uuid REFERENCES public.subcontractors(id),
 agreement_file_id uuid REFERENCES public.stored_files(id),
 agreement_company_id uuid REFERENCES public.subcontractors(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='no_eligible_company')=(company_id IS NULL)),
 CHECK(agreement_file_id IS NULL OR (status='accepted' AND agreement_company_id=company_id))
);
CREATE TABLE IF NOT EXISTS public.project_company_decisions (
 id bigserial PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects(id),
 revision integer NOT NULL, company_id uuid NOT NULL REFERENCES public.subcontractors(id),
 company_name text NOT NULL, decision text NOT NULL CHECK(decision IN ('accepted','declined')),
 decided_by uuid NOT NULL REFERENCES public.users(id), decided_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,revision)
);
CREATE OR REPLACE FUNCTION public.validate_company_allocation_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='accepted' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
  RAISE EXCEPTION 'An accepted project company is locked' USING ERRCODE='23514';
 END IF;
 IF NEW.revision<OLD.revision OR ((NEW.status IS DISTINCT FROM OLD.status OR NEW.company_id IS DISTINCT FROM OLD.company_id) AND NEW.revision<>OLD.revision+1) THEN
  RAISE EXCEPTION 'Company allocation revisions must increase with each decision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_allocation_revision ON public.project_company_allocations;
CREATE TRIGGER company_allocation_revision BEFORE UPDATE ON public.project_company_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_company_allocation_revision();
CREATE OR REPLACE FUNCTION public.immutable_company_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Company decision history is append-only' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS company_decision_history_immutable ON public.project_company_decisions;
CREATE TRIGGER company_decision_history_immutable BEFORE UPDATE OR DELETE ON public.project_company_decisions FOR EACH ROW EXECUTE FUNCTION public.immutable_company_decision();

CREATE TABLE IF NOT EXISTS public.project_parallel_upload_approvals (
 responsibility_id bigint NOT NULL REFERENCES public.project_phase_responsibilities(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),
 active_stage_id smallint NOT NULL REFERENCES public.project_stages(id),
 approved_by uuid NOT NULL REFERENCES public.users(id), approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(responsibility_id,active_stage_id)
);
CREATE TABLE IF NOT EXISTS public.project_checklist_responsibilities (
 checklist_item_id bigint NOT NULL REFERENCES public.project_phase_checklist_items(id),
 responsibility_id bigint NOT NULL REFERENCES public.project_phase_responsibilities(id),
 PRIMARY KEY(checklist_item_id,responsibility_id)
);
CREATE TABLE IF NOT EXISTS public.project_checklist_dependencies (
 checklist_item_id bigint NOT NULL REFERENCES public.project_phase_checklist_items(id),
 required_stage_id smallint NOT NULL REFERENCES public.project_stages(id),
 PRIMARY KEY(checklist_item_id,required_stage_id)
);
ALTER TABLE public.project_phase_files ADD COLUMN IF NOT EXISTS responsibility_id bigint REFERENCES public.project_phase_responsibilities(id);
ALTER TABLE public.project_phase_files ADD COLUMN IF NOT EXISTS checklist_item_id bigint REFERENCES public.project_phase_checklist_items(id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='monitoring_file_identity_pair') THEN
  ALTER TABLE public.project_phase_files ADD CONSTRAINT monitoring_file_identity_pair CHECK((responsibility_id IS NULL)=(checklist_item_id IS NULL));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS monitoring_latest_evidence ON public.project_phase_evidence(checklist_item_id,responsibility_id,id DESC);
ALTER TABLE public.project_phase_evidence ADD COLUMN IF NOT EXISTS monitoring_version smallint CHECK(monitoring_version=1);
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_pending_evidence ON public.project_phase_evidence(checklist_item_id,responsibility_id) WHERE status='pending' AND responsibility_id IS NOT NULL AND monitoring_version=1;
CREATE OR REPLACE FUNCTION public.validate_monitoring_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.project_phase_responsibilities; i public.project_phase_checklist_items;
BEGIN
 SELECT * INTO r FROM public.project_phase_responsibilities WHERE id=NEW.responsibility_id;
 IF TG_TABLE_NAME='project_parallel_upload_approvals' THEN
  IF r.project_id IS DISTINCT FROM NEW.project_id OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=NEW.project_id AND p.suggested_opm_id=NEW.approved_by) THEN
   RAISE EXCEPTION 'Parallel approval requires this project responsibility and Office PM' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.responsibility_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM public.project_phase_checklist_items WHERE id=NEW.checklist_item_id;
  IF r.project_id IS DISTINCT FROM i.project_id OR r.project_stage_id IS DISTINCT FROM i.project_stage_id THEN
   RAISE EXCEPTION 'Checklist responsibility belongs to another project or phase' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='project_phase_files' THEN
   IF NEW.project_id IS DISTINCT FROM r.project_id OR NEW.project_stage_id IS DISTINCT FROM r.project_stage_id OR NEW.uploaded_by IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'File must belong to its responsibility owner, project and phase' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS monitoring_approval_scope ON public.project_parallel_upload_approvals;
CREATE TRIGGER monitoring_approval_scope BEFORE INSERT OR UPDATE ON public.project_parallel_upload_approvals FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_scope();
DROP TRIGGER IF EXISTS monitoring_applicability_scope ON public.project_checklist_responsibilities;
CREATE TRIGGER monitoring_applicability_scope BEFORE INSERT OR UPDATE ON public.project_checklist_responsibilities FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_scope();
DROP TRIGGER IF EXISTS monitoring_file_scope ON public.project_phase_files;
CREATE TRIGGER monitoring_file_scope BEFORE INSERT OR UPDATE ON public.project_phase_files FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_scope();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['project_company_allocations','project_company_decisions','project_parallel_upload_approvals','project_checklist_responsibilities','project_checklist_dependencies'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
   EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
   IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='service_intake_monitoring') THEN
    EXECUTE format('CREATE POLICY service_intake_monitoring ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
   END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT USAGE,SELECT ON SEQUENCE public.project_company_decisions_id_seq TO service_role; END IF;
END $$;
COMMIT;
