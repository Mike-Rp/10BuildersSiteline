# Hosted deployment checklist: verified activity progress recovery

Prepared for the backend teammate. **No hosted connection or migration was made
by this task. No commit, merge, push or deployment is authorized by this report.**

This file did not exist in the inspected checkout, so there was no existing
"missing weight migration" placeholder to replace. The concrete recovery file is
`Thesis-Backend/migrations/004-verified-activity-progress.sql`.

## Security fix: license routes, uploads and daily license reminders

Deploy this together with, or before, the verified-progress recovery. **It needs
no database migration.** It changes only backend code and `vercel.json`.

### What was wrong and what changed

- `POST`/`PUT` `/api/v1/engineer/licenses` worked with no login, and the update
  built its SQL from request text (SQL injection). Every `/licenses` route (both
  `/engineer` and `/accounts`) now requires an administrator. `/certifications`
  and the two `/projects/intake/upload-*` routes also require an administrator.
- The license and contract updates use a fixed column list with bound parameters.
  The license id and contract id must be UUIDs, the expiry must be a real
  `YYYY-MM-DD` date, the license number is at most 120 characters, and sort
  direction in list queries is limited to ASC or DESC.
- `authenticate()` now checks the JWT signature and expiry, the stored session,
  the account status and the deleted flag (same rules as `getCurrentUser`). An
  expired session can no longer be renewed through `PUT /api/v1/auth`.
- Upload folder names are limited to letters, digits, `_` and `-`; uploads accept
  PDF, JPG and PNG only, up to 15 MB.
- `/api/v1/health` returns only `ok`/`database` again. The temporary block that
  returned the database host, user, password length and a password fingerprint
  is removed. **If a build containing that block was ever deployed, treat the
  database password as exposed and rotate it.**
- Repeated failed sign-ins are blocked with HTTP 429 (10 failures per 15 minutes,
  per address and per email). Each serverless instance counts separately, so this
  slows guessing but is not a hard global limit.
- Hosted 500 responses no longer return raw database error text, and
  `/api-docs` is not served in production unless `ENABLE_API_DOCS=true`.

### New environment variables (Vercel project settings, Production)

| Name | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | **Yes** | Protects `/api/v1/cron/license-sweep`. Vercel Cron sends it as `Authorization: Bearer <value>`. Without it every cron call is refused with 401. |
| `CORS_ORIGINS` | No | Comma-separated browser origins allowed to call the API. Unset keeps the current open behavior. |
| `ENABLE_API_DOCS` | No | `true` serves `/api-docs` in production. |

Create `CRON_SECRET` privately, at least 32 random characters, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste it into Vercel (Settings → Environment Variables → Production). Never put
it in Git, chat or `.env.example`. Environment changes apply only to new
deployments, so redeploy after adding it.

### Automatic license reminders

The manual "Notify engineer" button is removed; reminders are now automatic.
`sweepLicenses` finds Office PM and Site PM accounts (active or still invited)
whose PRC license is missing, has no uploaded document, is expired or expires
within 90 days (the same window the app labels "Expiring soon"). It adds an
in-app notice for that person and every active administrator. It runs:

- **Right after a license is saved** (account workspace save, add license, PRC renewal),
  for that account only.
- **When notifications load**, at most every 30 minutes per server process, on the
  request's own database connection, so it never blocks or fails the request.
- **Daily by Vercel Cron**, `GET /api/v1/cron/license-sweep` at 22:00 UTC (06:00
  Philippine time), as a backstop. Vercel runs crons only on the production
  deployment; confirm the job is listed in Settings → Cron Jobs after deploy.

A reminder is not repeated: expired and expiring licenses remind once per expiry
date; missing and undocumented ones once per month. Saving a license with a new
expiry date creates a new reminder.

### Verify after deploying

```powershell
# Expect 401 (no login):
curl.exe -s -o NUL -w "%{http_code}
" -X PUT https://<site>/api/v1/engineer/licenses/00000000-0000-4000-8000-000000000000
# Expect 401 (no or wrong secret):
curl.exe -s -o NUL -w "%{http_code}
" https://<site>/api/v1/cron/license-sweep
# Expect only {"ok":true,"database":true}:
curl.exe -s https://<site>/api/v1/health
```

Calling the sweep **with** the secret (HTTP 200) creates real notifications, so
do that deliberately, once, and only if you want today's reminders to go out.

Local regression coverage: `tests/license-security.test.mjs` (run with
`npm test`). It uses a throwaway in-memory database only.

