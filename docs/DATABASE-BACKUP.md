# Automated database and file backup

Supabase Pro keeps 7 daily backups, and those never include Storage files. This setup keeps an extra, encrypted copy
of the database and the Storage files on a separate PC for **100 days**. The code is in
`Thesis-Backend/scripts/backup/`. It only reads from Supabase.

## What it does every night (02:00)

1. Runs `pg_dump` on the `public` schema (login sessions in `users_token` are left out).
2. Checks the dump: `pg_restore --list` must read it back and it must contain at least 60 tables. A dump that fails is
   discarded and the night is marked failed.
3. Encrypts it with the **public key** into `database/database-YYYY-MM-DD.dump.enc` and deletes the plain dump.
4. Copies new or changed Storage files (encrypted) into `files/current/`. A file that is replaced or deleted in
   Supabase moves to `files/removed/YYYY-MM-DD/`, so an older database backup can still find its files.
5. Deletes database backups and `removed` folders older than `RETENTION_DAYS`, **only after** a successful database
   backup. A failing night never shrinks the history.
6. Writes `logs/status.json` (latest run), `logs/last-good.json`, `logs/history.jsonl` and a monthly log.

## Reporting to the website

The script is the "backup computer" described in [BACKUPS.md](BACKUPS.md). Each run is recorded on the Admin
Settings > Backups page, which also lets an Admin request a backup.

| Command | When | What it does |
| --- | --- | --- |
| `nightly-backup.js --scheduled` (also the default) | Nightly at 02:00, or by hand | Claims a run (an Admin's request first, otherwise a new nightly run), backs up, reports the result |
| `nightly-backup.js --poll` | Every 5 minutes | Does nothing unless an Admin pressed **Run backup request**, then runs that backup |
| `nightly-backup.js --restore-test pass` or `fail` | After each restore test | Records the result so the page shows "Last restore test" |
| `nightly-backup.js --check` | Any time | Tests the settings, the database, Storage and the website secret without making a backup or claiming a run |
| `--no-report` | Optional | Backs up without contacting the website |

Only sizes, counts and plain failure reasons are sent: never file names, paths, keys or contents. A night counts as a
success once the database backup is saved. If Storage files could not be reached the night is reported as failed with
the reason "Could not protect all uploaded files", because those files cannot be called protected.

If the website cannot be reached the backup still happens. A result that could not be sent is kept in
`logs/claimed-run.json` and delivered first at the next run. A run that was claimed but never finished (for example the
PC lost power) is reported as interrupted at the next run, so the page never shows a backup that is "running" forever.
The page shows **Late** when the last success is more than 24 hours old, even if the PC is off.

Status is `ok`, `partial` (the database was saved but something else needs attention, for example Storage files were
not copied or the dump shrank to under half the last one) or `failed`. The process exit code is 0, 2 or 1.

## Where things live

| Item | Location |
| --- | --- |
| Backups and logs | `C:\siteline-backups\` (`database\`, `files\`, `logs\`) |
| Settings (passwords) | `C:\siteline-backups\config\backup.env`, never in the repository |
| Public key | `C:\siteline-backups\config\backup-public.pem` |
| Private key | **Not on the backup PC.** Kept by the key holder, protected by a passphrase. |

## Encryption

Backups are encrypted with a public key. The backup PC holds only the public key, so a stolen PC or drive cannot read
them. Each file gets its own random AES-256-GCM key, wrapped with RSA-OAEP. Any change to a backup file makes
decryption fail instead of producing wrong data. **Without the private key and its passphrase, backups cannot be
opened.** Keep the private key in two places, and the passphrase separately from it.

## One-time setup

1. Install the PostgreSQL 17 command line tools.
2. Create the keys: `node Thesis-Backend/scripts/backup/make-keys.js`. Move the private key file to its safe place and
   delete it from the PC.
3. Copy `backup.env.example` to `C:\siteline-backups\config\backup.env` and fill it in. Use port **5432**, not 6543.
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard > Project Settings > API) are needed for the
   Storage files. `BACKUP_API_URL` (for example `https://10buildline.site/api/v1`, or `http://localhost:3000/api/v1`
   while testing) and `BACKUP_WORKER_SECRET` (the same value as in the backend settings) connect it to the Backups
   page. Apply migration `029-backup-monitoring.sql` and set `BACKUP_WORKER_SECRET` in the backend (and Vercel) first.
   The service role key is very powerful, so keep that file private.
4. Test: `node Thesis-Backend/scripts/backup/nightly-backup.js --check`. Every line should say OK.
5. Run one backup by hand: `node Thesis-Backend/scripts/backup/nightly-backup.js`.
6. Prove the key works **before** relying on it: decrypt that first backup with the private key (see below).
7. Schedule it, in PowerShell as Administrator: `Thesis-Backend\scripts\backup\install-task.ps1`. It creates the
   nightly task and the 5-minute request check.

The PC must be on at 02:00. A missed run starts as soon as the PC is back on and online. Allow wake timers in the power
plan if the PC sleeps overnight.

## Restoring

1. Decrypt: `node decrypt-backup.js database\database-YYYY-MM-DD.dump.enc <private-key.pem>` and enter the passphrase.
2. Restore into a **new or test** database, never over the live one without a plan:
   `pg_restore --dbname=<connection string> --no-owner --no-privileges <file>.dump`
3. Storage files use the same format. Decrypt a file with the same command.
4. Delete the decrypted files when finished.

Do a restore test into a scratch database from time to time. The script can check that a dump is readable, but only
someone holding the private key can prove a backup restores.

## Checking that it works

- The Admin Settings > Backups page shows the last backup, the restore history in days and any failure.
- `Get-ScheduledTaskInfo -TaskName "SITELINE Nightly Backup"` shows the last run time and result.
- `C:\siteline-backups\logs\status.json` shows the latest status and any warnings.
- `database\` should gain one `.dump.enc` file each day.

## Not covered

- Supabase Auth and the `storage` schema's metadata are not dumped. The app uses its own login, and Storage objects
  themselves are copied separately.
- Changes made after 02:00 are in the next night's backup. Supabase's own 7 daily backups cover recent days.
- One PC is one copy. For real company use, add a second location.
