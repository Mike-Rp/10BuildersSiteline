# Independent notifications — Stage 1 review

Status: implemented in the local working tree; migration dry-run only. Not staged, committed, pushed, or deployed. No hosted database connection was opened. There is no configured persistent local database. Stages 2–6 have not been implemented.

## Change manifest

New files:

- `Thesis-Backend/migrations/011-independent-notifications.sql`: independent message storage, indexes, server-only grants/RLS, legacy copy, removal of the legacy recipient audit trigger.
- `Thesis-Backend/scripts/migrate-notifications.js`: `migrateNotifications`; local-only CLI, dry run by default, preservation report, optional validation inside the rolled-back transaction.
- `Thesis-Backend/src/services/notifications/notification.utility.js`: storage readiness, creation, migration bridge, recipient-scoped listing/read/dismiss, internal wording revision and task resolution, legacy read synchronization.
- `Thesis-Backend/src/services/notifications/controller.js`: `getNotifications`, `markRead`, `dismiss`; authenticated identity is always the recipient.
- `Thesis-Backend/src/services/notifications/routes.js`: three HTTP routes; no resolution, wording-edit, or delete endpoint.
- `Thesis-Backend/tests/notifications.test.js`: disposable database and localhost HTTP tests, including real authentication queries and renewal controller transactions.
- `docs/NOTIFICATIONS_STAGE_1.md`: this review record.

Existing files changed:

- `Thesis-Backend/src/app.js`: mount V2 notification routes before legacy workspace routes.
- `Thesis-Backend/src/common/utilities/notify.utility.js`: `notify` retains legacy behavior and creates independent recipient copies after migration.
- `Thesis-Backend/src/services/workspace/routes.js`: `event` mirrors new messages; the legacy read endpoint synchronizes new read state.
- `Thesis-Backend/src/services/accounts/license-sweep.utility.js`: mirror reminders created by the older sweep.
- `Thesis-Backend/src/services/licenses/renewal.controller.js`: correlate new review notifications with the renewal request; resolve on verified/rejected in the same transaction.
- `Thesis-Backend/src/services/licenses/override.controller.js`: correlate new reassignment notifications with the override; resolve on accepted/declined in the same transaction.
- `Thesis-Backend/src/services/licenses/sweep.js`: resolve pending reassignment messages when their response window expires.
- `tests/activity-migration-contract.test.mjs`: prepare the new backend SQL inside the notification migration dry run, using savepoints for individual preparation failures. The new schema is rolled back afterward.

No frontend files, unrelated workflows, existing seeds, or existing backend phase tests were changed.

## Database objects

New `public.notifications` columns:

`id`, `recipient_user_id`, `type`, `title`, `message`, `link`, `priority`, `related_project_id`, `activity_log_id`, `created_at`, `read_at`, `dismissed_at`, `resolved_at`, `resolved_reason`.

Additional transition/correlation columns:

- `subject_type`, `subject_id`: stable business-record identity for server resolution; paired nullability check.
- `legacy_key`: `activity:<id>`; unique together with recipient. This prevents duplicate migration copies without restricting future independently created messages.
- `legacy_snapshot`: original `is_read`, `read_at`, nullable detail, and creation timestamp. Preserves inconsistent historical read fields exactly.

For an old `is_read=true` row with no `read_at`, the effective new read time uses the old update/creation/event timestamp; the original null is retained in `legacy_snapshot`. An old unread row remains unread even if it had a stale timestamp. Null detail becomes an empty display message, with the original null preserved in the snapshot.

The migration copies every legacy recipient, including clients if present. It does not infer recipients from Admin's old global event feed. It leaves `activity_log`, `audit_log`, `notification_recipients`, and all business data intact.

The only existing trigger removed is `trg_audit_notification_recipients`. Historical audit rows remain. No business-audit trigger is attached to `notifications`. Its independent text, read/unread, dismissal and resolution changes do not update activity entries or create audit records.

Browser roles `anon` and `authenticated`, and `PUBLIC`, receive no access. The trusted `service_role`, if present, receives SELECT/INSERT/UPDATE plus sequence access and an RLS policy. No DELETE privilege is granted. Actual backend connection ownership/grants are unverified because there is no persistent local database and hosted inspection is prohibited.

## HTTP contract

All routes require a valid current account session. Admin has no recipient override. Supplied recipient IDs are not used for authorization.

| Method | Route | Input / output |
| --- | --- | --- |
| GET | `/api/v1/notifications/v2?limit=20&offset=0&archived=false` | Envelope `data` contains `notifications`, `total`, `unread_count`, `limit`, `offset` |
| PATCH | `/api/v1/notifications/v2/:id/read` | `{ "read": true }` or `{ "read": false }` |
| POST | `/api/v1/notifications/v2/:id/dismiss` | Archives the addressed message; repeat calls preserve the first dismissal time |

