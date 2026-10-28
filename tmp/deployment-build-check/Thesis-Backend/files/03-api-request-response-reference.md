# Construction Workforce Dashboard — API Request / Response Reference

> Current Team Accounts pagination/filtering and intake-client endpoints are documented in [06-account-intake-api.md](06-account-intake-api.md).


> Phase progress, checklist evidence, uploads, and related project write behavior are defined in [05-phase-progress-api.md](05-phase-progress-api.md). Those current contracts supersede the older manual percentage examples below.


Companion to `02-api-endpoint-specifications.md`. Every endpoint listed there now has a matching entry below — same section numbers/order — with a representative request/response payload and the **tables affected** (queried on GET, written on POST/PATCH/DELETE), so a change to any table can be traced back to the endpoints that touch it.

**Audit trail note:** every mutating endpoint (POST/PATCH/PUT/DELETE) also writes a row to `audit_log` via that table's trigger (see `01-database-schema.md` §8). This is omitted from each entry below to avoid repeating it 60+ times — assume `audit_log` is affected on every non-GET call in this document.

## Standard Envelope

**Success (single resource / action):**
```json
{ "data": { }, "meta": { "timestamp": "2026-09-23T08:15:00Z" } }
```

**Success (list):**
```json
{ "data": [ ], "meta": { "page": 1, "pageSize": 20, "totalCount": 42, "timestamp": "2026-09-23T08:15:00Z" } }
```

**Error:**
```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "licenseExpiry must be a valid future or past date", "fields": { "licenseExpiry": "Invalid date format" } },
  "meta": { "timestamp": "2026-09-23T08:15:00Z" }
}
```

---

## 1. Auth

### POST `/auth/login`
**Tables:** `users` (read), `user_sessions` (insert)
Request:
```json
{ "email": "patricia.domingo@10builders.com", "password": "demo1234" }
```
Response `200`:
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "8f2b0c...",
    "expiresIn": 3600,
    "user": { "id": "a0000000-0000-0000-0000-000000000001", "fullName": "Patricia N. Domingo", "role": "admin", "status": "active", "mustResetPassword": false }
  }
}
```
Response `401`:
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect." } }
```

### POST `/auth/refresh`
**Tables:** `user_sessions` (read)
Request:
```json
{ "refreshToken": "8f2b0c..." }
```
Response `200`:
```json
{ "data": { "accessToken": "eyJhbGciOi...", "expiresIn": 3600 } }
```

### POST `/auth/logout`
**Tables:** `user_sessions` (update — sets `logout_at`)
Request: `{}` (token identifies the session)
Response `204`: *(no body)*

### POST `/auth/force-password-reset`
**Tables:** `users` (update — `password_hash`, `temp_password_issued`)
Request:
```json
{ "newPassword": "N3wSecureP@ss!" }
```
Response `200`:
```json
{ "data": { "id": "a0000000-0000-0000-0000-000000000007", "mustResetPassword": false } }
```

---

## 2. Accounts (Users)

### GET `/accounts?role=spm&status=active`
**Tables:** `users`, `user_discipline_scopes`, `user_project_type_specializations` (read, for scope summary column)
Response `200`:
```json
{
  "data": [
    { "id": "a0000000-0000-0000-0000-000000000004", "fullName": "Karlo M. Espiritu", "role": "spm", "status": "active", "scope": ["Structural", "Civil"], "dateAdded": "2026-03-05" }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 7 }
}
```

### POST `/accounts`
**Tables:** `users` (insert), `user_discipline_scopes` / `user_project_type_specializations` / `user_client_project_links` (insert, depending on role)
Request:
```json
{
  "fullName": "Mikaela Bautista",
  "email": "mikaela.bautista@10builders.com",
  "phone": "0922 887 5541",
  "role": "spm",
  "scope": { "disciplines": ["Electrical", "Plumbing", "Fire Protection"] }
}
```
Response `201`:
```json
{ "data": { "id": "u-007", "fullName": "Mikaela Bautista", "role": "spm", "status": "invited", "tempPassword": "kR7mNqTz2p", "dateAdded": "2026-07-20" } }
```
Notes: `tempPassword` is returned **once**, on creation only. For `role: "opm"`, body uses `"scope": { "projectTypes": ["Residential","Mixed-Use"] }` (max 2, enforced by the `trg_check_opm_specialization_cap` trigger on `user_project_type_specializations`, `422` if exceeded). For `role: "client"`, `"scope": { "linkedProjectIds": ["p-004"] }` writes to `user_client_project_links`.

