# Project attachment allowance

Each project has a combined allowance of 10 MB (10,485,760 bytes) across
documents, appointments, agreements, photos and phase evidence. The allowance
applies across submissions and includes retained earlier versions. Referencing
the same stored file again does not count its bytes twice.

Both file stores are checked under the same project row lock inside the upload
transaction. Project document linking and phase-file insertion use this check,
so simultaneous uploads serialize before calculating the remaining allowance.
Files cannot be moved between projects to bypass the limit.

Existing projects above the allowance remain readable; additional files are
rejected. No existing files are deleted. Rejections report the remaining bytes.
Generic document uploads are staged before project linking; rejected staged
files are not attached to the project and do not consume its allowance.

Account license documents and company directory documents are separate from
project storage. Their existing individual file rules remain in effect, as
does the 15 MB company manpower spreadsheet rule. Shared upload hints distinguish
the project total from these individual limits. No database migration is needed.

Verification: `node --experimental-strip-types --test tests/project-upload-budget.test.mjs tests/upload-policy.test.mjs tests/upload-limits-ui.test.mjs`
