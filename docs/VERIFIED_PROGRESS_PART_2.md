# Verified activity progress — Part 2

## Implemented behavior

Checklist review is now independent for each evidence record, including evidence
attached to a combined field update. Approving one activity never approves another
activity or its parent report. Reviewing a report does not approve/reject its evidence,
resolve its linked issues, award activity value, or change the project's phase.

The existing Office PM and Administrator review permissions remain unchanged. No
additional Administrator authority is introduced. SPMs and Clients cannot review
activities or read staff review previews.

The Office PM's **Rework & approvals → QA/QC evidence** controls now open an existing
style modal before saving a decision. It shows the activity and server-calculated
phase/project fractions and percentages before and after approval. Rejection shows
unchanged totals and requires an explanation. An incomplete project scope is honestly
shown as unavailable; the phase can still have a known result.

The existing evidence viewer remains beside the review controls. Progress note cards
now explain that evidence is reviewed separately, and use “Approve progress note”.
There were no editable percentage inputs in this review UI to remove.

## Backend integrity

New staff endpoint:

```text
GET /api/v1/projects/:id/evidence/:evidenceId/review-preview
```

It validates an active project, existing reviewer ownership/access, the evidence's
project/phase/activity/parent-update relationships, and its current latest pending
state. It returns before/after phase and project totals plus a review token. The UI
returns the token with its decision as `expected_review_token`. If the evidence or
calculated impact changes, confirmation fails and requires a fresh preview.

The existing approve/reject evidence endpoints perform the same access, relationship,
latest-version, and pending-state checks. Approval and its review history/current-phase
compatibility cache are updated in the existing transaction, locking the project first
and then evidence. A failed audit write rolls the whole decision back. Old API callers
can continue using the evidence endpoints without a preview token; the current review
UI always sends one. A token never substitutes for authorization or status checks.

The API action adapter uses the evidence ID from the displayed record. It no longer
fetches a newer record and silently redirects a stale click to unseen evidence, or
routes bundled evidence decisions to the parent report endpoint.

Submission and review boundaries reject browser-supplied progress values, weights,
earned totals, and deductions. Evidence and parent update associations remain intact.
Rejection records its reason, actor, and date without publishing a new client-visible
progress approval. Corrected submissions preserve older evidence versions and reviews.

Report rejection affects only the report's status/reason. Any related activity review
and pending issue continue through their respective authorized controls. Report
approval keeps the existing general history/file relationships and the existing
closeout check; phase handoff/completion policy changes remain Part 4.

## Changed files in this part

- `Thesis-Backend/src/services/progress/phase.controller.js`: individual review,
  relationship validation, impact preview, stale-preview check, rejection audit.
- `Thesis-Backend/src/services/progress/phase.routes.js`: preview route.
- `Thesis-Backend/src/services/progress/phase-update.controller.js`: separate report
  decisions from checklist evidence and phase advancement.
- `Thesis-Backend/src/services/progress/phase-update.utility.js`: reject unsupported
  progress inputs, including nested/multipart update inputs.
- `src/model.ts`, `src/api/adapter.ts`: preserve displayed evidence identity.
- `src/workflows.ts`: command metadata for exact evidence ID and review token.
- `src/api/actions.ts`: route each review to its exact evidence record.
- `src/EvidenceReview.tsx`: impact/reason confirmation modal.
- `src/RoleWorkspace.tsx`: review controls and report guidance.
- `Thesis-Backend/tests/phase-progress.test.js`: controller behavior and input checks.
- `tests/api-backend.test.mjs`: real API isolation, impact, stale-state, access,
  resubmission/history, and transaction rollback tests on disposable PostgreSQL.
- `tests/evidence-review-ui.test.mjs`: impact visibility, required reason, failed save,
  unavailable scope, and stale-preview handling.
- `docs/VERIFIED_PROGRESS_PART_2.md`: implementation and verification notes.

No schema migration or table change is introduced by Part 2. The Part 1 value-column
migration is still required by the backend and has not been applied to an existing
user database. Part 1 work and the pre-existing backend app/Vite edits were preserved.

## Local verification

Use a verified localhost database with the Part 1 migration applied after the required
dry-run review/approval, or use the self-contained test databases. Do not point this
verification at hosted records.

1. As Site PM, submit two separate checklist activities in one field update.
2. As the project's Office PM, open Rework & approvals → QA/QC evidence.
3. Open the first activity's evidence, then choose Approve evidence.
4. Inspect phase/project before → after totals. Confirm approval.
5. Confirm only the first activity is approved; the second and report remain pending.
6. Reject the second activity with a reason. Confirm progress does not increase and
   the Site PM can submit corrected evidence with the earlier review preserved.
7. Approve the general report separately. Confirm it awards no extra activity value
   and does not change the project's phase.
8. Open a preview, change another activity's approval in a second authorized session,
   and confirm the original preview. Expect a stale-state error and refresh the panel.
9. Verify an unrelated Office PM, Site PM, Client, or cross-project evidence reference
   cannot use the review endpoint. Client workspace responses remain staff-data-free.

## Deliberately deferred

Part 3 introduces targeted withdrawal/rework. Part 4 updates all lifecycle gates.
Part 5 integrates the compact project/phase presentation across roles. Existing
legacy frontend workflow fixture calculations remain separate from the production API
review path. No commits, pushes, existing database migrations, or hosted writes were made.

## Verification results — October 21, 2026

- Application regression suite: 234 passed, zero failures or skipped tests. This
  includes the review modal component test and real API tests with a disposable
  PostgreSQL database and local Express server.
- Backend suite: 78 passed, zero failures or skipped tests.
- TypeScript `tsc --noEmit`: passed.
- Targeted lint of the changed backend controllers, route, utility, and tests: passed.
- Production build: passed; existing Vite configuration notices remain.
- `git diff --check`: passed.

The database integration tests prove sibling isolation, explicit positive approval
impact, rejection without credit, independent report decisions, stale previews,
duplicate review rejection, role/project checks, corrected evidence history, and
transaction rollback after a deliberately failed history insert. No existing user
database was used. No standalone browser smoke run was performed.

Changed test expectations are intentional: report approval no longer approves its
activities or advances its selected phase; report rejection leaves activity reviews
independent; individual bundled evidence can be reviewed before its report; individual
rejection now adds a private audit-history entry with its reason.