## Confirm the revision and database first

- Working branch: `part-4-lifecycle-checks`, created from Part 4 commit `de158ce`.
  Its ancestors include `d0662ec`, `ea4ed5b` and `3d3027e`.
- Review and approve this uncommitted recovery change before committing it to
  that branch. Do not push or merge it into main without separate approval.
- The repository already had `004-verified-activity-values.sql`,
  `004-project-type-workflows.sql` and `005-targeted-rework.sql`. A file existing
  in Git does not mean its SQL was applied to the deployment database.
- Apply this named recovery file explicitly. **Do not use `db:migrate` or run
  every numbered file for this recovery.** The older type migration remaps data;
  the older rework migration drops/replaces a constraint. Neither is part of
  this additive recovery procedure. Do not apply the older values/rework files
  afterward as additional prerequisites.
- Required baseline: the existing project schema plus phase migrations 001, 002
  and 003. Do not re-run the seed or historical data-changing migrations on
  production. An existing integer weight is supported; an existing
  double-precision weight causes this recovery to stop for separate review.
- If project-type mappings already exist, they are preserved. Where no mapping
  exists, recovery inserts the original seven-stage lookup defaults. It does
  not silently expand historical projects to 9/9/12 phases, invent assignments,
  add project activities, or mark anything approved. Review any separate
  project-type rollout independently.
- The connection must be the database actually used by Vercel. Check deployment
  environment configuration privately; never paste secrets into chat or Git.
  The migration role needs DDL authority. The backend runtime needs its existing
  baseline privileges and access to the new private tables (owner or correctly
  configured trusted server role). Browser roles receive no table privileges.

## Exact execution order

**Backup → 004 dry run → 004 apply → verify → confirm live site → merge
part-4-lifecycle-checks to main after approval → verify the new deployment.**

Commands below are for the backend teammate to run from the repository root.
They assume a privately configured libpq service named `siteline-hosted` that
points to the intended database with the approved credentials and TLS settings.
Configure that service outside the repository first. These commands were not
executed against a hosted database by Codex.

### 1. Backup

Choose a private backup location outside Git and verify the backup completes:

```powershell
pg_dump --dbname="service=siteline-hosted" --format=custom --file="siteline-before-verified-004.dump"
if ($LASTEXITCODE -ne 0) { throw "Backup failed; stop." }
pg_restore --list "siteline-before-verified-004.dump"
if ($LASTEXITCODE -ne 0) { throw "Backup could not be read; stop." }
```

Retain a copy of the migration's before/after outputs and confirm the team's
restore procedure. Pause staff approval/rework/handoff writes during execution
and verification so concurrent activity cannot obscure comparisons.

### 2. Read-only baseline capture and 004 dry run

Capture schema state and business-row counts before running DDL:

```sql
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
AND table_name IN ('phase_checklist_templates','project_phase_checklist_items','project_phase_evidence')
ORDER BY table_name,ordinal_position;
SELECT count(*) AS evidence_rows FROM public.project_phase_evidence;
SELECT count(*) AS history_rows FROM public.project_progress_history;
SELECT count(*) AS checklist_rows FROM public.project_phase_checklist_items;
SELECT count(*) AS scope_snapshots FROM public.project_phase_checklists;
SELECT id,current_stage_id,current_pct,lifecycle_status FROM public.projects ORDER BY id;
```

Generate a dry-run script locally. This mode reads SQL files only; it does not
read database credentials or open a connection. It wraps the exact migration
body and verification queries in BEGIN / ROLLBACK:

```powershell
node Thesis-Backend/scripts/check-activity-progress.js --print-dry-run | Set-Content -Encoding utf8 verified-004-dry-run.sql
if ($LASTEXITCODE -ne 0) { throw "Dry-run generation failed; stop." }
psql -X --set=ON_ERROR_STOP=1 --dbname="service=siteline-hosted" --file="verified-004-dry-run.sql"
if ($LASTEXITCODE -ne 0) { throw "Dry run failed; stop." }
```

Expect rollback, integer / NOT NULL / default 10 for both weight columns,
positive checks, rework link keys/indexes, and the compatibility trigger. Existing
scope, approvals, evidence, history and stored progress must be unchanged after
rollback. The additive DDL still takes locks during the dry run; use the agreed
maintenance window. If a check fails, stop; do not run a destructive conversion.

### 3. Apply exactly the reviewed recovery migration

