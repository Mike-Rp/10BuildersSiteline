-- Recovery migration: base schema + migrations 001–003 only.
-- Run this file explicitly; do not run the legacy all-migrations runner for recovery.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('verified-activity-progress-recovery'));
SELECT set_config('siteline.recovery_new_tables',COALESCE((
  SELECT string_agg(name,',') FROM (VALUES ('project_rework_activities'),('project_type_stages')) t(name)
  WHERE to_regclass('public.'||name) IS NULL),''),true);

-- Existing integer activity values are retained. Existing non-integer column
-- types require a separately reviewed conversion, never a silent truncation.
DO $$ DECLARE t text; existing_type text; nullable text; existing_default text; BEGIN
  FOREACH t IN ARRAY ARRAY['phase_checklist_templates','project_phase_checklist_items'] LOOP
    SELECT data_type,is_nullable,column_default INTO existing_type,nullable,existing_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='weight';
    IF existing_type IS NOT NULL AND existing_type <> 'integer' THEN
      RAISE EXCEPTION '% .weight has type %, expected integer; stop for a separately reviewed conversion',t,existing_type;
    END IF;
    IF existing_type IS NOT NULL AND (nullable <> 'NO' OR existing_default IS DISTINCT FROM '10') THEN
      RAISE EXCEPTION '%.weight must already be NOT NULL DEFAULT 10; stop for a separately reviewed repair',t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 10 CHECK (weight > 0)',t);
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('public.%I',t)::regclass AND conname='verified_activity_weight_positive') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT verified_activity_weight_positive CHECK(weight > 0)',t);
    END IF;
  END LOOP;
END $$;

-- Explicit rejection + a rework link represents a withdrawal without widening
-- or dropping the legacy pending/approved/rejected status CHECK. API projection
-- supplies the logical Rework required state. No existing evidence is rewritten.
ALTER TABLE public.project_phase_evidence
  ADD COLUMN IF NOT EXISTS rework_request_id uuid REFERENCES public.pending_rework_requests(id);
-- Compatibility for the already-deployed Parts 1–3 writer: accept its logical
-- rework_required input by normalizing NEW only, before the old CHECK runs.
-- No existing row, approval, evidence or constraint is changed.
DO $bridge$ BEGIN
  IF to_regprocedure('public.siteline_normalize_rework_status()') IS NULL THEN
    EXECUTE $create$CREATE FUNCTION public.siteline_normalize_rework_status() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
      BEGIN
        IF NEW.status='rework_required' AND NEW.rework_request_id IS NOT NULL THEN
          NEW.status := 'rejected';
        END IF;
        RETURN NEW;
      END $function$ $create$;
    REVOKE ALL ON FUNCTION public.siteline_normalize_rework_status() FROM PUBLIC;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.project_phase_evidence'::regclass
    AND tgname='siteline_normalize_rework_status') THEN
    CREATE TRIGGER siteline_normalize_rework_status BEFORE INSERT OR UPDATE OF status,rework_request_id
      ON public.project_phase_evidence FOR EACH ROW EXECUTE FUNCTION public.siteline_normalize_rework_status();
  END IF;
END $bridge$;
CREATE UNIQUE INDEX IF NOT EXISTS pending_rework_request_scope
  ON public.pending_rework_requests(id,project_id,project_stage_id);
CREATE TABLE IF NOT EXISTS public.project_rework_activities (
  request_id uuid NOT NULL,
  project_id uuid NOT NULL,
  project_stage_id smallint NOT NULL,
  checklist_item_id bigint NOT NULL,
  withdrawn_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  correction_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  PRIMARY KEY(request_id,checklist_item_id),
  FOREIGN KEY(request_id,project_id,project_stage_id)
    REFERENCES public.pending_rework_requests(id,project_id,project_stage_id),
  FOREIGN KEY(checklist_item_id,project_id,project_stage_id)
    REFERENCES public.project_phase_checklist_items(id,project_id,project_stage_id)
);
CREATE INDEX IF NOT EXISTS rework_activities_project_phase
  ON public.project_rework_activities(project_id,project_stage_id);

CREATE TABLE IF NOT EXISTS public.project_type_stages (
  project_type_id smallint NOT NULL REFERENCES public.project_types(id),
  project_stage_id smallint NOT NULL REFERENCES public.project_stages(id),
  sort_order smallint NOT NULL CHECK(sort_order>0),
  PRIMARY KEY(project_type_id,project_stage_id),
  UNIQUE(project_type_id,sort_order)
);
-- Recover the original seven-stage workflow only for types with NO stored
-- workflow. Existing 9/9/12 or custom workflow rows remain entirely untouched.
-- This adds lookup defaults, not project checklist snapshots or approvals.
INSERT INTO public.project_type_stages(project_type_id,project_stage_id,sort_order)
SELECT t.id,s.id,v.position FROM public.project_types t
CROSS JOIN (VALUES ('mobilization',1),('design',2),('foundation',3),
  ('structure',4),('mep rough-in',5),('finishes',6),('closeout',7)) v(code,position)
JOIN public.project_stages s ON lower(s.code)=v.code
WHERE NOT EXISTS(SELECT 1 FROM public.project_type_stages existing WHERE existing.project_type_id=t.id)
ON CONFLICT DO NOTHING;

-- Same server-only boundary as migration 003: browser roles have no table ACL.
-- Explicit false policies document that boundary; the trusted service role has
-- its own allow policy. Existing table policies and grants are never changed.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['project_rework_activities','project_type_stages'] LOOP
    IF NOT (t=ANY(string_to_array(current_setting('siteline.recovery_new_tables'),','))) THEN
      CONTINUE; -- Preserve policies and ACLs of tables that already existed.
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='verified_server_only') THEN
      EXECUTE format('CREATE POLICY verified_server_only ON public.%I FOR ALL TO PUBLIC USING(false) WITH CHECK(false)',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='verified_service_access') THEN
        EXECUTE format('CREATE POLICY verified_service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
      END IF;
      EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',t);
    END IF;
  END LOOP;
END $$;
COMMIT;
