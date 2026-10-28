# Phase progress backend

Apply the migration before starting the updated backend:

```powershell
npm.cmd run db:migrate
npm.cmd test
npm.cmd run lint:phase
```

The migration adds private file storage, checklist templates, project checklist snapshots,
versioned evidence, and update/file links. It seeds the five Structure requirements shown
in the UI. Existing active Structure projects are initialized and their manual percentages
are replaced with approved-checklist percentages. Existing history is retained.
It also initializes a missing current stage from the first confirmed phase assignment.
The migration is safe to rerun without losing approvals.

Configure required checklists for other stages through the admin template endpoint before
using those phases. Only the screenshot's Structure requirements are seeded; this avoids
inventing contractual requirements for other phases. Templates are snapshotted on first use.
Later template edits apply to phases whose checklists have not been initialized.

## Rule

Current phase progress is `round(approved required items / all required items * 100)`.
Missing, pending, and rejected evidence contributes zero. Optional items do not affect
progress. An unconfigured phase returns zero and `checklist.configured: false`;
submitting an update or advancing into it returns 422.

An SPM must hold the confirmed assignment for the active current stage. Only the assigned
OPM or an admin can approve/reject evidence or advance the phase. Approvals lock the project
and evidence, update the cached project percentage, and append client-visible history.
Rejected evidence needs a review note and can be resubmitted as a new version.
Approved/pending evidence cannot be overwritten.

## Endpoints

All paths below are relative to `${API_URL}/progress`. Send a Bearer token.
Responses use the existing `{code, message, count, data}` envelope.

| Method | Path | Purpose |
|---|---|---|
| GET | /projects/:id/phase-overview | Data for the expanded UI |
| POST | /projects/:id/checklist-items/:itemId/evidence | Multipart `file`; upload for review |
| POST | /projects/:id/evidence/:evidenceId/approve | Approve a pending version |
| POST | /projects/:id/evidence/:evidenceId/reject | Reject; `review_note` required |
| POST | /projects/:id/phase-files | Multipart `file`; optional general evidence |
| GET | /projects/:id/phase-files/:fileId | Authenticated attachment download |
| POST | /projects/:id/phase-updates | Submit optional note and uploaded file IDs |
| GET | /projects/:id/issues | All project issues and review outcomes |
| POST | /projects/:id/issues | Report an issue; `reason` required |
| POST | /projects/:id/advance-phase | OPM/admin activates next assigned phase |
| PUT | /phase-checklist-templates/:stageId | Admin configures template for future snapshots |

Uploads accept PDF, JPEG, PNG, and WebP, with signature validation and a 10 MiB limit.
Files are stored privately as PostgreSQL BYTEA and served through an authenticated download.
This implementation favors a self-contained backend; larger deployments can replace byte
storage with private object storage. File metadata appears in the overview; evidence items
include a file ID. General files remain uploaded even if the user does not submit an update.

Example update:

```json
{
  "stage_id": 4,
  "note": "Pour completed; evidence uploaded for review.",
  "file_ids": ["44444444-4444-4444-8444-444444444444"]
}
```

Omit `pct`; supplying it returns 422. `stage_id` is optional and defaults to the current stage.
File IDs must belong to the same phase and submitting user. The update records the current
approved percentage, optional note, and file links; it does not grant approval to evidence.

Template body:

```json
{
  "items": [
    {"code": "inspection", "title": "Work inspection checklist", "required": true},
    {"code": "site_photo", "title": "Optional site photo", "required": false}
  ]
}
```

At least one required item is needed. Codes must be unique within a stage.

## Frontend mapping

The existing project list now includes `current_stage_id`, `current_stage`, `current_pct`,
`crew_assigned`, `crew_required`, `phase_owner_id`, `phase_owner_name`,
`phase_owner_status`, `your_phase_is_active`, `last_progress_updated_at`,
`checklist_approved_count`, and `checklist_required_count`.

Use `GET /projects/:id/phase-overview` to expand Upload Progress. The response includes
`phase_owner`, `can_submit`, `your_phase_is_active`, `checklist`, `issues`,
`recommended_disciplines`, and general `files`. Checklist statuses are
`missing`, `pending`, `approved`, and `rejected`.
Render required count as the denominator. Refresh the list/overview after approval or update.

The screenshot's broad “Construction” category is a presentation grouping of stages.
The backend returns the actual stage (for example Structure); the frontend can map stages
into its broader labels.

Issues use the existing rework request review model: pending, approved, or rejected.
OPM/admin resolve them using the existing rework approve/reject routes. Resolution means
a review decision about the report; it is not a separate “work physically resolved” status.

## Existing routes

The legacy `POST /projects/:id/progress-updates` delegates to phase updates and rejects
manually supplied percentages. Legacy progress approve/reject/sweep/escalated routes now
return 410, because approval occurs per checklist item. Existing pending updates remain
readable as legacy records but cannot be applied through those routes.

Project creation uses the intake workflow (admin, project_type, manager selection and
nonempty phase_team). Project updates edit project details and crew_required only;
phase and percentage changes require the dedicated phase workflow. Project deletion
soft-deletes the project and releases active internal/worker assignments.

Initial recommendations and reruns now use the same discipline-slot headcount formula.

## Verification

`npm test` runs controller/utility regression tests with mocked authentication and database
transactions. `npm run test:phase:db` runs additional checks against PostgreSQL in an isolated,
empty copied schema inside a transaction and always rolls it back. It needs CREATE SCHEMA
permission and an existing public base schema. It does not migrate application data.
`npm run lint:phase` checks the changed JavaScript using a Node-specific ESLint config;
the original TypeScript ESLint configuration is incompatible with the installed TS 7.0.