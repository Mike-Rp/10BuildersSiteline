# Independent SPM workspaces — implementation and QA report

Date: 2026-11-08

## Inspection

Inspected the React workspace modal, engineer allocation/responsibility panels, API mapping and upload controls; Node authorization, checklist submissions, evidence/report reviews, rework and handoff; repository Supabase schema/migrations; and the configured PostgreSQL database through read-only schema and compatibility checks.

Existing reusable functionality:

- Shared checklist snapshots, weighted verified progress, phase sequencing, Office PM QA/QC, project Lead SPM, history and file ownership.
- Multiple engineer responsibility assignments and separate completion review records already existed in migration 020.
- The attachment control already selected several files, but checklist saves submitted them separately.

Single-SPM limitations identified:

- Checklist reads and review supersession used the latest evidence for the whole requirement.
- One pending-report index and the corresponding API check blocked every other SPM in a project.
- Project membership permitted writes outside the user's assigned active phase.
- The workspace modal checked only the legacy single assignment pointer.
- Diary entries and gallery photographs lacked phase references.

## Resulting behavior

The existing responsibility rows are peer SPM assignments. Project Lead SPM behavior and the legacy assignment pointer remain compatible; the allocation UI no longer labels one peer a phase coordinator.

Each assigned SPM submits against the same checklist item IDs, with separate evidence ownership, versions, review state and optional multiple attachments. Definitions are never copied per SPM. The existing percentage/weight formulas now operate over each applicable SPM's required submissions. Legacy phases without responsibility rows retain their existing single-SPM evidence interpretation.

Backend transactions retain the existing project-row lock. Exact assignment ownership, confirmation, active phase, phase hold and individual approved completion are checked on writes. Upcoming and past phases reject new submissions. Approving one SPM completion freezes that workspace while peers remain able to work. The existing handoff gates require all applicable assignments and checklist submissions to be approved.

Office PM screens expose each SPM's approved/required counts, missing requirements and completion status. Evidence review can preview every file in one submission. Pending reports are listed and reviewed individually. Rework targets the reporting SPM's submission while calculating its impact against the full phase/project totals. Peer SPMs retain read-only archived project and evidence access after the existing engineer-release workflow. Site diary and photo records retain their author and new phase references; reusing a photograph in another phase cannot relabel the historical photo row.

## Migration

Only new migration: **Thesis-Backend/migrations/025-independent-spm-workspaces.sql** (requires migration 020).

- Adds the evidence-to-files junction, retaining the existing first-file field for compatibility.
- Links existing non-null evidence files without rewriting evidence rows.
- Adds an index for the latest evidence per requirement and SPM.
- Replaces the project-wide pending report index with a per-project/phase/SPM index.
- Adds nullable phase IDs to diary entries and photographs. Unknown historical phases remain null.
- Restricts the junction to the backend/service role with RLS and explicit browser-role revocations.
- Is transactional and safe to rerun.

The manifest records 025 as a dedicated migration. It also recognizes the already-existing 024 upload migration so the reviewed manifest remains complete.

**Deployment state:** migration 025 has been prepared and validated but has not been persistently applied to the configured database. Apply it with the existing Supabase/database deployment process before deploying the multi-attachment/concurrent-report behavior. The repository's migration runner requires a verified backup before remote apply; this task has not asserted that such a backup exists.

## Configured database validation

A rollback-only transaction executed migration 025 twice successfully. It verified unchanged counts for 23 projects, 74 phase-team records, 113 evidence records, 107 phase files, 143 progress-history records, 8 diary entries and 5 photographs. All Lead SPM references were unchanged. It produced 111 evidence attachment links, then rolled back and confirmed the new table was absent again. The database had no existing responsibility rows requiring an inferred assignment or completion backfill.

## Tests and build

- Backend suite: **125 passed, 0 failed**.
- Full frontend/domain/database/UI suite: **597 passed, 0 failed**.
- Focused real-API multi-SPM suite: **11 passed, 0 failed** (including its parent test).
- Shared attachment-control UI test: **passed**, including one batch callback for multiple files.
- Backend phase lint: **passed**.
- Production build: **passed**.
- Git whitespace check: **passed**.

New API scenarios cover simultaneous same-requirement submissions, concurrent reports, multiple attachments, foreign-file rejection, future-only assignee restrictions, individual approvals and returns, immutable prior versions, incomplete-completion rejection, per-SPM read-only enforcement, independent diary/photo writes, targeted rework, phase unlocking, photo history, trusted totals, and Lead SPM preservation. Existing allocation, lifecycle, archive and checklist tests were updated for exact-phase authorization and required checklist approval; they continue to exercise the existing production workflows. SQL coverage includes the new schema.

QA logs are under the ignored tmp directory: multi-spm-all-tests-final.log, multi-spm-backend-final.log, multi-spm-integration-final.log and multi-spm-upload-ui.log.

## Remaining items

- Apply migration 025 and deploy the source through the existing release process.
- Existing Vite configuration and bundle-size warnings remain; they do not fail the production build.
- Mobile layout structure and existing CSS were retained. UI behavior was tested with JSDOM; no manual real-device visual walkthrough was performed.

## Modified and added files

- Thesis-Backend/migrations/025-independent-spm-workspaces.sql
- Thesis-Backend/scripts/migration-plan.js
- Thesis-Backend/src/common/utilities/access.utility.js
- Thesis-Backend/src/domain/construction-phase-progress.d.ts
- Thesis-Backend/src/domain/construction-phase-progress.js
- Thesis-Backend/src/services/progress/assignment.utility.js
- Thesis-Backend/src/services/progress/controller.js
- Thesis-Backend/src/services/progress/handoff.utility.js
- Thesis-Backend/src/services/progress/lifecycle.utility.js
- Thesis-Backend/src/services/progress/phase-submission.utility.js
- Thesis-Backend/src/services/progress/phase-update.controller.js
- Thesis-Backend/src/services/progress/phase-update.utility.js
- Thesis-Backend/src/services/progress/phase.controller.js
- Thesis-Backend/src/services/progress/phase.utility.js
- Thesis-Backend/src/services/progress/rework.controller.js
- Thesis-Backend/src/services/progress/verified.utility.js
- Thesis-Backend/src/services/projects/read.controller.js
- Thesis-Backend/src/services/workspace/phase-responsibilities.js
- Thesis-Backend/src/services/workspace/project-data.controller.js
- Thesis-Backend/src/services/workspace/routes.js
- Thesis-Backend/tests/archive.test.js
- Thesis-Backend/tests/migration-plan.test.js
- Thesis-Backend/tests/phase-coverage.test.js
- Thesis-Backend/tests/phase-progress.test.js
- docs/MULTI-SPM-WORKSPACES.md
- src/EngineerResponsibilities.tsx
- src/EvidenceReview.tsx
- src/PhaseEngineerAllocation.tsx
- src/RoleWorkspace.tsx
- src/api/actions.ts
- src/api/adapter.ts
- src/model.ts
- src/panels.tsx
- src/workflows.ts
- tests/activity-migration-contract.test.mjs
- tests/api-backend.test.mjs
- tests/multi-spm-workspaces.test.mjs
- tests/phase-foreman-backend.test.mjs
- tests/standard-phase-checklists.test.mjs
- tests/upload-limits-ui.test.mjs
