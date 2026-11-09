import { assertProjectUploadBudget } from "../workspace/project-upload-budget.utility.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { HttpError, handleError, isUuid } from "../../common/utilities/access.utility.js";

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 16, fieldSize: 32768 },
}).single("file");

export const phaseUpload = (req, res, next) => parser(req, res, error => {
  if (error) return handleError(res, new HttpError(400, error.message));
  return next();
});

export function fileType(file) {
  if (!file?.buffer?.length) throw new HttpError(400, "A non-empty file is required.");
  const b = file.buffer;
  const extension = file.originalname?.split(".").pop()?.toLowerCase();
  const types = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
  if (file.originalname && !types[extension]) throw new HttpError(400, "Supported files: PDF, JPG, JPEG and PNG.");
  const checked = type => {
    if (file.originalname && types[extension] !== type) throw new HttpError(400, "The file content does not match its extension.");
    return type;
  };
  if (b.subarray(0, 5).toString() === "%PDF-") return checked("application/pdf");
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return checked("image/png");
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return checked("image/jpeg");
  throw new HttpError(400, "Supported files: PDF, JPG, JPEG and PNG.");
}

export const optionalPhaseUpload = (req, res, next) => {
  if (req.is("multipart/form-data")) return phaseUpload(req, res, next);
  return next();
};
// Records an already-uploaded file (see POST /files) as a phase file, entirely on the
// server. The browser sends only an id, so the 4.5 MB request cap never applies. A
// Storage-backed file is referenced in place; a database-backed one is copied.
export async function insertFileFromStored(client, project, fileId, userId) {
  if (!isUuid(fileId)) throw new HttpError(400, "A valid file_id is required.");
  const row = (await client.query("select * from stored_files where id=$1 and uploaded_by=$2 for update", [fileId, userId])).rows[0];
  if (!row) throw new HttpError(404, "Uploaded file not found. Upload the file again.");
  if (row.project_id && row.project_id !== project.id)
    throw new HttpError(409, "This file already belongs to another project. Upload a separate copy.");
  const contentType = row.storage_path ? row.content_type : fileType({ buffer: Buffer.from(row.content ?? []), originalname: row.original_name });
  await assertProjectUploadBudget(client, project.id, Number(row.byte_size));
  const id = uuidv4();
  if (row.storage_path)
    await client.query(
      `INSERT INTO project_phase_files
         (id, project_id, project_stage_id, original_name, content_type, byte_size, uploaded_by, storage_bucket, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, project.id, project.current_stage_id, row.original_name, contentType, row.byte_size, userId, row.storage_bucket, row.storage_path]);
  else
    await client.query(
      `INSERT INTO project_phase_files
         (id, project_id, project_stage_id, original_name, content_type, byte_size, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, project.id, project.current_stage_id, row.original_name, contentType, row.byte_size, row.content, userId]);
  return { id, original_name: row.original_name, content_type: contentType, byte_size: Number(row.byte_size) };
}

export async function insertFile(client, project, file, userId) {
  const contentType = fileType(file);
  await assertProjectUploadBudget(client, project.id, file.buffer.length);
  const id = uuidv4();
  const originalName = file.originalname.replace(/[\r\n\\/]/g, "_").slice(0, 200);
  await client.query(
    `INSERT INTO project_phase_files
       (id, project_id, project_stage_id, original_name, content_type, byte_size, content, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, project.id, project.current_stage_id, originalName, contentType, file.buffer.length, file.buffer, userId]);
  return { id, original_name: originalName, content_type: contentType, byte_size: file.buffer.length };
}
