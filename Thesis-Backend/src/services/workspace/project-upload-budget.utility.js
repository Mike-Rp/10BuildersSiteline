import { HttpError } from "../../common/utilities/access.utility.js";

export const PROJECT_UPLOAD_LIMIT = 10 * 1024 * 1024;

// All attachment paths lock the same project before reading either file store.
// Retained versions count too; replacing a document does not erase its bytes.
export async function assertProjectUploadBudget(db, projectId, additionalBytes) {
  await db.query("select id from projects where id=$1 for update", [projectId]);
  const { rows } = await db.query(`select
    coalesce((select sum(byte_size) from stored_files where project_id=$1),0) +
    coalesce((select sum(byte_size) from project_phase_files where project_id=$1),0) as used`, [projectId]);
  const used = Number(rows[0].used);
  if (additionalBytes > 0 && used + additionalBytes > PROJECT_UPLOAD_LIMIT) {
    const remaining = Math.max(0, PROJECT_UPLOAD_LIMIT - used);
    throw new HttpError(400, `This project allows 10 MB total across all documents, photos and phase evidence. Only ${(remaining / 1024 / 1024).toFixed(2)} MB remains (${remaining} bytes). Choose a smaller file.`);
  }
}

export async function linkProjectFile(db, projectId, fileId, purpose = "document") {
  await db.query("select id from projects where id=$1 for update", [projectId]);
  const { rows } = await db.query("select project_id,byte_size from stored_files where id=$1 for update", [fileId]);
  const file = rows[0];
  if (!file) throw new HttpError(404, "Uploaded file not found.");
  if (file.project_id && file.project_id !== projectId)
    throw new HttpError(409, "This file already belongs to another project. Upload a separate copy.");
  await assertProjectUploadBudget(db, projectId, file.project_id === projectId ? 0 : Number(file.byte_size));
  await db.query("update stored_files set project_id=$2,purpose=$3 where id=$1", [fileId, projectId, purpose]);
}