### GET `/accounts/{id}`
**Tables:** `users`, `user_discipline_scopes`, `user_project_type_specializations`, `user_client_project_links`, `user_licenses`, `user_certifications` (all read)
Response `200`:
```json
{
  "data": {
    "id": "a0000000-0000-0000-0000-000000000004",
    "fullName": "Karlo M. Espiritu",
    "email": "karlo.espiritu@10builders.com",
    "role": "spm",
    "status": "active",
    "scope": ["Structural", "Civil"],
    "license": { "licenseNumber": "PRC Registered Civil Engineer No. 0068312", "licenseExpiry": "2028-02-11", "status": "uploaded" },
    "certifications": ["PRC-Civil", "DOLE-Safety", "BFP-FireSafety"]
  }
}
```

### PATCH `/accounts/{id}`
**Tables:** `users` (update), `user_discipline_scopes` / `user_project_type_specializations` (replace rows if `scope` included)
Request:
```json
{ "phone": "0919 774 9900", "scope": { "disciplines": ["Structural", "Civil", "Geotechnical"] } }
```
Response `200`:
```json
{ "data": { "id": "a0000000-0000-0000-0000-000000000004", "phone": "0919 774 9900", "scope": ["Structural", "Civil", "Geotechnical"] } }
```

### PATCH `/accounts/{id}/status`
**Tables:** `users` (update — `status`)
Request:
```json
{ "status": "suspended", "reason": "Extended leave" }
```
Response `200`:
```json
{ "data": { "id": "a0000000-0000-0000-0000-000000000011", "status": "suspended" } }
```

### POST `/accounts/{id}/regenerate-password`
**Tables:** `users` (update — `password_hash`, `temp_password_issued`)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "a0000000-0000-0000-0000-000000000011", "tempPassword": "Q2vXn8Lpe4" } }
```

### GET `/accounts/{id}/licenses`
**Tables:** `user_licenses` (read, all rows incl. `superseded_at IS NOT NULL` history)
Response `200`:
```json
{
  "data": [
    { "id": "lic-090", "licenseNumber": "PRC Registered Civil Engineer No. 0068312", "licenseExpiry": "2028-02-11", "uploadStatus": "uploaded", "supersededAt": null }
  ]
}
```

### POST `/accounts/{id}/licenses`
**Tables:** `user_licenses` (insert new row; marks any prior active row's `superseded_at`)
Request (multipart/form-data):
```
licenseNumber: "PRC Registered Civil Engineer No. 0091234"
licenseExpiry: "2027-01-18"
file: <binary>
```
Response `201`:
```json
{ "data": { "id": "lic-114", "userId": "u-002", "status": "uploaded", "licenseExpiry": "2027-01-18" } }
```

### PUT `/accounts/{id}/certifications`
**Tables:** `user_certifications` (delete existing rows for user, insert replacement set)
Request:
```json
{ "certificationTypeCodes": ["PRC-Civil", "DOLE-Safety", "BFP-FireSafety"] }
```
Response `200`:
```json
{ "data": { "userId": "a0000000-0000-0000-0000-000000000004", "certifications": ["PRC-Civil", "DOLE-Safety", "BFP-FireSafety"] } }
```

### GET `/accounts/license-alerts`
**Tables:** `users`, `user_licenses` (read, filtered on `license_expiry` within/past threshold or `upload_status <> 'uploaded'`)
Response `200`:
```json
{
  "data": [
    { "userId": "a0000000-0000-0000-0000-000000000005", "fullName": "Bea R. Concepcion", "licenseExpiry": "2025-11-30", "alertLevel": "expired" }
  ],
  "meta": { "totalCount": 1 }
}
```

---

## 3. Project Intake & Lifecycle

### POST `/projects/intake`
**Tables:** `projects` (insert), `projects` (update — `suggested_opm_id`, `headcount_suggested` after the matching step below runs), `project_phase_team` (insert, one row per stage, `status='pending'`)
Request:
```json
{
  "name": "Alden Heights Residences — Tower B",
  "projectType": "Mixed-Use",
  "floorAreaSqm": 18400,
  "floorCount": 22,
  "targetStartDate": "2026-09-01",
  "clientName": "Marbrisa Land Corp."
}
```
Response `201`:
```json
{
  "data": {
    "id": "p-004",
    "lifecycleStatus": "draft",
    "suggestedAllocation": {
      "opm": { "userId": "u-002", "name": "Renz D. Villaverde", "matchScore": 94 },
      "phaseTeam": [
        { "stage": "Mobilization", "spmUserId": "u-004", "spmName": "Karlo M. Espiritu", "isLead": true },
        { "stage": "Design", "spmUserId": "u-013", "spmName": "Rafael D. Mercado", "isLead": false }
      ],
      "headcountSuggested": 6,
      "headcountTier": "Small tier base"
    }
  }
}
```

### GET `/projects/intake/{id}/suggested-allocation`
**Tables:** `projects`, `project_phase_team`, `users` (read)
Response `200`:
```json
{
  "data": {
    "opm": { "userId": "u-002", "name": "Renz D. Villaverde", "matchScore": 94 },
    "phaseTeam": [
      { "stage": "Mobilization", "spmUserId": "u-004", "spmName": "Karlo M. Espiritu", "status": "pending" }
    ],
    "headcountSuggested": 6
  }
}
```

### POST `/projects/intake/{id}/reallocate`
**Tables:** `projects` (update — `suggested_opm_id`, `suggested_opm_match_score`), `project_phase_team` (delete + reinsert pending rows)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "p-004", "suggestedAllocation": { "opm": { "userId": "u-012", "name": "Josef A. Manalo", "matchScore": 89 } } } }
```

