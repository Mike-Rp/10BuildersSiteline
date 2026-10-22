-- Explicit 4-3-4 scope revision. Requires verified weights and type workflows.
-- Preview on a disposable/local copy first. No evidence or review is fabricated.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siteline-standard-phase-scope-v1'));
CREATE TEMP TABLE phase_policy ON COMMIT DROP AS
 WITH ordered AS (
  SELECT *,min(sort_order) OVER(PARTITION BY project_type_id) first_order,
   max(sort_order) OVER(PARTITION BY project_type_id) last_order
  FROM public.project_type_stages
 )
 SELECT project_type_id,project_stage_id,sort_order,
 CASE WHEN sort_order=first_order THEN 'first' WHEN sort_order=last_order THEN 'last' ELSE 'middle' END AS kind FROM ordered;
CREATE TEMP TABLE standard_activities(kind text,code text,title text,position integer) ON COMMIT DROP;
INSERT INTO standard_activities VALUES
 ('first','site_possession','Site Possession and Existing Conditions Verification',1),
 ('first','site_logistics','Temporary Facilities and Site Logistics Readiness',2),
 ('first','safety_readiness','Safety and Emergency Readiness',3),
 ('first','kickoff_deployment','Project Kickoff and Initial Deployment Confirmation',4),
 ('middle','work_inspection','Activity/Work Inspection Checklist',1),
 ('middle','inspection_testing','Inspection and Testing Records',2),
 ('middle','method_statement','Method Statement',3),
 ('last','punch_list_closure','Final Inspection and Punch-List Closure',1),
 ('last','commissioning_acceptance','Final Testing and Commissioning Acceptance',2),
 ('last','handover_training','Handover Information and Owner Training Completion',3),
 ('last','final_turnover','Site Restoration and Final Turnover Acceptance',4);
DELETE FROM public.phase_checklist_templates t WHERE EXISTS(SELECT 1 FROM phase_policy p WHERE p.project_stage_id=t.project_stage_id)
 AND NOT EXISTS(SELECT 1 FROM phase_policy p JOIN standard_activities a ON a.kind=p.kind
  WHERE p.project_stage_id=t.project_stage_id AND a.code=t.code);
INSERT INTO public.phase_checklist_templates(project_stage_id,code,title,required,sort_order,weight)
 SELECT DISTINCT p.project_stage_id,a.code,a.title,true,a.position,10
 FROM phase_policy p JOIN standard_activities a ON a.kind=p.kind
 ON CONFLICT(project_stage_id,code) DO UPDATE SET title=EXCLUDED.title,required=true,sort_order=EXCLUDED.sort_order,weight=10;

DO $revise$ DECLARE p record; phase record; prior jsonb; revised jsonb; phase_pct integer; BEGIN
 FOR p IN SELECT * FROM public.projects WHERE lifecycle_status='active' AND NOT coalesce(is_deleted,false)
  AND current_stage_id IS NOT NULL ORDER BY id FOR UPDATE LOOP
  FOR phase IN SELECT policy.* FROM phase_policy policy WHERE policy.project_type_id=p.project_type_id
   AND policy.sort_order >= (SELECT sort_order FROM phase_policy WHERE project_type_id=p.project_type_id AND project_stage_id=p.current_stage_id)
   ORDER BY policy.sort_order LOOP
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'title',title,'required',required,'weight',weight,'sort_order',sort_order) ORDER BY id),'[]'::jsonb)
    INTO prior FROM public.project_phase_checklist_items WHERE project_id=p.id AND project_stage_id=phase.project_stage_id;
   INSERT INTO public.project_phase_checklists(project_id,project_stage_id) VALUES(p.id,phase.project_stage_id) ON CONFLICT DO NOTHING;
   -- Extra requirements remain addressable by their original IDs and evidence references.
   UPDATE public.project_phase_checklist_items i SET required=false WHERE project_id=p.id AND project_stage_id=phase.project_stage_id
    AND NOT EXISTS(SELECT 1 FROM standard_activities a WHERE a.kind=phase.kind AND a.code=i.code);
   INSERT INTO public.project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order,weight)
    SELECT p.id,phase.project_stage_id,a.code,a.title,true,a.position,10 FROM standard_activities a WHERE a.kind=phase.kind
    ON CONFLICT(project_id,project_stage_id,code) DO UPDATE SET title=EXCLUDED.title,required=true,sort_order=EXCLUDED.sort_order,weight=10;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'title',title,'required',required,'weight',weight,'sort_order',sort_order) ORDER BY id),'[]'::jsonb)
    INTO revised FROM public.project_phase_checklist_items WHERE project_id=p.id AND project_stage_id=phase.project_stage_id;
   IF prior IS DISTINCT FROM revised THEN
    INSERT INTO public.audit_log(table_name,record_id,operation,changed_by,new_values)
     VALUES('project_phase_checklists',p.id::text||':'||phase.project_stage_id::text,'UPDATE',NULL,
      jsonb_build_object('_checklist_scope_revision','standard-4-3-4-v1','project_id',p.id,'project_stage_id',phase.project_stage_id,
       'before',prior,'after',revised,'reason','Explicit standard checklist revision; previous evidence and reviews retained.'));
   END IF;
  END LOOP;
  SELECT round(100.0*count(*) FILTER(WHERE e.status='approved' AND e.reviewed_by IS NOT NULL AND e.reviewed_at IS NOT NULL)/nullif(count(*),0))::integer
   INTO phase_pct FROM public.project_phase_checklist_items i
   LEFT JOIN LATERAL(SELECT status,reviewed_by,reviewed_at FROM public.project_phase_evidence WHERE checklist_item_id=i.id ORDER BY id DESC LIMIT 1)e ON true
   WHERE i.project_id=p.id AND i.project_stage_id=p.current_stage_id AND i.required;
  IF phase_pct IS NOT NULL THEN
   UPDATE public.projects SET current_pct=phase_pct,updated_at=now() WHERE id=p.id AND current_pct IS DISTINCT FROM phase_pct;
  END IF;
 END LOOP;
END $revise$;
COMMIT;
