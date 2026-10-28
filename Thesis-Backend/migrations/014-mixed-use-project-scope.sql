-- Additive project-specific workflow; legacy projects retain their existing type workflow.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siteline-mixed-use-scope-v1'));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS phase_scope jsonb;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_phase_scope_object;
ALTER TABLE public.projects ADD CONSTRAINT projects_phase_scope_object CHECK (
 phase_scope IS NULL OR (jsonb_typeof(phase_scope)='object' AND jsonb_typeof(phase_scope->'phases')='array'));
INSERT INTO public.project_stages(id,code,sort_order)
 SELECT (base.last_id+row_number() OVER(ORDER BY names.code))::smallint,names.code,110
 FROM (VALUES ('Office Fit-Out'),('Hotel Fit-Out'),('Site Works')) names(code)
 CROSS JOIN (SELECT coalesce(max(id),0) last_id FROM public.project_stages) base
 WHERE NOT EXISTS(SELECT 1 FROM public.project_stages s WHERE s.code=names.code);
-- These stages already exist for other project types; do not rewrite their IDs.
INSERT INTO public.project_stage_discipline_links(project_type_id,project_stage_id,discipline_id)
 SELECT t.id,s.id,d.id FROM public.project_types t
 CROSS JOIN (VALUES
 ('Structure','Structural'),('Structure','Civil'),('Envelope','Structural'),('Envelope','Civil'),
 ('Office Fit-Out','Interior/Finishes'),('Office Fit-Out','Acoustic'),('Office Fit-Out','Electrical'),
 ('Hotel Fit-Out','Interior/Finishes'),('Hotel Fit-Out','Plumbing'),('Hotel Fit-Out','Electrical'),('Hotel Fit-Out','Fire Protection'),
 ('Site Works','Civil')) required(stage,discipline)
 JOIN public.project_stages s ON s.code=required.stage
 JOIN public.disciplines d ON d.code=required.discipline WHERE t.code='Mixed-Use'
 ON CONFLICT DO NOTHING;
COMMIT;