### PATCH `/projects/intake/{id}/phase-team/{stageId}`
**Tables:** `project_phase_team` (update — `spm_user_id`, resets `status='pending'`)
Request:
```json
{ "spmUserId": "a0000000-0000-0000-0000-000000000013" }
```
Response `200`:
```json
{ "data": { "stage": "Design", "spmUserId": "a0000000-0000-0000-0000-000000000013", "spmName": "Rafael D. Mercado", "status": "pending" } }
```

### POST `/projects/intake/{id}/contract`
**Tables:** `contracts` (insert, `contract_type='client_contract'`)
Request (multipart/form-data): `file: <binary>`
Response `201`:
```json
{ "data": { "id": "ct-021", "contractType": "client_contract", "uploadedAt": "2026-08-01T02:00:00Z" } }
```

### POST `/projects/intake/{id}/client-subcon-agreement`
**Tables:** `contracts` (insert, `contract_type='client_subcon_agreement'`)
Request (multipart/form-data):
```
subcontractorName: "Bravado Fit-Out Specialists"
tradeScope: "Interior Fit-Out"
file: <binary>
```
Response `201`:
```json
{ "data": { "id": "ct-022", "contractType": "client_subcon_agreement", "subcontractorName": "Bravado Fit-Out Specialists", "isLocked": true } }
```

### POST `/projects/intake/{id}/confirm-and-send`
**Tables:** `projects` (update — `lifecycle_status`), `assignment_confirmations` (insert, one per OPM/lead SPM)
Request: `{}` (validates that contract + phase team are complete)
Response `200`:
```json
{ "data": { "id": "p-004", "lifecycleStatus": "sent_to_opm", "sentAt": "2026-08-01T03:10:00Z" } }
```
Response `422` (contract missing):
```json
{ "error": { "code": "CONTRACT_REQUIRED", "message": "Upload the signed contract agreement before sending this project to the Office PM." } }
```

### GET `/projects/intake-log`
**Tables:** `projects` (read, all lifecycle states)
Response `200`:
```json
{ "data": [ { "id": "p-004", "name": "Alden Heights Residences — Tower B", "lifecycleStatus": "sent_to_opm", "createdAt": "2026-08-01T00:00:00Z" } ], "meta": { "totalCount": 4 } }
```

### GET `/projects`
**Tables:** `projects` (read, role-filtered via `project_phase_team`/`project_engineers`/`user_client_project_links` join)
Response `200`:
```json
{ "data": [ { "id": "p-004", "name": "Alden Heights Residences — Tower B", "currentStage": "Foundation", "currentPct": 32, "lifecycleStatus": "active" } ], "meta": { "page": 1, "pageSize": 20, "totalCount": 4 } }
```

### GET `/projects/{id}`
**Tables:** `projects`, `project_engineers`, `project_subcontractor_assignments`, `project_documents`, `project_progress_history` (read, aggregated detail view)
Response `200`:
```json
{
  "data": {
    "id": "p-004",
    "name": "Alden Heights Residences — Tower B",
    "currentStage": "Foundation",
    "currentPct": 32,
    "engineers": [ { "userId": "a0000000-0000-0000-0000-000000000004", "name": "Karlo M. Espiritu", "roleLabel": "Site PM" } ],
    "subcontractors": [ { "companyName": "Bravado Fit-Out Specialists", "trade": "Facade", "workerCount": 5 } ]
  }
}
```

### PATCH `/projects/{id}`
**Tables:** `projects` (update)
Request:
```json
{ "crewRequired": 16 }
```
Response `200`:
```json
{ "data": { "id": "p-004", "crewRequired": 16 } }
```

