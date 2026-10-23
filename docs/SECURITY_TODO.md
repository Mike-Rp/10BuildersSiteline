# Security TODO

**Status after merging GitHub `main` (commit 8f4bb37 by markzippz): items 1, 2 and the first point of item 3 are already fixed upstream.** The license routes now require an Administrator, the license and contract updates use a fixed column list with bound parameters, and `authenticate()` checks the JWT, the stored session, the account status and the deleted flag. `tests/license-security.test.mjs` covers this. Keep this file as the record of what was found; the descriptions below are of the code before that fix. Still open: the download route check in item 3 (`/engineer/engineers/:id/documents/:documentType/download` should be self-or-Admin; confirm it).

Found during the expired-license audit (2026-10-22), by reading the code.

## 1. SQL injection in the license update (HIGH)

**Where:** [Thesis-Backend/src/common/utilities/upload.utility.js](../Thesis-Backend/src/common/utilities/upload.utility.js), function `uploadLicense`, branch `method === 'update'`.

| Line | Code | Attacker-controlled value |
|---|---|---|
| 115 | `` `license_number = '${data.license_number}'` `` | form field `license_number` |
| 119 | `` `license_expiry = '${data.license_expiry}'` `` | form field `license_expiry` |
| 123 | `` `upload_file_ref = '${file.path}'` `` | uploaded file path |
| 127 | `` `updated_by = '${created_by}'` `` | the caller's id |
| 132 | `` WHERE id = '${data.id}' `` | URL parameter `:id` |

The statement is built by joining strings and run with no parameters (`execute(...)` at line 129). With no parameters the `pg` driver uses the simple query protocol, which also accepts several statements in one string.

**Reachable through:** `PUT /api/v1/accounts/licenses/:id` (Admin only, `requireLicenseAdmin`) and `PUT /api/v1/engineer/licenses/:id` (see item 2: no check at all). The controller is `updateLicense` in `services/accounts/license.controller.js`.

**How it can be exploited:** a request whose `license_number` ends a quote and adds its own SQL, for example the value `X', license_expiry = '2099-12-31` (sets any expiry the attacker wants, so an expired engineer looks valid), or a value that closes the statement and starts another one (`'; update users set ...; --`). That allows reading, changing or deleting any table the database user can reach, including accounts, passwords and tokens. The `:id` parameter and the file name are injectable the same way.

**Same pattern elsewhere in the same file:** `uploadContract`, branch `update`, lines 209, 213, 217, 221, 222, 226 and 231 (`contract_type`, `subcontractor_name`, `trade_scope`, `file_ref`, `uploaded_by`, `WHERE id`). Fix it in the same change.

**Fix:**
1. Build the `SET` list from a fixed whitelist of column names and pass every value as a parameter (`$1`, `$2`, ...). Never put request values inside the SQL text.
2. Validate before the query: `id` must be a UUID (`isUuid`), `license_expiry` must match `YYYY-MM-DD` and be a real date, `license_number` must be a trimmed string of at most 120 characters.
3. Add a regression test that sends `X', license_expiry = '2099-12-31` and expects it to be stored as a literal string or rejected, never applied as SQL.

## 2. License routes with no authentication or role check (HIGH)

**Where:** [Thesis-Backend/src/services/engineer/routes.js](../Thesis-Backend/src/services/engineer/routes.js), lines 33 to 47, and `services/accounts/license.controller.js`.

- `GET /api/v1/engineer/licenses` and `/licenses/:id` have no login check, so anyone can read license numbers and expiry dates.
- `POST /api/v1/engineer/licenses/` and `PUT /api/v1/engineer/licenses/:id` call `authenticate(req)` but never stop when it returns `null`. The same routes under `/accounts` correctly use `requireLicenseAdmin`.
- Impact: anyone who can reach the server could replace an engineer's license record (supersede the real one with a fake expiry), which defeats the expired-license workflow, and could use item 1 for full SQL access.

**Fix:** put `requireLicenseAdmin` (or `requireUser` with the right roles) on every route in that block, and make `authenticate` callers reject `null`. Prefer removing the duplicate `/engineer/licenses*` routes and keeping one admin-only set.

## 3. Related hardening (MEDIUM)

- `authenticate()` in `common/utilities/auth.utility.js` looks the token up in `users_token` without checking the JWT signature, the user's status or the deleted flag. Use `getCurrentUser` everywhere instead.
- `GET /engineer/engineers/:id/documents/:documentType/download` should be checked for a self-or-Admin rule, because license files are personal data.
