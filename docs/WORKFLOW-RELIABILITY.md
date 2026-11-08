# SITELINE workflow reliability implementation report

Local implementation and verification, 8 November 2026. No commit, push, hosted database query, hosted migration, or production write was performed during this task. The checkout was clean before work started. The six-tag staffing rule and existing project Lead SPM designation were not changed. No Phase Lead was introduced.

## 1. Original gaps and resolution

| Gap | Local status | Resolution and deployment dependency |
| --- | --- | --- |
| Pending checklist evidence stranded after an SPM replacement | **FIXED AND VERIFIED** | Review queues and history follow the project, phase, evidence and review status, independent of the current assignee. Authorized Office PMs can preview, download, approve or reject former submitters' evidence. Stable responsibility provenance carries approved and pending requirements through a replacement without changing the original submitter, file or submission time. Requires 027 for provenance. |
| Credential verification depended on specialization fields | **FIXED AND VERIFIED** | Every ordinary credential upload, including Admin and legacy API uploads, stays pending. Verification requires an explicit authorized review with a note. The existing account-registration action may still explicitly verify when the Admin has checked the review confirmation and supplied the required note; uploading alone cannot enable it. |
| Profile and allocation accepted different license-number formats | **FIXED AND VERIFIED** | Exactly seven ASCII digits, supplied as text, without trimming or numeric conversion. Leading zeros survive. Backend eligibility, shared profile validation and the 027 qualification view agree. Revoked, invalid, unreviewed, expired and correction-required credentials do not qualify. An SPM also needs a supported qualification mapping. |
| Missing migrations 025/026 blocked credential tags, attachments and independent reports | **FIXED — ADDITIONAL REVIEW REQUIRED** | Both files already exist and remain unchanged. They are dedicated migrations, intentionally excluded from automatic general-runner application; prior validation was rollback-only. Disposable PostgreSQL tests apply them and the additive 027 successfully. Their hosted installation is **not verified or performed** in this task. |

Previously reported hosted-schema findings are historical audit evidence, not a new hosted inspection. Do not assume the current hosted database matches the local test database.

## 2. Implementation and preserved behavior

### Evidence and replacement

`project_phase_evidence.responsibility_id` identifies the existing responsibility slot. Replacing its SPM changes the current assignee but does not transfer authorship of any submission. Checklist reads, verified totals and project-list totals use the same slot when available. Legacy single-SPM reads retain their existing fallback.

027 backfills only unambiguous matches to a current owner or an audited `replace` event's previous owner. Ambiguous/unmatched history remains unmodified. It is still visible in the independent review/history API. Do not guess which assignment should receive its progress credit.

The independent queue contains all pending evidence in the caller's authorized projects, including evidence no longer selected as the latest current checklist version. Existing review cards and counts consume that queue without adding it to progress denominators. The review modal exposes original submission details, explicit attachment downloads and on-demand version history. There is no Document Repository or Active Sites redesign.

Office PM review still checks project management access, project lifecycle, phase locks, license access and an optimistic preview token inside the project-row transaction. Reviewing historical evidence that contributes no current credit adds zero points. A competing second review receives a conflict. Original ownership and primary file references are immutable at the database layer.

Every pending required submission blocks progression, even if it is no longer the latest version. Rework versions retain the existing correction rules. A checklist displaying 100% cannot bypass pending reviews, assignment completion, next-phase confirmation or closeout gates. Existing formulas and shared checklist definitions are retained.

The declined-assignment and office-signed license-handover paths now synchronize an existing responsibility slot too. Both retain its scope and audit the previous owner. An approved responsibility cannot be replaced. A workspace containing evidence cannot be handed over through these paths before the provenance migration is available.

### Credential lifecycle and legacy correction

An Admin upload without tags no longer automatically verifies or silently rejects an older pending submission. The one-pending-submission-per-profession conflict remains explicit. Admins must reject or verify that pending submission through the authorized review endpoint before submitting a replacement.