### POST `/projects/{id}/archive`
**Tables:** `projects` (update — `lifecycle_status='archived'`, `archived_at`)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "p-001", "lifecycleStatus": "archived", "archivedAt": "2026-09-20T00:00:00Z" } }
```

---

## 4. Assignment Confirmations

### GET `/confirmations`
**Tables:** `assignment_confirmations`, `projects` (read, filtered to `target_user_id = current user`, `status='pending'`)
Response `200`:
```json
{
  "data": [
    { "id": "conf-021", "projectId": "p-004", "projectName": "Alden Heights Residences — Tower B", "roleContext": "spm", "matchScore": 91, "status": "pending", "responseDeadlineAt": "2026-08-03T00:00:00Z" }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 1 }
}
```

### POST `/confirmations/{id}/accept`
**Tables:** `assignment_confirmations` (update — `status='accepted'`, `responded_at`), `project_engineers` (insert, if `role_context='opm'`)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "conf-021", "status": "accepted", "respondedAt": "2026-08-01T09:00:00Z" } }
```

### POST `/confirmations/{id}/decline`
**Tables:** `assignment_confirmations` (update — `status='declined'`, `responded_at`)
Request:
```json
{ "reason": "Already at capacity this quarter" }
```
Response `200`:
```json
{ "data": { "id": "conf-021", "status": "declined", "respondedAt": "2026-08-01T09:05:00Z" } }
```

