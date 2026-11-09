import { createClient } from "@supabase/supabase-js";
import { Readable } from "node:stream";
import { HttpError } from "../../common/utilities/access.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";

// File storage is optional. Without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY the
// callers fall back to the database-backed upload path, so nothing breaks.
let injected;
let cached;
export const setStorageClient = client => { injected = client; cached = undefined; };

function client() {
  if (injected !== undefined) return injected;
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}

export const storageEnabled = () => Boolean(client());

function required() {
  const active = client();
  if (!active) throw new HttpError(503, "File storage is not configured.");
  return active;
}

// Raw storage errors can name buckets and paths. Keep them in the server log only.
function failure(error) {
  if (error) errorlog(error);
  return new HttpError(502, "File storage is unavailable. Try again.");
}

const SIGNED_URL_SECONDS = 60;

async function signedUrl(bucket, path) {
  const { data, error } = await required().storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw failure(error);
  return data.signedUrl;
}

export async function createUploadTarget(bucket, path) {
  const { data, error } = await required().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw failure(error);
  return { url: data.signedUrl };
}

// Size and type of a stored object, or null if it does not exist.
export async function statObject(bucket, path) {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await required().storage.from(bucket).list(folder, { limit: 10, search: name });
  if (error) throw failure(error);
  const found = data?.find(object => object.name === name);
  return found ? { size: Number(found.metadata?.size ?? 0), contentType: found.metadata?.mimetype } : null;
}

// First bytes of an object, to check its real file type without downloading all of it.
export async function readHead(bucket, path, bytes = 16) {
  const response = await fetch(await signedUrl(bucket, path), { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!response.ok) throw failure(new Error(`Storage head read failed (${response.status}).`));
  return Buffer.from(await response.arrayBuffer()).subarray(0, bytes);
}

// Opens an object for streaming. Streaming keeps big files clear of the serverless
// response size cap; the caller sets headers, then calls pipeObject.
export async function openObject(bucket, path) {
  const response = await fetch(await signedUrl(bucket, path));
  if (response.status === 404 || response.status === 400) throw new HttpError(404, "File not found.");
  if (!response.ok || !response.body) throw failure(new Error(`Storage read failed (${response.status}).`));
  return { body: Readable.fromWeb(response.body), size: Number(response.headers.get("content-length")) || 0 };
}

export function pipeObject(res, { body, size }) {
  if (size) res.set("Content-Length", String(size));
  return new Promise(resolve => {
    body.on("error", error => { errorlog(error); res.destroy(error); resolve(); });
    res.on("close", resolve);
    body.pipe(res);
  });
}

// Best effort: used to discard an upload that failed validation.
export async function removeObject(bucket, path) {
  try { await required().storage.from(bucket).remove([path]); }
  catch (error) { errorlog(error); }
}