Specialization editing remains separate from verification and does not verify credentials. Changes to stored license number, profession, supporting document, expiry or owner invalidate verification through a database trigger. Existing reviewer identity/time and the existing audit trail are retained. Application credential-edit routes continue to reject overwriting verified evidence; corrections use a new pending submission and a new verified version.

027 derives `correction_required` from the existing number and verification state. This avoids changing historical `updated_at` timestamps merely to flag invalid values. It adds revocation attribution and an Admin-only, reason-required revocation endpoint/control. A revoked credential remains visible with its original verification attribution, but supplies no allocation eligibility.

To correct a legacy number, submit a new seven-digit credential for the same engineer with supporting evidence, explicitly review it, and retain the old credential as history. The legacy review endpoint can accept an explicit corrected number and links `replaces_license_id`; the reviewed version preserves that relationship. No legacy exception format, number rewriting, global license-number uniqueness rule, or inferred profession was introduced. Cross-profession/account duplicates are not automatically deleted or merged.

### Retry safety and concurrent reports

The existing project lock serializes writes. 025 changes pending-report uniqueness to `(project, phase, SPM)`, allowing peers to submit independently. Multiple attachments remain separate immutable files joined to one evidence submission; owner/project/phase are validated before linking.

027 adds request receipts scoped to project, submitting user and UUID. A successful write and its receipt commit together; a failed transaction saves neither. Replaying a key returns the original response, including after report review, and changing its payload returns 409. The same UUID can safely be used by different SPMs. Legitimately identical new reports use different keys.

The frontend sends stable phase-file identities and retains submission keys for retries of the same open form. Existing API clients without a key retain their current pending/approved conflict behavior; they do not gain durable replay after a completed report is reviewed. External clients needing replay guarantees must retain and resend `request_id`. The in-memory form-key map does not survive a browser restart. Normal permission/lifecycle checks can still refuse a replay after a workspace is locked or access is revoked.

## 3. Database and authorization changes

025 and 026 are unchanged. New migration: `Thesis-Backend/migrations/027-workflow-reliability.sql`.

- Optional evidence-to-responsibility foreign key, an index for slot/version reads and an index for pending reviews.
- Scope/provenance triggers reject cross-project/phase assignment links, ownership changes, and new attachment links owned by another submitter.
- `project_request_receipts` with project/user foreign keys and a composite primary key. RLS enabled; PUBLIC, anon and authenticated have no access; only the existing service-role policy permits backend access.
- `user_licenses.revoked_at`, `revoked_by`, `revocation_note` and generated `correction_required`.
- Essential-field re-verification trigger and strict seven-digit qualification view.
- No checklist-definition duplication, table replacement, record deletion or historical migration rewrite.

Backend API authorization remains mandatory even though the backend connection is trusted. New history/revocation routes do not grant ordinary SPMs or clients administrative access. Upcoming workspaces and completed assignments remain protected by the existing backend gates.

## 4. Verification and baseline comparison

The baseline was run before source edits. TypeScript and repository-wide lint baselines were additionally reconstructed against the original `HEAD` source using the same installed compiler/configuration.

| Check | Baseline | Final |
| --- | --- | --- |
| Frontend/domain/API/database/integration tests | 599 passed, 0 failed | 605 passed, 0 failed, 0 skipped (345.9 seconds). |
| Backend unit tests | 125 passed, 0 failed | 125 passed, 0 failed |
| TypeScript `npx tsc --noEmit` | 8 diagnostics | Passed, 0 diagnostics |
| Backend `npm run lint:phase` | Passed | Passed |
| Expanded lint over credential/workspace/eligibility modules | 2 unused-variable errors | Passed |
| Repository-wide backend `npm run lint` | 157 errors with the same existing files/config | **NOT FIXED:** 155 errors, no newly introduced diagnostics; see limitations below |
| `npm run build` | Passed with existing warnings | Passed with existing warnings |
| `npm run test:ui` | Not run in baseline | Passed for all six accounts/roles; exit 0. |