### POST `/confirmations/{id}/reassign`
**Tables:** `assignment_confirmations` (insert new row with `reassigned_from_id`; update old row's `status='reassigned'`)
Request:
```json
{ "newUserId": "u-006", "reason": "Original SPM non-responsive past deadline" }
```
Response `201`:
```json
{ "data": { "id": "conf-022", "status": "pending", "reassignedFromId": "conf-021" } }
```

### GET `/projects/{id}/phase-team`
**Tables:** `project_phase_team`, `users` (read)
Response `200`:
```json
{ "data": [ { "stage": "Foundation", "spmUserId": "a0000000-0000-0000-0000-000000000004", "spmName": "Karlo M. Espiritu", "status": "confirmed", "isLead": true } ] }
```

### POST `/projects/{id}/phase-team/{stageId}/accept`
**Tables:** `project_phase_team` (update — `status='confirmed'`, `responded_at`)
Request: `{}`
Response `200`:
```json
{ "data": { "stage": "Foundation", "status": "confirmed", "respondedAt": "2026-08-02T01:00:00Z" } }
```

### POST `/projects/{id}/phase-team/{stageId}/decline`
**Tables:** `project_phase_team` (update — `status='declined'`, `responded_at`)
Request:
```json
{ "reason": "Discipline mismatch — Structure phase needs a Structural specialist" }
```
Response `200`:
```json
{ "data": { "stage": "Structure", "status": "declined", "respondedAt": "2026-08-02T01:10:00Z" } }
```

---

## 5. Progress & Rework

### POST `/projects/{id}/progress-updates`
**Tables:** `pending_progress_updates` (insert), `project_photos` (insert, if `photoIds` provided)
Request:
```json
{ "stage": "Foundation", "pct": 32, "note": "Pile driving completed, footings poured.", "photoIds": ["photo-101"] }
```
Response `201`:
```json
{
  "data": {
    "id": "pu-014", "projectId": "p-004", "priorStage": "Mobilization", "priorPct": 14,
    "requestedStage": "Foundation", "requestedPct": 32, "isMaterialChange": true,
    "status": "pending", "autoApproveDeadlineAt": "2026-08-04T09:00:00Z"
  }
}
```

### GET `/projects/{id}/progress-updates/pending`
**Tables:** `pending_progress_updates` (read)
Response `200`:
```json
{ "data": { "id": "pu-014", "requestedStage": "Foundation", "requestedPct": 32, "status": "pending", "autoApproveDeadlineAt": "2026-08-04T09:00:00Z" } }
```
Response `200` (none pending):
```json
{ "data": null }
```

### POST `/progress-updates/{id}/approve`
**Tables:** `pending_progress_updates` (update — `status='approved'`, `resolved_by`, `resolved_at`, `resulting_history_id`), `project_progress_history` (insert), `projects` (update — `current_stage_id`, `current_pct`)
Request:
```json
{ "resolutionNote": "Verified against site photos." }
```
Response `200`:
```json
{ "data": { "id": "pu-014", "status": "approved", "resolvedAt": "2026-08-02T10:00:00Z", "resultingHistoryId": "hist-088" } }
```

### POST `/progress-updates/{id}/reject`
**Tables:** `pending_progress_updates` (update — `status='rejected'`, `resolved_by`, `resolved_at`)
Request:
```json
{ "resolutionNote": "Photos don't show footing completion on Grid C — resubmit once verified." }
```
Response `200`:
```json
{ "data": { "id": "pu-009", "status": "rejected", "resolvedAt": "2026-07-23T09:00:00Z" } }
```

### GET `/progress-updates/escalated`
**Tables:** `pending_progress_updates`, `projects` (read, `status='escalated'`)
Response `200`:
```json
{ "data": [ { "id": "pu-009", "projectId": "p-001", "projectName": "Rosaria Business Park", "requestedStage": "Structure", "requestedPct": 62, "escalatedAt": "2026-07-23T00:00:00Z", "daysSinceSubmission": 3 } ] }
```

### POST `/projects/{id}/rework-requests`
**Tables:** `pending_rework_requests` (insert)
Request:
```json
{ "stage": "Structure", "reason": "Rebar spacing failed QA/QC spot check on Level 4." }
```
Response `201`:
```json
{ "data": { "id": "rw-006", "status": "pending", "submittedAt": "2026-07-05T04:20:00Z" } }
```

### GET `/rework-requests`
**Tables:** `pending_rework_requests`, `projects` (read, `status='pending'`)
Response `200`:
```json
{ "data": [ { "id": "rw-006", "projectId": "p-002", "stage": "Structure", "reason": "Rebar spacing failed QA/QC spot check on Level 4.", "status": "pending" } ] }
```

### POST `/rework-requests/{id}/approve`
**Tables:** `pending_rework_requests` (update — `status='approved'`, `resolved_by`, `resolved_at`, `resolution_note`)
Request:
```json
{ "resolutionNote": "Rework confirmed complete; re-inspection passed." }
```
Response `200`:
```json
{ "data": { "id": "rw-006", "status": "approved", "resolvedAt": "2026-07-10T00:00:00Z" } }
```

### POST `/rework-requests/{id}/reject`
**Tables:** `pending_rework_requests` (update — `status='rejected'`, `resolved_by`, `resolved_at`, `resolution_note`)
Request:
```json
{ "resolutionNote": "Not a rework issue — proceed as planned." }
```
Response `200`:
```json
{ "data": { "id": "rw-007", "status": "rejected", "resolvedAt": "2026-07-11T00:00:00Z" } }
```

### GET `/projects/{id}/history`
**Tables:** `project_progress_history` (read; `is_client_visible=true` filter applied for `client` role)
Response `200`:
```json
{ "data": [ { "id": "hist-088", "stage": "Foundation", "pct": 32, "note": "Pile driving completed, footings poured.", "isIssue": false, "recordedAt": "2026-08-02T10:00:00Z" } ] }
```

### POST `/projects/{id}/photos`
**Tables:** `project_photos` (insert)
Request (multipart/form-data):
```
caption: "Rebar cage, Level 4 column C7"
takenDate: "2026-07-04"
file: <binary>
```
Response `201`:
```json
{ "data": { "id": "photo-101", "caption": "Rebar cage, Level 4 column C7", "takenDate": "2026-07-04" } }
```

### GET `/projects/{id}/photos`
**Tables:** `project_photos` (read)
Response `200`:
```json
{ "data": [ { "id": "photo-101", "url": "https://cdn.10builders.com/photos/photo-101.jpg", "caption": "Rebar cage, Level 4 column C7", "takenDate": "2026-07-04" } ] }
```

### POST `/projects/{id}/notes`
**Tables:** `project_notes` (insert)
Request:
```json
{ "noteText": "Client requested a walkthrough the week of Aug 10." }
```
Response `201`:
```json
{ "data": { "id": "note-033", "noteText": "Client requested a walkthrough the week of Aug 10.", "notedAt": "2026-08-01T06:00:00Z" } }
```

### GET `/projects/{id}/notes`
**Tables:** `project_notes` (read)
Response `200`:
```json
{ "data": [ { "id": "note-033", "author": "Renz D. Villaverde", "noteText": "Client requested a walkthrough the week of Aug 10.", "notedAt": "2026-08-01T06:00:00Z" } ] }
```

### GET `/projects/{id}/client-report`
**Tables:** `project_progress_history` (read, `is_client_visible=true` + `status='approved'`/`auto_approved'` only, via `pending_progress_updates.resulting_history_id`)
Response `200`:
```json
{ "data": { "projectName": "Alden Heights Residences — Tower B", "reportUrl": "https://cdn.10builders.com/reports/p-004-2026-08.pdf", "generatedAt": "2026-08-02T10:05:00Z" } }
```

---

## 6. Subcontractors & Workers

### GET `/subcontractors?trade=Electrical`
**Tables:** `subcontractors` (read)
Response `200`:
```json
{ "data": [ { "id": "sc-002", "companyName": "Voltline Electrical Services", "trade": "Electrical", "source": "system_matched", "committedUntil": "2026-11-30" } ], "meta": { "totalCount": 6 } }
```

### GET `/subcontractors/{id}`
**Tables:** `subcontractors`, `subcontractor_workers` (read)
Response `200`:
```json
{ "data": { "id": "sc-002", "companyName": "Voltline Electrical Services", "trade": "Electrical", "workers": [ { "id": "wk-014", "fullName": "Ramon B. Cruz", "roleTitle": "Crew Foreman", "status": "active" } ] } }
```

### POST `/subcontractors`
**Tables:** `subcontractors` (insert)
Request:
```json
{ "companyName": "Ironclad Waterproofing Co.", "trade": "Waterproofing", "contactEmail": "ops@ironcladwp.ph" }
```
Response `201`:
```json
{ "data": { "id": "sc-011", "companyName": "Ironclad Waterproofing Co.", "trade": "Waterproofing", "source": "directory" } }
```

### GET `/projects/{id}/subcontractor-matches`
**Tables:** `project_subcontractor_matches`, `subcontractors` (read)
Response `200`:
```json
{ "data": [ { "subcontractorId": "sc-002", "companyName": "Voltline Electrical Services", "matchScore": 91, "certCoveragePct": 100 } ] }
```

### POST `/projects/{id}/subcontractor-requests`
**Tables:** `pending_subcontractor_requests` (insert; checks `subcontractors.committed_until` to set `has_conflict`)
Request:
```json
{ "subcontractorId": "sc-002", "tradeId": "trade-electrical" }
```
Response `201`:
```json
{ "data": { "id": "req-018", "projectId": "p-004", "subcontractorId": "sc-002", "hasConflict": false, "status": "pending" } }
```
Response `201` with conflict detected:
```json
{ "data": { "id": "req-019", "subcontractorId": "sc-003", "hasConflict": true, "conflictDetail": "Committed to another project until 2026-11-30, past this project's 2026-08-15 start.", "status": "pending" } }
```

### GET `/subcontractor-requests`
**Tables:** `pending_subcontractor_requests`, `projects`, `subcontractors` (read, `status='pending'`)
Response `200`:
```json
{ "data": [ { "id": "req-018", "projectName": "Alden Heights Residences — Tower B", "subcontractorName": "Voltline Electrical Services", "hasConflict": false, "status": "pending" } ] }
```

### POST `/subcontractor-requests/{id}/approve`
**Tables:** `pending_subcontractor_requests` (update — `status='approved'`, `resolved_by`, `resolved_at`), `project_subcontractor_assignments` (insert)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "req-018", "status": "approved", "assignmentId": "asg-041", "workerCount": 2 } }
```

### POST `/subcontractor-requests/{id}/reject`
**Tables:** `pending_subcontractor_requests` (update — `status='rejected'`, `resolved_by`, `resolved_at`)
Request:
```json
{ "reason": "Subcontractor's certifications lapsed for this trade" }
```
Response `200`:
```json
{ "data": { "id": "req-019", "status": "rejected" } }
```

### GET `/projects/{id}/subcontractor-assignments`
**Tables:** `project_subcontractor_assignments`, `subcontractors` (read, `status='active'`)
Response `200`:
```json
{ "data": [ { "id": "asg-041", "subcontractorName": "Voltline Electrical Services", "trade": "Electrical", "workerCount": 2, "status": "active" } ] }
```

### DELETE `/subcontractor-assignments/{id}`
**Tables:** `project_subcontractor_assignments` (update — `status='released'`, `released_at`; soft release, not a hard delete)
Response `204`: *(no body)*

### GET `/subcontractors/{id}/workers`
**Tables:** `subcontractor_workers` (read)
Response `200`:
```json
{ "data": [ { "id": "wk-014", "fullName": "Ramon B. Cruz", "roleTitle": "Crew Foreman", "status": "active", "availabilityStatus": "assigned" } ] }
```

### POST `/subcontractors/{id}/workers`
**Tables:** `subcontractor_workers` (insert)
Request:
```json
{ "fullName": "Elena V. Santos", "roleTitle": "Electrician II", "discipline": "Electrical", "licenseNumber": "TESDA-EL-88213", "licenseExpiry": "2027-04-01" }
```
Response `201`:
```json
{ "data": { "id": "wk-052", "fullName": "Elena V. Santos", "status": "active", "availabilityStatus": "available" } }
```

### PATCH `/workers/{id}`
**Tables:** `subcontractor_workers` (update)
Request:
```json
{ "availabilityStatus": "assigned", "currentProjectId": "p-004", "currentProjectUntil": "Nov 2026" }
```
Response `200`:
```json
{ "data": { "id": "wk-052", "availabilityStatus": "assigned", "currentProjectUntil": "Nov 2026" } }
```

### PUT `/workers/{id}/certifications`
**Tables:** `worker_certifications` (delete existing rows for worker, insert replacement set)
Request:
```json
{ "certificationTypeCodes": ["TESDA-Welding"] }
```
Response `200`:
```json
{ "data": { "workerId": "wk-052", "certifications": ["TESDA-Welding"] } }
```

### GET `/workers/{id}/history`
**Tables:** `worker_employment_history` (read)
Response `200`:
```json
{ "data": [ { "externalProjectName": "Greenhills Mall Retrofit", "roleTitle": "Electrician I", "periodStart": "2024-02-01", "periodEnd": "2025-06-30" } ] }
```

---

## 7. Documents & Contracts

### GET `/projects/{id}/documents`
**Tables:** `project_documents`, `document_types` (read; `is_client_visible_default=false` docs filtered out for `client` role)
Response `200` (as `client`):
```json
{
  "data": [
    { "documentTypeId": 1, "label": "Notice to Proceed", "status": "uploaded", "isClientVisible": true, "uploadedAt": "2026-05-02T00:00:00Z" },
    { "documentTypeId": 2, "label": "Approved Building Permit", "status": "uploaded", "isClientVisible": true, "uploadedAt": "2026-05-06T00:00:00Z" }
  ]
}
```

### POST `/projects/{id}/documents/{documentTypeId}`
**Tables:** `project_documents` (insert on first upload, else update — `status`, `file_ref`, `uploaded_by`, `uploaded_at`)
Request (multipart/form-data): `file: <binary>`
Response `200`:
```json
{ "data": { "documentTypeId": 3, "status": "uploaded", "uploadedAt": "2026-08-02T05:00:00Z", "uploadedBy": "u-002" } }
```

### GET `/documents/{id}/download`
**Tables:** `project_documents` (read — resolves `file_ref` and checks `is_client_visible` for `client` role)
Response `200`: binary file stream (`Content-Type` per stored file); `403` if the caller's role can't see this document type.

### GET `/projects/{id}/contracts`
**Tables:** `contracts` (read)
Response `200`:
```json
{ "data": [ { "id": "ct-021", "contractType": "client_contract", "uploadedAt": "2026-08-01T02:00:00Z" }, { "id": "ct-022", "contractType": "client_subcon_agreement", "subcontractorName": "Bravado Fit-Out Specialists", "isLocked": true } ] }
```

### POST `/projects/{id}/contracts`
**Tables:** `contracts` (insert)
Request (multipart/form-data):
```
contractType: "client_contract"
file: <binary>
```
Response `201`:
```json
{ "data": { "id": "ct-030", "contractType": "client_contract", "uploadedAt": "2026-09-01T00:00:00Z" } }
```

---

## 8. Share Links

### GET `/share-links`
**Tables:** `share_links`, `projects` (read; `status` computed from `revoked`/`expires_at`)
Response `200`:
```json
{ "data": [ { "id": "sl-009", "projectName": "Rosaria Business Park", "scope": "documents", "status": "active", "expiresAt": "2026-09-30T00:00:00Z" } ] }
```

### POST `/share-links`
**Tables:** `share_links` (insert), `share_link_excluded_documents` (insert, if any excluded)
Request:
```json
{ "projectId": "p-001", "scope": "documents", "expiryOption": "7d", "excludedDocumentTypeIds": [6] }
```
Response `201`:
```json
{
  "data": {
    "id": "sl-009", "token": "kx83jz9m2q7wq4trh5nvbf8s",
    "url": "https://app.10builders.com/share/kx83jz9m2q7wq4trh5nvbf8s",
    "scope": "documents", "expiresAt": "2026-09-30T00:00:00Z", "status": "active"
  }
}
```

### POST `/share-links/{id}/revoke`
**Tables:** `share_links` (update — `revoked=true`, `revoked_at`, `revoked_by`)
Request: `{}`
Response `200`:
```json
{ "data": { "id": "sl-009", "status": "revoked", "revokedAt": "2026-09-10T00:00:00Z" } }
```

### GET `/public/share/{token}`
**Tables:** `share_links`, `share_link_excluded_documents`, `project_documents`, `project_progress_history` (read, scope-dependent), `share_link_access_log` (insert, logs the hit)
Response `200`:
```json
{
  "data": {
    "projectName": "Rosaria Business Park",
    "scope": "documents",
    "documents": [ { "label": "Notice to Proceed", "downloadUrl": "https://cdn.10builders.com/files/abc123.pdf" } ]
  }
}
```
Response `410` (expired/revoked):
```json
{ "error": { "code": "LINK_EXPIRED", "message": "This share link has expired or been revoked." } }
```

---

## 9. Activity Log & Notifications

### GET `/notifications`
**Tables:** `activity_log`, `notification_recipients` (read, joined on `recipient_user_id = current user`, unread-first ordering)
Response `200`:
```json
{
  "data": [
    {
      "id": "act-205", "type": "progress", "title": "Progress update submitted",
      "detail": "Alden Heights Residences — Tower B · Foundation & Substructure · 32%",
      "actor": "Karlo M. Espiritu", "isRead": false, "anchorRef": "activesites", "occurredAt": "2026-07-22T14:00:00Z"
    }
  ],
  "meta": { "unreadCount": 3 }
}
```

### POST `/notifications/mark-all-read`
**Tables:** `notification_recipients` (update — `is_read=true`, `read_at`, for all rows where `recipient_user_id = current user`)
Request: `{}`
Response `204`: *(no body)*

### GET `/activity-log`
**Tables:** `activity_log` (read, filterable by `activity_type_id`, `actor_user_id`, date range)
Response `200`:
```json
{
  "data": [
    { "id": "act-204", "type": "approval", "title": "Progress update approved", "actor": "Renz D. Villaverde", "occurredAt": "2026-08-02T10:00:00Z" },
    { "id": "act-205", "type": "progress", "title": "Progress update submitted", "actor": "Karlo M. Espiritu", "occurredAt": "2026-07-22T14:00:00Z" }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 214 }
}
```

---

## 10. Dashboard / KPI

### GET `/dashboard/admin`
**Tables:** `projects`, `assignment_confirmations`, `users`, `pending_rework_requests`, `pending_progress_updates` (read, aggregated counts)
Response `200`:
```json
{
  "data": {
    "totalProjects": 4, "activeProjects": 3, "archivedProjects": 1,
    "pendingConfirmations": 2, "pendingReworkRequests": 1, "escalatedProgressUpdates": 1,
    "totalAccounts": 13, "accountsByStatus": { "active": 11, "invited": 2, "suspended": 0 }
  }
}
```

### GET `/dashboard/admin/schedule-performance`
**Tables:** `project_progress_history`, `projects` (read, planned-vs-actual % series over time)
Response `200`:
```json
{
  "data": {
    "series": [
      { "date": "2026-07-01", "plannedPct": 20, "actualPct": 18 },
      { "date": "2026-08-01", "plannedPct": 35, "actualPct": 32 }
    ]
  }
}
```

### GET `/dashboard/opm`
**Tables:** `projects`, `project_engineers`, `pending_rework_requests`, `assignment_confirmations` (read, scoped to current OPM)
Response `200`:
```json
{ "data": { "myProjects": 3, "pendingConfirmations": 1, "reworkAwaitingReview": 1, "progressUpdatesAwaitingReview": 2 } }
```

### GET `/dashboard/spm`
**Tables:** `project_phase_team`, `projects`, `assignment_confirmations` (read, scoped to current SPM)
Response `200`:
```json
{ "data": { "assignedSites": 2, "pendingPhaseAcceptance": 1, "nextDeadline": "2026-08-03T00:00:00Z" } }
```

### GET `/dashboard/client`
**Tables:** `user_client_project_links`, `projects`, `project_progress_history` (read, scoped to linked projects)
Response `200`:
```json
{ "data": { "projectName": "Alden Heights Residences — Tower B", "currentStage": "Foundation", "currentPct": 32, "lastUpdatedAt": "2026-08-02T10:00:00Z" } }
```

---

## 11. Reference Data

All six endpoints below are read-only, cached client-side after first load, and each maps to exactly one lookup table.

### GET `/lookups/disciplines`
**Tables:** `disciplines`
```json
{ "data": [ { "id": 1, "code": "Civil" }, { "id": 3, "code": "Structural" } ] }
```

### GET `/lookups/project-types`
**Tables:** `project_types`
```json
{ "data": [ { "id": 1, "code": "Residential", "maxOpmSpecializations": 2 } ] }
```

### GET `/lookups/project-stages`
**Tables:** `project_stages`
```json
{ "data": [ { "id": 1, "code": "Mobilization", "sortOrder": 1 }, { "id": 3, "code": "Foundation", "sortOrder": 3 } ] }
```

### GET `/lookups/trades`
**Tables:** `trades`
```json
{ "data": [ { "id": 2, "code": "Electrical" } ] }
```

### GET `/lookups/certification-types`
**Tables:** `certification_types`
```json
{ "data": [ { "id": 5, "code": "DOLE-Safety", "issuingBody": "DOLE" } ] }
```

### GET `/lookups/document-types`
**Tables:** `document_types`
```json
{ "data": [ { "id": 1, "code": "notice_to_proceed", "label": "Notice to Proceed", "isClientVisibleDefault": true } ] }
```
