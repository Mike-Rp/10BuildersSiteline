# Construction Workforce Dashboard — API Endpoint Specifications

> Current Team Accounts pagination/filtering and intake-client endpoints are documented in [06-account-intake-api.md](06-account-intake-api.md).


> Phase progress, checklist evidence, uploads, and related project write behavior are defined in [05-phase-progress-api.md](05-phase-progress-api.md). Those current contracts supersede the older manual percentage examples below.


Base path: `/api/v1`. Auth: `Bearer <JWT>` header. Roles: `admin`, `opm`, `spm`, `client` (a request may be scoped further to "own project" for `spm`/`client`). All list endpoints support `?page=`, `?pageSize=`, and resource-appropriate `?filter[...]=` params. All responses follow the envelope defined in `03-api-request-response-reference.md`.

---

## 1. Auth

| Method | Path | Description | Roles |
|---|---|---|---|
| POST | `/auth/login` | Email + password login, returns JWT + refresh token | public |
| POST | `/auth/refresh` | Exchange refresh token for new access token | authenticated |
| POST | `/auth/logout` | Invalidate session, closes `user_sessions` row | authenticated |
| POST | `/auth/force-password-reset` | Set new password when `temp_password_issued = true` | authenticated |

---

## 2. Accounts (Users)

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/accounts` | List accounts, filterable by role/status | admin |
| POST | `/accounts` | Create account (role, scope, generates temp password) | admin |
| GET | `/accounts/{id}` | Account detail incl. scope, licenses, certifications | admin, self |
| PATCH | `/accounts/{id}` | Edit name/email/phone/scope/projectTypes | admin |
| PATCH | `/accounts/{id}/status` | Activate / suspend / re-invite | admin |
| POST | `/accounts/{id}/regenerate-password` | Issue new temp password | admin |
| GET | `/accounts/{id}/licenses` | License history for a user | admin, self |
| POST | `/accounts/{id}/licenses` | Upload/replace license (number, expiry, file) | admin, self (opm/spm) |
| PUT | `/accounts/{id}/certifications` | Replace certification set | admin |
| GET | `/accounts/license-alerts` | Accounts with expiring/expired/missing licenses | admin |

---

## 3. Project Intake & Lifecycle

| Method | Path | Description | Roles |
|---|---|---|---|
| POST | `/projects/intake` | Create draft project from intake form | admin |
| GET | `/projects/intake/{id}/suggested-allocation` | Get system-suggested OPM + per-phase SPM + headcount | admin |
| POST | `/projects/intake/{id}/reallocate` | Re-run allocation suggestion | admin |
| PATCH | `/projects/intake/{id}/phase-team/{stageId}` | Override one phase's suggested SPM | admin, opm |
| POST | `/projects/intake/{id}/contract` | Upload Client Contract Agreement | admin |
| POST | `/projects/intake/{id}/client-subcon-agreement` | Upload optional client-supplied subcontractor + agreement | admin |
| POST | `/projects/intake/{id}/confirm-and-send` | Advance lifecycle: confirmed → sent_to_opm | admin |
| GET | `/projects/intake-log` | Table of all intake submissions with status pills | admin |
| GET | `/projects` | List projects (role-filtered: opm sees own, spm sees assigned, client sees linked) | admin, opm, spm, client |
| GET | `/projects/{id}` | Full project detail (engineers, subcons, docs, history) | admin, opm, spm, client (own only) |
| PATCH | `/projects/{id}` | Edit core project fields | admin, opm |
| POST | `/projects/{id}/archive` | Archive a completed/cancelled project | admin |

---

## 4. Assignment Confirmations

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/confirmations` | Queue of pending OPM/SPM confirmations for current user | opm, spm |
| POST | `/confirmations/{id}/accept` | Accept assignment | opm, spm |
| POST | `/confirmations/{id}/decline` | Decline assignment | opm, spm |
| POST | `/confirmations/{id}/reassign` | Admin reassigns after decline/auto-expiry | admin |
| GET | `/projects/{id}/phase-team` | Per-phase SPM confirmation rows | admin, opm, spm |
| POST | `/projects/{id}/phase-team/{stageId}/accept` | SPM accepts one phase row | spm |
| POST | `/projects/{id}/phase-team/{stageId}/decline` | SPM declines one phase row | spm |

---

## 5. Progress & Rework

| Method | Path | Description | Roles |
|---|---|---|---|
| POST | `/projects/{id}/progress-updates` | SPM submits stage/% update, note, optional photos | spm |
| GET | `/projects/{id}/progress-updates/pending` | Current pending update (if any) | admin, opm, spm |
| POST | `/progress-updates/{id}/approve` | Approve now (applies immediately) | opm, admin |
| POST | `/progress-updates/{id}/reject` | Reject with resolution note | opm, admin |
| GET | `/progress-updates/escalated` | Updates escalated to Admin after 3-day silence | admin |
| POST | `/projects/{id}/rework-requests` | SPM flags an issue / rework need | spm |
| GET | `/rework-requests` | Rework queue | opm, admin |
| POST | `/rework-requests/{id}/approve` | Approve rework resolution | opm, admin |
| POST | `/rework-requests/{id}/reject` | Reject rework flag | opm, admin |
| GET | `/projects/{id}/history` | Full stage/% timeline (client-visible filter applied for client role) | admin, opm, spm, client |
| POST | `/projects/{id}/photos` | Upload site photo | spm |
| GET | `/projects/{id}/photos` | List site photos | admin, opm, spm, client |
| POST | `/projects/{id}/notes` | Add project note | opm, spm |
| GET | `/projects/{id}/notes` | List project notes | admin, opm, spm |
| GET | `/projects/{id}/client-report` | Generate client-facing progress report (approved history only) | client, admin, opm |