Focused results (also covered by the successful final full rerun): 42 legacy real-API checks passed; 16 multi-SPM/database checks passed; credential/canonical-rule focused checks passed; the three assignment-window checks passed. Counts overlap the full suite and must not be added together.

### Regression and failure matrix

| Scenarios | Evidence/result |
| --- | --- |
| Concurrent SPM evidence for the same shared requirement; independent reports | Real Express requests against disposable PostgreSQL. Separate submissions/statuses and attachment lists retained; one SPM does not block a peer. |
| Empty workspace replacement, repeated replacements, partial approval and all required documents submitted before replacement | Stable slot and original submitter retained. Successor sees approved/pending requirements; cannot overwrite either. |
| Former submitter suspended; Office PM review and downloads | Pending evidence remains in the managed queue; Office PM review/history/download succeed. |
| Two reviews of one submission | One 200, one 409; one decision recorded. |
| Review preview obtained before replacement | Stable contribution remains correct; unchanged evidence can keep its token. Fresh/current tokens are enforced when totals change. |
| Checklist 100% with unrelated historical pending evidence | Advancement returns 409; historical approval adds zero progress and preserves original ownership/file. |
| Missing/rejected resubmission and multiple attachments | New evidence versions retain previous files and review history; no sibling approval changes. |
| Completed and upcoming workspaces; Lead preservation | Uploads/reports/notes/gallery mutations blocked as appropriate; completed files remain readable; original project Lead preserved. |
| Upload/report retries and changed-payload key reuse | Same file/report returned, one committed row; changed payload gets 409. Report replay still works after its review. |
| Report insert followed by invalid checklist item | Transaction rolls back the report and receipt; API reports failure. Existing attachments are not relinked. |
| Failed evidence-review history write | Existing real-API rollback regression verifies both approval and cached progress roll back. |
| Invalid ownership, foreign keys, request fields, MIME/signature and permissions | New and existing API/DB regressions reject unsafe operations. DB provenance/attachment violations return constraint errors. |
| Admin uploads with zero/one/multiple tags and engineer uploads | Upload alone stays pending; unauthorized verification is denied. Explicit Admin registration decisions remain independently covered. |
| Concurrent credential verification | One success, one conflict; one current verified version. |
| Revocation, invalid essential-field edit, supporting-document change and legacy correction | Allocation rejected; history retained; a separately reviewed valid correction restores eligibility. |
| Seven-digit/leading-zero, six/eight-digit, alphabetic, alphanumeric, whitespace, null/empty and legacy values | JS eligibility, backend allocation and real qualification-view results agree. No normalization erases leading zeros. |
| Expiry boundary and missing specialization | Day 30 blocked, day 31 allowed with reviewed qualifications; an unmapped SPM credential cannot supply unrelated scope. |
| 025 incompatible duplicate pending reports | Unique-index creation fails atomically without deleting either report. Explicit disposable-fixture reconciliation permits reapplication. |
| 027 missing prerequisites, rollback-only validation and repeat application | Missing prerequisites fail; transactions roll back; repeat application retains original records. |
| RLS | anon/authenticated cannot read receipts or evidence-file links; backend role policies retained. |

The main API regression deliberately retains the legacy single-SPM schema and installs the exact additive receipt table/policy SQL for compatibility testing. The independent multi-SPM suite applies the complete 025/026/027 migrations. The static SQL contract prepares backend queries against the complete migrated schema.

## 5. Data preservation

Disposable tests compare complete original rows before/after migration for projects, phase teams, responsibility assignments, evidence, files, progress history, licenses, renewal requests and specialization relationships, excluding only newly added fields. Old license numbers, reviewer identity/time, file references and timestamps remain unchanged. Primary/foreign key failures and transaction rollback are exercised. Original evidence ownership and attachment access are checked after replacement.

