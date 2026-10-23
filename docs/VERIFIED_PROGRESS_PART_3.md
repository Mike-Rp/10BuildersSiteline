# Verified activity progress — Part 3: targeted rework

## Behavior

Site PMs select affected checklist activities in the current phase and explain the
issue. Reporting alone awards or removes no credit. Office PMs can dismiss with a
reason, preserving approvals, or select linked activities requiring correction and
confirm a server-calculated impact preview with a required reason.

For phase/project totals, the loss is the currently approved required value selected
for withdrawal divided by the respective stable required total. Severity supplies no
numerical deduction. Pending, missing, optional, rejected, and already-withdrawn
activities produce no additional numerical loss. No phase or project denominator is
changed and unaffected approvals remain valid.

Confirmation appends a `rework_required` evidence version. Original approved evidence,
file references, reviewer, date, and reason are retained unchanged. The current state
therefore earns zero. Confirming an overlapping issue cannot deduct the same approval
again. Link records distinguish the original withdrawn evidence from the newly added
correction marker.

Corrected evidence must be uploaded as a fresh file owned by the submitting SPM and
belonging to the same project/phase. The original file cannot simply be reused. A new
pending evidence version retains the rework reference and reason; upload restores no
credit. Fresh Office PM approval restores credit once through Part 2's existing
individual evidence review. Rejection and further corrections preserve version history.

Requests are limited to the current phase of an active project. Pending issues block
phase advancement. Archived projects and requests left in a different phase cannot
be reopened by this flow. The broader lifecycle consolidation remains Part 4.

## Permissions and integrity

- Existing project-specific review access is retained. Only an authorized Office PM
  can confirm the new withdrawal operation; Administrator receives no new withdrawal
  authority. Existing authorized Administrator dismissal/read access remains.
- SPMs flag issues and supply corrections; they cannot withdraw or restore approval.
- Client responses contain none of the rework links, reasons, activity records, or
  private event history. Existing document/photo access remains unchanged.
- The server validates linked project, phase, activity, evidence, and file relationships.
- Preview tokens cover the selected activities, current evidence identities/states,
  values, and progress totals. Stale and already-resolved decisions are rejected.
- Project/request locks and the existing transaction ensure evidence markers, request
  resolution, compatibility percentage changes, and private history either all persist
  or all roll back.
- All linked activities, original approvals, correction markers, reasons, actors, and
  timestamps remain in the database. No legacy record is rewritten into a new approval.

Legacy reports without activity links can be dismissed with an explanation or replaced
by a targeted report. They cannot trigger a guessed phase-wide reset. Dismissal does
not require reconstructing a missing numerical scope.

## Where to use it on localhost

Prerequisite: the earlier integration/project-type/value migrations and migration 005
must be applied to a verified local database. No existing database has been migrated
by this implementation.

1. Site PM → Active Sites → project → activity/progress submission.
2. Select an issue category, affected current-phase activities, and enter the reason.
   Optional supporting evidence keeps its existing private access rules.
3. Office PM → Rework & approvals → Rework / issues → Review rework impact.
4. Select linked activities requiring correction, inspect phase/project fractions,
   percentages and percentage-point losses, enter the decision reason, and confirm.
5. Alternatively dismiss the request with a reason; approvals remain unchanged.
6. Site PM returns to the activity checklist. “Rework required” and the Office PM's
   reason are shown beside the affected activity. Use Upload corrected evidence.
7. Office PM → QA/QC evidence → review the corrected submission and approve it.
8. Confirm that credit returns once, unaffected activities remain approved, and original
   evidence/reviews are preserved. A stale preview must be closed and refreshed.

If complete project scope is missing, the project impact remains honestly unavailable;
valid phase impact is still shown. New project-type phases are never assumed completed.

## Migration

`Thesis-Backend/migrations/005-targeted-rework.sql`:
- Adds the `rework_required` evidence state and a rework-request reference.
- Adds `project_rework_activities` with project/phase/activity foreign keys and protected
  access matching the backend-only data pattern. Existing table RLS is not changed.
- Does not alter activity values, required totals, existing approvals, files, histories,
  assignment ownership, or existing project statuses.

`Thesis-Backend/scripts/migrate-targeted-rework.js` defaults to a transactional dry run,
rejects non-loopback database hosts before connecting, and supports repeat execution.

```text
node Thesis-Backend/scripts/migrate-targeted-rework.js --dry-run
```

Review dry-run results and obtain approval before applying `--apply` to an existing
local database. Do not run it against hosted records.

Disposable-database dry-run output:

```json
{"mode":"dry-run (rolled back)","templates":26,"project_activities":11,"evidence_rows":6,"history_rows":12,"default_value_activities":11,"rework_links":0}
```

The test verified rollback removes the new column, and applying/rerunning only inside
the disposable database preserves existing evidence/history and percentages.

## Changed files

- `Thesis-Backend/migrations/005-targeted-rework.sql`
- `Thesis-Backend/scripts/migrate-targeted-rework.js`
- `Thesis-Backend/src/services/progress/rework.controller.js`
- `Thesis-Backend/src/services/progress/controller.js`
- `Thesis-Backend/src/services/progress/routes.js`
- `Thesis-Backend/src/services/progress/phase-update.utility.js`
- `Thesis-Backend/src/services/progress/phase-update.controller.js`
- `Thesis-Backend/src/services/progress/phase.controller.js`
- `Thesis-Backend/src/services/progress/phase.utility.js`
- `Thesis-Backend/src/services/progress/phase-submission.utility.js`
- `Thesis-Backend/src/services/workspace/project-data.controller.js`
- `src/model.ts`, `src/workflows.ts`, `src/api/adapter.ts`, `src/api/actions.ts`
- `src/ReworkReview.tsx`, `src/RoleWorkspace.tsx`
- `Thesis-Backend/tests/phase-progress.test.js`
- `tests/api-backend.test.mjs`, `tests/verified-progress-db.test.mjs`
- `tests/rework-review-ui.test.mjs`, `tests/ui-smoke.mjs` (local test migration setup)
- `docs/VERIFIED_PROGRESS_PART_3.md`

## Remaining scope

Parts 4 and 5 remain: unify all lifecycle checks and integrate the compact verified
progress presentation across roles. Historical/current-phase compatibility fields
and the unused legacy frontend fixture engine are not relabeled as authoritative
verified project progress by this part. No commit, push, hosted access, or existing
database migration is performed. Pre-existing backend diagnostic/Vite edits are preserved.

## Verification results — October 21, 2026

- Application regression suite: 238 passed, zero failures/skips.
- Backend regression suite: 78 passed, zero failures/skips.
- TypeScript `tsc --noEmit`: passed.
- Targeted lint of the changed backend controllers, utilities and migration runner: passed.
- Production build: passed, with existing Vite configuration/chunk-size notices.
- `git diff --check`: passed.

The real API tests use disposable PostgreSQL and a local Express server. They cover
no deduction on flag/dismissal, selected-only loss, stable totals, preserved original
approval, overlapping requests without duplicate deductions, stale/duplicate decisions,
required reasons, invalid/out-of-phase activity selections, pending-issue handoff hold,
fresh-file correction, zero credit until approval, single restoration, Administrator/SPM
restrictions, archived/cross-phase protection, private client projection, and complete
rollback after a deliberately failed audit insert.

The UI test covers before/after values, percentage-point loss, checkbox-driven preview
updates, zero deduction for an unapproved activity, required reasons, unchanged dismissal,
and disabled resubmission after a failed save. Existing evidence viewer and component
regressions passed. The standalone browser smoke suite was not run; its disposable
database setup was updated for migration 005.
