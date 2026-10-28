# Team Accounts and intake clients — existing tables

This update uses the existing database structure. There is no clients table, new column,
or migration. No production account/project records are created by the verification tests.

## Data mapping

| UI field | Existing storage |
|---|---|
| Contact person / account name | users.full_name |
| Email | users.email |
| Contact number | users.phone |
| Role | users.role_id referencing roles.code = client |
| Client / company name | projects.client_name |
| Connected project | user_client_project_links(user_id, project_id) |
| Account status | users.status |

A client is a user account and appears in Team Accounts under All and Client.
The client remains in users for future projects. Selecting a returning client adds a
new project link and keeps their old project links and password.

Company name belongs to the project intake, not a new directory table. Consequently,
the popup needs a saved draft project ID so all four fields can be persisted.
A person can be associated with different company names on different projects.

## Team Accounts

All paths below are relative to API_URL. Use the Admin's Bearer token.

```http
GET /accounts?role=client&page=1&pageSize=10&q=Residence
GET /accounts?role=opm&status=active&page=2&pageSize=10
GET /accounts?role=all&limit=10&offset=20
```

Role codes: admin, opm, spm, client. The All pill omits role or sends role=all.
Legacy role_ids comma-separated numeric IDs and full_name search are also supported.

Search matches name, email, scope labels, and status. Scope means disciplines for SPMs,
project specializations for OPMs, project names for clients, and an empty list for Admin.
Filters apply to both the total count and page data. Deleted users are excluded.
Default page size is 10; maximum is 100. Invalid paging/filter values return 400.

The response retains data as an array and count as the full matching total:

```json
{
  "code": 200,
  "count": 23,
  "data": [],
  "pagination": {
    "page": 2,
    "page_size": 10,
    "total": 23,
    "total_pages": 3,
    "has_next": true,
    "has_previous": true
  }
}
```

Rows include id/user_id, full_name, email, phone, role, role_id, role_name, status,
date_added, scope, linked_projects_count, and client_names (company names from linked projects).
Use scope for the Scope column and linked_projects_count in the client dropdown.

## Account creation

POST /accounts now uses the transactional Admin-only handler. New accounts are invited.
It accepts full_name (or fullName), email, phone, role, scope, and optional password.
An omitted password is generated securely and returned once as temp_password.

```json
{
  "full_name": "Maria Santos",
  "email": "maria@example.com",
  "phone": "09123456789",
  "role": "client",
  "scope": {"projects": ["33333333-3333-4333-8333-333333333333"]}
}
```

Scope keys: disciplines for spm, project_types for opm, projects for client.
OPMs may select at most two project types; SPMs at most three disciplines.
Admin needs no scope. Client scope values are real project UUIDs, not project names.
Invalid scope values roll back the account insertion.

Temporary passwords must have at least 8 characters and at most 72 UTF-8 bytes.

Other connected account routes:

| Method | Path | Purpose |
|---|---|---|
| GET | /accounts/:id | Admin or account owner reads details |
| PUT/PATCH | /accounts/:id | Admin edits account details/scope |
| PATCH | /accounts/:id/status | Admin changes active/invited/suspended status |
| POST | /accounts/temporary-password | Generate password for a new-account form without storing it |
| POST | /accounts/:id/regenerate-password | Replace existing account password; return once |
| DELETE | /accounts/:id | Admin soft-deletes account and removes sessions |

## Intake popup and returning-client dropdown

1. Save the draft before opening Create Client Account:

```http
POST /projects/intake/drafts
```

```json
{
  "name": "Alden Heights Residences — Tower B",
  "project_type": "Mixed-Use",
  "floor_area_sqm": 18400,
  "floor_count": 22,
  "target_start_date": "2026-09-01"
}
```

Project name and type are required. Other draft fields are optional.
Keep data.id as the draft_project_id.

2. Populate the client selector from GET /accounts?role=client&page=1&pageSize=100.
Use returned user IDs as option values; display full_name, email and linked_projects_count.
The list is paginated: load more pages or search when there are more than 100 clients.
Do not create a new account when a returning client is selected.

3. When the popup's Save Client for Project button is clicked:

```http
POST /projects/intake/client-account
```

```json
{
  "project_id": "33333333-3333-4333-8333-333333333333",
  "company_name": "Marbrisa Land Corp.",
  "contact_person": "Maria Santos",
  "email": "maria@example.com",
  "contact_number": "09123456789"
}
```

Contact number is optional. The handler creates an invited client in users, links the
draft, and stores the company name on projects, in one transaction. The response returns
user_id, project_id, client_name and a one-time temp_password for a new account.
Refresh Team Accounts and the client selector, and select the returned user_id.

If the email already belongs to an available client, that account is reused (200,
reused=true) without replacing their password or returning it. New accounts return 201.
Staff emails, suspended/deleted accounts, and already approved projects are rejected.

4. To select an existing client instead:

```http
POST /projects/:draftId/client
```

```json
{"client_user_id": "22222222-2222-4222-8222-222222222222", "client_name": "Marbrisa Land Corp."}
```

Client name defaults to the contact's account name if omitted. Replacing the selection
removes only the old client's link to this draft; their user account and other project
links remain intact.

5. Send the completed form to POST /projects/intake with draft_project_id plus the
existing intake fields (name, project_type, floor_area_sqm, floor_count, target_start_date,
suggested_opm_id, phase_team, etc.). Include client_user_id and client_name, or retain the
client already attached to that draft. The draft is updated in place rather than creating
another project. It then enters sent_to_opm and creates the OPM confirmation request.

## Login and visibility

Invited staff accounts become active on their first successful login.
A newly invited client must have a linked project whose lifecycle is active or archived
before first login can activate them. Existing returning clients keep their account status.

Clients cannot access draft/sent_to_opm/spm_review projects through project endpoints,
history, files, or dashboard listings merely because the link exists. Admin can see those
links in Team Accounts immediately. Project visibility becomes available when the existing
OPM/SPM acceptance workflow changes the project lifecycle to active.

This reuses existing lifecycle status as the approval gate. It does not add a separate
document/subcontractor completion flag: those additional popup conditions are not yet
represented by an intake-finalization workflow. The document-type registry is currently empty.

Login responses and JWT user payloads exclude password hashes. The temp_password_issued
flag remains available for a frontend password-change prompt.

## Intake log

```http
GET /projects/intake-log?limit=10&offset=0
GET /projects/intake-log?period=week
```

Admin-only. data contains this_week_count, timezone = Asia/Taipei, and projects.
The count envelope gives total matching rows. Rows include project/type/area/floors,
OPM name, lead-or-first SPM name, lifecycle_status, and status_label.
Labels include Draft, Suggested Allocation, Awaiting OPM, SPM Review, Confirmed,
SPM Declined, and Archived. This week's boundary is Monday midnight in Asia/Taipei.

## Checks

npm.cmd test runs account, login, client reuse/linking, and progress regression tests with
in-memory database fixtures. npm.cmd run lint:phase checks the affected JavaScript.
The account and intake-log SQL were checked with PostgreSQL EXPLAIN inside a read-only
transaction. No migration or production data-writing checks were run for this update.