Audit entries may be added for provenance backfills and explicit application actions; historical entries are not deleted. New derived correction flags do not write legacy license rows. Unmatched provenance is retained rather than inferred.

This is local representative-data verification, not a production row-count or backup audit. No hosted before/after comparison was authorized or performed.

## 6. Issues discovered and disposition

No persistent/hosted data was affected by any of the failures below; all occurred in local files or disposable test databases.

| Severity | Failure/reproduction and root cause | Disposition |
| --- | --- | --- |
| Critical | Replacing an SPM hid pending evidence in assignment-filtered reads; preview returned 409 while lifecycle still blocked it. | **FIXED AND VERIFIED:** independent queue/history plus stable provenance, explicit review and unchanged credit rules. |
| High | Admin `POST /licenses/renewals` without specialization fields auto-verified; the same upload with tags stayed pending. | **FIXED AND VERIFIED:** explicit review decision independent of payload shape. |
| High | Backend accepted a legacy text license that profile validation rejected. | **FIXED AND VERIFIED:** strict number rule and qualification consistency. |
| High | Legacy license/archive handovers moved `project_phase_team` while leaving existing workspace responsibilities assigned to the old engineer. | **FIXED AND VERIFIED** for shared synchronization and the declined-assignment API regression; license-flow compatibility regression passes. Full hosted Office-signing flow remains subject to rollout QA. |
| Medium | Initial 027 correction-flag backfill fired an existing timestamp trigger, changing license `updated_at`. | **FIXED AND VERIFIED:** generated flag; complete original-row comparison passes. |
| Medium | Historical 004 workflow normalization after provenance protection raises `Original evidence ownership and file references are immutable`. That old migration remaps phase IDs. | **FIXED — ADDITIONAL REVIEW REQUIRED:** preserve the protection; any required historical workflow conversion must be reviewed and completed before 027. Do not bypass the trigger. |
| Medium | An introduced UI success handler referenced an undefined retry variable; successful note saves appeared failed and retained the form. | **FIXED AND VERIFIED:** initialize retry state before calling the API; existing duplicate-save/failed-form regression passes. |
| Low | Initial edit-script replacement produced `SyntaxError: Unexpected identifier 'to_jsonb'` and a multiline SQL string syntax error; backend did not start. | **FIXED AND VERIFIED:** corrected source edits and syntax checks; no API/database writes occurred. Test teardown now handles a backend that exits during startup. |
| Low | Replacement fixture used unsupported `inactive` status; an approval fixture omitted reviewer metadata; another legacy responsibility used a discipline outside its phase. | **FIXED AND VERIFIED:** use supported suspension, explicit reviewer/time and a valid reviewed fixture scope. Constraints retained. |
| Low | Migration test used reference equality for equal Date objects. | **FIXED AND VERIFIED:** value/deep comparison; no application change. |
| Low | Existing tests expected automatic Admin verification or ignored a superseded pending submission. | **FIXED AND VERIFIED:** assert pending state, exercise explicit review, and explicitly resolve old pending evidence before progression. No assertions disabled. |
| Low | The isolated assignment-window fixture lacked `engineer_qualified_scopes` after eligibility was unified. | **FIXED AND VERIFIED:** add a declared qualification fixture; keep every expiry-boundary assertion. |
| Medium | Eight existing TypeScript diagnostics: numeric envelope error code, missing upload-limit declarations, ES2020 `replaceAll` usage and omitted account-credential fields in a type. | **FIXED AND VERIFIED:** type-safe declarations/signatures and equivalent supported string replacement. Compiler strictness retained. |
| Low | Existing credential lint errors: unused `resolveNotifications` import and `left` local. | **FIXED AND VERIFIED:** remove unused bindings; expanded lint passes. |
| Medium | General backend lint applies browser globals to Node files and reports existing unused bindings/explicit-any issues, including an existing untracked snapshot directory. | **NOT FIXED:** 155 errors remain versus 157 in the equivalent baseline; no introduced diagnostics. No rules disabled, ignore lists added or unrelated modules rewritten. |
| Low | Vite warns about native-config `__dirname`, JSON import attributes and bundles over 500 kB. | **NOT FIXED:** existing warnings; build succeeds. |
| Low | Some read-only inspection commands used nonexistent optional paths or literal Windows globs. | Corrected discovery/reads; no repository or data change caused by these command errors. |

