# Professional credentials and specializations

Implemented 2026-11-08 on main. The six-tag phase staffing rule was set aside and is unchanged.

## Reused functionality and changes

The Admin account form already supported multiple professions and supporting documents, but specialization selection and storage were account-level, with a global limit of three. The new form places the existing specialization catalog inside each credential card and enforces at most three selections per credential. Cards preserve their own profession, seven-digit license number as text, expiry, uploaded document and chosen tags. Selecting a profession never assigns tags automatically. Cards have stable identities, expand/collapse controls, and a confirmation before removal; the final credential cannot be removed.

Personal fields, generated account identity, phone and experience validation, role restrictions and authentication are retained. Office PM project-type specialization limits and the per-phase three-tag assignment limit are unchanged.

New account creation defaults to Pending Verification. Uploading or saving an associated credential does not automatically verify it. An Administrator can explicitly confirm the evidence review and provide a note at account creation, or use the existing credential verification action later. Selecting or editing tags does not change verification status. Existing legacy Admin API behavior remains compatible for submissions that do not use the new per-credential structure.

Profiles show each license/submission with its own tags and supporting document. Admins can edit the tags of a specific credential or pending submission without changing another. The directory exposes credential counts, a deduplicated specialization summary, and pending/verified/review status. Legacy tags remain separately labeled rather than assigned to a profession by inference.

## Database and migration

Apply Thesis-Backend/migrations/026-credential-specializations.sql after migration 015 through the established database deployment process. The migration adds nullable specialization arrays to user_licenses and license_renewal_requests, with a maximum of three entries. Pending submission associations are copied to the verified license and retained through renewal. New records do not flatten these associations into engineer_specializations. Existing account-level records remain intact for legacy compatibility.

The qualification view and browser qualification calculation require the specialization to belong to the same supporting verified credential. A tag cannot borrow verification from another professional license. Existing profession-to-scope mappings, expiry restrictions and verification requirements remain authoritative.

The migration is transactional and idempotent. It was executed twice against the configured database in a rollback-only transaction: 64 licenses, 22 submissions, 179 legacy specialization records and all 69 qualification rows were preserved. No credential association was inferred for old records.

**Persistent database migration was not applied. Migration 026 must be applied before deploying the new credential-entry flow.** Migration 025 from the prior independent-SPM change also remains a separate deployment item.

## Validation

- Full frontend/domain/database/UI suite: 599 passed, zero failed.
- Backend suite: 125 passed, zero failed.
- Focused credential and schema checks: 10 passed, zero failed.
- Production build, phase lint, targeted lint of changed backend files and whitespace checks passed.
- Expanded lint of all license modules also reports two pre-existing unused-variable errors in unchanged override.controller.js and sweep.js. Existing Vite configuration/bundle warnings remain. UI behavior and responsive CSS were tested through JSDOM and the production build; no real-device visual walkthrough was performed.

Acceptance coverage includes one, two and three credentials; three tags per card; varied tag counts; six/nine total selections; blocking a fourth or unsupported/duplicate tag within a credential; the same tag on different credentials; preserving other cards during add/remove/collapse and editing; leading zeros; document ownership and authorization; pending verification; separate profile/directory associations; and preservation of legacy credentials and qualification behavior. The suite also checks cross-credential qualification isolation, mixed legacy/new credential isolation and forged verification flags. The final focused security run passed all three tests after the mixed-legacy safeguard.

QA logs remain under the ignored tmp directory: credentials-all-tests.log, credential-backend.log, credentials-final-focused.log and credentials-build.log.

## Modified and added files

- Thesis-Backend/migrations/026-credential-specializations.sql
- Thesis-Backend/scripts/migration-plan.js
- Thesis-Backend/src/common/utilities/access.utility.js
- Thesis-Backend/src/domain/engineer-credentials.d.ts
- Thesis-Backend/src/domain/engineer-credentials.js
- Thesis-Backend/src/services/accounts/account-list.utility.js
- Thesis-Backend/src/services/accounts/manage.controller.js
- Thesis-Backend/src/services/licenses/credential-specializations.utility.js
- Thesis-Backend/src/services/licenses/credentials.controller.js
- Thesis-Backend/src/services/licenses/renewal.controller.js
- Thesis-Backend/src/services/licenses/routes.js
- Thesis-Backend/src/services/workspace/routes.js
- docs/CREDENTIAL-SPECIALIZATIONS.md
- src/App.tsx
- src/EngineerCredentials.tsx
- src/RegistrationCredentials.tsx
- src/api/actions.ts
- src/api/adapter.ts
- src/api/licenses.ts
- src/api/load.ts
- src/model.ts
- src/panels.tsx
- src/registration-credentials.css
- tests/account-credential-registration-ui.test.mjs
- tests/activity-migration-contract.test.mjs
- tests/engineer-credentials-ui.test.mjs
- tests/engineer-credentials.test.mjs
