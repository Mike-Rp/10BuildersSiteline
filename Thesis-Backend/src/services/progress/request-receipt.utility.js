import { createHash } from 'node:crypto';
import { HttpError, isUuid } from '../../common/utilities/access.utility.js';

// Used inside the existing project-row transaction. Keys are explicit operation
// identities, never content deduplication: identical new reports remain allowed.
export async function projectRequest(db, projectId, userId, requestId, operation, payload, write) {
  if (requestId == null) return write(); // Compatibility with existing clients.
  if (!isUuid(requestId)) throw new HttpError(400,'request_id must be a UUID.');
  if (!(await db.query("select to_regclass('public.project_request_receipts') is not null as ready")).rows[0].ready)
    throw new HttpError(409,'Apply migration 027 before using retry-safe submissions.');
  const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const old=(await db.query('SELECT * FROM project_request_receipts WHERE project_id=$1 AND user_id=$2 AND request_id=$3',[projectId,userId,requestId])).rows[0];
  if (old) {
    if (old.operation!==operation || old.fingerprint!==fingerprint) throw new HttpError(409,'This request_id was already used with different content.');
    return old.response;
  }
  const response=await write();
  await db.query('INSERT INTO project_request_receipts(project_id,user_id,request_id,operation,fingerprint,response) VALUES($1,$2,$3,$4,$5,$6)',[projectId,userId,requestId,operation,fingerprint,JSON.stringify(response)]);
  return response;
}
