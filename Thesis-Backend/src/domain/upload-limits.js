export const DOCUMENT_UPLOAD_LIMIT_MB = 10;
export const MANPOWER_UPLOAD_LIMIT_MB = 15;
export const GENERAL_UPLOAD_LIMIT_BYTES = MANPOWER_UPLOAD_LIMIT_MB * 1024 * 1024;
// Leave ample room under Vercel's 4.5 MB function request limit for multipart headers.
export const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_UPLOAD_CHUNKS = Math.ceil(GENERAL_UPLOAD_LIMIT_BYTES / UPLOAD_CHUNK_BYTES);
