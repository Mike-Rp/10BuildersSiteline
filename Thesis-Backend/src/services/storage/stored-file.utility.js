import { HttpError, isUuid } from "../../common/utilities/access.utility.js";
import { fileType } from "../progress/phase-upload.utility.js";
import { assertUploadSize, planUpload } from "./storage-plan.js";
import { createUploadTarget, readHead, removeObject, statObject, storageEnabled } from "./storage.service.js";

let columnsInstalled = false;
// Migration 028 adds the storage columns. Until it runs, uploads keep using the database.
export async function storageColumnsInstalled(db) {
  if (columnsInstalled) return true;
  const { rows } = await db.query(`select count(*)::int as n from information_schema.columns
    where table_schema='public' and table_name in ('stored_files','project_phase_files')
    and column_name in ('storage_bucket','storage_path')`);
  columnsInstalled = rows[0].n === 4;
  return columnsInstalled;
}

export const storageReady = async db => storageEnabled() && await storageColumnsInstalled(db);

const cleanName = name => String(name ?? "").replace(/[\r\n\\/]/g, "_").slice(0, 200);

// Step 1: tell the browser where to send the file. The file itself never passes
// through the serverless function, so its 4.5 MB request cap does not apply.
export async function requestUploadTarget(db, user, body) {
  if (!await storageReady(db)) return { mode: "direct" };
  if (!isUuid(body?.id)) throw new HttpError(400, "A file UUID is required.");
  const plan = planUpload({ userId: user.id, id: body.id, name: body.name, size: Number(body.size), kind: body.kind });
  if ((await db.query("select 1 from stored_files where id=$1", [body.id])).rowCount)
    throw new HttpError(409, "This file was already uploaded.");
  const target = await createUploadTarget(plan.bucket, plan.path);
  return { mode: "storage", upload_url: target.url, bucket: plan.bucket, path: plan.path, content_type: plan.contentType };
}

// Step 2: after the browser has uploaded, confirm the object, check what it really
// is, and record it. A file that fails the check is deleted from the bucket.
export async function completeStorageUpload(db, user, body) {
  if (!await storageReady(db)) throw new HttpError(409, "File storage is not enabled.");
  if (!isUuid(body?.id)) throw new HttpError(400, "A file UUID is required.");
  const plan = planUpload({ userId: user.id, id: body.id, name: body.name, kind: body.kind });
  const downloadUrl = "/api/v1/files/" + body.id + "/content";
  const existing = (await db.query("select uploaded_by,storage_path from stored_files where id=$1", [body.id])).rows[0];
  if (existing) {
    if (existing.uploaded_by === user.id && existing.storage_path === plan.path) return { id: body.id, download_url: downloadUrl };
    throw new HttpError(409, "This file was already uploaded.");
  }
  const stat = await statObject(plan.bucket, plan.path);
  if (!stat) throw new HttpError(404, "The upload was not received. Upload the file again.");
  let contentType;
  try {
    assertUploadSize(stat.size);
    contentType = fileType({ buffer: await readHead(plan.bucket, plan.path), originalname: body.name });
  } catch (error) {
    await removeObject(plan.bucket, plan.path);
    throw error;
  }
  await db.query(`insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,uploaded_by,storage_bucket,storage_path)
    values($1,$2,'upload',$3,$4,$5,$2,$6,$7)`, [body.id, user.id, cleanName(body.name), contentType, stat.size, plan.bucket, plan.path]);
  return { id: body.id, download_url: downloadUrl };
}
