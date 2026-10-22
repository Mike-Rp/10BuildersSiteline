# Hosted deployment checklist

Do not run any step until you have decided to deploy. Nothing here has been run.
Order matters: **backup → database migrations → backend → frontend**. The backend and frontend ship together on Vercel (`vercel.json`), so the database must already be updated when the deploy goes live.

## 1. Backup
- [ ] Take a Supabase backup or point-in-time restore point. Note its time here: ______
- [ ] Confirm which database you are about to change (host and database name in `Thesis-Backend/.env`; never paste the password anywhere).

## 2. Migrations, in order
Run each from `Thesis-Backend`. `npm run db:migrate` applies `001` and `002` once each and records them in `phase_schema_migrations`, so it is safe to re-run.

| # | File / command | What it changes |
|---|---|---|
| 1 | `migrations/001-phase-checklists.sql` via `npm run db:migrate` | Phase checklist templates and project checklist items. |
| 2 | `migrations/002-phase-update-confirmation.sql` via `npm run db:migrate` | Phase update and confirmation tables. |
| 3 | `migrations/003-react-integration.sql` via `npm run db:integrate` | Additive: `stored_files` and other integration tables. Nothing removed. |
| 4 | `npm run db:normalize-types` (dry run), then `CONFIRM_BACKUP=yes npm run db:normalize-types -- --apply` | Moves legacy project types to Residential / Commercial / Mixed-Use. Changes only `project_type_id` and `name`. |
| 5 | `migrations/004-engineer-license-workflow.sql` via `npm run db:license-workflow` (dry run), then `npm run db:license-workflow -- --apply` | Expired-license workflow: adds `license_renewal_requests`, `license_reminders_sent`, `engineer_assignment_history` and `license_overrides`, backfills current holders, adds default `reminderDays`. Adds no column to existing tables. **Must be applied before the backend that uses it is deployed**, because progress approvals, assignment access and the workspace load read these tables. |
| 6 | Set the grace period (Settings, or `update workspace_settings set rules = rules || '{"grace":30}'`) | The default is now 30 days; existing hosted values are never overwritten by the migration. |

For each step: run the dry run, read it, then apply, then run the verify query.

Verify queries (read-only):
```sql
select name, applied_at from phase_schema_migrations order by name;
select column_name from information_schema.columns where table_name = 'project_phase_checklist_items' order by ordinal_position;
select t.code, count(*) from projects p join project_types t on t.id = p.project_type_id group by t.code;
```
Expected after step 4: only Residential, Commercial and Mixed-Use.

## 3. Backend deploy
- [ ] Reminders and the grace-end alert run in the 15-minute maintenance timer, which is **off** unless `ARCHIVE_MAINTENANCE_ENABLED=true`, and Vercel functions cannot keep a timer. They also run (at most once a minute) when any user loads their workspace. For guaranteed delivery on Vercel, add a scheduled call that loads a workspace, or move the sweep to Vercel Cron.
- [ ] Health check after deploy: `GET /api/v1/health` returns `{"ok":true,"database":true}`.
- [ ] Sign in as an Administrator and open a project with a checklist: no "database is missing a required update" message.

## 4. Frontend deploy
- [ ] Push to `main` and wait for the Vercel build to finish and show Ready.
- [ ] Smoke test each role: Administrator, Office PM, Site PM, Client.

## Rollback
- Frontend: promote the previous Vercel deployment.
- Database: restore from the backup in step 1 (migrations here are additive, so most issues need only a code rollback).
