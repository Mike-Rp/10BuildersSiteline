import { HttpError } from "../../common/utilities/access.utility.js";
import { readChecklist } from "./phase.utility.js";
import { validateFiles } from "./phase-update.utility.js";

export async function submitChecklist(client, project, user, submission, updateId = null, checklist = null) {
  checklist ??= await readChecklist(client, project.id, project.current_stage_id);
  const item = checklist.items.find(i => String(i.id) === String(submission.item_id));
  if (!item) throw new HttpError(404, "Checklist item not found in the selected stage.");
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
  await validateFiles(client, project, user.id, submission.file_id ? [submission.file_id] : []);
  const result = await client.query(
    `INSERT INTO project_phase_evidence
       (project_id, project_stage_id, checklist_item_id, file_id, submitted_by, submission_note, phase_update_id,rework_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7,$8) RETURNING id, status, submitted_at`,
    [project.id, project.current_stage_id, item.id, submission.file_id ?? null, user.id,
      submission.submission_note ?? null, updateId,item.rework_request_id||null]);
  return { ...result.rows[0], checklist_item_id: item.id, file_id: submission.file_id ?? null };
}
