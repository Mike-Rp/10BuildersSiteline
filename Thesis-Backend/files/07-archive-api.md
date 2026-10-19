# Role-specific Archive API

Uses existing projects, users, assignment, document, request, and audit_log tables.
No schema migration or new table is needed. Workflow metadata is appended to audit_log
under the reserved _archive_event key. Existing trigger snapshots remain intact.

All endpoints below are relative to API_URL/archive and require a Bearer token.
The backend resolves the user's role and identity from the session; a supplied user_id
cannot grant access to another staff member's archive. Client accounts do not have access.

## Archive tabs

GET /summary returns the authenticated role and its tab counts.

| Role | GET path | Contents |
|---|---|---|
| Admin | /closed-projects | Project/type, OPM/SPMs, created/confirmed/closed dates, final headcount, document counts |
| Admin | /dead-end-intake | Archived declined/changes-requested intake, original flagged date, flagger, reason |
| Admin | /expired-assignments | Expired SPM invitations whose replacement reached accepted/declined |
| Admin | /suspended-accounts | Suspensions eligible for review and permanently removed accounts |
| OPM | /accepted-projects | Own accepted/completed projects, Site PMs, docs count, OPM acceptance date |
| OPM | /changes-requested | Resolved requests and flags attached to archived projects, flagged/resolved dates |
| OPM | /spm-responses | Accepted/declined/expired SPM responses on the OPM's projects, dates and notes |
| SPM | /completed-projects | Own completed projects, project type, OPM, assigned/accepted/closed dates, final headcount/docs |
| SPM | /subcontractor-requests | Own approved/rejected requests, company, trade/scope, project, submission/resolution dates, notes |
| SPM | /declined-assignments | Own declines, OPM, decline date, reason, reassignment/final outcome |

The fifth Share Links tab visible in the screenshots is outside the four Admin tabs requested.

Lists support page, pageSize (1–100), q, and optional offset/limit.
The response uses data as an array, count as the full matching total, pagination metadata,
and read_only=true.

Example:

```http
GET /accepted-projects?page=1&pageSize=20&q=Warehouse
GET /suspended-accounts?threshold_days=60&page=1&pageSize=20
```

OPM access includes projects currently managed, previously accepted, or present in their
historical engineer roster. SPM completed-project access includes confirmed current/past
phase assignments, engineer assignments, and accepted generic SPM confirmations.
Declined-only assignments allow the SPM's outcome history, but do not grant document access.

## Dates and columns

Common project fields:
- project_id, project_name, project_type, opm_name, spm_names.
- created_at, confirmed_at, accepted_at, closed_at.
- final_headcount, docs_uploaded, docs_required, document_requirements_configured.

For Admin's created → confirmed → closed display, use created_at, confirmed_at, closed_at.
confirmed_at is the recorded transition to confirmed, or to active after SPM acceptance
when the intake workflow has no separate persisted confirmed step.
accepted_at refers to OPM acceptance. OPM accepted rows also supply opm_accepted_at.
SPM completed rows supply assigned_at and spm_accepted_at for that SPM's own timeline.

Response rows expose response, response_at, notes, reason, and outcome. Declines include
declined_at. Replacement information includes replacement_user_id, replacement_spm_name,
replacement_response, reassigned_at, and outcome_at when recorded.
Outcome values include accepted, reassigned_pending, reassigned_accepted,
reassigned_declined, awaiting_admin_action, and archived.

Request status preserves the stored approved/rejected value and supplies status_label
as Accepted/Declined. Resolution notes are saved going forward.

Older dates/reasons that were never recorded stay null. No acceptance/decline reason or
final headcount is invented. Legacy final headcounts are recovered from the old project
snapshot at archival when available; new closures store an explicit final headcount.

## Read-only document repository

```http
GET /projects/:projectId/documents
GET /projects/:projectId/documents/:documentId/download
GET /projects/:projectId/contracts/:contractId/download
GET /projects/:projectId/phase-files/:fileId/download
```

The repository returns:
- documents: registered document labels, upload status, upload date, document ID.
- contracts: contract metadata.
- phase_files: private phase photos/reports/evidence file metadata.
- docs_uploaded, docs_required, document_requirements_configured, read_only=true.

Use document_id (UUID), not document_type_id, for a document download.
Documents/contracts stored under the existing uploads directory can be downloaded securely;
private phase files are served from PostgreSQL bytes. Arbitrary paths outside uploads
are not served. External object-storage keys/URLs need their storage provider configured
rather than being treated as local files.

The document counter uses document_types.is_required_for_intake and uploaded project_documents
with a file reference. It displays 6/6 only when six requirements are registered and uploaded.
The registry is currently empty, so the backend reports unconfigured rather than pretending
that six documents exist. Configure real requirements before displaying a six-document counter.

GET archive endpoints do not mutate state. There are no archive document-edit endpoints.

## Automatic project closure

