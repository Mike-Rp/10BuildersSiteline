import { HttpError, isUuid, isBigintId, isSmallintId } from "../../common/utilities/access.utility.js";
import { projectWorkflowSql } from "../projects/project-workflow.utility.js";

// Legacy public export retained for older consumers; selection and ordering use project_type_stages.
export const STAGES = ["Mobilization", "Design", "Foundation", "Structure", "MEP Rough-in", "Finishes", "Closeout"];
export const ISSUE_CATEGORIES = [
  { code: "failed_inspection", label: "Failed inspection" },
  { code: "material_defect", label: "Material defect / damage" },
  { code: "rework_required", label: "Rework required" },
  { code: "design_change", label: "Design / plan change" },
  { code: "weather_delay", label: "Weather delay" },
  { code: "manpower_shortage", label: "Subcontractor manpower shortage" },
  { code: "safety_incident", label: "Safety incident" },
  { code: "other", label: "Other" },
];
export const optionalNote = (value, field = "note") => {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 10000) throw new HttpError(400, `${field} must be text up to 10000 characters.`);
  return value.trim() || null;
};
const arrayField = (value, field) => {
  if (value === undefined) return [];
  try { if (typeof value === "string") value = JSON.parse(value); }
  catch { throw new HttpError(400, `${field} must be a JSON array.`); }
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be an array.`);
  return value;
};
export function rejectProgressInput(body) {
  if (!body || typeof body !== "object") return;
  const unsupported = ["pct", "progress", "percentage", "current_pct", "requested_pct", "requestedProgress",
    "phase_pct", "progress_pct", "requested_progress", "weight", "earned", "earned_total", "earned_value",
    "total", "total_required", "deduction", "rework_deduction", "verifiedProgress"];
  if (unsupported.some(field => Object.hasOwn(body,field))) {
    throw new HttpError(422, "Progress and activity values are calculated from trusted checklist records; omit progress values.");
  }
}
export function updateBody(body = {}) {
  rejectProgressInput(body);
  if (body && body.payload !== undefined) {
    try { body = JSON.parse(body.payload); }
    catch { throw new HttpError(400, "payload must be a JSON object."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "An update object is required.");
  rejectProgressInput(body);
  const categories = arrayField(body.issue_categories, "issue_categories");
  if (categories.length > ISSUE_CATEGORIES.length || categories.some(code => !ISSUE_CATEGORIES.some(i => i.code === code))) {
    throw new HttpError(400, "Unknown issue category.");
  }
  const files = arrayField(body.file_ids, "file_ids");
  const affected=arrayField(body.affected_activity_ids,"affected_activity_ids");
  if(affected.length>100 || affected.some(id=>!isBigintId(id)||BigInt(id)<=0n) || new Set(affected.map(String)).size!==affected.length) {
    throw new HttpError(400,"Affected activities must contain unique positive checklist IDs.");
  }
  if (files.length > 20 || files.some(id => !isUuid(id))) throw new HttpError(400, "file_ids must contain up to 20 file UUIDs.");
  if (body.submitted_item_ids !== undefined && body.checklist_submissions !== undefined) {
    throw new HttpError(400, "Use submitted_item_ids or checklist_submissions, not both.");
  }
  const submissions = body.checklist_submissions !== undefined
    ? arrayField(body.checklist_submissions, "checklist_submissions")
    : arrayField(body.submitted_item_ids, "submitted_item_ids").map(item_id => ({ item_id }));
  submissions.forEach(rejectProgressInput);
  if (submissions.length > 100 || submissions.some(i => !i || !isBigintId(i.item_id) || BigInt(i.item_id) <= 0n ||
      (i.file_id != null && !isUuid(i.file_id))) ||
      new Set(submissions.map(i => String(i.item_id))).size !== submissions.length) {
    throw new HttpError(400, "Checklist submissions need unique positive item IDs and optional file UUIDs.");
  }
  return {
    ...body, note: optionalNote(body.note), issue_reason: optionalNote(body.issue_reason),
    affected_activity_ids:affected.map(String),
    issue_categories: [...new Set(categories)], file_ids: [...new Set(files)],
    checklist_submissions: submissions.map(i => ({
      item_id: String(i.item_id), file_id: i.file_id ?? null, submission_note: optionalNote(i.submission_note, "submission_note"),
    })),
  };
}
export async function resolveStage(client, body, fallback, projectTypeId, projectId) {
 const id=body.stage_id ?? (body.stage===undefined ? fallback : null);
 if(id!=null && !isSmallintId(id))throw new HttpError(400,"Invalid stage_id.");
 if(body.stage!==undefined && (typeof body.stage!=="string" || !body.stage.trim()))throw new HttpError(400,"Unknown stage.");
 if(id==null && body.stage===undefined)throw new HttpError(400,"Select a stage.");
 const result=await client.query(`SELECT s.id,s.code,w.sort_order FROM ${projectId ? `(${projectWorkflowSql})` : "project_type_stages"} w
 JOIN project_stages s ON s.id=w.project_stage_id
 WHERE w.project_type_id=$1 AND ($2::smallint IS NULL OR s.id=$2)
 AND ($3::text IS NULL OR lower(s.code)=lower($3)) ${projectId ? "AND w.project_id=$4" : ""}`,[projectTypeId,id==null?null:Number(id),body.stage?.trim()??null,...(projectId ? [projectId] : [])]);
 if(!result.rowCount)throw new HttpError(400,"Unknown or conflicting stage selection for this project type.");
 return result.rows[0];
}
export async function stageOptions(client, projectTypeId, projectId) {
 return (await client.query(`SELECT s.id,s.code,w.sort_order FROM ${projectId ? `(${projectWorkflowSql})` : "project_type_stages"} w
 JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_type_id=$1 ${projectId ? "AND w.project_id=$2" : ""} ORDER BY w.sort_order`,[projectTypeId,...(projectId ? [projectId] : [])])).rows;
}
export async function validateFiles(client, project, userId, fileIds) {
  if (!fileIds.length) return;
  const owned = await client.query(
    `SELECT id FROM project_phase_files WHERE id = ANY($1::uuid[]) AND project_id = $2
      AND project_stage_id = $3 AND uploaded_by = $4`,
    [fileIds, project.id, project.current_stage_id, userId]);
  if (owned.rowCount !== new Set(fileIds).size) throw new HttpError(400, "Files must belong to you and the selected project/stage.");
}
export function issueReason(body) {
  return body.issue_reason ?? body.note ??
    body.issue_categories.map(code => ISSUE_CATEGORIES.find(i => i.code === code).label).join("; ");
}
export async function insertIssue(client, project, userId, body, updateId = null, historyId = null) {
  const affected=body.affected_activity_ids||[];
  if(affected.length){
    const current=await client.query("SELECT current_stage_id FROM projects WHERE id=$1",[project.id]);
    if(Number(current.rows[0]?.current_stage_id)!==Number(project.current_stage_id))throw new HttpError(422,"Targeted issues must concern the current phase.");
    if(!body.issue_reason?.trim()&&!body.note?.trim())throw new HttpError(400,"Explain why the selected activities need rework.");
    const items=await client.query("SELECT id FROM project_phase_checklist_items WHERE project_id=$1 AND project_stage_id=$2 AND id=ANY($3::bigint[])",[project.id,project.current_stage_id,affected]);
    if(items.rowCount!==affected.length)throw new HttpError(422,"Affected activities must belong to this project's current phase.");
  }
  const result = await client.query(
    `INSERT INTO pending_rework_requests
       (project_id, project_stage_id, reason, issue_categories, phase_update_id, resulting_history_id,
        submitted_by, submitted_at, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), 'pending', $7, $7) RETURNING id, status, submitted_at`,
    [project.id, project.current_stage_id, issueReason(body), body.issue_categories, updateId, historyId, userId]);
  if(affected.length)await client.query(`INSERT INTO project_rework_activities(request_id,project_id,project_stage_id,checklist_item_id)
    SELECT $1,$2,$3,unnest($4::bigint[])`,[result.rows[0].id,project.id,project.current_stage_id,affected]);
  return result.rows[0];
}
