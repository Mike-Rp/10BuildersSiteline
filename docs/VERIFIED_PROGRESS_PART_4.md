# Verified progress — Part 4: lifecycle safeguards

## Dependencies and scope

Parts 1–3 provide the shared calculation, snapshotted checklist scope, individual
approvals and targeted rework. This part changes lifecycle decisions only. No
migration is needed. No existing local or hosted database was connected to or
modified; database verification uses disposable PGlite with Express on localhost.

The existing unrelated changes in `Thesis-Backend/src/app.js` and `vite.config.ts`
are retained. This part does not stage, commit or push files.

## Behavior

Direct phase advancement now requires:

- Valid required scope and a positive required total.
- Full verified earned value, with reviewer identity and review date, for every
  required current-phase activity. Approval counts or cached percentages alone
  cannot satisfy the gate.
- Confirmed current-phase and next-phase Site PM assignments.
- Valid next-phase required scope.
- No pending progress reports, pending rework requests or pending subcontractor
  requests anywhere on the project.
- No latest evidence still awaiting review or marked rework required. An older
  superseded pending version does not keep blocking the project.

The existing project row lock and transaction protect the decision and phase
change. Assignment acceptance alone does not bypass the backend gate.

Completion requires current workflow position Closeout, verified Closeout
completion, valid complete scope and verified 100% across every project phase,
confirmed assignments for the full type workflow, and no blocking reviews.
The shared closure policy checks the current row under lock before recording
the completion archive and releasing workers/engineers.

The same closure policy is used by explicit Closeout, individual evidence
approval, general report approval and automatic archive maintenance. Completed
Closeout cannot compensate for missing or withdrawn earlier-phase approvals.
Pending or invalid scope leaves the project active without granting credit.

## Advancement and archive audit

- `advancePhase`: the production phase transition endpoint. Uses verified
  phase totals and the shared review holds.
- `resolvePhaseUpdate`: already records report review independently of evidence
  approvals and does not change workflow phase. This behavior is retained and
  exercised with a report selecting another phase.
- `resolveChecklist`: individual review does not advance phases. Its existing
  call to the shared closure policy now checks the whole project.
- `closeProject`: explicit completion calls the same policy and now gives an
  error explaining all-phase completion, assignments and review requirements.
- `sweepArchive` / scheduled maintenance: completion goes through the same
  policy. Assignment expiry and abandoned intake archival retain their existing
  separate rules. They do not award verified construction credit.
- Administrator soft removal (`deleteProject`) remains an administrative removal,
  distinguished by `is_deleted`; it does not claim verified completion or set
  construction progress to 100%. It is outside construction completion.
- Already archived records are not reopened, recalculated or migrated by the
  completion policy.

## Legacy local workflow helpers

The authenticated application uses the API; its older pure local workflow is
also hardened so it cannot provide an alternative set of lifecycle rules:

- New local activations snapshot all existing per-type checklist definitions.
  No activities are replaced or collapsed into a three-activity template.
- Approval records include the authorized reviewer identity alongside the date.
- Pure shared weighted calculations replace the equal-phase average and legacy
  baseline/anchor calculation. Missing historical scope cannot satisfy a gate.
- Completion includes every project phase, regardless of historical
  `progressStart`, `progressBase` or cached progress.
- Pending reports, submitted evidence and rework prevent local handoff.
- General note approval cannot activate a different phase. Informational timer
  resolution cannot advance or complete a project.
- The old local rework confirmation fails closed and directs callers to the
  connected targeted-review flow. Production targeted rework remains available
  through Part 3's authorized API; no stage-floor deduction is applied.
- `STAGE_FLOORS` and `projectStageFloor` remain compatibility exports used by an
  existing project-type test. They have no progress, handoff or completion caller.
  Legacy persisted fields remain readable; no storage reset is introduced.

## Files and functions changed

- `Thesis-Backend/src/services/progress/lifecycle.utility.js`:
  `blockingReviews`, `verifiedComplete`.