After an OPM/admin confirms a phase update or verifies the last standalone Closeout item,
the project closes automatically when:
1. Current phase is Closeout.
2. The Closeout checklist is configured and every required item is approved.
3. No phase update, rework review, or subcontractor request remains pending.

The closure snapshots active assigned worker headcount before releasing the workers and
internal engineer roster, marks active subcontractor assignments released, sets lifecycle
to archived, and retains the project and all history/documents. It does not delete records.

An OPM/admin may also explicitly check/close an eligible project:

```http
POST /projects/:projectId/close
```

It returns 422 when the closure conditions are incomplete.
Configure Closeout requirements through the existing phase-checklist template API.
An empty checklist never counts as signed off.

## Changes-requested history and dead-end intake

```http
POST /projects/:projectId/changes-requested
```

```json
{"reason":"Structural plan revisions are required."}
```

The response returns event_id and flagged_at.

```http
POST /projects/:projectId/changes-requested/:eventId/resolve
```

```json
{"note":"Revised plans were received and reviewed."}
```

Only the responsible OPM or Admin can use these actions. Already resolved requests and
archived projects reject further changes. The intake log displays Changes Requested or
OPM Declined when applicable.

An inactive declined/changes-requested intake moves to dead-end archive after 30 idle
calendar days. Its original reason, flagger, and flagged date are retained. Recent flags,
project edits, document/contract uploads, notes, and SPM responses prevent premature expiry.
Active projects are never treated as dead-end intake. Archived intake cannot be resubmitted
through the ordinary intake endpoint.

Existing resolved rework requests also appear in the OPM history. Their resolved_at
means the review decision was completed; it is not a separate physical rework-completion flag.

## SPM responses, expiry and reassignment

Accept actions accept optional note. Decline actions now require reason or a nonempty note:

```json
{"reason":"The assignment overlaps an existing site commitment."}
```

SPM phase response deadlines begin after OPM acceptance and allow three business days.
Business days mean Monday–Friday in Asia/Taipei, preserving time of day.
Holidays are not configured. Existing historical deadlines are not rewritten.

The pending-expiry Admin queue is separate from the resolved archive:

```http
GET /assignments/escalated?limit=20&offset=0
```

Each item includes assignment_id and assignment_kind (phase or confirmation).
For a phase assignment:

```http
POST /phase-assignments/:assignmentId/reassign
```

```json
{"new_user_id":"22222222-2222-4222-8222-222222222222","note":"Reassigned after no response."}
```

The replacement must be an eligible active SPM with a current license.
For generic confirmation assignments, use the existing confirmation reassignment endpoint.
Prior outcomes remain in audit snapshots even if the live phase row changes.
The resolved-expiry archive includes an attempt only after a replacement responds
accepted or declined; unresolved attempts remain in the Admin action queue.

The existing subcontractor approve endpoint accepts optional note/resolution_note.
Its reject endpoint now requires reason, note, or resolution_note. These notes appear
in the SPM request history.

## Suspended-account review

GET /suspended-accounts?threshold_days=60 returns section=pending_review or archived.
Threshold may be 1–3650 calendar days. section_counts provides totals for both sections.

Suspended-since dates come from the latest recorded status transition, not arbitrary
profile-edit dates. Unknown historical suspension dates cannot qualify for an automatic
age threshold. Admin can still inspect those accounts through Team Accounts.

Suspension never causes automatic permanent removal. Admin decides:

```http
POST /accounts/:userId/remove
```

```json
{"reason":"Resigned from company; permanently offboarded."}
```

The account must be suspended and not already removed. It is soft-deleted, sessions are
cleared, and the reason is saved. The users row is retained for project history.
Admin cannot archive their own account.

```http
POST /accounts/:userId/reinstate
```

```json
{"note":"Temporary suspension has ended."}
```

Only a suspended, unremoved account may be reinstated. Permanently removed accounts
cannot be reinstated through this action.

## Maintenance and operations

The backend starts a non-overlapping maintenance timer every 15 minutes after startup.
It checks overdue SPM invitations, eligible Closeout projects, and stale dead-end intake.
There is no immediate sweep at startup.

Set ARCHIVE_MAINTENANCE_ENABLED=false to disable the periodic timer. Closeout approval
hooks still perform their normal automatic closure check.

Admin can explicitly run a sweep:

```http
POST /maintenance
```

This mutates eligible workflow records and appends audit events. It does not remove
suspended accounts automatically. Do not call it just to refresh archive tab counts;
use GET /summary instead.

Archive records can be viewed read-only, with deliberate review/reassignment actions on
currently unresolved records. The physical archived project rejects workflow edits.

## Verification

npm.cmd test covers permission boundaries, required Closeout approvals, pending reviews,
frozen final headcount, business-day deadlines, manual account decisions, and idle intake.
npm.cmd run lint:phase includes the archive modules.
All ten archive-view SQL statements and the Admin pending-expiry query were checked with
PostgreSQL EXPLAIN inside a read-only transaction. No schema migration or live maintenance
sweep was executed as part of verification.
