# Admin backup monitoring

Backups appears below Organization rules in Administrator Settings. It reads real
metadata; the production UI contains no demo rows. Staff and clients cannot read
status or request backups. The existing sidebar is unchanged.

## Setup

1. Apply `Thesis-Backend/migrations/029-backup-monitoring.sql` to the application's
   PostgreSQL database using the normal reviewed migration process. It is additive
   and idempotent. No backup contents are stored. Before installation the API returns
   a setup message and the UI provides Try again.
2. Set a long random `BACKUP_WORKER_SECRET` in the backend environment and on the
   separate backup computer. Keep it separate from login/JWT credentials and never
   expose it through Vite. Requests stay disabled until this is configured.
3. Configure the existing backup computer to poll at least every five minutes and
   to run nightly at **2:00 AM Asia/Manila**. Connect it to the metadata API below.
   The web application does not run backup commands, install a backup agent,
   encrypt files, enforce retention, or test-restore data itself. Those jobs must
   be performed and verified by the backup computer before reporting success.

No production database migration or backup computer configuration is performed by
the frontend build. A configured secret means requests can be recorded; it is not
proof that a computer is connected. Unclaimed requests show a warning after 15 minutes.

## Admin API

These require the app's existing authenticated **admin** session:

- `GET /api/v1/backups`: last 30 records, last successful backup and its protection
  summary, last restore test, any open request, server time and setup status.
- `POST /api/v1/backups/requests` with `{}`: saves a request and the authenticated
  sender's identity. An existing open request is returned instead of creating a
  duplicate. A database unique index enforces one open request across all admins.

## Backup computer API

All calls use HTTPS and `Authorization: Bearer <BACKUP_WORKER_SECRET>`.
An administrator login token does not authorize these operations.

1. `POST /api/v1/backups/worker/claim` with `{}` on the five-minute poll. Returns
   `{id}` or `null` in the standard `data` envelope. Only the worker receiving the
   ID should do the backup. At 2:00 AM send `{"scheduled":true}` to create a nightly
   run if there is no request to claim. A running backup prevents a second run.
   Claim once for a scheduled occurrence; don't poll with `scheduled:true`.
2. Perform the encrypted backup on the separate computer. After verifying the copy,
   `POST /api/v1/backups/worker/runs/<id>/result` with:

   ```json
   {
     "status": "success",
     "databaseBytes": 214000000,
     "filesChanged": 3,
     "summary": {
       "protectedFiles": 347,
       "totalFiles": 347,
       "storageUsedBytes": 9800000000,
       "storageCapacityBytes": 100000000000,
       "oldestRestorableAt": "2026-10-03T18:04:00.000Z"
     }
   }
   ```

   Supply the actual oldest **still-restorable** copy after retention cleanup,
   including the required data and file history. It is not calculated from how
   long the application has been installed. Values are metadata only; unknown
   payload properties are discarded. Do not send file names, paths or contents.
3. On failure report `{"status":"failed","reason":"database"}`. Known reason
   codes are `database`, `files`, `storage`, and `interrupted`. Raw exception strings
   are deliberately rejected so credentials cannot appear on the page.
4. After each weekly restore test, `POST /api/v1/backups/worker/restore-tests` with
   `{"passed":true}` or `{"passed":false}`. The server records the current timestamp.

The worker should persist its claimed ID locally. If interrupted, reconcile that
run and report `interrupted` before claiming another. The web app never assumes a
running backup has finished and never unlocks an open request on a timer. Result
submission with the same final status is safe to retry after a lost response.

## UI behavior

Metadata refreshes every 30 seconds while Settings is mounted. A failed refresh
shows Status unavailable and disables requests until status can be read again.
Existing metadata stays visible for context. The server clock determines request
age; dates and nightly schedules use Asia/Manila. A latest failed run takes
precedence over Late; Late means the last success is over 24 hours old. Completion
notices are shown for manual requests completed within the last 10 minutes.

The first 30 records are paginated ten at a time using the app's compact pager.
Phone tables use labeled cards. How it works starts collapsed. The standalone
`__admin-backups-preview.html` remains a design sample only.