Only after the teammate reviews successful dry-run output:

```powershell
psql -X --set=ON_ERROR_STOP=1 --dbname="service=siteline-hosted" --file="Thesis-Backend/migrations/004-verified-activity-progress.sql"
if ($LASTEXITCODE -ne 0) { throw "Migration failed; stop." }
```

This file commits atomically and is safe to re-run. It does not fabricate
approvals from typed percentages and does not rewrite historical evidence.
Do not put a backup/seed import into this step.

### 4. Verify

```powershell
psql -X --set=ON_ERROR_STOP=1 --dbname="service=siteline-hosted" --file="Thesis-Backend/scripts/verify-activity-progress.sql"
if ($LASTEXITCODE -ne 0) { throw "Verification failed; stop." }
```

Essential results:

```sql
SELECT table_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND column_name='weight'
AND table_name IN ('phase_checklist_templates','project_phase_checklist_items');
-- Two rows: integer | NO | 10.

SELECT to_regclass('public.project_rework_activities'),
       to_regclass('public.project_type_stages'),
       to_regprocedure('public.siteline_normalize_rework_status()');
-- All present.

SELECT count(*) AS invalid_values FROM public.project_phase_checklist_items
WHERE weight IS NULL OR weight<=0;
-- 0.
```

The supplied verification file also lists constraints, indexes, RLS policies and
the enabled trigger. Compare the baseline evidence/history/scope/project values
again. Existing business rows and values must be unchanged. Activity values may
now have the safe default 10; new workflow lookup defaults may exist for types
that previously had none.

For newly created tables, `verified_server_only` denies PUBLIC and
`verified_service_access` allows the trusted `service_role` with
SELECT/INSERT/UPDATE. PUBLIC, anon and authenticated have no table privileges.
Existing tables' policies/ACLs are preserved. The new trigger uses SECURITY
INVOKER and a fixed search path; PUBLIC has no direct execute grant.

### 5. Confirm the currently deployed live site

Have authorized users sign in as Administrator, Office PM, Site PM and Client.
Check browser network responses and Vercel backend logs for the missing-weight
error. Inspect staff project overview, monitoring, checklists and approval queues.
Use a designated test project for approval/rework tests; do not alter customer
records merely to test the migration.

The compatibility trigger accepts the already-deployed rework writer's
`rework_required` insert and stores a reviewed rejection linked to its request
before the old CHECK runs. This preserves zero credit and fresh-review rules.
The compatibility API projections in this branch restore the explicit
"Rework required" label consistently; do not assume the old deployed browser
already has those projection changes.

**Client display limitation:** Parts 1–4 deliberately omit new client-safe
weighted aggregates. Client navigation/documents can be checked now, but complete
verified fractions/percentages in the Client portal and reports remain Part 5.
Do not label legacy or phase-local values as newly verified project totals.

### 6. Review, merge and deploy the Part 4 branch separately

After explicit user approval, commit the recovery changes to
`part-4-lifecycle-checks`. Review/merge that branch to main using the team's
normal approval process. The agent has not performed these actions.

After Vercel deploys the merged revision, recheck logical Rework required labels,
individual activity review, targeted withdrawal/correction/reapproval and the
Part 4 rules: current phase verified 100%, confirmed assignments, resolved
blocking reviews, and all-phase verified 100% for project completion.

If something fails, keep staff writes paused, preserve logs and backups and
investigate. Do not drop the added schema to roll back code; historical rework
references may already depend on it. Use the team's reviewed restore procedure
only when required, accounting for any writes made since the backup.

## Local verification and audit artifacts

- Full dependency audit, catalog types/objects, complete SQL and actual dry-run
  output: `docs/VERIFIED_PROGRESS_SCHEMA_AUDIT.md`.
- Reproduce that report without credentials:
  `node scripts/audit-activity-schema.mjs`.
- Local-only dry run/apply/check runner:
  `node Thesis-Backend/scripts/check-activity-progress.js --dry-run`
  (or `--apply` / `--check`). It refuses non-loopback DB_SERVER values before
  connecting. Do not use that runner to connect to hosted data.
- Regression: `tests/activity-migration-contract.test.mjs` prepares static SQL
  against only base + 001–003 + recovery, rejects missing tables/columns, checks
  repeatability, preserves existing records and tests the old writer bridge.
- Actual results and remaining lint/display limitations:
  `docs/VERIFIED_PROGRESS_RECOVERY_RESULTS.md`.
