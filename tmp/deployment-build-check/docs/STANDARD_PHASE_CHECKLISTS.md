# Standard phase checklists: 4–3–4

The construction progress modal now uses standard activity identities and five
status badges. See [Construction phase progress](CONSTRUCTION_PHASE_PROGRESS.md)
for the current display policy, additive legacy reconciliation, holds, and tests.
The optional 007 revision described below is a separate historical rollout;
it is not required for the current implementation, which retains additional
legacy mandatory documents as approval gates.

New middle-phase checklist snapshots contain these required activities, each
with a default value of 10:

1. Activity/Work Inspection Checklist
2. Inspection and Testing Records
3. Method Statement

Mobilization uses four required activities:
1. Site Possession and Existing Conditions Verification
2. Temporary Facilities and Site Logistics Readiness
3. Safety and Emergency Readiness
4. Project Kickoff and Initial Deployment Confirmation

Closeout uses four required activities:
1. Final Inspection and Punch-List Closure
2. Final Testing and Commissioning Acceptance
3. Handover Information and Owner Training Completion
4. Site Restoration and Final Turnover Acceptance

Each has value 10. Position comes from the project's type-specific phase order:
Residential and Commercial have nine phases; Mixed-Use has twelve.

The browser fallback and backend use the same activity definitions. Activation,
first checklist submission, and workspace initialization use the same backend
snapshot policy. Existing project snapshots remain authoritative until the
explicit scope revision below is applied. No browser fallback rewrites records.

For a standard middle phase the approved fractions are 0/30, 10/30, 20/30 and
30/30 (0%, 33.3%, 66.7% and 100%). Four-item phases use 0/40, 10/40, 20/40,
30/40, 40/40 (0%, 25%, 50%, 75%, 100%). New nine-phase projects total 290;
twelve-phase projects total 380. Project progress uses approved value / actual
required project total, never the average of rounded phase percentages.

## Existing projects

`Thesis-Backend/migrations/007-standard-phase-scope-revision.sql` explicitly
revises current and upcoming phases of active projects. Already-passed phases
and inactive/archived/completed projects retain their historical scope. Their
project totals can therefore differ from the new-project totals above.

Matching activity codes retain their IDs, evidence and approvals. Extra old
requirements become non-required historical records; no evidence is deleted.
Different new requirements start without approval. Site PMs can view retired
evidence under “Previous checklist records”; new submissions to these items are
blocked. Retired evidence does not block handoff. Required pending evidence,
pending issues, rework and other existing approval holds still block it.

Changed scopes are recorded in audit_log with before/after requirements. This
deliberate scope revision can change the denominator and percentage; it does not
fabricate approvals or infer them from reported percentages. Progress history
is unchanged. The current-phase compatibility current_pct field is recalculated.
Repeated application creates no duplicate revision events.

## Local verification and deployment

Prerequisites: approved project-type workflows and verified-progress schema.
007 supersedes the template policy of the earlier middle-only 006 migration and
can run directly once prerequisites exist. Do not run the legacy blanket runner.

From the repository root, print rollback SQL without connecting to a database:

```powershell
node Thesis-Backend/scripts/revise-standard-checklists.js --print-dry-run
```

Point backend DB_* settings at a disposable localhost copy, then run:

```powershell
node Thesis-Backend/scripts/revise-standard-checklists.js --dry-run
node Thesis-Backend/scripts/revise-standard-checklists.js --apply
```

The runner refuses non-local hosts before connecting. Dry-run reports before /
after counts, revision events and required phase totals, then rolls back. Tests
use isolated PGlite databases to check rollback, repeat apply, retained approvals,
unchanged evidence/history, historical phases and inactive projects.

Backend deployment owner: back up the target database, verify prerequisites,
review the SQL and changed-scope report on a local copy, then apply the approved
007 SQL explicitly using your normal deployment process. Publishing code does
not apply SQL. This implementation does not execute hosted SQL. Deploy matching
frontend/backend code, refresh, and verify the current checklist for each role.
Automatic handoff uses trusted approvals and existing holds. Final closure
retains the existing completion checks.

After application inspect required flags, values and revision events:

```sql
SELECT p.name,s.code,i.code,i.required,i.weight
FROM project_phase_checklist_items i
JOIN projects p ON p.id=i.project_id
JOIN project_stages s ON s.id=i.project_stage_id
ORDER BY p.name,s.sort_order,i.sort_order;

SELECT record_id,new_values FROM audit_log
WHERE new_values->>'_checklist_scope_revision'='standard-4-3-4-v1'
ORDER BY changed_at;
```