Limits: 1–100 rows; nonnegative integer offset; explicit boolean read state. Another recipient's ID returns 404, including for Admin. Responses are private/no-store.

Unread count covers the recipient's messages that are unread, not dismissed, and not resolved, independent of pagination. Resolved messages remain in the normal list and retain their read state. Dismissed messages are available with `archived=true`.

`createNotification` can create a message without any log entry. `reviseNotification` can change its wording/link independently. Only root-relative links without backslashes, whitespace or control characters are accepted. The Stage 5 frontend still needs to implement link navigation and recheck destination permissions.

`resolveNotifications` is an internal helper invoked from a business transaction using an exact subject type and ID. It has no HTTP route. Reading or dismissing a notification does not complete or resolve the underlying task. Resolution is idempotent and preserves its first reason/time.

## Transition limitations

- The existing frontend still uses the legacy notification/read routes and combined event feed. This is intentional until Stage 5.
- Before the approved migration exists, legacy producers/read routes retain their old behavior. V2 returns 503 with a migration-required message; it never silently substitutes log entries.
- After migration, existing event producers create independent copies, and legacy/V2 read changes synchronize during transition. Dismissed/resolved state is available in V2; the old combined activity feed does not implement those UI states.
- New renewal and override tasks have verifiable record IDs and automatic resolution. Old messages without record identifiers are not matched by names or wording. Further event/task correlations belong to Stage 3.
- Client progress-history notices remain on their current frontend flow; those synthetic notices are not `notification_recipients` rows. Their conversion is required before the Stage 5 client switch.
- `notification_recipients` cannot be retired yet: old UI routes, dual writes, seeds, and tests still use it. It is not dropped in this task.
- This stage does not make either log immutable or add complete event coverage/hash verification. Those remain Stages 2–4.

## Actual local dry run

Source: a disposable in-memory PostgreSQL fixture, not the user's existing data. The new migration and all module checks ran inside BEGIN/ROLLBACK, with no commit. Tests verify that the new table disappears and the legacy trigger/data are restored after rollback.

```json
{
  "mode": "dry-run (rolled back)",
  "before": { "activity_rows": 9, "audit_rows": 345, "legacy_rows": 20 },
  "after": {
    "activity_rows": 9,
    "audit_rows": 345,
    "legacy_rows": 20,
    "notification_rows": 20,
    "legacy_audit_triggers": 0
  },
  "legacy_rows": 20,
  "mapped_rows": 20,
  "missing_rows": 0,
  "source_read_state_differences": 0,
  "current_text_differences": 0
}
```

Re-running SQL inside the same dry run preserves changed notification wording/read/dismissal/resolution state and creates no duplicate migrated rows. Reported differences on a later migration rerun can legitimately reflect subsequent message edits or legacy read changes; rerunning never overwrites them.

The CLI was also invoked against the current configuration and refused its non-local host before opening a connection. It reuses the existing localhost guard, whose message mentions verified-progress migrations. No hosted override is supported by this runner.

## Validation and localhost reproduction

- Type check: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed; existing Vite configuration/chunk warnings remain.
- Application suite: 384/384 passed; static backend SQL contract prepared 460 statements with notification schema rolled back afterward.
- Focused notification suite: 8/8 passed. Tests include owner isolation over real localhost HTTP, unread totals, read/unread, dismissal, standalone messages, independent wording, migration preservation/re-run, grants, real renewal verification/rejection resolution, and rollback of the business action when resolution fails.
- Full backend suite: 87 passed, 7 failed (94 total). The same seven Stage 0 failures remain in `tests/phase-progress.test.js` at lines 179, 192, 218, 233, 427, 445 and 623; these older mocks omit the required evidence review token. No existing backend test was edited to hide them.
- Targeted Node ESLint configuration: passed for all changed/new backend JavaScript.
- Repository-wide backend lint: the existing 150 errors remain. Root frontend has no lint script. No unrelated lint cleanup was performed.
- `git diff --check`: passed. No staging, commit, push, stash, reset or discard.

To reproduce the rolled-back module/localhost checks without a persistent database:

```powershell
cd Thesis-Backend
node --experimental-test-module-mocks --test tests/notifications.test.js
```

The suite creates only an in-memory database, opens a random loopback HTTP port, exercises the endpoints and real authentication SQL, and closes both. Its new migration is never committed.

For a future persistent local database, first configure an explicit `localhost`, `127.0.0.1` or `::1` connection and inspect the actual backend role. Then run `node scripts/migrate-notifications.js --dry-run` and review that database's own preservation counts. Do not run `--apply` until the user says **apply local**. Do not point this runner or any manual SQL at the hosted database.

Stage 1 stops here for review. No persistent database migration has been applied.
