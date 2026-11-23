import { HttpError } from "../../common/utilities/access.utility.js";
import { readChecklist } from "./phase.utility.js";
import { validateFiles } from "./phase-update.utility.js";
import { assertAssignmentWritable, multiSpmInstalled } from "./assignment.utility.js";
import { monitoringProject } from "../projects/intake-monitoring.utility.js";
import { assertOverlapSubmission } from "./overlap.utility.js";

export async function submitChecklist(client, project, user, submission, updateId = null, checklist = null) {
  const monitored=await monitoringProject(client,project);
  const overlap=monitored?await assertOverlapSubmission(client,project,user,submission.responsibility_id,submission.item_id):null;
  const assignment=overlap?{responsibility_id:overlap.responsibility.id}:await assertAssignmentWritable(client,user,project);
  checklist ??= await readChecklist(client, project.id, project.current_stage_id, {userId:user.id});
  const item = checklist.items.find(i => String(i.id) === String(submission.item_id));
  if (!item) throw new HttpError(404, "Checklist item not found in the selected stage.");
  if (item.required === false) throw new HttpError(409, "This checklist requirement is historical and no longer accepts new submissions.");
  if (item.status === "approved") throw new HttpError(409, "Approved evidence cannot be overwritten.");
  if (item.status === "pending") {
    // A separately submitted item can join the final update, without creating another version.
    if (updateId && item.phase_update_id == null && item.submitted_by === user.id &&
        (!submission.file_id || submission.file_id === item.file_id)) {
      await client.query("UPDATE project_phase_evidence SET phase_update_id = $2 WHERE id = $1", [item.evidence_id, updateId]);
      return { id: item.evidence_id, status: "pending", checklist_item_id: item.id, file_id: item.file_id };
    }
    throw new HttpError(409, "This item is already awaiting review.");
  }
  if(item.rework_request_id&&(!submission.file_id||submission.file_id===item.file_id)) {
    throw new HttpError(400,"Upload fresh corrected evidence for this rework activity.");
  }
  const fileIds=[...new Set(submission.file_ids ?? (submission.file_id ? [submission.file_id] : []))];
  if(monitored&&!fileIds.length)throw new HttpError(400,'Attach evidence for this responsibility submission.');
  await validateFiles(client, project, user.id, fileIds);
  if(monitored&&fileIds.length) {
    const matching=await client.query('SELECT id FROM project_phase_files WHERE id=ANY($1::uuid[]) AND responsibility_id=$2 AND checklist_item_id=$3',[fileIds,assignment.responsibility_id,item.id]);
    if(matching.rowCount!==fileIds.length)throw new HttpError(400,'Files must be linked to this checklist item and responsibility.');
  }
  if (monitored) {
    const reused = await client.query(`SELECT 1 FROM project_phase_evidence e
      LEFT JOIN project_phase_evidence_files f ON f.evidence_id=e.id
      WHERE e.project_id=$1 AND e.checklist_item_id=$2 AND e.responsibility_id=$3
        AND (f.file_id=ANY($4::uuid[]) OR e.file_id=ANY($4::uuid[])) LIMIT 1`,
      [project.id,item.id,assignment.responsibility_id,fileIds]);
    if (reused.rowCount) throw new HttpError(409,"Upload fresh files for corrected evidence.");
  }
  if (fileIds.length > 1 && !await multiSpmInstalled(client)) throw new HttpError(409,"Apply migration 025 to enable multiple attachments.");
  const result = await client.query(
    `INSERT INTO project_phase_evidence
       (project_id, project_stage_id, checklist_item_id, file_id, submitted_by, submission_note, phase_update_id,rework_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7,$8) RETURNING id, status, submitted_at`,
    [project.id, project.current_stage_id, item.id, fileIds[0] ?? null, user.id,
      submission.submission_note ?? null, updateId,item.rework_request_id||null]);
  if (assignment.responsibility_id && (await client.query("select to_regclass('public.project_request_receipts') is not null as ready")).rows[0].ready) {
    await client.query('UPDATE project_phase_evidence SET responsibility_id=$2 WHERE id=$1',[result.rows[0].id,assignment.responsibility_id]);
  }
  if(monitored) await client.query('UPDATE project_phase_evidence SET monitoring_version=1 WHERE id=$1',[result.rows[0].id]);
  if (fileIds.length && await multiSpmInstalled(client)) await client.query(
    "INSERT INTO project_phase_evidence_files(evidence_id,file_id) SELECT $1,unnest($2::uuid[])",[result.rows[0].id,fileIds]);
  return { ...result.rows[0], checklist_item_id: item.id, file_id: fileIds[0] ?? null, file_ids:fileIds };
}
