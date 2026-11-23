# Project setup API

Paths below are relative to `/api/v1`. Deploy the API and workspace changes together.

## Contract conversion and retrieval

| Endpoint | Frontend behavior |
| --- | --- |
| `POST /projects/inquiries/:id/workflow` | On signed-contract confirmation, send the same `contract_file_id` and `request_id` (the file UUID) on retry. Keep the original review version and expected previous contract. |
| `POST /projects/intake` | The first conversion and a replay return `project` and `signed_contract`. The latter carries `code`, document row `id`, stored `file_id`, `original_name`, `content_type`, `byte_size`, `uploaded_at`, and `download_url`. An older conversion without a recoverable file can return null. |
| `GET /projects/:id/documents` and `GET /workspace/project-data` | Find the registered document by `code === "owner_contract"`. The standalone list and bulk workspace include the same file identity and metadata. Use the supplied download URL with the existing session. |
| `POST /projects/:id/workspace-command` | `upload_registered` locks the slot after save. Repeating the same file and uploader returns `project_id`. A different file for that slot returns 409. For project activation, a repeat of the saved Lead Site PM agreement returns the project ID while the project is active. |

The signed client contract intentionally counts once among the six required documents. Both screen entries open the same upload. The Lead Site PM’s subcontractor agreement is a separate document.

Both historical `db:<uuid>` and `db://<uuid>` references are readable. After migration 033, run `Thesis-Backend/migrations/034-recover-inquiry-contracts.sql` once on the target database. It is safe to repeat. It fills an empty slot only when the converted inquiry identifies a confirmed file already assigned to that project and uploaded by its Office PM. Existing uploads take precedence. Conflicting IDs, missing bytes or absent project ownership require staff review. Migration 034 makes no guesses from filenames or client names.

## Upload and submission retries

1. Allocate one UUID per selected file and a separate UUID for the checklist submission. Keep the file order. For a checklist, the workspace retains these IDs while the dialog is open. It also recognizes the same files reselected in the same tab after reopening or reloading, using the actor, project, responsibility or item, evidence version, filenames, and content fingerprints. The saved tab entry expires after seven days of inactivity. A correction starts a new attempt.
2. For documents and evidence, call `POST /files/upload-url` with `id`, `name`, `size`, and `kind`. In `direct` mode use `POST /files`, or `POST /files/chunks` followed by `POST /files/:id/complete`. In `storage` mode PUT to the signed URL and call `POST /files/:id/complete-storage`. In `complete` mode use the returned `id` and `download_url` immediately. A lost storage PUT response can be recovered by requesting the target again with the same ID.
3. For each stored file call `POST /projects/:id/phase-files`. Send `file_id`, use that same UUID as `request_id`, and include `responsibility_id` and `checklist_item_id` for a monitored project. Keep the returned phase-file `id`.
4. Call `POST /projects/:id/checklist-items/:itemId/submit` with the **submission** `request_id`, ordered phase-file `file_ids`, the responsibility and any submission note. Replay the identical request after a lost response. The receipt returns the original evidence `id`, `status`, `submitted_at`, `checklist_item_id`, and file IDs. A changed receipt payload gets 409. To see the current review decision, reload the project.
5. The assigned Office PM opens `GET /projects/:id/evidence/:evidenceId/review-preview`, then posts to `/approve` or `/reject` under the same evidence URL with `expected_review_token`. Rejection requires `review_note`. Admin can inspect evidence history. A Site PM submits fresh attachments to correct returned evidence.

PDF, PNG, and JPEG documents and evidence allow up to 10 MiB per file. The server checks actual content against the extension, including assembled chunks and stored objects. The separate Excel manpower route allows up to 15 MiB with workbook validation. A checklist batch supports up to 20 files.

### Abandoned uploads

Incomplete chunk sets are eligible for removal after the whole set has been idle for 24 hours. The chunk endpoint removes stale sets for that uploader on later uploads. Re-sending all parts with the original ID resumes the attempt. Invalid stored objects can be removed on validation failure. A transient storage read failure keeps the object available for retry.

Completed uploads and phase links have no automatic age-based purge. Before removing one, establish that the attempt was abandoned, its seven-day retry window and outstanding upload URLs have expired, and no inquiry, registered document, phase file, evidence version, receipt, or other application record refers to the bytes or storage path. Historical uploads can have references outside a project row. Keep ambiguous records for review.

## Client account recovery

`GET /projects/:id/client-account` is available to Admin and the assigned Office PM. Use `status`, `next_action`, `can_recover`, and `can_issue_activation_code` to drive controls.

| Status | Next action | Staff action |
| --- | --- | --- |
| `pending_activation` | `issue_activation_code` | Assigned Office PM verifies the client and calls `POST /projects/:id/client-account/activation-code`. The result contains `email`, one-time `code`, and `expires_at`. |
| `missing_valid_email` | `request_email_correction` | Obtain the correct address and have Admin verify who owns it. This includes older setup records without an inquiry email. |
| `unlinked` | `admin_verify` | Admin verifies the recorded client and address. |
| `account_unavailable` or `setup_locked` | `admin_verify` | Review an unavailable or ambiguous link, or the locked project lifecycle. |
| `active` | `none` | The linked client account is active. Project activation still has its own prerequisites. |

For an unlinked, editable intake, Admin posts `{ "email": "verified@example.org", "ownership_verified": true }` to `/projects/:id/client-account/recover`. Recovery links a matching active client or creates an invited client when the address is unused. It records the verified address and Admin actor in the audit log and preserves the original inquiry snapshot. Existing links, unavailable accounts, and identity collisions return 409. Invalid input or absent ownership verification returns 422. The existing `POST /projects/:id/client` remains available to link a verified active match for an inquiry project.
