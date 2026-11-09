// Copies Supabase Storage objects to the backup folder, encrypted. Only new or changed objects are downloaded.
// Objects that were deleted or replaced in Supabase move to files/removed/<date>/ instead of being erased, so an
// older database backup can still find its files. Nothing here deletes data in Supabase.
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { encryptFile } from "./crypto.js";

const PAGE = 100;

/** One bucket's objects, including those in nested folders. A folder is an entry with a null id. */
export async function listBucketObjects(storage, bucket, prefix = "") {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) found.push(...(await listBucketObjects(storage, bucket, path)));
      else found.push({ bucket, path, size: Number(item.metadata?.size) || 0, version: String(item.metadata?.eTag || item.updated_at || "") });
    }
    if (!data || data.length < PAGE) break;
  }
  return found;
}

export const objectKey = (bucket, path) => `${bucket}/${path}`;

/** What changed since the last run. `previous` is the saved manifest: { "bucket/path": { size, version } }. */
export function diffManifest(previous, remote) {
  const add = [], change = [], remove = [];
  const seen = new Set();
  for (const object of remote) {
    const key = objectKey(object.bucket, object.path);
    seen.add(key);
    const before = previous[key];
    if (!before) add.push(object);
    else if (before.version !== object.version || before.size !== object.size) change.push(object);
  }
  for (const key of Object.keys(previous)) if (!seen.has(key)) remove.push(key);
  return { add, change, remove };
}

/** A path that is safe to create inside the backup folder on Windows, one segment at a time. */
export function localObjectPath(bucket, path) {
  const encode = (segment) => {
    if (segment === "." || segment === ".." || segment === "") throw new Error(`Unsafe object name: ${path}`);
    return segment.replace(/[<>:"/\\|?*%\u0000-\u001f]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  };
  return [encode(bucket), ...path.split("/").map(encode)].join("/") + ".enc";
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function moveToRemoved(root, today, relative) {
  const from = join(root, "files", "current", relative);
  if (!(await exists(from))) return false;
  let target = join(root, "files", "removed", today, relative);
  for (let n = 1; await exists(target); n++) target = join(root, "files", "removed", today, relative + "." + n);
  await mkdir(dirname(target), { recursive: true });
  await rename(from, target);
  return true;
}

export async function syncStorage({ storage, root, publicKeyPem, today, buckets }) {
  const manifestPath = join(root, "files", "manifest.json");
  let manifest = {};
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* first run */ }

  let names = buckets;
  if (!names || !names.length) {
    const { data, error } = await storage.listBuckets();
    if (error) throw new Error(`Could not list storage buckets: ${error.message}`);
    names = (data || []).map((bucket) => bucket.name);
  }
  const remote = [];
  for (const bucket of names) remote.push(...(await listBucketObjects(storage, bucket)));

  const { add, change, remove } = diffManifest(manifest, remote);
  const next = { ...manifest };
  const summary = { buckets: names.length, objects: remote.length, added: 0, changed: 0, removed: 0, bytes: 0, failed: [] };
  await mkdir(join(root, "tmp"), { recursive: true });

  for (const object of [...add, ...change]) {
    const key = objectKey(object.bucket, object.path);
    const relative = localObjectPath(object.bucket, object.path);
    const temp = join(root, "tmp", `object-${summary.added + summary.changed + summary.failed.length}.bin`);
    try {
      const { data, error } = await storage.from(object.bucket).download(object.path);
      if (error || !data) throw new Error(error?.message || "empty download");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (object.size > 0 && bytes.length !== object.size) throw new Error(`size ${bytes.length} does not match ${object.size}`);
      await writeFile(temp, bytes);
      const isChange = Boolean(manifest[key]);
      if (isChange) await moveToRemoved(root, today, relative);
      const target = join(root, "files", "current", relative);
      await mkdir(dirname(target), { recursive: true });
      await encryptFile(temp, target, publicKeyPem);
      next[key] = { size: object.size || bytes.length, version: object.version };
      summary.bytes += bytes.length;
      if (isChange) summary.changed++; else summary.added++;
    } catch (error) {
      summary.failed.push(`${key}: ${error.message}`);
    } finally {
      await rm(temp, { force: true });
    }
  }

  for (const key of remove) {
    const slash = key.indexOf("/");
    const relative = localObjectPath(key.slice(0, slash), key.slice(slash + 1));
    await moveToRemoved(root, today, relative);
    delete next[key];
    summary.removed++;
  }

  await mkdir(dirname(manifestPath), { recursive: true });
  const tempManifest = manifestPath + ".tmp";
  await writeFile(tempManifest, JSON.stringify(next, null, 1));
  await rename(tempManifest, manifestPath);
  return summary;
}