---

## 6. Subcontractors & Workers

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/subcontractors` | List (suggested + directory), filterable by trade | admin, opm, spm |
| GET | `/subcontractors/{id}` | Detail incl. worker roster | admin, opm, spm |
| POST | `/subcontractors` | Add a new directory subcontractor | admin, spm |
| GET | `/projects/{id}/subcontractor-matches` | System-generated match scores + cert coverage for this project | admin, opm |
| POST | `/projects/{id}/subcontractor-requests` | SPM requests a subcon for the project | spm |
| GET | `/subcontractor-requests` | Pending requests queue (flags double-booking conflicts) | admin, opm |
| POST | `/subcontractor-requests/{id}/approve` | Approve, creates `project_subcontractor_assignments` row | admin, opm |
| POST | `/subcontractor-requests/{id}/reject` | Reject request | admin, opm |
| GET | `/projects/{id}/subcontractor-assignments` | Confirmed subcon assignments for a project | admin, opm, spm, client |
| DELETE | `/subcontractor-assignments/{id}` | Release a subcontractor from a project | admin, opm |
| GET | `/subcontractors/{id}/workers` | Worker roster | admin, opm, spm |
| POST | `/subcontractors/{id}/workers` | Add worker | admin, spm |
| PATCH | `/workers/{id}` | Edit worker status/availability/discipline | admin, spm |
| PUT | `/workers/{id}/certifications` | Replace worker certification set | admin, spm |
| GET | `/workers/{id}/history` | Prior-project employment history | admin, opm, spm |

---

## 7. Documents & Contracts

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/projects/{id}/documents` | 6-doc checklist + subcon agreement status | admin, opm, spm, client (visible-only) |
| POST | `/projects/{id}/documents/{documentTypeId}` | Upload/replace a registered document | opm |
| GET | `/documents/{id}/download` | Download original file | admin, opm, spm, client (if visible) |
| GET | `/projects/{id}/contracts` | List contracts (client contract, client-subcon agreement) | admin, opm |
| POST | `/projects/{id}/contracts` | Upload a contract | admin |

---

## 8. Share Links

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/share-links` | List all links, status computed (active/expired/revoked) | admin |
| POST | `/share-links` | Create link (project, scope, expiry, excluded docs) | admin |
| POST | `/share-links/{id}/revoke` | Revoke a link | admin |
| GET | `/public/share/{token}` | Public, unauthenticated read-only view resolved by token | public |

---

## 9. Activity Log & Notifications

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/notifications` | Current user's unread-first notification feed | admin, opm, spm, client |
| POST | `/notifications/mark-all-read` | Bulk mark-as-read | admin, opm, spm, client |
| GET | `/activity-log` | Full filterable activity log (type, actor, date range) | admin, opm, spm, client (own scope) |

---

## 10. Dashboard / KPI

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/dashboard/admin` | Total projects, pending confirmations, account counts, archive counts | admin |
| GET | `/dashboard/admin/schedule-performance` | Planned vs actual progress series | admin |
| GET | `/dashboard/opm` | OPM's project summary + confirmation/rework counts | opm |
| GET | `/dashboard/spm` | SPM's assigned sites + deadline badges | spm |
| GET | `/dashboard/client` | Client's linked project overview | client |

---

## 11. Reference Data

| Method | Path | Description | Roles |
|---|---|---|---|
| GET | `/lookups/disciplines` | | any authenticated |
| GET | `/lookups/project-types` | | any authenticated |
| GET | `/lookups/project-stages` | | any authenticated |
| GET | `/lookups/trades` | | any authenticated |
| GET | `/lookups/certification-types` | | any authenticated |
| GET | `/lookups/document-types` | | any authenticated |

---

## Common Response Codes

| Code | Meaning |
|---|---|
| 200 | success (GET/PATCH/action endpoints) |
| 201 | resource created (POST) |
| 204 | success, no body (DELETE, mark-read) |
| 400 | validation error |
| 401 | missing/invalid token |
| 403 | authenticated but role/scope not permitted (e.g. SPM accessing another SPM's project) |
| 404 | resource not found or outside caller's scope (scope-based 404s preferred over 403 to avoid leaking existence) |
| 409 | conflict (e.g. double-booked subcontractor, duplicate phase-team row) |
| 422 | business-rule violation (e.g. OPM specialization cap of 2 exceeded) |