## 7. Outstanding validation and decisions

- **BLOCKED — USER DECISION REQUIRED:** hosted rollout. Review this diff, backup, migration order and preflight output; explicit authorization is required before any hosted operation. This run must not apply migrations or commit/push.
- **FIXED — ADDITIONAL REVIEW REQUIRED:** historical evidence with missing/ambiguous assignment provenance. Queue access is restored; deciding which responsibility should receive its credit requires reviewed historical records. No silent mapping or cleanup is provided.
- **NOT TESTED:** live Supabase outage/recovery, production network/storage interruption, production volume/load, independent PostgreSQL-session contention and deadlock behavior, and visual testing on real mobile devices. Existing local request/error tests and disposable transactions do not replace these checks. Evidence bytes are stored in the existing database tables; no new object-storage integration was added.
- Concurrency tests issue simultaneous HTTP requests but the PGlite API fixture uses a single backend pool connection. Project locks, uniqueness constraints and receipt transactions are exercised; this is not proof of distributed production contention behavior.
- Repository-wide lint and existing build warnings remain as disclosed above. Local passing tests do not establish that all possible system errors are eliminated.
- No attachment-deletion API was added. Submitted historical files remain retained. If an operator needs to correct invalid historical links, prepare an explicit audited plan rather than deleting records or disabling guards.

## 8. Deployment instructions — prepared only, not executed

1. Obtain explicit authorization for the exact target and maintenance window. Back up the database and file bytes, verify restoration in a disposable clone, and preserve an export of the original rows/counts and migration ledger. Do not rely on this local run as a hosted backup check.
2. In the clone, inspect `phase_schema_migrations` and actual schemas. 025 needs 020, and 026 needs 015. Verify their earlier prerequisites too. If the environment still needs `004-project-type-workflows.sql` phase-ID normalization, review/test that conversion **before** 027; do not run it afterward or disable provenance protection to force it through.
3. Review and run the read-only `Thesis-Backend/scripts/preflight-workflow-reliability.sql` against the clone. It lists prerequisites, columns, indexes, duplicate pending reports, noncanonical licenses, historical attachment mismatches, unlinked evidence, policies and record counts. The script was also validated in a disposable database.
4. Resolve duplicate pending-report conflicts through explicit, audited Office PM review, retaining both records. Investigate historical file/project/owner mismatches and ambiguous provenance. Do not delete, rewrite or merge them automatically. Uncertain cases require a user decision before rollout.
5. Apply the existing files, then the additive follow-up, in order. Example PowerShell commands for an operator **after authorization**, with the target URL supplied explicitly (never print it in logs):

   ```powershell
   Set-Location 'C:\Users\ADMIN\OneDrive\Documents\Siteline\10BuildersSiteline'
   psql --dbname "$env:SITELINE_REVIEWED_DATABASE_URL" --set ON_ERROR_STOP=1 --file Thesis-Backend/migrations/025-independent-spm-workspaces.sql
   if ($LASTEXITCODE -ne 0) { throw '025 failed; stop rollout and investigate.' }
   psql --dbname "$env:SITELINE_REVIEWED_DATABASE_URL" --set ON_ERROR_STOP=1 --file Thesis-Backend/migrations/026-credential-specializations.sql
   if ($LASTEXITCODE -ne 0) { throw '026 failed; stop rollout and investigate.' }
   psql --dbname "$env:SITELINE_REVIEWED_DATABASE_URL" --set ON_ERROR_STOP=1 --file Thesis-Backend/migrations/027-workflow-reliability.sql
   if ($LASTEXITCODE -ne 0) { throw '027 failed; stop rollout and investigate.' }
   ```

   The files contain their own transactions. An outer `BEGIN ... ROLLBACK` does **not** safely dry-run a file containing `COMMIT`. Use the disposable tests/clone for dry runs. The generic migration runner intentionally does not apply these dedicated files.

