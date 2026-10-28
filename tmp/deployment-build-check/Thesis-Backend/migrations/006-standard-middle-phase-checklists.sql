-- Requires project-type workflows and activity weights. Apply explicitly after
-- the approved schema recovery/type rollout, not with the blanket legacy runner.
-- Defaults only: no project snapshots, evidence, approvals or history are changed.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('standard-middle-phase-checklists'));
CREATE TEMP TABLE standard_middle_phases ON COMMIT DROP AS
 WITH ordered AS (
  SELECT project_stage_id,sort_order,
   min(sort_order) OVER(PARTITION BY project_type_id) AS first_order,
   max(sort_order) OVER(PARTITION BY project_type_id) AS last_order
  FROM public.project_type_stages
 )
 SELECT project_stage_id FROM ordered GROUP BY project_stage_id
 HAVING bool_and(sort_order>first_order AND sort_order<last_order);
-- Shared stages that serve as an endpoint in any workflow are left unchanged.
DELETE FROM public.phase_checklist_templates t USING standard_middle_phases s
 WHERE t.project_stage_id=s.project_stage_id
 AND t.code NOT IN ('work_inspection','inspection_testing','method_statement');
INSERT INTO public.phase_checklist_templates(project_stage_id,code,title,required,sort_order,weight)
 SELECT s.project_stage_id,v.code,v.title,true,v.sort_order,10
 FROM standard_middle_phases s CROSS JOIN (VALUES
  ('work_inspection','Activity/Work Inspection Checklist',1),
  ('inspection_testing','Inspection and Testing Records',2),
  ('method_statement','Method Statement',3)
 ) v(code,title,sort_order)
 ON CONFLICT(project_stage_id,code) DO UPDATE SET
  title=EXCLUDED.title,required=true,sort_order=EXCLUDED.sort_order,weight=EXCLUDED.weight;
COMMIT;
