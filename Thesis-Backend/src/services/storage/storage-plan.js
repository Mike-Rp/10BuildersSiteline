import { HttpError } from "../../common/utilities/access.utility.js";
import { DOCUMENT_UPLOAD_LIMIT_MB } from "../../domain/upload-limits.js";

// One private Supabase Storage bucket per kind of file. The names must match the
// buckets created in the Supabase dashboard.
export const STORAGE_BUCKETS = Object.freeze({
  photo: "project-photos",
  evidence: "phase-evidence",
  document: "project-documents",
  credential: "account-credentials",
});

const CONTENT_TYPES = Object.freeze({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" });

export const storageKinds = () => Object.keys(STORAGE_BUCKETS);

export function assertUploadSize(size) {
  if (!Number.isInteger(size) || size < 1) throw new HttpError(400, "A non-empty file is required.");
  if (size > DOCUMENT_UPLOAD_LIMIT_MB * 1024 * 1024) throw new HttpError(400, `The file must be ${DOCUMENT_UPLOAD_LIMIT_MB} MB or smaller.`);
}

// Decides where a file will live. Nothing here touches the network, so it is the
// single place that fixes bucket, path and allowed types. Paths are scoped by the
// uploading user, so one person can never overwrite another person's object.
// `size` is checked when known; the completion step checks the stored size instead.
export function planUpload({ userId, id, name, size, kind }) {
  if (!Object.hasOwn(STORAGE_BUCKETS, kind)) throw new HttpError(400, "Unknown upload type.");
  const extension = String(name ?? "").split(".").pop().toLowerCase();
  if (!Object.hasOwn(CONTENT_TYPES, extension)) throw new HttpError(400, "Supported files: PDF, JPG, JPEG and PNG.");
  if (size !== undefined) assertUploadSize(size);
  // The photo bucket only accepts images; a PDF filed as a "photo" goes to documents.
  const bucket = kind === "photo" && extension === "pdf" ? STORAGE_BUCKETS.document : STORAGE_BUCKETS[kind];
  return { bucket, path: `${userId}/${id}.${extension}`, extension, contentType: CONTENT_TYPES[extension] };
}
