# Construction phase progress

The construction phase modal has three columns: Construction Phase, Approved
Activities, and Phase Status. It displays no percentages, bars, unavailable
counts, or setup statuses. Current Phase and Locked are separate labels.
Text in the modal is at least 14px; the table scrolls horizontally on small screens.
The existing project-wide date comparison outside the modal remains available.

## Totals and evidence

The existing `standardActivities` definitions determine counts by position in
the stored project-type workflow: Mobilization 4, intermediate phases 3, Closeout
4. Residential, Commercial, and Mixed-Use use the same rule. Even an uninitialized
phase displays 0 against its standard total. Project-specific latest evidence
provides approval credit, once per standard activity identity, only when status
is approved and reviewer and review time are recorded. Uploads and rejected or
rework evidence do not earn approval credit.

Additional legacy mandatory documents remain mandatory gates. They do not
inflate the standard displayed total, and all must be approved before a phase
can be Completed or advance. Thus a legacy phase can show 3 / 3 and Ongoing while
an additional legacy mandatory document is missing or rejected.

## Status determination

- Not Started (gray): no evidence, phase file, report, or recorded positive work.
- Ongoing (blue): work has begun and mandatory submissions or approvals are incomplete.
- Pending Approval (amber): every standard and additional mandatory requirement
  has latest pending or valid approved evidence, with Office PM review remaining.
- Completed (green): all standard and additional mandatory evidence is validated.
- On Hold (red): the phase checklist has an explicit `on_hold=true` flag.

Current-phase selection, elapsed time and inactivity do not create a work status.
A hold takes precedence over completion and prevents submissions and handoff.
Future phases remain locked until the existing workflow actually advances;
uploads, reports, evidence submission and review cannot bypass that lock.
Previous phases remain available for corrective work under existing permissions.

## Existing records and rollout

No evidence, approvals, document names, weights, historical progress or audit
records are deleted or overwritten. Active current-phase workspace initialization
and normal checklist initialization append any missing identities using the
existing standard checklist definitions. Existing matching identities retain
IDs, titles, weights and evidence; an existing standard identity marked optional
becomes required again. Additional legacy mandatory requirements remain required.
Unrelated legacy approvals are never copied onto a new standard requirement.
Scope extensions are audited and repeated initialization is idempotent.

Historical phases and inactive projects are not bulk rewritten. Their visible
standard counts use only matching validated evidence; historical completion is
not assumed from cached percentages or former workflow position. Their saved
weighted reporting totals and recorded progress history remain intact.

`Thesis-Backend/migrations/012-construction-phase-hold.sql` adds only
`project_phase_checklists.on_hold boolean NOT NULL DEFAULT false`. It is
idempotent and does not change evidence or progress. Apply it through the normal
database deployment process to store explicit holds. Reads remain compatible
before this migration by treating an absent flag as false. No hold-management
UI, new role permissions or additional status values were introduced.

The earlier optional 007 scope-revision script retires legacy requirements.
It is not needed for this implementation; this implementation instead retains
legacy mandatory documents as approval gates. Code publication does not apply
database migrations, and no hosted database was modified during development.

## Modified files

- UI: `src/ProjectProgress.tsx`, `src/project-progress.ts`,
  `src/project-progress.css`, `src/model.ts`, `src/phase-handoff.ts`.
- Shared domain: `Thesis-Backend/src/domain/construction-phase-progress.js`,
  its `.d.ts`, and `verified-progress.d.ts`.
- Backend: `Thesis-Backend/src/services/progress/phase.utility.js`,
  `verified.utility.js`, `lifecycle.utility.js`, `handoff.utility.js`,
  `checklist-template.utility.js`, `phase.controller.js`,
  `phase-update.controller.js`, and
  `Thesis-Backend/src/services/workspace/project-data.controller.js`.
- Database: `Thesis-Backend/migrations/012-construction-phase-hold.sql`.
- Tests: `tests/construction-phase-progress.test.mjs`,
  `tests/project-progress-ui.test.mjs`, `tests/api-backend.test.mjs`,
  `Thesis-Backend/tests/phase-progress.test.js`,
  `Thesis-Backend/tests/archive.test.js`.
- Documentation: this file and `docs/STANDARD_PHASE_CHECKLISTS.md`.

## Verification

New domain and disposable PostgreSQL tests cover all requested evidence/status
scenarios, every project type, legacy totals, explicit hold persistence,
idempotent migration/reconciliation, preserved evidence/history, and future
submission locks. The modal regression checks exact columns, counts, badges,
absence of phase bars/percentages, and nested-dialog focus and scroll restoration.
The real authenticated API suite additionally exercises independent approval,
stale review tokens, rejected/rework evidence, handoff, archive gates and role scope.

Results: repository test suite 394/394 passed, including all 38 real API checks;
TypeScript checking, production build and phase lint passed. The separate backend
suite passed 87/94. Its seven failing evidence-review tests also fail against the
unchanged baseline because they omit the already-required fresh review token.
No production review-token requirement was weakened to satisfy those old tests.
Production build still reports the existing Vite configuration and bundle-size
warnings. Browser visual verification against a live project was not performed;
UI verification used the rendered React DOM and responsive CSS checks.