6. After confirming each actual commit/schema result, record its exact filename in the existing ledger. Verify the ledger exists and is the correct registry first; stop if it does not. Do not mark a failed or rollback-only migration as applied:

   ```sql
   INSERT INTO public.phase_schema_migrations(name) VALUES
     ('025-independent-spm-workspaces.sql'),
     ('026-credential-specializations.sql'),
     ('027-workflow-reliability.sql')
   ON CONFLICT(name) DO NOTHING;
   ```

7. Rerun the read-only preflight, compare preserved records/counts against the backup/clone, inspect the expected per-SPM report index and service-role-only policies, and verify both credential specialization columns. Review every unlinked-evidence result; old single-SPM history can legitimately have no responsibility slot.
8. Reproduce the local checks from the repository root:

   ```powershell
   node --experimental-strip-types --test --test-concurrency=4 tests/*.test.mjs
   npm --prefix Thesis-Backend test
   npx tsc --noEmit
   npm --prefix Thesis-Backend run lint:phase
   npm run test:ui
   npm run build
   ```

   Run the expanded configured ESLint check from `Thesis-Backend` over `src/services/licenses/*.js`, `src/services/workspace/phase-responsibilities.js`, `src/services/workspace/project-data.controller.js` and `src/common/utilities/license-eligibility.utility.js`. General `npm run lint` has the disclosed pre-existing debt and is not represented as passing.
9. Deploy the validated backend and frontend together after schema readiness, then manually exercise two SPMs, pending-evidence replacement, Office PM history/download/review, explicit credential verification and exact next-phase unlocking. The new frontend sends retry keys and needs receipt schema readiness.
10. If a migration fails, stop, preserve its error and inspect rollback/schema state. Do not continue blindly or use destructive down migrations. If rollback of an application release is needed, leave the additive data/history intact and use a reviewed compatibility plan; a previous backend containing the automatic-verification bug is not a safe default rollback target.

## 9. Modified file inventory

The inventory is generated from the final local diff below before delivery. No package dependencies or historical migrations 025/026 were changed.

