# Monthly report backend investigation — 13 November 2026

## Confirmed configured-database findings

Read-only diagnostics against the database selected by `Thesis-Backend/.env`
found Green Cross Department (`481ed6f5-7f45-450e-83b0-a6b394c567e8`),
created 6 November 2026 at 16:06:25.925 Asia/Manila, currently archived.
This observation concerns that configured database; it does not establish the
state of a separately configured deployment.

- `to_regclass('public.monthly_report_baselines')` and
  `to_regclass('public.monthly_report_events')` both returned null.
- No `siteline_report_capture` or `siteline_report_immutable` triggers exist.
  Migration `008-monthly-report-history.sql` has not established reporting
  coverage. The general migration runner deliberately lists 008 as a dedicated
  migration, so running the general runner alone does not install it.
- Current scope contains 29 required activities and 29 approved evidence rows;
  none of those approvals lacks `reviewed_by` or `reviewed_at`. Reconstructing
  **current stored state** gives 290 / 290 (100%) across nine configured phases.
  These current rows do not establish past scope, effective approval transitions,
  withdrawals, or the absence of earlier versions. They cannot replace the
  missing reporting ledger.
- November begins at `2026-10-31T16:00:00.000Z` and ends exclusively at
  `2026-11-30T16:00:00.000Z`. During November the cutoff is the read transaction's
  `now()`. The selected month is valid and the project existed before the observed
  cutoff; reporting boundaries do not explain the missing history.

The GET endpoint correctly returns unavailable historical balances and movement
when those tables are absent. CSV and print export authorize and reuse its signed
snapshot; they do not independently query current progress to fill gaps. The PDF
JavaScript/MIME loading problem is separate and was not investigated here.

## Code changes

- Evaluate balance completeness at atomic transaction boundaries. A checklist
  temporarily removed and restored in one scope revision no longer creates a
  false historical-coverage warning. Committed incomplete scope still does.
- Reconcile scope credit changes from transaction balances and evidence credit
  changes. Include `progress_weighting` in scope detection, suppressing net
  percentage comparisons when weighting changes even if totals match.
- Count effective evidence credit withdrawals without requiring a rework ID,
  including revoked provenance and deleted approvals.
- When simultaneous approval/scope changes prevent reliable attribution, retain
  unavailable movement values and explicitly disclose the limitation.
- A baseline established exactly at the exclusive cutoff cannot supply closing
  progress for that period.
- Bind Site PM detail phase IDs into the signed report and recheck all of them
  on export, including phases represented only by pending counts. Older Site PM
  snapshots without those IDs must be refreshed. Project authorization, role
  binding, Manila boundaries and signed snapshot reuse remain in place.

## Required operational steps — separate from code changes

No configured-database schema or project/history data was changed.

1. Back up the target database. On a local restored copy, review and dry-run
   migration 008 with `node Thesis-Backend/scripts/migrate-monthly-reports.js --dry-run`.
   This command intentionally accepts local databases only. Do not change that
   guard to run it against a remote database.
2. For the intended database, apply the reviewed
   `Thesis-Backend/migrations/008-monthly-report-history.sql` through the deployment
   database migration process. It locks source tables while creating baselines
   and capture triggers; schedule accordingly. For a local database the dedicated
   command supports `--apply`.
3. Verify a baseline for every project, actual `covered_from` timestamps, all ten
   enabled source capture triggers, both immutable-history triggers, service-role
   permissions/RLS, and capture of subsequent approval/scope transactions. Keep
   existing coverage timestamps on reapplication.
4. Refresh previews after deployment; previously signed snapshots intentionally
   retain their original unavailable values until refreshed or expired.

Installation starts prospective coverage at installation time. It cannot make
November's opening or pre-installation movement available. A closing snapshot
after coverage begins may become available if scope is complete. The first full
month after uninterrupted coverage begins can supply complete monthly movement.

No historical data repair is justified by the inspected records. Any future
repair requires independently verified, complete historical scope and approval
transitions, with separately reviewed provenance and coverage. Do not backdate
baselines, infer old approval events from today's approved rows, rewrite the
immutable ledger, or substitute zero for unknown values.

## Validation

Targeted tests cover missing migration/baseline coverage, late and valid coverage,
cutoff exclusivity, whole-transaction cutoffs, atomic and committed scope gaps,
weighting changes, approvals/withdrawals, client visibility, revoked Site PM
assignments, authorization and snapshot consistency for CSV/print exports.

The PGlite integration test applies the real SQL on a disposable database and
checks dry-run rollback, idempotence, unchanged project/evidence records, all ten
capture triggers, real approval/withdrawal/scope/global-stage events, transaction
IDs and rollback, immutable history, and denied authenticated-user ledger access.
