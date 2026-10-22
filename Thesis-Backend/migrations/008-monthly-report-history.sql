-- Prospective reporting coverage only. Never backdate or infer old approvals.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siteline-monthly-report-history-v1'));
LOCK TABLE public.projects, public.project_type_stages, public.project_stages,
 public.project_phase_checklists, public.project_phase_checklist_items, public.project_phase_evidence,
 public.project_phase_updates, public.pending_rework_requests, public.project_progress_history, public.project_phase_team
 IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.monthly_report_baselines (
 project_id uuid PRIMARY KEY REFERENCES public.projects(id),
 covered_from timestamptz NOT NULL DEFAULT clock_timestamp(),
 data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.monthly_report_events (
 id bigserial PRIMARY KEY,
 project_id uuid REFERENCES public.projects(id),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 source_table text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 before_row jsonb,
 after_row jsonb
);
CREATE INDEX IF NOT EXISTS monthly_report_events_project_time ON public.monthly_report_events(project_id,occurred_at,id);

CREATE OR REPLACE FUNCTION public.siteline_report_baseline(project_uuid uuid) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE snapshot jsonb='{}'; table_name text; rows_json jsonb;
BEGIN
 FOR table_name IN SELECT unnest(ARRAY['projects','project_phase_checklists','project_phase_checklist_items',
  'project_phase_evidence','project_phase_updates','pending_rework_requests','project_progress_history','project_phase_team']) LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) FROM public.%I r WHERE %I=$1',
   table_name,CASE WHEN table_name='projects' THEN 'id' ELSE 'project_id' END) INTO rows_json USING project_uuid;
  snapshot=jsonb_set(snapshot,ARRAY[table_name],rows_json);
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) INTO rows_json FROM public.project_type_stages w
  JOIN public.projects p ON p.project_type_id=w.project_type_id WHERE p.id=project_uuid;
 snapshot=jsonb_set(snapshot,'{project_type_stages}',rows_json);
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO rows_json FROM public.project_stages s;
 snapshot=jsonb_set(snapshot,'{project_stages}',rows_json);
 INSERT INTO public.monthly_report_baselines(project_id,data) VALUES(project_uuid,snapshot) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.siteline_report_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior jsonb; next_row jsonb; record jsonb; project_uuid uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN prior=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN next_row=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND prior IS NOT DISTINCT FROM next_row THEN RETURN NEW; END IF;
 record=coalesce(next_row,prior);
 project_uuid=CASE WHEN TG_TABLE_NAME='projects' THEN (record->>'id')::uuid ELSE (record->>'project_id')::uuid END;
 IF TG_TABLE_NAME='projects' AND TG_OP='INSERT' THEN PERFORM public.siteline_report_baseline(project_uuid); END IF;
 INSERT INTO public.monthly_report_events(project_id,source_table,operation,before_row,after_row)
 VALUES(project_uuid,TG_TABLE_NAME,TG_OP,prior,next_row);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.siteline_report_immutable() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Monthly reporting history is immutable'; END $$;

DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['projects','project_type_stages','project_stages','project_phase_checklists',
  'project_phase_checklist_items','project_phase_evidence','project_phase_updates','pending_rework_requests','project_progress_history','project_phase_team'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='siteline_report_capture') THEN
   EXECUTE format('CREATE TRIGGER siteline_report_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.siteline_report_capture()',t);
  END IF;
 END LOOP;
 FOR p IN SELECT id FROM public.projects LOOP PERFORM public.siteline_report_baseline(p.id); END LOOP;
 FOREACH t IN ARRAY ARRAY['monthly_report_baselines','monthly_report_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='siteline_report_immutable') THEN
   EXECUTE format('CREATE TRIGGER siteline_report_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.siteline_report_immutable()',t);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
   IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='monthly_reports_service') THEN
    EXECUTE format('CREATE POLICY monthly_reports_service ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
   END IF;
   EXECUTE format('GRANT SELECT,INSERT ON public.%I TO service_role',t);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT USAGE,SELECT ON SEQUENCE public.monthly_report_events_id_seq TO service_role; END IF;
END $$;
REVOKE ALL ON FUNCTION public.siteline_report_baseline(uuid), public.siteline_report_capture(),public.siteline_report_immutable() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.siteline_report_baseline(uuid),public.siteline_report_capture(),public.siteline_report_immutable() TO service_role;
END IF; END $$;
COMMIT;
