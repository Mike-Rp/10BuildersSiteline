# Verified activity progress — Part 1

## Scope

This part adds the calculation and persistence foundation. It does not replace the
existing approval/rework workflow, handoff gates, dashboard, client portal, or reports.
Those integrations are intentionally deferred to Parts 2–5.

`Thesis-Backend/src/domain/verified-progress.js` is the same pure module imported by
the browser through `src/project-progress.ts` and by the backend. Its functions are
`activityEarned`, `phaseProgress`, `projectProgress`, and the preview-only `reworkImpact`.

Required activity value is earned in full only by current valid approval. Optional
activities are excluded. Phase and project percentages divide earned value by the
respective required total. There are no phase weights, floor increases, partial
activity credit, date-based credit, or credit from legacy reported percentages.
Totals retain full precision. Presentation can round to one decimal.

Unknown scope, duplicate identifiers, missing positive values, and inconsistent
project phases return null totals/percentage with a reason. A configured phase with
required activities but no approvals returns a genuine zero. Evidence versions are
resolved on the server, using only the latest version per activity, with a recorded
reviewer and review time required for approved credit.

## Stored scope and values

Migration `Thesis-Backend/migrations/004-verified-activity-values.sql` adds `weight`
to templates and project activities, defaulting to 10. Values must be positive and
finite. It preserves activity identities, required flags, evidence, history, existing
reported percentages, and all missing phase scope. It neither creates historical
activities nor synthesizes approvals.

Newly activated projects snapshot all assigned phases inside the existing activation
transaction. Template values are copied into project items only when a checklist
is first created. Existing snapshots are never replaced by subsequent template
changes or repeated initialization.

The existing seven-phase defaults remain 3/3/4/5/4/3/4 activities: 26 activities and
260 total at the default value. Three activities per phase is not retroactively
applied. Required scope comes from actual project phase assignments plus stored
snapshots; unexpected or unconfigured phases prevent claiming a complete total.
There is no new value editor. A future Administrator editor could extend the existing
`configurePhaseTemplate` endpoint, with an explicit prospective-versus-project-scope
policy and matching validation. It must not silently rewrite project snapshots.

## API and compatibility

Staff `/api/v1/workspace/project-data` results now include:

```text
verifiedProgress.project = { earned, total, percentage, reason }
verifiedProgress.phases[] = { id, name, earned, total, percentage, reason }
```

Checklist overview responses also include `checklist.verified` for that phase.
The frontend adapter retains these as `Project.verifiedProgress`, separately from
`Project.progress`, legacy history, and existing count-based `checklistProgress`.
Clients receive none of the new staff fields in this part. Client-safe aggregate
integration belongs to Part 5.

Verified reads calculate from complete trusted records, not paginated subsets or
browser-supplied values. They do not update stored progress or history. Existing
`current_pct`, `pct`, and `Project.progress` keep their current compatibility meanings
until the later integration; this part does not relabel old phase progress as verified
overall progress. Existing bundled approvals and stage-floor rework remain separate
legacy behavior to be replaced by Parts 2 and 3, not consumed by this calculation.

## Historical records

Older seeds initialize only selected phases. Their overall verified percentage remains
unavailable, even when historical reported progress is 60%, 67%, or 100%. Preserve
those values read-only and label them as historical reported values during Part 5.
Do not reopen archives, add guessed approvals, or fill missing denominators merely to
match them. Any historical scope reconstruction needs explicit authoritative scope
and a separately reviewed local backfill. The current migration only assigns values
to activities that already exist.

## Local migration and verification

Apply the migration before using the updated backend with a database. It has not been
applied to any existing user database. The dedicated runner accepts only literal
`localhost`, `127.0.0.1`, or `::1` in `DB_SERVER` and refuses other hosts before connecting.
Its default is a transactional dry run that rolls back all schema changes.

From the repository root, with an explicitly configured localhost database:

```text
node Thesis-Backend/scripts/migrate-verified-progress.js --dry-run
```

Review the reported counts and obtain approval before using `--apply` on an existing
local database. Do not use the general migration runner to bypass this approval.

Self-contained tests create disposable in-memory PostgreSQL databases and require no
user database settings:

```text
node --experimental-strip-types --test tests/verified-progress.test.mjs tests/verified-progress-db.test.mjs
node --experimental-strip-types --test tests/api-backend.test.mjs
```

After an approved local migration, sign in as staff, inspect the workspace response,
and compare `verifiedProgress.project` with its phase totals. A legacy project with
missing snapshots should show null totals with a reason. An initialized project with
zero approvals should show zero earned value and a positive total. Template edits
must leave initialized project values unchanged. Sign in as Client and confirm no
`verifiedProgress` staff payload is returned. The visible interface remains unchanged
until the later design part.

## Files changed and validation

Calculation/model:
- `Thesis-Backend/src/domain/verified-progress.js`
- `Thesis-Backend/src/domain/verified-progress.d.ts`
- `src/project-progress.ts`
- `src/model.ts`
- `src/workflows.ts` (creation defaults only)

Backend/API:
- `Thesis-Backend/src/services/progress/phase.utility.js`
- `Thesis-Backend/src/services/progress/verified.utility.js`
- `Thesis-Backend/src/services/workspace/project-data.controller.js`
- `Thesis-Backend/src/services/workspace/routes.js` (activation snapshots only)
- `src/api/adapter.ts`

Migration:
- `Thesis-Backend/migrations/004-verified-activity-values.sql`
- `Thesis-Backend/scripts/migrate-verified-progress.js`

Tests/documentation:
- `tests/verified-progress.test.mjs`
- `tests/verified-progress-db.test.mjs`
- `tests/api-adapter.test.mjs`
- `tests/api-backend.test.mjs`
- `tests/ui-smoke.mjs` (test-database migration setup only)
- `docs/VERIFIED_PROGRESS_PART_1.md`

Validation on October 21, 2026:
- Application suite: 231 passed, no failures or skipped tests.
- Backend suite: 77 passed, no failures or skipped tests.
- TypeScript `tsc --noEmit`: passed.
- Targeted backend lint: passed.
- Production build: passed, with existing Vite configuration and chunk-size warnings.
- Whitespace/error check `git diff --check`: passed.
- Standalone browser smoke suite was not run; its disposable database setup was
  updated for the migration. Existing component/UI tests passed in the application suite.

Disposable migration dry-run: 26 templates, 11 project activities, 6 evidence rows,
12 history rows; all schema changes rolled back. Applying and rerunning the migration
only inside the disposable database preserved those evidence/history counts and
the existing stored project percentages. No existing local or hosted database was
migrated or contacted by these tests.

The pre-existing changes to `Thesis-Backend/src/app.js` and `vite.config.ts` were not
edited. No Git write commands were used.
