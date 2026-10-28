# Verified progress recovery: results and review notes

## Branch and findings

Work is on `part-4-lifecycle-checks`, created from existing Part 4 commit
`de158ce`. Read-only ancestry checks confirm `d0662ec`, `ea4ed5b`, `3d3027e`
and `de158ce` are present. The branch did not exist locally at task start;
local main already contained Part 4. No commit, push or merge was performed.

The inspected repository was not limited to migrations 001–003. It already had:

| Existing file | What it supplies | Why it is not the requested additive recovery |
|---|---|---|
| 004-verified-activity-values.sql | Template and project activity weight | Uses double precision rather than the requested integer |
| 005-targeted-rework.sql | Request links and targeted activity references | Drops/replaces the evidence status CHECK |
| 004-project-type-workflows.sql | Type-specific workflow scope | Separate rollout; rewrites/remaps historical phase references |

The reported missing-column error is consistent with a database that has not
received the needed schema changes, or a deployment connected to a different
database. File absence from Git is not the cause established by this checkout.
The actual hosted schema and current live Vercel state were not inspected.

## Concrete recovery

New file: `Thesis-Backend/migrations/004-verified-activity-progress.sql`.
It is applied explicitly after the baseline schema and existing 001–003, instead
of automatically running all old 004/005 files.

| Dependency | SQL type / object | Consumers | Existing coverage / recovery |
|---|---|---|---|
| phase_checklist_templates.weight | integer NOT NULL DEFAULT 10, CHECK > 0 | ensureChecklist, activation snapshot, template configuration | Old values migration uses float; recovery adds integer |
| project_phase_checklist_items.weight | integer NOT NULL DEFAULT 10, CHECK > 0 | phase/project totals, review previews, withdrawal, lifecycle | Recovery adds integer; existing values preserved |
| project_phase_evidence.rework_request_id | nullable uuid FK | rework review, corrected evidence, staff projections | Old 005; recovery adds reference |
| project_rework_activities | UUID request/project, smallint phase, bigint activity/evidence references; PK and composite FKs | targeted selection, withdrawal provenance | Old 005; recovery creates with indexes |
| pending_rework_request_scope | unique request/project/phase index | composite request FK | Old 005; recovery creates |
| project_type_stages | smallint type/phase/order, PK/unique/FKs | stage options, snapshots, handoff and all-phase completion | Separate old type migration; recovery supplies only missing legacy lookup defaults |
| evidence review identity/date/state and versions | bigint/uuid/text/timestamptz and existing CHECKs | individual approval, latest-state credit, history | Baseline + 001/002 already supply them |
| project scope snapshot rows | composite project/phase key, activities/required flags | stable denominator | Baseline/001 already supply them; no inferred backfill |
| bundled reports, files, issue categories and history links | bigint/uuid/text[]/text/timestamps | report review and traceability | 002 already supplies them |
| project lifecycle/stage/cache, assignments and archive history | existing varchar/smallint/uuid/timestamps | Part 4 and existing resource release | Baseline + 003 already supply them |
| logical withdrawal compatibility | SECURITY INVOKER trigger function + BEFORE trigger | already-deployed writer and old status CHECK | New additive bridge, no CHECK replacement |

The complete dependency table covers **53 referenced tables and 474 columns**,
with SQL types, defaults, migration sources, consuming files, constraints,
indexes, functions and triggers:
`docs/VERIFIED_PROGRESS_SCHEMA_AUDIT.md`. That report also contains the **full
recovery SQL** and complete actual dry-run JSON. Its scope deliberately includes
all columns of referenced tables, including baseline columns, so it is broader
than the new fields alone.

## Status compatibility and history

The original CHECK accepts pending/approved/rejected. The new API writes a
reviewed rejection linked to its rework request and projects that state as
Rework required. It is still zero-credit and still requires fresh evidence and
fresh Office PM approval. Historical approved versions are retained unchanged.

An additive normalization trigger also accepts the already-deployed writer's
`rework_required` input before the original CHECK runs. It modifies only the NEW
row, not old data, and only when a rework request reference is supplied. This
avoids requiring a destructive constraint replacement before code deployment.
The branch's projection changes should be deployed for consistent labels.

Existing table policies and grants are preserved. Newly created private tables
enable RLS, deny PUBLIC/anon/authenticated table access and give trusted
service_role access through an explicit policy and SELECT/INSERT/UPDATE grants.
The API retains project-specific role checks. The trigger function is not
SECURITY DEFINER and has a fixed search path and no PUBLIC execute grant.

## Actual local dry-run and application

Only disposable PGlite was used. The test starts from base schema, applies
001–003, loads the seed, runs recovery in a transaction and rolls it back:

