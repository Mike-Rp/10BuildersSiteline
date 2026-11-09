import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { requireUser, sendOk, handleError, HttpError, isUuid } from '../../common/utilities/access.utility.js';
import { withTransaction } from '../../common/utilities/transaction.utility.js';
import { readBackups, requestBackup, claimBackup, finishBackup } from './store.js';

const digest = value => createHash('sha256').update(value).digest();
export function createBackupRouter({ transaction = withTransaction, authorize = requireUser, secret = () => process.env.BACKUP_WORKER_SECRET } = {}) {
  const router = Router();
  const endpoint = (worker, fn) => async (req, res) => {
    try {
      let user;
      if (worker) {
        const expected = secret();
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (!expected || !token || !timingSafeEqual(digest(expected), digest(token))) throw new HttpError(401, 'Missing or invalid backup computer credentials.');
      } else {
        user = await authorize(req, res, ['admin']);
        if (!user) return;
      }
      const data = await transaction(db => fn(db, req, user));
      return sendOk(res, 'Backup status updated.', 1, data);
    } catch (error) {
      if (error.code === '42P01') return handleError(res, new HttpError(503, 'Backup monitoring is not set up yet. Ask the system maintainer to install the backup monitoring migration.'));
      return handleError(res, error);
    }
  };
  router.get('/', endpoint(false, async db => ({ ...await readBackups(db), workerConfigured: Boolean(secret()), serverTime: new Date().toISOString() })));
  router.post('/requests', endpoint(false, async (db, req, user) => {
    if (!secret()) throw new HttpError(503, 'The backup computer connection is not configured yet.');
    return { ...await requestBackup(db, user), workerConfigured: true, serverTime: new Date().toISOString() };
  }));
  router.post('/worker/claim', endpoint(true, async (db, req) => {
    if (req.body?.scheduled !== undefined && typeof req.body.scheduled !== 'boolean') throw new HttpError(400, 'Scheduled must be true or false.');
    return claimBackup(db, req.body?.scheduled === true);
  }));
  router.post('/worker/runs/:id/result', endpoint(true, (db, req) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, 'Invalid backup ID.');
    return finishBackup(db, req.params.id, req.body);
  }));
  router.post('/worker/restore-tests', endpoint(true, async (db, req) => {
    if (typeof req.body?.passed !== 'boolean') throw new HttpError(400, 'Provide the restore test result.');
    return (await db.query('insert into backup_restore_tests(passed) values($1) returning tested_at,passed', [req.body.passed])).rows[0];
  }));
  return router;
}
export default createBackupRouter();