| Change | File |
| --- | --- |
| New | [docs/WORKFLOW-RELIABILITY.md](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/docs/WORKFLOW-RELIABILITY.md>) |
| Modified | [src/api/actions.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/api/actions.ts>) |
| Modified | [src/api/adapter.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/api/adapter.ts>) |
| Modified | [src/api/client.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/api/client.ts>) |
| Modified | [src/EngineerCredentials.tsx](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/EngineerCredentials.tsx>) |
| Modified | [src/EngineerResponsibilities.tsx](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/EngineerResponsibilities.tsx>) |
| Modified | [src/EvidenceReview.tsx](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/EvidenceReview.tsx>) |
| Modified | [src/model.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/model.ts>) |
| Modified | [src/RoleWorkspace.tsx](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/RoleWorkspace.tsx>) |
| Modified | [src/workflows.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/src/workflows.ts>) |
| Modified | [tests/activity-migration-contract.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/activity-migration-contract.test.mjs>) |
| Modified | [tests/api-backend.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/api-backend.test.mjs>) |
| Modified | [tests/engineer-credentials.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/engineer-credentials.test.mjs>) |
| Modified | [tests/helpers/credential-fixture.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/helpers/credential-fixture.mjs>) |
| Modified | [tests/license-assignment-window.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/license-assignment-window.test.mjs>) |
| Modified | [tests/license-security.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/license-security.test.mjs>) |
| Modified | [tests/license-workflow.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/license-workflow.test.mjs>) |
| Modified | [tests/multi-spm-workspaces.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/multi-spm-workspaces.test.mjs>) |
| New | [tests/workflow-reliability-db.test.mjs](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tests/workflow-reliability-db.test.mjs>) |
| New | [Thesis-Backend/migrations/027-workflow-reliability.sql](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/migrations/027-workflow-reliability.sql>) |
| Modified | [Thesis-Backend/scripts/migration-plan.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/scripts/migration-plan.js>) |
| New | [Thesis-Backend/scripts/preflight-workflow-reliability.sql](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/scripts/preflight-workflow-reliability.sql>) |
| Modified | [Thesis-Backend/src/common/utilities/license-eligibility.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/common/utilities/license-eligibility.utility.js>) |
| Modified | [Thesis-Backend/src/domain/engineer-credentials.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/domain/engineer-credentials.js>) |
| New | [Thesis-Backend/src/domain/upload-limits.d.ts](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/domain/upload-limits.d.ts>) |
| Modified | [Thesis-Backend/src/services/archive/actions.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/archive/actions.controller.js>) |
| Modified | [Thesis-Backend/src/services/licenses/credentials.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/licenses/credentials.controller.js>) |
| Modified | [Thesis-Backend/src/services/licenses/override.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/licenses/override.controller.js>) |
| Modified | [Thesis-Backend/src/services/licenses/renewal.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/licenses/renewal.controller.js>) |
| Modified | [Thesis-Backend/src/services/licenses/routes.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/licenses/routes.js>) |
| Modified | [Thesis-Backend/src/services/licenses/sweep.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/licenses/sweep.js>) |
| Modified | [Thesis-Backend/src/services/progress/assignment.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/assignment.utility.js>) |
| New | [Thesis-Backend/src/services/progress/evidence-queue.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/evidence-queue.utility.js>) |
| Modified | [Thesis-Backend/src/services/progress/lifecycle.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/lifecycle.utility.js>) |
| Modified | [Thesis-Backend/src/services/progress/phase-submission.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/phase-submission.utility.js>) |
| Modified | [Thesis-Backend/src/services/progress/phase-update.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/phase-update.controller.js>) |
| Modified | [Thesis-Backend/src/services/progress/phase.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/phase.controller.js>) |
| Modified | [Thesis-Backend/src/services/progress/phase.routes.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/phase.routes.js>) |
| Modified | [Thesis-Backend/src/services/progress/phase.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/phase.utility.js>) |
| New | [Thesis-Backend/src/services/progress/request-receipt.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/request-receipt.utility.js>) |
| Modified | [Thesis-Backend/src/services/progress/verified.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/progress/verified.utility.js>) |
| Modified | [Thesis-Backend/src/services/projects/read.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/projects/read.controller.js>) |
| New | [Thesis-Backend/src/services/projects/responsibility-handover.utility.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/projects/responsibility-handover.utility.js>) |
| Modified | [Thesis-Backend/src/services/workspace/phase-responsibilities.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/workspace/phase-responsibilities.js>) |
| Modified | [Thesis-Backend/src/services/workspace/project-data.controller.js](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/Thesis-Backend/src/services/workspace/project-data.controller.js>) |


Validation logs (local, ignored by Git):

- [Full regression run](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-verified-tests.log>)
- [Backend unit tests](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-final-backend.log>)
- [TypeScript](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-final-types.log>)
- [Configured lint](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-final-lint.log>) and [expanded lint](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-final-lint-extra.log>)
- [General lint baseline comparison](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-full-lint-comparison2.log>)
- [Production build](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-final-build.log>)
- [Six-role navigation smoke](<C:/Users/ADMIN/OneDrive/Documents/Siteline/10BuildersSiteline/tmp/reliability-ui-smoke.log>)
