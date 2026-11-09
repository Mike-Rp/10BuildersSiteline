import { HttpError } from '../../common/utilities/access.utility.js';

export async function readBackups(db) {
  const runs = (await db.query(`select id,status,requested_by_name,requested_at,started_at,finished_at,
    database_bytes,files_changed,failure_reason from backup_runs order by requested_at desc,id desc limit 30`)).rows;
  const lastGood = (await db.query("select finished_at,database_bytes,summary from backup_runs where status='success' order by finished_at desc limit 1")).rows[0] || null;
  const lastTest = (await db.query('select tested_at,passed from backup_restore_tests order by tested_at desc limit 1')).rows[0] || null;
  // An old open request remains visible even after thirty newer historical records.
  const openRequest = (await db.query("select id,status,requested_at,started_at,requested_by_name from backup_runs where status in ('requested','running') limit 1")).rows[0] || null;
  return { runs, lastGood, lastTest, openRequest };
}

export async function requestBackup(db, user) {
  const inserted = (await db.query(`insert into backup_runs(status,requested_by,requested_by_name)
    values('requested',$1,$2) on conflict do nothing returning id`, [user.id, user.full_name])).rows[0];
  return { ...await readBackups(db), alreadyOpen: !inserted };
}

// The worker must claim BEFORE doing any backup work. No backup command is executed by the web app.
export async function claimBackup(db, scheduled = false) {
  const claimed = (await db.query(`update backup_runs set status='running',started_at=now()
    where id=(select id from backup_runs where status='requested' order by requested_at for update skip locked limit 1)
    returning id`)).rows[0];
  if (claimed) return claimed;
  if (!scheduled) return null;
  return (await db.query(`insert into backup_runs(status,started_at) values('running',now())
    on conflict do nothing returning id`)).rows[0] || null;
}

const nonnegative = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function validateResult(body) {
  if (!body || !['success','failed'].includes(body.status)) throw new HttpError(400, 'Choose success or failed.');
  if (body.status === 'failed') {
    // Only plain, administrator-facing reasons; never forward raw DB errors or credentials.
    const reasons = { database: 'Could not connect to the database', files: 'Could not protect all uploaded files', storage: 'Could not save to backup storage', interrupted: 'The backup did not finish' };
    if (typeof body.reason !== 'string' || !Object.hasOwn(reasons, body.reason)) throw new HttpError(400, 'Choose a known failure reason.');
    return { status: 'failed', reason: reasons[body.reason] };
  }
  const summary = body.summary;
  if (!nonnegative(body.databaseBytes) || !nonnegative(body.filesChanged) || !summary ||
    !['protectedFiles','totalFiles','storageUsedBytes','storageCapacityBytes'].every(key => nonnegative(summary[key])) ||
    summary.protectedFiles > summary.totalFiles || summary.storageCapacityBytes < 1 ||
    typeof summary.oldestRestorableAt !== 'string' || !Number.isFinite(Date.parse(summary.oldestRestorableAt)) || Date.parse(summary.oldestRestorableAt) > Date.now())
    throw new HttpError(400, 'Provide valid backup sizes, file counts, storage and restore history.');
  return { status: 'success', databaseBytes: body.databaseBytes, filesChanged: body.filesChanged,
    summary: { protectedFiles: summary.protectedFiles, totalFiles: summary.totalFiles,
      storageUsedBytes: summary.storageUsedBytes, storageCapacityBytes: summary.storageCapacityBytes,
      oldestRestorableAt: new Date(summary.oldestRestorableAt).toISOString() } };
}

export async function finishBackup(db, id, body) {
  const result = validateResult(body);
  const row = (await db.query(`update backup_runs set status=$2,finished_at=now(),database_bytes=$3,
    files_changed=$4,failure_reason=$5,summary=$6 where id=$1 and status='running' returning id`,
  [id, result.status, result.databaseBytes ?? null, result.filesChanged ?? null, result.reason ?? null, result.summary ?? null])).rows[0];
  if (!row) {
    const previous = (await db.query('select status from backup_runs where id=$1', [id])).rows[0];
    if (previous?.status === result.status) return { id }; // Safe retry after a lost HTTP response.
    throw new HttpError(409, 'This backup is not running.');
  }
  return row;
}
