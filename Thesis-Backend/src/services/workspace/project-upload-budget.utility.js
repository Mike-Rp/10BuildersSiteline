import { HttpError } from "../../common/utilities/access.utility.js";

// Each site photo or phase evidence upload may be up to 10 MB. There is no
// cumulative per-project cap. Name kept so existing callers do not change.
export const PER_FILE_UPLOAD_LIMIT = 10 * 1024 * 1024;
export const PROJECT_UPLOAD_LIMIT = PER_FILE_UPLOAD_LIMIT;

export async function assertProjectUploadBudget(db, projectId, additionalBytes) {
  if (additionalBytes > PER_FILE_UPLOAD_LIMIT) {
    throw new HttpError(400, `Each upload may be up to 10 MB. This file is ${(additionalBytes / 1024 / 1024).toFixed(2)} MB. Choose a smaller file.`);
  }
}

export async function linkProjectFile(db, projectId, fileId, purpose = "document") {
  await db.query("select id from projects where id=$1 for update", [projectId]);
  const { rows } = await db.query("select project_id,byte_size,purpose from stored_files where id=$1 for update", [fileId]);
  const file = rows[0];
  if (!file) throw new HttpError(404, "Uploaded file not found.");
  if (file.project_id && file.project_id !== projectId)
    throw new HttpError(409, "This file already belongs to another project. Upload a separate copy.");
  if (purpose === "photo") await assertProjectUploadBudget(db, projectId, Number(file.byte_size));
  await db.query("update stored_files set project_id=$2,purpose=$3 where id=$1", [fileId, projectId, purpose]);
}