- `Thesis-Backend/src/services/progress/phase.controller.js`: `advancePhase`.
- `Thesis-Backend/src/services/archive/policy.js`: `maybeCloseProject`, shared by
  direct closure, review and maintenance callers.
- `Thesis-Backend/src/services/archive/actions.controller.js`: closure error text.
- `src/workflows.ts`: local verified scope/totals, approval provenance,
  `completionReady`, `advanceIfReady`, legacy review and timer safeguards.
- `src/model.ts`: optional `ChecklistItem.reviewedBy` for compatible local records.
- `Thesis-Backend/tests/phase-progress.test.js`: handoff, provenance, invalid
  values, pending reviews and current assignment tests.
- `Thesis-Backend/tests/archive.test.js`: whole-project completion, assignment
  checks, maintenance and historical archive tests.
- `tests/api-backend.test.mjs`: real API lifecycle scenario in a separate
  disposable project with authenticated roles.
- `tests/post-intake.test.mjs`: missing scope, baseline bypass, reviewer
  provenance and general-note/timer transition regression tests.
- `tests/workflows.test.mjs`: replaces the obsolete stage-floor rollback
  expectation with rejection of the legacy confirmation path.
- This report.

No tables or permissions were changed. Tests create fixture records only inside
their disposable database. They do not invent approvals in existing user data.

Read dependencies: `projects`, `project_type_stages`, `project_stages`,
`project_phase_team`, `project_phase_checklists`, `project_phase_checklist_items`,
`project_phase_evidence`, `project_phase_updates`, `pending_rework_requests` and
`pending_subcontractor_requests`. Successful completion retains the existing
writes to `projects`, `audit_log`, `project_engineers`, `subcontractor_workers`
and `project_subcontractor_assignments` within the same transaction.

## Verification

- `npm.cmd test`: 241 passed, no failures or skips.
- `npm.cmd --prefix Thesis-Backend test`: 84 passed, no failures or skips.
- `npx.cmd tsc --noEmit`: passed.
- Targeted backend ESLint on all changed backend source and tests: passed.
- `npm.cmd run build`: passed; existing Vite config and chunk-size warnings remain.
- `git diff --check`: passed (line-ending notices only).

The API suite starts Express and PostgreSQL-compatible PGlite on loopback,
exercising the actual authenticated endpoints. No live browser smoke test was
run for this logic-only part; the root suite includes component regressions.

New expectations are intentional: legacy stage-floor rework is rejected; note
review cannot move phases; Closeout completion alone is insufficient.

## Localhost verification steps

Use an authorized local test database with Parts 1–3 installed and a complete
project checklist snapshot. Do not point these steps at hosted data.

1. Site PM: submit current-phase evidence. Verify a pending submission or issue
   prevents the Office PM's phase advancement.
2. Office PM: approve each required activity individually. Check that 100% verified
   phase completion does not itself change the current workflow phase.
3. Submit a general report, including one selecting a different phase. Verify
   pending review blocks handoff and report approval does not change the phase.
4. Leave the next Site PM assignment unconfirmed. The authenticated
   `POST /api/v1/projects/:id/advance-phase` must refuse handoff. Confirm the
   assignment; with valid scope and all holds resolved it can advance.
5. On a disposable Closeout project, leave an earlier required activity without
   valid approval. Approving Closeout or using
   `POST /api/v1/archive/projects/:id/close` must leave the project active.
6. Restore the earlier activity through authorized evidence review, confirm all
   assignments and resolve all reviews. Final authorized approval or explicit
   closure can archive the project and release resources.
7. Administrator: inspect the archived project and retained history. Subsequent
   advancement or mutation attempts must fail; the record remains archived.
8. Client: verify existing project/document visibility remains unchanged. No
   reviewer identities, issue reasons or staff evidence were added to payloads.

## Remaining work

Part 5 remains: compact role-wide verified summaries, fractions, text-only phase
breakdowns, safe client aggregates/reports, help panels and consistent display.
Current compatibility display fields retain their existing meaning until that
integration. No dashboard redesign or new phase-transition controls were added
here. Historical projects lacking full snapshots remain ineligible for verified
completion until their real scope and approvals are resolved explicitly.
