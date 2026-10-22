# Monthly project progress reports

## Audit and historical coverage

The actual application has an Express/PostgreSQL backend; the older demo-only
architecture description in HANDOFF_FOR_CLAUDE_CODE.md is stale.

Existing sources inspected:

| Source | Meaning and limitation |
| --- | --- |
| project_phase_checklists / items | Frozen project scope and required values, but current rows alone cannot establish past denominators. |
| project_phase_evidence | Versions, approval provenance and submitted/reviewed timestamps; current status alone is insufficient for arbitrary past cutoffs. |
| pending_rework_requests / project_rework_activities | Request confirmation and affected activities; correction markers preserve earlier approved evidence. |
| project_progress_history | Checklist review, handoff, issues and client visibility. Its typed/rounded percentages are never a verified reporting balance. |
| audit_log | Existing row snapshots and migration 007 scope revisions are helpful but historical retention/trigger coverage cannot be guaranteed for every installation. |
| projects | Creation, workflow position, lifecycle and archive state. Workflow handoff is distinct from verified checklist completion. |
| client-access.ts / ClientPortal | Existing TXT export is superseded by the report preview entry point; the legacy pure TXT function remains for compatibility. |

Migration 008 creates immutable project baselines and append-only row events.
It freezes current stored scope, evidence and pending queues at installation;
this establishes coverage from that time, NOT from the project's creation date.
Source triggers capture subsequent changes in the same database transaction as
approvals, withdrawal markers, corrected submissions, scope revisions, phase
workflow changes, handoffs and archival. No approvals/evidence are fabricated.
New projects receive a baseline on insertion. Rollback also rolls back events.
Global stage/type-workflow changes are recorded and filtered to each project.

Reports replay the baseline and events, grouping each transaction atomically.
An atomic group takes effect at its final reporting mutation timestamp. Queries
load complete groups, including later rows, so a cutoff cannot split them. This
is event-effective time, not PostgreSQL commit timestamp tracking. Transactions
that remain open across a month boundary without further reporting mutations
retain that effective time when eventually committed; commit-time accounting
would require a separately designed commit/closing ledger.
Opening is immediately before the month starts; closing is before the exclusive
cutoff. Months before coverage show:
“Unavailable — historical approval or scope records are incomplete.”
An incomplete month's available closing snapshot may still be displayed.
Incomplete scope never becomes zero. No future checklist initialization runs
from report generation. Existing archives remain read-only and keep their scope.

Coverage assumes the reporting triggers remain enabled and history is retained.
Do not disable them, bypass them during imports, or delete reporting history.
Changes outside that contract require a newly reviewed coverage baseline;
never claim uninterrupted coverage after a gap.

## Entry points and authorization

- Administrator: Project details → Monthly report. Select among authorized projects.
- Office PM / Site PM: Project Monitoring → Monthly report.
- Client: existing Download progress report → monthly preview.
- No new sidebar module. Underlying project modal, scrolling and focus remain.

GET `/api/v1/projects/:id/monthly-report?month=YYYY-MM` opens a repeatable-read,
read-only transaction and checks current project authorization. Clients require
an active/archived linked project. All inputs are server-validated.
Complete project records are read; calculations never use paginated lists.

Administrator and Office PM receive authorized project activity. Site PMs receive
project aggregate balances/completion plus activity and pending reviews for
their phase assignments. Project-wide approval/rework movement metrics are
unavailable in the Site PM projection, to avoid implying their partial detail is
the full project queue. Clients receive aggregate balances, phase completion and
explicitly client-visible update/handoff history only. They never receive the
internal approval/withdrawal tables, rework reasons, identities or evidence.

## Definitions

- Business reporting timezone: Asia/Manila, centralized in reporting helpers.
- Past months end at next month's first day (exclusive); current month is month
  to date at server transaction time. Future months are rejected.
- Verified percentage: approved required activity value / required scope total.
  Uses shared verified-progress functions; no dates, stage floors, legacy typed
  percentages, rounded phase averages or hardcoded 290/380 totals.
- Approval events: positive earned-value transitions into valid approval,
  including reapproval. Duplicate/no-credit reviews do not count. Distinct
  activity count is also provided.
- Withdrawals: effective negative earned-value transitions tied to rework.
  Unapproved activities and duplicate zero-credit markers do not deduct twice.
- Confirmed rework: distinct requests changing into approved during the period.
- Phases completed: distinct phases reaching verified 100% at a committed
  transaction boundary; shows whether still complete at cutoff. Handoff events
  are separate. Completion withdrawn later is not silently shown as complete.
- Pending reviews: latest pending required evidence, pending reports and pending
  rework requests at cutoff, not today's queue for a past month. Retired optional
  evidence is excluded. Holds are not changed by reporting.
