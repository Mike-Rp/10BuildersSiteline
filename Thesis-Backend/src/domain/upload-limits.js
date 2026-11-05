// Shared by the API and browser. One size limit for every upload (documents, photos, spreadsheets).
// Vercel functions reject request bodies over 4.5 MB, so 4 MB leaves room for the form fields around the file.
export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const UPLOAD_TOO_LARGE_MESSAGE = `The file must be ${MAX_UPLOAD_MB} MB or smaller.`;
