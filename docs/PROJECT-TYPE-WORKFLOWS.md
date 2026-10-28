# Project-type workflows

Residential and Commercial use 9 default phases; the default Mixed-Use template has 12. `project_type_stages`, `project_stages` and `project_stage_discipline_links` still define those defaults. Confirmed Mixed-Use intake scopes can now select a project-specific sequence, as described below.

## Mixed-Use scope review

New Mixed-Use intake follows Project details → Project scope → Staffing & agreements.
The administrator selects at least two supported building uses (residential,
retail/commercial, offices, hotel/hospitality), separately from podium, tower,
curtain wall and landscaping features. A written scope basis and explicit
confirmation are required. This confirms proposed allocation scope; responsible
project professionals must still review design, permit and contract applicability.

The shared `mixed-use-scope.js` policy proposes applicable phases. Uses select
their fit-out packages, including Office Fit-Out and Hotel Fit-Out. Without a
tower, Structure remains; without curtain wall, Envelope remains; without
landscaping, Site Works remains. Mobilization, Design, Foundation, MEP,
Fire & Life Safety and Closeout cannot be unchecked. Non-applicable packages
retain their generated reasons in the scope snapshot, rather than receiving
completion or fabricated approvals. Re-run allocation retains its existing
ranking behavior and only allocates phases in the confirmed scope.

Apply `Thesis-Backend/migrations/014-mixed-use-project-scope.sql` after the
project-type workflow, verified checklist and integration prerequisites. It adds
the nullable `projects.phase_scope` snapshot, three stage definitions and the
corresponding Mixed-Use discipline links. It changes no existing project scope,
assignment, evidence, approval or progress history. Repeat application is safe.
No hosted database is changed by publishing the code.

For an existing database that already has the default workflows, run the additive
scope setup from the project root (it previews and rolls back unless `--apply` is supplied):

```powershell
npm.cmd --prefix Thesis-Backend run db:mixed-use-scope -- --dry-run
npm.cmd --prefix Thesis-Backend run db:mixed-use-scope -- --apply
```

Missing scope setup can produce a misleading Office Fit-Out qualification error
because its stage and discipline links do not exist yet. Do not change staff
qualifications to work around missing database setup. The `db:project-types`
command now reapplies migration 014 after migration 004, which replaces the
default discipline links, so rerunning workflow setup retains scoped stages.

The server derives the canonical ordered phases from validated uses/features;
client-provided phase names, exclusions and reviewer identity are not trusted.
It records the authenticated confirming administrator and timestamp and audits
the scope. The saved scope is locked after submission, including returned
intakes. It is visible read-only in staff project details. Existing projects and
legacy API clients without a scope continue to use the full type workflow.
Read paths tolerate a missing phase_scope column, but creating a scoped intake
requires migration 014. Deploy the migration before using the new scope form.

`projectWorkflowSql` resolves project-specific stages with a type-workflow
fallback. It is shared across assignment validation, staff detail reads,
checklist initialization, stage selection, unlock/handoff, archive gates and
subcontractor allocation. Progress and monthly-report reconstruction use the
same snapshot. Mobilization/Closeout retain four standard checklists, each
included intermediate phase three. Existing mandatory evidence and approval
provenance rules remain intact. Excluded phases cannot be initialized/submitted
as a way to bypass the saved scope.

Validation includes every supported use/feature combination, missing/forged
scope rejection, frontend scope confirmation/reconfirmation, qualification
matching, authenticated intake/reload, immutable scope, phase unlock/handoff,
checklist totals, company-allocation scope, report balances and unchanged legacy
workflows. See `tests/mixed-use-scope*.test.mjs` and the scoped-intake scenario
in `tests/api-backend.test.mjs`.

Verification results for this change: 461 repository tests passed; the final
authenticated API rerun passed 40/40 and scope/schema checks passed 8/8.
TypeScript, production build and phase lint passed. Narrow-screen browser
inspection confirmed the responsive form. The standalone backend suite has
10 pre-existing failures (84/94 passed), reproduced against the unchanged
baseline: old client-email expectations, legacy crew-flow mocks and evidence
reviews missing required preview tokens. No approval requirements were relaxed
to satisfy those tests. Existing Vite configuration/bundle-size warnings remain.

## Apply to an existing database

From the project root after installing backend dependencies and configuring `Thesis-Backend/.env`:

```powershell
npm.cmd --prefix Thesis-Backend run db:project-types
```

The transactional migration is `Thesis-Backend/migrations/004-project-type-workflows.sql`. It can also be run in the Supabase SQL editor. The legacy schema, migration 003 and any old seed scripts must be loaded before this migration. Do not rerun legacy seven-stage seed scripts on a migrated database.

For new installations with demo data: schema -> integration migration 003 -> demo seed -> project-type migration 004.

## Existing project records

- Common stage IDs stay attached to their evidence. MEP Rough-in is relabeled MEP Rough-In without changing its ID.
- Commercial Finishes becomes Fit-Out / Finishes.
- Mixed-Use Structure becomes Podium Structure; Finishes becomes Retail/Commercial Fit-Out. Tower Structure and Residential Fit-Out are separate added phases. These mappings retain the old records; they do not establish that the new phases were performed.
- Current stage references, assignments, checklist snapshots, evidence, file references, histories and pending reviews migrate together. Existing statuses and percentages are preserved.
- Added phases have no assigned Site PM and remain pending. An administrator must assign an eligible Site PM and obtain acceptance. No extra permissions, acceptance or completion is invented.
- Existing checklist snapshots and templates are retained. Renamed phases inherit their original templates. New phases without templates must be configured through the existing Administrator checklist-template endpoint before work can advance into them.
- Reapplying the migration does not recreate assignments or duplicate records. Completed projects remain archived.

## Verification

```powershell
node --experimental-strip-types --test tests/project-type-workflows.test.mjs tests/api-backend.test.mjs
npm.cmd --prefix Thesis-Backend test
```