- Scope-change metric counts changed source records (not a count of migrations).
  Required-value changes appear separately from withdrawals. Opening and closing
  denominators are displayed. Net percentage-point comparison is suppressed
  when scope changes, including equal-total substitutions.
- With unchanged scope, closing earned = opening + awarded − withdrawn.
  With scope changes, the movement includes credit gained/lost from scope.

## Export consistency

The GET response includes a role/user-bound HMAC-signed report snapshot, valid
for 30 minutes. No raw baseline, private ledger or authentication information
is included. POST `/projects/:id/monthly-report/export` accepts the snapshot
and `format: csv | print`, verifies integrity/expiry/identity, rechecks project
access and Site PM phase access, then exports the SAME snapshot. Refresh generates
a new cutoff rather than silently changing an open preview. No project records
are written when previewing, refreshing or exporting reports.

CSV quotes every field, doubles quotes, retains Unicode/newlines and neutralizes
spreadsheet formulas. Client CSV omits staff sections entirely. Print opens the
browser print dialog on an isolated print document with table headings and dates;
choose Save as PDF. This is not a direct or certified PDF download.
Deploy frontend/backend together; the signing key uses the existing JWT_SECRET.
Changing it invalidates older report snapshots. Snapshots are not public links.

## Local migration and hosted rollout

Prerequisites: existing base/001–003, approved type workflows and verified schema
(004 recovery). Apply reviewed scope migrations such as 007 BEFORE establishing
the baseline if that is the intended starting scope. Later revisions are tracked.
Use a disposable local database, not the current hosted backend configuration.

From the repository root:

```powershell
node Thesis-Backend/scripts/migrate-monthly-reports.js --print-dry-run
# Configure DB_* to your disposable localhost copy before either command:
node Thesis-Backend/scripts/migrate-monthly-reports.js --dry-run
node Thesis-Backend/scripts/migrate-monthly-reports.js --apply
```

The runner refuses non-loopback hosts before connecting. Dry-run rolls back all
DDL and baselines. Reapply preserves original coverage timestamps and records.
Only SELECT/INSERT is granted to service_role on the new RLS-enabled tables;
browser anon/authenticated and PUBLIC receive no table permissions. Immutable
triggers reject UPDATE/DELETE/TRUNCATE. Existing policies are untouched.

Backend deployment owner: back up → test 008 on a local copy → review the
baseline report and trigger coverage → apply the reviewed SQL explicitly using
normal deployment controls → verify → deploy matching code. Git push does not
apply SQL. No hosted migration is executed by this work.

```sql
SELECT count(*),min(covered_from),max(covered_from) FROM monthly_report_baselines;
SELECT source_table,count(*) FROM monthly_report_events GROUP BY source_table;
SELECT tgrelid::regclass,tgname FROM pg_trigger
WHERE tgname IN ('siteline_report_capture','siteline_report_immutable');
SELECT tablename,policyname FROM pg_policies WHERE tablename LIKE 'monthly_report_%';
```

Without 008 the preview remains available with honest unavailable historical
states. No automatic baseline installation or hosted writes occur on a GET.

## Manual local verification

1. Open a project as Administrator and select a month; check dates/limitations.
2. Open an assigned project as Office PM; approve one required activity. Refresh
   the report and verify closing value changes once. With full-period coverage,
   verify approval count/movement; otherwise opening/period counts stay unavailable.
3. Confirm targeted rework, upload correction and reapprove; verify one withdrawal
   and one reapproval, retained evidence and existing automatic handoff behavior.
4. As Site PM check only authorized phase detail is returned; another project is
   refused. As Client verify no review/rework sections or internal fields in JSON.
5. Export CSV and print from the same preview. Revoke access and verify export
   is refused. Refresh or change month, then ensure exports use the new snapshot.
6. Close the report and confirm focus/scroll return to Project Monitoring.
7. Choose a historical month before coverage: no invented past balances or queues.

Automated tests use PGlite and exercise dry run, repeat migration, immutable
events, timeline replay, role projections, snapshot authorization, CSV/print,
period boundaries and modal behavior. See completion report for actual run results.

## Implementation verification

- Full application suite: 268 passed, 0 failed.
- Backend suite: 86 passed, 0 failed.
- TypeScript: passed. Backend phase lint plus targeted report/domain lint: passed.
- Production build: passed; existing Vite configuration/chunk-size warnings remain.
- Final report/domain/modal checks after scope validation refinement: 8 passed.
- Disposable migration dry run: 7 project baselines, 0 new history events;
  DDL rolled back. Local apply/reapply retained the original coverage timestamps,
  evidence and project percentages. Transactions rolled back without ledger events.
- No hosted database connection/migration, commit or push was performed.
- Existing unrelated app.js / vite.config.ts and separately edited 004 recovery
  migration/test changes were preserved. Only the schema-contract test's monthly
  migration setup was added for this feature.