```json
{
  "mode": "dry-run (rolled back)",
  "verified": {
    "weight_type": "integer",
    "weight_default": 10,
    "weight_nullable": false,
    "rework_links": true,
    "workflow_scope": true,
    "legacy_writer_bridge": true
  },
  "activities": 11,
  "evidence": 6,
  "history": 12,
  "rework_links": 0,
  "workflow_rows": 42
}
```

The full JSON includes every added column. After verifying rollback, the test
applies twice to the disposable database and compares existing evidence,
history, project values, scope snapshots and activity identity/required flags.
There are no fabricated approvals, historical percentages are not converted
into credit, and pre-existing integer values are not reset. A separate test
proves pre-existing workflow mappings and their ACLs/policies are preserved.
A floating-point installation aborts without conversion or partial DDL.

The application integration and role smoke fixtures now explicitly use only
base + 001–003 + recovery. The missing-weight error is gone on those paths.

## Actual verification results

| Check | Result |
|---|---|
| Application full suite: npm.cmd test | 245 passed, 0 failed/skipped |
| Backend full suite: npm.cmd --prefix Thesis-Backend test | 84 passed, 0 failed/skipped |
| TypeScript: npx.cmd tsc --noEmit | Passed |
| Production build: npm.cmd run build | Passed; existing Vite config/chunk-size warnings |
| Local real React/API role smoke: npm.cmd run test:ui | Six accounts across all four roles passed; no reported page problems |
| PostgreSQL migration coverage | 360 static backend SQL statements prepared against migrated schema |
| Missing-object regression | Unknown column and table rejected with PostgreSQL 42703 / 42P01 |
| Re-run/rollback/history/permissions/old-writer tests | Passed |
| Changed backend code lint with eslint.phase.config.js | Passed |
| Standard repository backend lint: npm.cmd --prefix Thesis-Backend run lint | FAILED: 105 issues outside this change |

Standard lint traverses an existing nested frontend checkout and uses browser
globals for Node scripts. It also reports existing unused variables/imports.
These unrelated files/configuration were not rewritten to conceal failures.
No lint errors remained in the changed backend source or new runner under the
repository's Node-aware phase lint configuration.

The prepare regression caught an existing ambiguous `project_stage_id` reference
in the recommendation query after joining `project_type_stages`. It is now
qualified as `pstdl.project_stage_id`. Tests compile static literal SQL; dynamic
SQL is covered by the exercised API routes and catalog audit, not a universal
static proof of every possible runtime string.

## Role and workflow verification boundaries

| Role / behavior | Confirmed locally | Remaining display work |
|---|---|---|
| Administrator | Login/navigation/Active Sites/modal; trusted staff aggregates load without weight errors | Compact role-wide value fractions are Part 5 |
| Office PM | Weighted phase/project impact previews; individual approvals; selective withdrawal; stale/duplicate checks; correction/reapproval | Final compact monitoring presentation is Part 5 |
| Site PM | Login/assignments/evidence submission; rework reason and corrected upload; no credit until approval | Consistent phase versus project summary design is Part 5 |
| Client | Login/project/timeline/documents/history/photo navigation; payloads still omit staff-only records | New client-safe weighted aggregate projection and verified fractions/reports are Part 5 |
| Handoff | Below 100%, invalid/missing scope, pending reviews, and unconfirmed assignments block it | No new UI controls added |
| Completion | Closeout cannot hide an earlier incomplete phase; all-phase 100% plus existing checks required | Historical archived records remain protected |

**This task does not claim that verified fractions are already displayed
consistently for every role.** Parts 1–4 explicitly deferred that integration,
especially the client-safe aggregate response. A migration cannot itself add
that client UI. Part 5 remains separate, as requested.

## Live Vercel assessment

No live URL or hosted connection was used. Current live status is therefore
**unverified**, not reported as repaired.

If the deployed code is connected to a database without weight, staff workspace
loading (and thus Dashboard/Active Sites), project monitoring/checklist reads,
activation snapshots, activity approval, rework and lifecycle endpoints can fail.
Authentication itself does not require weight. Client routes skip staff weighted
aggregates in the current version, so the reported error does not by itself prove
every client page is broken. Separately missing project_type_stages would affect
workflow-based project reads too. The teammate must inspect deployment logs and
verify the actual site after applying the approved recovery.

## Handoff and approval

Exact backend-teammate commands, dry-run generation, verification SQL, policy
expectations and deployment order are in `docs/HOSTED_DEPLOYMENT_CHECKLIST.md`:

Backup → explicit 004 dry run → explicit 004 apply → verify → confirm currently
deployed site → approved merge of part-4-lifecycle-checks → verify the new
deployment, then separately continue Part 5.

Unrelated `Thesis-Backend/src/app.js` diagnostics and `vite.config.ts` edits remain
untouched. Hosted records were not accessed. Nothing was staged, committed or
pushed. Stop for user approval before committing recovery work to this branch.
