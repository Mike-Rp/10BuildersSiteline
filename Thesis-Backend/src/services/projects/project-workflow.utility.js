// Read compatibility: to_jsonb permits legacy databases without phase_scope.
// Null scope preserves the existing type workflow. Scoped projects use their
// server-validated, ordered phase snapshot, never the submitted team as scope.
export const projectWorkflowSql = `
 SELECT p.id AS project_id,p.project_type_id,s.id AS project_stage_id,phase.position::int AS sort_order
 FROM projects p
 CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(to_jsonb(p)->'phase_scope'->'phases',
   (SELECT jsonb_agg(s.code ORDER BY w.sort_order) FROM project_type_stages w
    JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_type_id=p.project_type_id),'[]'::jsonb))
   WITH ORDINALITY phase(name,position)
 JOIN project_stages s ON s.code=phase.name`;
