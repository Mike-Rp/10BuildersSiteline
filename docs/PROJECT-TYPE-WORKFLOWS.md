# Project-type workflows

Residential and Commercial use 9 phases; Mixed-Use uses 12. The authoritative definitions and per-type order are in `project_type_stages`, joined to `project_stages` and `project_stage_discipline_links`. The workspace API supplies them to the frontend.

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
