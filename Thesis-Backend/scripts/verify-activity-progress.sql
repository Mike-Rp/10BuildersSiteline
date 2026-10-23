-- Run after applying the recovery migration. All statements are read-only.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public' AND
 ((table_name IN ('phase_checklist_templates','project_phase_checklist_items') AND column_name='weight')
 OR (table_name='project_phase_evidence' AND column_name='rework_request_id'))
ORDER BY table_name,column_name;
SELECT c.relname,t.conname,pg_get_constraintdef(t.oid) AS definition
FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid
WHERE c.relnamespace='public'::regnamespace AND c.relname IN
 ('phase_checklist_templates','project_phase_checklist_items','project_phase_evidence','project_rework_activities','project_type_stages')
ORDER BY c.relname,t.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('project_rework_activities','pending_rework_requests','project_type_stages');
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('project_rework_activities','project_type_stages');
SELECT project_type_id,count(*) AS phases FROM public.project_type_stages GROUP BY project_type_id ORDER BY project_type_id;
SELECT count(*) AS invalid_activity_values FROM public.project_phase_checklist_items WHERE weight IS NULL OR weight<=0;
SELECT count(*) AS invalid_template_values FROM public.phase_checklist_templates WHERE weight IS NULL OR weight<=0;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.project_phase_evidence'::regclass AND tgname='siteline_normalize_rework_status';
SELECT to_regprocedure('public.siteline_normalize_rework_status()') AS compatibility_function;
