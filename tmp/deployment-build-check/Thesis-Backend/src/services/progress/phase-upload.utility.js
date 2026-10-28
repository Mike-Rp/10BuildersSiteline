import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { HttpError, handleError } from "../../common/utilities/access.utility.js";

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
export async function insertFile(client, project, file, userId) {
  const contentType = fileType(file);
  const id = uuidv4();
  const originalName = file.originalname.replace(/[\r\n\\/]/g, "_").slice(0, 200);
  await client.query(
    `INSERT INTO project_phase_files
       (id, project_id, project_stage_id, original_name, content_type, byte_size, content, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, project.id, project.current_stage_id, originalName, contentType, file.buffer.length, file.buffer, userId]);
  return { id, original_name: originalName, content_type: contentType, byte_size: file.buffer.length };
}
