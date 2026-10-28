import { STANDARD_PHASE_ACTIVITIES, MOBILIZATION_ACTIVITIES, CLOSEOUT_ACTIVITIES } from "../../domain/standard-phase-checklist.js";
import { projectWorkflowSql } from "../projects/project-workflow.utility.js";

// Fixed 4-3-4 policy by workflow position.
// Also used to append missing standard identities to an active legacy snapshot.
// Existing names, weights, evidence and additional mandatory documents survive.
const values = [["first",MOBILIZATION_ACTIVITIES],["middle",STANDARD_PHASE_ACTIVITIES],["last",CLOSEOUT_ACTIVITIES]]
  .flatMap(([kind,items])=>items.map((item,index)=>`('${kind}','${item.code}','${item.title}',${index+1},${item.weight})`)).join(",");
export const projectChecklistTemplateSql = `
 WITH phase_scope AS (
  SELECT w.project_stage_id,w.sort_order,
    min(w.sort_order) OVER() AS first_order,max(w.sort_order) OVER() AS last_order
  FROM (${projectWorkflowSql}) w WHERE w.project_id=$1
 ), selected_phase AS (
  SELECT *,CASE WHEN sort_order=first_order THEN 'first' WHEN sort_order=last_order THEN 'last' ELSE 'middle' END AS kind
  FROM phase_scope WHERE project_stage_id=$2
 )
 SELECT s.project_stage_id,v.code,v.title,true AS required,v.sort_order,v.weight
 FROM selected_phase s JOIN (VALUES ${values}) v(kind,code,title,sort_order,weight) ON v.kind=s.kind
 UNION ALL
 SELECT t.project_stage_id,t.code,t.title,t.required,t.sort_order,t.weight
 FROM phase_checklist_templates t WHERE t.project_stage_id=$2
 AND NOT EXISTS(SELECT 1 FROM selected_phase)
 AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=$1 AND NULLIF(to_jsonb(p)->'phase_scope','null'::jsonb) IS NOT NULL)`;
