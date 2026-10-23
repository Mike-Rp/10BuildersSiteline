# Verified activity progress: schema dependency audit

Generated from a disposable local database; no hosted database inspected.

Branch: part-4-lifecycle-checks. Confirmed ancestors: d0662ec, ea4ed5b, 3d3027e, de158ce.

The checkout already contains 004-verified-activity-values.sql (double precision) and 005-targeted-rework.sql (replaces a CHECK), plus a separate 004-project-type-workflows.sql. The new explicitly applied recovery 004 supersedes those two progress/rework schema steps for a schema + 001–003 database. It does not silently execute the separate project-type remapping migration.

## Important limits

- A missing weight error proves the connected database lacks that column. It does not prove the migration file is absent from Git. No hosted schema inspection or live Vercel request was made.
- Integer columns are added with NOT NULL DEFAULT 10 and positive CHECKs. A previously installed double-precision weight is rejected for separately reviewed conversion; it is never truncated.
- Existing workflow rows are preserved. Only types with no mapping receive the original seven-stage lookup defaults. Existing 9/9/12 mappings are preserved; this migration does not remap historical phase relationships or create missing project scope.
- Staff verified aggregates use current approval provenance. Clients still lack the new authorized aggregate projection in Parts 1–4; complete client fractions and compact displays remain Part 5. Legacy percentages must not be presented as newly verified values.
- Normalized withdrawal is a reviewed rejection linked to its request. API projections retain the Rework required label. An additive trigger accepts the already-deployed writer's rework_required input without dropping the old status CHECK. Deploy the compatibility projections with the reviewed branch for consistent labels.

## Dependency table

Every column on every public relation referenced by backend source is listed below, including baseline columns for completeness. This is deliberately broader than newly introduced dependencies. Source lists identify table consumers; the PostgreSQL preparation regression checks actual static SQL column/alias resolution. Runtime-built SQL is additionally exercised by the role/API integration tests, not claimed to be statically proven.

### activity_log

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('activity_log_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql |
| activity_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| title | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| detail | text | YES | — | 20261017000002_thesis_backend_schema.sql |
| actor_user_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| target_role_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| anchor_reference | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| related_project_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| occurred_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### activity_types

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| icon | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### assignment_confirmations

Used by: `Thesis-Backend/src/services/archive/audit.utility.js`, `Thesis-Backend/src/services/archive/controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('assignment_confirmations_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| target_user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| role_context | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| match_score | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'pending'::character varying | 20261017000002_thesis_backend_schema.sql |
| responded_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| escalated_to_admin | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| escalated_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| reassigned_from_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### audit_log

Used by: `Thesis-Backend/src/services/activity-logs/controller.js`, `Thesis-Backend/src/services/archive/actions.controller.js`, `Thesis-Backend/src/services/archive/audit.utility.js`, `Thesis-Backend/src/services/archive/controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('audit_log_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql |
| table_name | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| record_id | text | NO | — | 20261017000002_thesis_backend_schema.sql |
| operation | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| changed_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| changed_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| old_values | jsonb | YES | — | 20261017000002_thesis_backend_schema.sql |
| new_values | jsonb | YES | — | 20261017000002_thesis_backend_schema.sql |

### certification_types

Used by: `Thesis-Backend/src/services/accounts/certification.controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| issuing_body | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### contracts

Used by: `Thesis-Backend/src/common/utilities/upload.utility.js`, `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| contract_type | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| subcontractor_name | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| trade_scope | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| file_ref | text | NO | — | 20261017000002_thesis_backend_schema.sql |
| uploaded_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| uploaded_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| is_locked | boolean | NO | true | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### disciplines

Used by: `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### document_types

Used by: `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| label | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| is_client_visible_default | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| is_required_for_intake | boolean | NO | true | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### notification_recipients

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| activity_log_id | bigint | NO | — | 20261017000002_thesis_backend_schema.sql |
| recipient_user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| is_read | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| read_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### pending_progress_updates

Used by: `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('pending_progress_updates_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| prior_stage_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| prior_pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| requested_stage_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| requested_pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| note | text | YES | — | 20261017000002_thesis_backend_schema.sql |
| is_material_change | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| submitted_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| submitted_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| auto_approve_deadline_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'pending'::character varying | 20261017000002_thesis_backend_schema.sql |
| escalated_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| resolved_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| resolved_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| resulting_history_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### pending_rework_requests

Used by: `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/lifecycle.utility.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/rework.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| project_stage_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| reason | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| submitted_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| submitted_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| status | character varying | NO | 'pending'::character varying | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolved_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolved_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolution_note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| issue_categories | text[] | NO | '{}'::text[] | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| phase_update_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resulting_history_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |

### pending_subcontractor_requests

Used by: `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/progress/lifecycle.utility.js`, `Thesis-Backend/src/services/subcontractors/controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| subcontractor_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| trade_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| requested_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| requested_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| has_conflict | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'pending'::character varying | 20261017000002_thesis_backend_schema.sql |
| resolved_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| resolved_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### phase_checklist_templates

Used by: `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('phase_checklist_templates_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| code | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| title | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| required | boolean | NO | true | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| sort_order | integer | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| weight | integer | NO | 10 | NEW 004-verified-activity-progress.sql |

### project_documents

Used by: `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| document_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'not_uploaded'::character varying | 20261017000002_thesis_backend_schema.sql |
| file_ref | text | YES | — | 20261017000002_thesis_backend_schema.sql |
| uploaded_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| uploaded_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_engineers

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/services/archive/audit.utility.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/projects/controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| project_role_label | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| assigned_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| unassigned_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_notes

Used by: `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| author_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| note_text | text | NO | — | 20261017000002_thesis_backend_schema.sql |
| noted_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_phase_checklist_items

Used by: `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('project_phase_checklist_items_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| code | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| title | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| required | boolean | NO | true | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| sort_order | integer | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| weight | integer | NO | 10 | NEW 004-verified-activity-progress.sql |

### project_phase_checklists

Used by: `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| initialized_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |

### project_phase_evidence

Used by: `Thesis-Backend/src/services/progress/lifecycle.utility.js`, `Thesis-Backend/src/services/progress/phase-submission.utility.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/rework.controller.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('project_phase_evidence_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| checklist_item_id | bigint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| file_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| status | text | NO | 'pending'::text | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| submitted_by | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| submitted_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| reviewed_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| reviewed_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| review_note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| submission_note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| phase_update_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql, 002-phase-update-confirmation.sql |
| rework_request_id | uuid | YES | — | NEW 004-verified-activity-progress.sql |

### project_phase_files

Used by: `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase-upload.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| original_name | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| content_type | text | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| byte_size | integer | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| content | bytea | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| uploaded_by | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| uploaded_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |

### project_phase_submission_files

Used by: `Thesis-Backend/src/services/progress/phase-update.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| update_id | bigint | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| file_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |

### project_phase_team

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/services/archive/actions.controller.js`, `Thesis-Backend/src/services/archive/audit.utility.js`, `Thesis-Backend/src/services/archive/controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('project_phase_team_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| spm_user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| is_lead | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'pending'::character varying | 20261017000002_thesis_backend_schema.sql |
| response_deadline_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| responded_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_phase_update_files

Used by: `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| history_id | bigint | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |
| file_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 001-phase-checklists.sql |

### project_phase_updates

Used by: `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/lifecycle.utility.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('project_phase_updates_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| selected_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| prior_stage_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| prior_pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| issue_categories | text[] | NO | '{}'::text[] | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| issue_reason | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| submitted_by | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| submitted_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| status | text | NO | 'pending'::text | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolved_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolved_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| resolution_note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| history_id | bigint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |

### project_photos

Used by: `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| file_ref | text | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| caption | character varying | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| taken_date | date | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| uploaded_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| is_client_visible | boolean | NO | true | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |

### project_progress_history

Used by: `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/dashboard/schedule-performance.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | bigint | NO | nextval('project_progress_history_id_seq'::regclass) | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| project_stage_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| note | text | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| is_issue | boolean | NO | false | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| is_client_visible | boolean | NO | true | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| recorded_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| recorded_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| issue_categories | text[] | NO | '{}'::text[] | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |
| entry_type | text | NO | 'update'::text | 20261017000002_thesis_backend_schema.sql, 002-phase-update-confirmation.sql |

### project_rework_activities

Used by: `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/rework.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| request_id | uuid | NO | — | NEW 004-verified-activity-progress.sql |
| project_id | uuid | NO | — | NEW 004-verified-activity-progress.sql |
| project_stage_id | smallint | NO | — | NEW 004-verified-activity-progress.sql |
| checklist_item_id | bigint | NO | — | NEW 004-verified-activity-progress.sql |
| withdrawn_evidence_id | bigint | YES | — | NEW 004-verified-activity-progress.sql |
| correction_evidence_id | bigint | YES | — | NEW 004-verified-activity-progress.sql |

### project_stage_discipline_links

Used by: `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_stage_id | integer | NO | — | 20261017000002_thesis_backend_schema.sql |
| discipline_id | integer | NO | — | 20261017000002_thesis_backend_schema.sql |
| project_type_id | integer | NO | — | 20261017000002_thesis_backend_schema.sql |

### project_stages

Used by: `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/projects/type-phases.utility.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| sort_order | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_subcontractor_assignments

Used by: `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/projects/controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| subcontractor_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| trade_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| worker_count | smallint | NO | 0 | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'active'::character varying | 20261017000002_thesis_backend_schema.sql |
| assigned_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| released_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_subcontractor_matches

Used by: `Thesis-Backend/src/services/subcontractors/controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| subcontractor_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| match_score | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| cert_coverage_pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### project_subcontractor_selections

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_id | uuid | NO | — | 003-react-integration.sql |
| subcontractor_id | uuid | NO | — | 003-react-integration.sql |
| status | text | NO | — | 003-react-integration.sql |
| contacted_at | timestamp with time zone | YES | — | 003-react-integration.sql |
| responded_at | timestamp with time zone | YES | — | 003-react-integration.sql |

### project_type_stages

Used by: `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/projects/type-phases.utility.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_type_id | smallint | NO | — | NEW 004-verified-activity-progress.sql |
| project_stage_id | smallint | NO | — | NEW 004-verified-activity-progress.sql |
| sort_order | smallint | NO | — | NEW 004-verified-activity-progress.sql |

### project_types

Used by: `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| max_opm_specializations | smallint | NO | 2 | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### projects

Used by: `Thesis-Backend/src/app.js`, `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/archive/actions.controller.js`, `Thesis-Backend/src/services/archive/audit.utility.js`, `Thesis-Backend/src/services/archive/controller.js`, `Thesis-Backend/src/services/archive/documents.controller.js`, `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/archive/routes.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/confirmations/routes.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/dashboard/schedule-performance.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase-update.controller.js`, `Thesis-Backend/src/services/progress/phase-update.utility.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/progress/phase.routes.js`, `Thesis-Backend/src/services/progress/phase.utility.js`, `Thesis-Backend/src/services/progress/routes.js`, `Thesis-Backend/src/services/progress/verified.utility.js`, `Thesis-Backend/src/services/projects/controller.js`, `Thesis-Backend/src/services/projects/intake-client.controller.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/subcontractors/routes.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| name | character varying | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| project_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| client_name | character varying | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| floor_area_sqm | numeric | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| floor_count | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| target_start_date | date | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| current_stage_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| current_pct | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| crew_required | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| crew_assigned | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| lifecycle_status | character varying | NO | 'draft'::character varying | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| suggested_opm_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| suggested_opm_match_score | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| headcount_suggested | smallint | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| headcount_tier | character varying | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| archived_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| is_deleted | boolean | NO | false | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| deleted_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| deleted_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| target_end_date | date | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| location | text | NO | ''::text | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |

### roles

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/common/utilities/dao.utility.js`, `Thesis-Backend/src/common/utilities/license-eligibility.utility.js`, `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/accounts/prc-monitor.controller.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/projects/intake-client.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`, `Thesis-Backend/src/swagger.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| label | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### stored_files

Used by: `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| project_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| user_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| purpose | text | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| original_name | text | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| content_type | text | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| byte_size | integer | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| content | bytea | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| uploaded_by | uuid | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |

### subcontractor_workers

Used by: `Thesis-Backend/src/services/archive/policy.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/projects/controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| subcontractor_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| full_name | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| role_title | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| phone | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'active'::character varying | 20261017000002_thesis_backend_schema.sql |
| discipline_id | smallint | YES | — | 20261017000002_thesis_backend_schema.sql |
| license_number | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| license_expiry | date | YES | — | 20261017000002_thesis_backend_schema.sql |
| availability_status | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| availability_note | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| current_project_id | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| current_project_until | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### subcontractors

Used by: `Thesis-Backend/src/app.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/subcontractors/routes.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| company_name | character varying | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| trade_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| contact_email | citext | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| meta_description | character varying | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| source | character varying | NO | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| committed_until | date | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| is_deleted | boolean | NO | false | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| deleted_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| deleted_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |
| directory_status | text | NO | 'approved'::text | 20261017000002_thesis_backend_schema.sql, 003-react-integration.sql |

### trades

Used by: `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/subcontractors/controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| code | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### user_certifications

Used by: `Thesis-Backend/src/services/accounts/certification.controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| certification_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### user_client_project_links

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/projects/intake-client.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| project_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### user_discipline_scopes

Used by: `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| discipline_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### user_licenses

Used by: `Thesis-Backend/src/common/utilities/license-eligibility.utility.js`, `Thesis-Backend/src/common/utilities/upload.utility.js`, `Thesis-Backend/src/services/accounts/license.controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/accounts/prc-monitor.controller.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| license_number | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| license_expiry | date | YES | — | 20261017000002_thesis_backend_schema.sql |
| upload_file_ref | text | YES | — | 20261017000002_thesis_backend_schema.sql |
| upload_status | character varying | NO | 'none'::character varying | 20261017000002_thesis_backend_schema.sql |
| superseded_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### user_project_type_specializations

Used by: `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| project_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### users

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/common/utilities/license-eligibility.utility.js`, `Thesis-Backend/src/services/accounts/account-list.utility.js`, `Thesis-Backend/src/services/accounts/certification.controller.js`, `Thesis-Backend/src/services/accounts/controller.js`, `Thesis-Backend/src/services/accounts/license.controller.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/accounts/prc-monitor.controller.js`, `Thesis-Backend/src/services/activity-logs/controller.js`, `Thesis-Backend/src/services/archive/actions.controller.js`, `Thesis-Backend/src/services/archive/controller.js`, `Thesis-Backend/src/services/archive/queries.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/confirmations/controller.js`, `Thesis-Backend/src/services/dashboard/metrics.js`, `Thesis-Backend/src/services/engineer/engineers.controller.js`, `Thesis-Backend/src/services/progress/controller.js`, `Thesis-Backend/src/services/progress/phase.controller.js`, `Thesis-Backend/src/services/projects/intake-client.controller.js`, `Thesis-Backend/src/services/projects/intake-log.controller.js`, `Thesis-Backend/src/services/projects/intake.controller.js`, `Thesis-Backend/src/services/projects/read.controller.js`, `Thesis-Backend/src/services/projects/recommend.controller.js`, `Thesis-Backend/src/services/workspace/project-data.controller.js`, `Thesis-Backend/src/services/workspace/routes.js`, `Thesis-Backend/src/swagger.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| full_name | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |
| email | citext | NO | — | 20261017000002_thesis_backend_schema.sql |
| phone | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| password_hash | text | NO | — | 20261017000002_thesis_backend_schema.sql |
| temp_password_issued | boolean | NO | true | 20261017000002_thesis_backend_schema.sql |
| role_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| status | character varying | NO | 'invited'::character varying | 20261017000002_thesis_backend_schema.sql |
| date_added | date | NO | CURRENT_DATE | 20261017000002_thesis_backend_schema.sql |
| last_login_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| is_deleted | boolean | NO | false | 20261017000002_thesis_backend_schema.sql |
| deleted_at | timestamp with time zone | YES | — | 20261017000002_thesis_backend_schema.sql |
| deleted_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### users_token

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/services/accounts/manage.controller.js`, `Thesis-Backend/src/services/archive/actions.controller.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| token | character varying | NO | — | 20261017000002_thesis_backend_schema.sql |

### worker_certifications

Used by: `Thesis-Backend/src/services/subcontractors/controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| worker_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| certification_type_id | smallint | NO | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### worker_employment_history

Used by: `Thesis-Backend/src/services/subcontractors/controller.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 20261017000002_thesis_backend_schema.sql |
| worker_id | uuid | NO | — | 20261017000002_thesis_backend_schema.sql |
| external_project_name | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| role_title | character varying | YES | — | 20261017000002_thesis_backend_schema.sql |
| period_start | date | YES | — | 20261017000002_thesis_backend_schema.sql |
| period_end | date | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| created_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |
| updated_by | uuid | YES | — | 20261017000002_thesis_backend_schema.sql |
| updated_at | timestamp with time zone | NO | now() | 20261017000002_thesis_backend_schema.sql |

### workspace_account_metadata

Used by: `Thesis-Backend/src/common/utilities/access.utility.js`, `Thesis-Backend/src/common/utilities/license-eligibility.utility.js`, `Thesis-Backend/src/services/auth/controller.js`, `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| user_id | uuid | NO | — | 003-react-integration.sql |
| metadata | jsonb | NO | '{}'::jsonb | 003-react-integration.sql |

### workspace_company_metadata

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| subcontractor_id | uuid | NO | — | 003-react-integration.sql |
| metadata | jsonb | NO | '{}'::jsonb | 003-react-integration.sql |

### workspace_project_metadata

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| project_id | uuid | NO | — | 003-react-integration.sql |
| metadata | jsonb | NO | '{}'::jsonb | 003-react-integration.sql |

### workspace_settings

Used by: `Thesis-Backend/src/services/workspace/routes.js`.

| Column | SQL type | Nullable | Default | Migration exists / source |
|---|---|---|---|---|
| singleton | boolean | NO | true | 003-react-integration.sql |
| rules | jsonb | NO | '{"cap": 2, "idle": 15, "grace": 7, "response": 3}'::jsonb | 003-react-integration.sql |

## Constraints and indexes

All returned objects exist after the explicit recovery path. Existing baseline objects are retained; new objects are created by recovery 004. Positive activity checks, composite request/activity FKs and latest-evidence indexes are included.

| Table | Object | Definition |
|---|---|---|
| activity_log | activity_log_activity_type_id_fkey | FOREIGN KEY (activity_type_id) REFERENCES activity_types(id) |
| activity_log | activity_log_activity_type_id_not_null | NOT NULL activity_type_id |
| activity_log | activity_log_actor_user_id_fkey | FOREIGN KEY (actor_user_id) REFERENCES users(id) |
| activity_log | activity_log_created_at_not_null | NOT NULL created_at |
| activity_log | activity_log_id_not_null | NOT NULL id |
| activity_log | activity_log_occurred_at_not_null | NOT NULL occurred_at |
| activity_log | activity_log_pkey | PRIMARY KEY (id) |
| activity_log | activity_log_related_project_id_fkey | FOREIGN KEY (related_project_id) REFERENCES projects(id) |
| activity_log | activity_log_target_role_id_fkey | FOREIGN KEY (target_role_id) REFERENCES roles(id) |
| activity_log | activity_log_title_not_null | NOT NULL title |
| activity_log | activity_log_updated_at_not_null | NOT NULL updated_at |
| activity_types | activity_types_code_key | UNIQUE (code) |
| activity_types | activity_types_code_not_null | NOT NULL code |
| activity_types | activity_types_created_at_not_null | NOT NULL created_at |
| activity_types | activity_types_id_not_null | NOT NULL id |
| activity_types | activity_types_pkey | PRIMARY KEY (id) |
| activity_types | activity_types_updated_at_not_null | NOT NULL updated_at |
| assignment_confirmations | assignment_confirmations_created_at_not_null | NOT NULL created_at |
| assignment_confirmations | assignment_confirmations_escalated_to_admin_not_null | NOT NULL escalated_to_admin |
| assignment_confirmations | assignment_confirmations_id_not_null | NOT NULL id |
| assignment_confirmations | assignment_confirmations_match_score_check | CHECK (((match_score >= 0) AND (match_score <= 100))) |
| assignment_confirmations | assignment_confirmations_pkey | PRIMARY KEY (id) |
| assignment_confirmations | assignment_confirmations_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| assignment_confirmations | assignment_confirmations_project_id_not_null | NOT NULL project_id |
| assignment_confirmations | assignment_confirmations_reassigned_from_id_fkey | FOREIGN KEY (reassigned_from_id) REFERENCES assignment_confirmations(id) |
| assignment_confirmations | assignment_confirmations_role_context_check | CHECK (((role_context)::text = ANY (ARRAY[('opm'::character varying)::text, ('spm'::character varying)::text]))) |
| assignment_confirmations | assignment_confirmations_role_context_not_null | NOT NULL role_context |
| assignment_confirmations | assignment_confirmations_status_check | CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('accepted'::character varying)::text, ('declined'::character varying)::text, ('auto_expired'::character varying)::text, ('reassigned'::character varying)::text]))) |
| assignment_confirmations | assignment_confirmations_status_not_null | NOT NULL status |
| assignment_confirmations | assignment_confirmations_target_user_id_fkey | FOREIGN KEY (target_user_id) REFERENCES users(id) |
| assignment_confirmations | assignment_confirmations_target_user_id_not_null | NOT NULL target_user_id |
| assignment_confirmations | assignment_confirmations_updated_at_not_null | NOT NULL updated_at |
| audit_log | audit_log_changed_at_not_null | NOT NULL changed_at |
| audit_log | audit_log_id_not_null | NOT NULL id |
| audit_log | audit_log_operation_check | CHECK (((operation)::text = ANY (ARRAY[('INSERT'::character varying)::text, ('UPDATE'::character varying)::text, ('DELETE'::character varying)::text]))) |
| audit_log | audit_log_operation_not_null | NOT NULL operation |
| audit_log | audit_log_pkey | PRIMARY KEY (id) |
| audit_log | audit_log_record_id_not_null | NOT NULL record_id |
| audit_log | audit_log_table_name_not_null | NOT NULL table_name |
| certification_types | certification_types_code_key | UNIQUE (code) |
| certification_types | certification_types_code_not_null | NOT NULL code |
| certification_types | certification_types_created_at_not_null | NOT NULL created_at |
| certification_types | certification_types_id_not_null | NOT NULL id |
| certification_types | certification_types_pkey | PRIMARY KEY (id) |
| certification_types | certification_types_updated_at_not_null | NOT NULL updated_at |
| contracts | chk_client_subcon_fields | CHECK ((((contract_type)::text <> 'client_subcon_agreement'::text) OR ((subcontractor_name IS NOT NULL) AND (trade_scope IS NOT NULL)))) |
| contracts | contracts_contract_type_check | CHECK (((contract_type)::text = ANY (ARRAY[('client_contract'::character varying)::text, ('client_subcon_agreement'::character varying)::text]))) |
| contracts | contracts_contract_type_not_null | NOT NULL contract_type |
| contracts | contracts_created_at_not_null | NOT NULL created_at |
| contracts | contracts_file_ref_not_null | NOT NULL file_ref |
| contracts | contracts_id_not_null | NOT NULL id |
| contracts | contracts_is_locked_not_null | NOT NULL is_locked |
| contracts | contracts_pkey | PRIMARY KEY (id) |
| contracts | contracts_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| contracts | contracts_project_id_not_null | NOT NULL project_id |
| contracts | contracts_updated_at_not_null | NOT NULL updated_at |
| contracts | contracts_uploaded_at_not_null | NOT NULL uploaded_at |
| contracts | contracts_uploaded_by_fkey | FOREIGN KEY (uploaded_by) REFERENCES users(id) |
| disciplines | disciplines_code_key | UNIQUE (code) |
| disciplines | disciplines_code_not_null | NOT NULL code |
| disciplines | disciplines_created_at_not_null | NOT NULL created_at |
| disciplines | disciplines_id_not_null | NOT NULL id |
| disciplines | disciplines_pkey | PRIMARY KEY (id) |
| disciplines | disciplines_updated_at_not_null | NOT NULL updated_at |
| document_types | document_types_code_key | UNIQUE (code) |
| document_types | document_types_code_not_null | NOT NULL code |
| document_types | document_types_created_at_not_null | NOT NULL created_at |
| document_types | document_types_id_not_null | NOT NULL id |
| document_types | document_types_is_client_visible_default_not_null | NOT NULL is_client_visible_default |
| document_types | document_types_is_required_for_intake_not_null | NOT NULL is_required_for_intake |
| document_types | document_types_label_not_null | NOT NULL label |
| document_types | document_types_pkey | PRIMARY KEY (id) |
| document_types | document_types_updated_at_not_null | NOT NULL updated_at |
| notification_recipients | notification_recipients_activity_log_id_fkey | FOREIGN KEY (activity_log_id) REFERENCES activity_log(id) ON DELETE CASCADE |
| notification_recipients | notification_recipients_activity_log_id_not_null | NOT NULL activity_log_id |
| notification_recipients | notification_recipients_created_at_not_null | NOT NULL created_at |
| notification_recipients | notification_recipients_is_read_not_null | NOT NULL is_read |
| notification_recipients | notification_recipients_pkey | PRIMARY KEY (activity_log_id, recipient_user_id) |
| notification_recipients | notification_recipients_recipient_user_id_fkey | FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE |
| notification_recipients | notification_recipients_recipient_user_id_not_null | NOT NULL recipient_user_id |
| notification_recipients | notification_recipients_updated_at_not_null | NOT NULL updated_at |
| pending_progress_updates | pending_progress_updates_created_at_not_null | NOT NULL created_at |
| pending_progress_updates | pending_progress_updates_id_not_null | NOT NULL id |
| pending_progress_updates | pending_progress_updates_is_material_change_not_null | NOT NULL is_material_change |
| pending_progress_updates | pending_progress_updates_pkey | PRIMARY KEY (id) |
| pending_progress_updates | pending_progress_updates_prior_stage_id_fkey | FOREIGN KEY (prior_stage_id) REFERENCES project_stages(id) |
| pending_progress_updates | pending_progress_updates_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| pending_progress_updates | pending_progress_updates_project_id_not_null | NOT NULL project_id |
| pending_progress_updates | pending_progress_updates_requested_stage_id_fkey | FOREIGN KEY (requested_stage_id) REFERENCES project_stages(id) |
| pending_progress_updates | pending_progress_updates_resolved_by_fkey | FOREIGN KEY (resolved_by) REFERENCES users(id) |
| pending_progress_updates | pending_progress_updates_resulting_history_id_fkey | FOREIGN KEY (resulting_history_id) REFERENCES project_progress_history(id) |
| pending_progress_updates | pending_progress_updates_status_check | CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('auto_approved'::character varying)::text, ('approved'::character varying)::text, ('escalated'::character varying)::text, ('rejected'::character varying)::text]))) |
| pending_progress_updates | pending_progress_updates_status_not_null | NOT NULL status |
| pending_progress_updates | pending_progress_updates_submitted_at_not_null | NOT NULL submitted_at |
| pending_progress_updates | pending_progress_updates_submitted_by_fkey | FOREIGN KEY (submitted_by) REFERENCES users(id) |
| pending_progress_updates | pending_progress_updates_updated_at_not_null | NOT NULL updated_at |
| pending_rework_requests | pending_rework_requests_created_at_not_null | NOT NULL created_at |
| pending_rework_requests | pending_rework_requests_id_not_null | NOT NULL id |
| pending_rework_requests | pending_rework_requests_issue_categories_not_null | NOT NULL issue_categories |
| pending_rework_requests | pending_rework_requests_phase_update_id_fkey | FOREIGN KEY (phase_update_id) REFERENCES project_phase_updates(id) |
| pending_rework_requests | pending_rework_requests_pkey | PRIMARY KEY (id) |
| pending_rework_requests | pending_rework_requests_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| pending_rework_requests | pending_rework_requests_project_id_not_null | NOT NULL project_id |
| pending_rework_requests | pending_rework_requests_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| pending_rework_requests | pending_rework_requests_resolved_by_fkey | FOREIGN KEY (resolved_by) REFERENCES users(id) |
| pending_rework_requests | pending_rework_requests_resulting_history_id_fkey | FOREIGN KEY (resulting_history_id) REFERENCES project_progress_history(id) |
| pending_rework_requests | pending_rework_requests_status_check | CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text]))) |
| pending_rework_requests | pending_rework_requests_status_not_null | NOT NULL status |
| pending_rework_requests | pending_rework_requests_submitted_at_not_null | NOT NULL submitted_at |
| pending_rework_requests | pending_rework_requests_submitted_by_fkey | FOREIGN KEY (submitted_by) REFERENCES users(id) |
| pending_rework_requests | pending_rework_requests_updated_at_not_null | NOT NULL updated_at |
| pending_subcontractor_requests | pending_subcontractor_requests_created_at_not_null | NOT NULL created_at |
| pending_subcontractor_requests | pending_subcontractor_requests_has_conflict_not_null | NOT NULL has_conflict |
| pending_subcontractor_requests | pending_subcontractor_requests_id_not_null | NOT NULL id |
| pending_subcontractor_requests | pending_subcontractor_requests_pkey | PRIMARY KEY (id) |
| pending_subcontractor_requests | pending_subcontractor_requests_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| pending_subcontractor_requests | pending_subcontractor_requests_project_id_not_null | NOT NULL project_id |
| pending_subcontractor_requests | pending_subcontractor_requests_requested_at_not_null | NOT NULL requested_at |
| pending_subcontractor_requests | pending_subcontractor_requests_requested_by_fkey | FOREIGN KEY (requested_by) REFERENCES users(id) |
| pending_subcontractor_requests | pending_subcontractor_requests_resolved_by_fkey | FOREIGN KEY (resolved_by) REFERENCES users(id) |
| pending_subcontractor_requests | pending_subcontractor_requests_status_check | CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text]))) |
| pending_subcontractor_requests | pending_subcontractor_requests_status_not_null | NOT NULL status |
| pending_subcontractor_requests | pending_subcontractor_requests_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) |
| pending_subcontractor_requests | pending_subcontractor_requests_subcontractor_id_not_null | NOT NULL subcontractor_id |
| pending_subcontractor_requests | pending_subcontractor_requests_trade_id_fkey | FOREIGN KEY (trade_id) REFERENCES trades(id) |
| pending_subcontractor_requests | pending_subcontractor_requests_updated_at_not_null | NOT NULL updated_at |
| phase_checklist_templates | phase_checklist_templates_code_not_null | NOT NULL code |
| phase_checklist_templates | phase_checklist_templates_id_not_null | NOT NULL id |
| phase_checklist_templates | phase_checklist_templates_pkey | PRIMARY KEY (id) |
| phase_checklist_templates | phase_checklist_templates_project_stage_id_code_key | UNIQUE (project_stage_id, code) |
| phase_checklist_templates | phase_checklist_templates_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| phase_checklist_templates | phase_checklist_templates_project_stage_id_not_null | NOT NULL project_stage_id |
| phase_checklist_templates | phase_checklist_templates_required_not_null | NOT NULL required |
| phase_checklist_templates | phase_checklist_templates_sort_order_not_null | NOT NULL sort_order |
| phase_checklist_templates | phase_checklist_templates_title_not_null | NOT NULL title |
| phase_checklist_templates | phase_checklist_templates_weight_check | CHECK ((weight > 0)) |
| phase_checklist_templates | phase_checklist_templates_weight_not_null | NOT NULL weight |
| phase_checklist_templates | verified_activity_weight_positive | CHECK ((weight > 0)) |
| project_documents | project_documents_created_at_not_null | NOT NULL created_at |
| project_documents | project_documents_document_type_id_fkey | FOREIGN KEY (document_type_id) REFERENCES document_types(id) |
| project_documents | project_documents_document_type_id_not_null | NOT NULL document_type_id |
| project_documents | project_documents_id_not_null | NOT NULL id |
| project_documents | project_documents_pkey | PRIMARY KEY (id) |
| project_documents | project_documents_project_id_document_type_id_key | UNIQUE (project_id, document_type_id) |
| project_documents | project_documents_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_documents | project_documents_project_id_not_null | NOT NULL project_id |
| project_documents | project_documents_status_check | CHECK (((status)::text = ANY (ARRAY[('not_uploaded'::character varying)::text, ('uploaded'::character varying)::text]))) |
| project_documents | project_documents_status_not_null | NOT NULL status |
| project_documents | project_documents_updated_at_not_null | NOT NULL updated_at |
| project_documents | project_documents_uploaded_by_fkey | FOREIGN KEY (uploaded_by) REFERENCES users(id) |
| project_engineers | project_engineers_assigned_at_not_null | NOT NULL assigned_at |
| project_engineers | project_engineers_created_at_not_null | NOT NULL created_at |
| project_engineers | project_engineers_id_not_null | NOT NULL id |
| project_engineers | project_engineers_pkey | PRIMARY KEY (id) |
| project_engineers | project_engineers_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_engineers | project_engineers_project_id_not_null | NOT NULL project_id |
| project_engineers | project_engineers_updated_at_not_null | NOT NULL updated_at |
| project_engineers | project_engineers_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) |
| project_engineers | project_engineers_user_id_not_null | NOT NULL user_id |
| project_notes | project_notes_author_id_fkey | FOREIGN KEY (author_id) REFERENCES users(id) |
| project_notes | project_notes_created_at_not_null | NOT NULL created_at |
| project_notes | project_notes_id_not_null | NOT NULL id |
| project_notes | project_notes_note_text_not_null | NOT NULL note_text |
| project_notes | project_notes_noted_at_not_null | NOT NULL noted_at |
| project_notes | project_notes_pkey | PRIMARY KEY (id) |
| project_notes | project_notes_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_notes | project_notes_project_id_not_null | NOT NULL project_id |
| project_notes | project_notes_updated_at_not_null | NOT NULL updated_at |
| project_phase_checklist_items | project_phase_checklist_items_code_not_null | NOT NULL code |
| project_phase_checklist_items | project_phase_checklist_items_id_not_null | NOT NULL id |
| project_phase_checklist_items | project_phase_checklist_items_id_project_id_project_stage_i_key | UNIQUE (id, project_id, project_stage_id) |
| project_phase_checklist_items | project_phase_checklist_items_pkey | PRIMARY KEY (id) |
| project_phase_checklist_items | project_phase_checklist_items_project_id_not_null | NOT NULL project_id |
| project_phase_checklist_items | project_phase_checklist_items_project_id_project_stage_id_c_key | UNIQUE (project_id, project_stage_id, code) |
| project_phase_checklist_items | project_phase_checklist_items_project_id_project_stage_id_fkey | FOREIGN KEY (project_id, project_stage_id) REFERENCES project_phase_checklists(project_id, project_stage_id) |
| project_phase_checklist_items | project_phase_checklist_items_project_stage_id_not_null | NOT NULL project_stage_id |
| project_phase_checklist_items | project_phase_checklist_items_required_not_null | NOT NULL required |
| project_phase_checklist_items | project_phase_checklist_items_sort_order_not_null | NOT NULL sort_order |
| project_phase_checklist_items | project_phase_checklist_items_title_not_null | NOT NULL title |
| project_phase_checklist_items | project_phase_checklist_items_weight_check | CHECK ((weight > 0)) |
| project_phase_checklist_items | project_phase_checklist_items_weight_not_null | NOT NULL weight |
| project_phase_checklist_items | verified_activity_weight_positive | CHECK ((weight > 0)) |
| project_phase_checklists | project_phase_checklists_initialized_at_not_null | NOT NULL initialized_at |
| project_phase_checklists | project_phase_checklists_pkey | PRIMARY KEY (project_id, project_stage_id) |
| project_phase_checklists | project_phase_checklists_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) |
| project_phase_checklists | project_phase_checklists_project_id_not_null | NOT NULL project_id |
| project_phase_checklists | project_phase_checklists_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_phase_checklists | project_phase_checklists_project_stage_id_not_null | NOT NULL project_stage_id |
| project_phase_evidence | project_phase_evidence_check | CHECK ((((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((status <> 'pending'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL)))) |
| project_phase_evidence | project_phase_evidence_checklist_item_id_not_null | NOT NULL checklist_item_id |
| project_phase_evidence | project_phase_evidence_checklist_item_id_project_id_projec_fkey | FOREIGN KEY (checklist_item_id, project_id, project_stage_id) REFERENCES project_phase_checklist_items(id, project_id, project_stage_id) |
| project_phase_evidence | project_phase_evidence_file_id_project_id_project_stage_id_fkey | FOREIGN KEY (file_id, project_id, project_stage_id) REFERENCES project_phase_files(id, project_id, project_stage_id) |
| project_phase_evidence | project_phase_evidence_id_not_null | NOT NULL id |
| project_phase_evidence | project_phase_evidence_phase_update_id_fkey | FOREIGN KEY (phase_update_id) REFERENCES project_phase_updates(id) |
| project_phase_evidence | project_phase_evidence_pkey | PRIMARY KEY (id) |
| project_phase_evidence | project_phase_evidence_project_id_not_null | NOT NULL project_id |
| project_phase_evidence | project_phase_evidence_project_stage_id_not_null | NOT NULL project_stage_id |
| project_phase_evidence | project_phase_evidence_reviewed_by_fkey | FOREIGN KEY (reviewed_by) REFERENCES users(id) |
| project_phase_evidence | project_phase_evidence_rework_request_id_fkey | FOREIGN KEY (rework_request_id) REFERENCES pending_rework_requests(id) |
| project_phase_evidence | project_phase_evidence_status_check | CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) |
| project_phase_evidence | project_phase_evidence_status_not_null | NOT NULL status |
| project_phase_evidence | project_phase_evidence_submitted_at_not_null | NOT NULL submitted_at |
| project_phase_evidence | project_phase_evidence_submitted_by_fkey | FOREIGN KEY (submitted_by) REFERENCES users(id) |
| project_phase_evidence | project_phase_evidence_submitted_by_not_null | NOT NULL submitted_by |
| project_phase_files | project_phase_files_byte_size_check | CHECK (((byte_size > 0) AND (byte_size <= 10485760))) |
| project_phase_files | project_phase_files_byte_size_not_null | NOT NULL byte_size |
| project_phase_files | project_phase_files_content_not_null | NOT NULL content |
| project_phase_files | project_phase_files_content_type_not_null | NOT NULL content_type |
| project_phase_files | project_phase_files_id_not_null | NOT NULL id |
| project_phase_files | project_phase_files_id_project_id_project_stage_id_key | UNIQUE (id, project_id, project_stage_id) |
| project_phase_files | project_phase_files_original_name_not_null | NOT NULL original_name |
| project_phase_files | project_phase_files_pkey | PRIMARY KEY (id) |
| project_phase_files | project_phase_files_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) |
| project_phase_files | project_phase_files_project_id_not_null | NOT NULL project_id |
| project_phase_files | project_phase_files_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_phase_files | project_phase_files_project_stage_id_not_null | NOT NULL project_stage_id |
| project_phase_files | project_phase_files_uploaded_at_not_null | NOT NULL uploaded_at |
| project_phase_files | project_phase_files_uploaded_by_fkey | FOREIGN KEY (uploaded_by) REFERENCES users(id) |
| project_phase_files | project_phase_files_uploaded_by_not_null | NOT NULL uploaded_by |
| project_phase_submission_files | project_phase_submission_files_file_id_fkey | FOREIGN KEY (file_id) REFERENCES project_phase_files(id) |
| project_phase_submission_files | project_phase_submission_files_file_id_not_null | NOT NULL file_id |
| project_phase_submission_files | project_phase_submission_files_pkey | PRIMARY KEY (update_id, file_id) |
| project_phase_submission_files | project_phase_submission_files_update_id_fkey | FOREIGN KEY (update_id) REFERENCES project_phase_updates(id) |
| project_phase_submission_files | project_phase_submission_files_update_id_not_null | NOT NULL update_id |
| project_phase_team | project_phase_team_created_at_not_null | NOT NULL created_at |
| project_phase_team | project_phase_team_id_not_null | NOT NULL id |
| project_phase_team | project_phase_team_is_lead_not_null | NOT NULL is_lead |
| project_phase_team | project_phase_team_pkey | PRIMARY KEY (id) |
| project_phase_team | project_phase_team_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_phase_team | project_phase_team_project_id_not_null | NOT NULL project_id |
| project_phase_team | project_phase_team_project_id_project_stage_id_key | UNIQUE (project_id, project_stage_id) |
| project_phase_team | project_phase_team_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_phase_team | project_phase_team_project_stage_id_not_null | NOT NULL project_stage_id |
| project_phase_team | project_phase_team_spm_user_id_fkey | FOREIGN KEY (spm_user_id) REFERENCES users(id) |
| project_phase_team | project_phase_team_spm_user_id_not_null | NOT NULL spm_user_id |
| project_phase_team | project_phase_team_status_check | CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('declined'::character varying)::text, ('auto_expired'::character varying)::text, ('reassigned'::character varying)::text]))) |
| project_phase_team | project_phase_team_status_not_null | NOT NULL status |
| project_phase_team | project_phase_team_updated_at_not_null | NOT NULL updated_at |
| project_phase_update_files | project_phase_update_files_file_id_fkey | FOREIGN KEY (file_id) REFERENCES project_phase_files(id) |
| project_phase_update_files | project_phase_update_files_file_id_not_null | NOT NULL file_id |
| project_phase_update_files | project_phase_update_files_history_id_fkey | FOREIGN KEY (history_id) REFERENCES project_progress_history(id) |
| project_phase_update_files | project_phase_update_files_history_id_not_null | NOT NULL history_id |
| project_phase_update_files | project_phase_update_files_pkey | PRIMARY KEY (history_id, file_id) |
| project_phase_updates | project_phase_updates_check | CHECK ((((status = 'pending'::text) AND (resolved_by IS NULL) AND (resolved_at IS NULL)) OR ((status <> 'pending'::text) AND (resolved_by IS NOT NULL) AND (resolved_at IS NOT NULL)))) |
| project_phase_updates | project_phase_updates_history_id_fkey | FOREIGN KEY (history_id) REFERENCES project_progress_history(id) |
| project_phase_updates | project_phase_updates_id_not_null | NOT NULL id |
| project_phase_updates | project_phase_updates_issue_categories_check | CHECK ((issue_categories <@ ARRAY['failed_inspection'::text, 'material_defect'::text, 'rework_required'::text, 'design_change'::text, 'weather_delay'::text, 'manpower_shortage'::text, 'safety_incident'::text, 'other'::text])) |
| project_phase_updates | project_phase_updates_issue_categories_not_null | NOT NULL issue_categories |
| project_phase_updates | project_phase_updates_pkey | PRIMARY KEY (id) |
| project_phase_updates | project_phase_updates_prior_stage_id_fkey | FOREIGN KEY (prior_stage_id) REFERENCES project_stages(id) |
| project_phase_updates | project_phase_updates_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) |
| project_phase_updates | project_phase_updates_project_id_not_null | NOT NULL project_id |
| project_phase_updates | project_phase_updates_resolved_by_fkey | FOREIGN KEY (resolved_by) REFERENCES users(id) |
| project_phase_updates | project_phase_updates_selected_stage_id_fkey | FOREIGN KEY (selected_stage_id) REFERENCES project_stages(id) |
| project_phase_updates | project_phase_updates_selected_stage_id_not_null | NOT NULL selected_stage_id |
| project_phase_updates | project_phase_updates_status_check | CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) |
| project_phase_updates | project_phase_updates_status_not_null | NOT NULL status |
| project_phase_updates | project_phase_updates_submitted_at_not_null | NOT NULL submitted_at |
| project_phase_updates | project_phase_updates_submitted_by_fkey | FOREIGN KEY (submitted_by) REFERENCES users(id) |
| project_phase_updates | project_phase_updates_submitted_by_not_null | NOT NULL submitted_by |
| project_photos | project_photos_created_at_not_null | NOT NULL created_at |
| project_photos | project_photos_file_ref_not_null | NOT NULL file_ref |
| project_photos | project_photos_id_not_null | NOT NULL id |
| project_photos | project_photos_is_client_visible_not_null | NOT NULL is_client_visible |
| project_photos | project_photos_pkey | PRIMARY KEY (id) |
| project_photos | project_photos_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_photos | project_photos_project_id_not_null | NOT NULL project_id |
| project_photos | project_photos_updated_at_not_null | NOT NULL updated_at |
| project_photos | project_photos_uploaded_by_fkey | FOREIGN KEY (uploaded_by) REFERENCES users(id) |
| project_progress_history | project_progress_history_created_at_not_null | NOT NULL created_at |
| project_progress_history | project_progress_history_entry_type_not_null | NOT NULL entry_type |
| project_progress_history | project_progress_history_id_not_null | NOT NULL id |
| project_progress_history | project_progress_history_is_client_visible_not_null | NOT NULL is_client_visible |
| project_progress_history | project_progress_history_is_issue_not_null | NOT NULL is_issue |
| project_progress_history | project_progress_history_issue_categories_not_null | NOT NULL issue_categories |
| project_progress_history | project_progress_history_pct_check | CHECK (((pct >= 0) AND (pct <= 100))) |
| project_progress_history | project_progress_history_pkey | PRIMARY KEY (id) |
| project_progress_history | project_progress_history_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_progress_history | project_progress_history_project_id_not_null | NOT NULL project_id |
| project_progress_history | project_progress_history_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_progress_history | project_progress_history_project_stage_id_not_null | NOT NULL project_stage_id |
| project_progress_history | project_progress_history_recorded_at_not_null | NOT NULL recorded_at |
| project_progress_history | project_progress_history_recorded_by_fkey | FOREIGN KEY (recorded_by) REFERENCES users(id) |
| project_progress_history | project_progress_history_updated_at_not_null | NOT NULL updated_at |
| project_rework_activities | project_rework_activities_checklist_item_id_not_null | NOT NULL checklist_item_id |
| project_rework_activities | project_rework_activities_checklist_item_id_project_id_pro_fkey | FOREIGN KEY (checklist_item_id, project_id, project_stage_id) REFERENCES project_phase_checklist_items(id, project_id, project_stage_id) |
| project_rework_activities | project_rework_activities_correction_evidence_id_fkey | FOREIGN KEY (correction_evidence_id) REFERENCES project_phase_evidence(id) |
| project_rework_activities | project_rework_activities_pkey | PRIMARY KEY (request_id, checklist_item_id) |
| project_rework_activities | project_rework_activities_project_id_not_null | NOT NULL project_id |
| project_rework_activities | project_rework_activities_project_stage_id_not_null | NOT NULL project_stage_id |
| project_rework_activities | project_rework_activities_request_id_not_null | NOT NULL request_id |
| project_rework_activities | project_rework_activities_request_id_project_id_project_st_fkey | FOREIGN KEY (request_id, project_id, project_stage_id) REFERENCES pending_rework_requests(id, project_id, project_stage_id) |
| project_rework_activities | project_rework_activities_withdrawn_evidence_id_fkey | FOREIGN KEY (withdrawn_evidence_id) REFERENCES project_phase_evidence(id) |
| project_stage_discipline_links | project_stage_discipline_links_discipline_id_fkey | FOREIGN KEY (discipline_id) REFERENCES disciplines(id) |
| project_stage_discipline_links | project_stage_discipline_links_discipline_id_not_null | NOT NULL discipline_id |
| project_stage_discipline_links | project_stage_discipline_links_pkey | PRIMARY KEY (project_stage_id, discipline_id, project_type_id) |
| project_stage_discipline_links | project_stage_discipline_links_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_stage_discipline_links | project_stage_discipline_links_project_stage_id_not_null | NOT NULL project_stage_id |
| project_stage_discipline_links | project_stage_discipline_links_project_type_id_fkey | FOREIGN KEY (project_type_id) REFERENCES project_types(id) |
| project_stage_discipline_links | project_stage_discipline_links_project_type_id_not_null | NOT NULL project_type_id |
| project_stages | project_stages_code_key | UNIQUE (code) |
| project_stages | project_stages_code_not_null | NOT NULL code |
| project_stages | project_stages_created_at_not_null | NOT NULL created_at |
| project_stages | project_stages_id_not_null | NOT NULL id |
| project_stages | project_stages_pkey | PRIMARY KEY (id) |
| project_stages | project_stages_sort_order_not_null | NOT NULL sort_order |
| project_stages | project_stages_updated_at_not_null | NOT NULL updated_at |
| project_subcontractor_assignments | project_subcontractor_assignments_assigned_at_not_null | NOT NULL assigned_at |
| project_subcontractor_assignments | project_subcontractor_assignments_created_at_not_null | NOT NULL created_at |
| project_subcontractor_assignments | project_subcontractor_assignments_id_not_null | NOT NULL id |
| project_subcontractor_assignments | project_subcontractor_assignments_pkey | PRIMARY KEY (id) |
| project_subcontractor_assignments | project_subcontractor_assignments_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_subcontractor_assignments | project_subcontractor_assignments_project_id_not_null | NOT NULL project_id |
| project_subcontractor_assignments | project_subcontractor_assignments_status_check | CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('released'::character varying)::text]))) |
| project_subcontractor_assignments | project_subcontractor_assignments_status_not_null | NOT NULL status |
| project_subcontractor_assignments | project_subcontractor_assignments_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) |
| project_subcontractor_assignments | project_subcontractor_assignments_subcontractor_id_not_null | NOT NULL subcontractor_id |
| project_subcontractor_assignments | project_subcontractor_assignments_trade_id_fkey | FOREIGN KEY (trade_id) REFERENCES trades(id) |
| project_subcontractor_assignments | project_subcontractor_assignments_trade_id_not_null | NOT NULL trade_id |
| project_subcontractor_assignments | project_subcontractor_assignments_updated_at_not_null | NOT NULL updated_at |
| project_subcontractor_assignments | project_subcontractor_assignments_worker_count_not_null | NOT NULL worker_count |
| project_subcontractor_matches | project_subcontractor_matches_cert_coverage_pct_check | CHECK (((cert_coverage_pct >= 0) AND (cert_coverage_pct <= 100))) |
| project_subcontractor_matches | project_subcontractor_matches_created_at_not_null | NOT NULL created_at |
| project_subcontractor_matches | project_subcontractor_matches_match_score_check | CHECK (((match_score >= 0) AND (match_score <= 100))) |
| project_subcontractor_matches | project_subcontractor_matches_pkey | PRIMARY KEY (project_id, subcontractor_id) |
| project_subcontractor_matches | project_subcontractor_matches_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_subcontractor_matches | project_subcontractor_matches_project_id_not_null | NOT NULL project_id |
| project_subcontractor_matches | project_subcontractor_matches_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE |
| project_subcontractor_matches | project_subcontractor_matches_subcontractor_id_not_null | NOT NULL subcontractor_id |
| project_subcontractor_matches | project_subcontractor_matches_updated_at_not_null | NOT NULL updated_at |
| project_subcontractor_selections | project_subcontractor_selections_pkey | PRIMARY KEY (project_id, subcontractor_id) |
| project_subcontractor_selections | project_subcontractor_selections_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| project_subcontractor_selections | project_subcontractor_selections_project_id_not_null | NOT NULL project_id |
| project_subcontractor_selections | project_subcontractor_selections_status_check | CHECK ((status = ANY (ARRAY['proposed'::text, 'contacted'::text, 'accepted'::text, 'declined'::text, 'replaced'::text, 'archived'::text]))) |
| project_subcontractor_selections | project_subcontractor_selections_status_not_null | NOT NULL status |
| project_subcontractor_selections | project_subcontractor_selections_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) |
| project_subcontractor_selections | project_subcontractor_selections_subcontractor_id_not_null | NOT NULL subcontractor_id |
| project_type_stages | project_type_stages_pkey | PRIMARY KEY (project_type_id, project_stage_id) |
| project_type_stages | project_type_stages_project_stage_id_fkey | FOREIGN KEY (project_stage_id) REFERENCES project_stages(id) |
| project_type_stages | project_type_stages_project_stage_id_not_null | NOT NULL project_stage_id |
| project_type_stages | project_type_stages_project_type_id_fkey | FOREIGN KEY (project_type_id) REFERENCES project_types(id) |
| project_type_stages | project_type_stages_project_type_id_not_null | NOT NULL project_type_id |
| project_type_stages | project_type_stages_project_type_id_sort_order_key | UNIQUE (project_type_id, sort_order) |
| project_type_stages | project_type_stages_sort_order_check | CHECK ((sort_order > 0)) |
| project_type_stages | project_type_stages_sort_order_not_null | NOT NULL sort_order |
| project_types | project_types_code_key | UNIQUE (code) |
| project_types | project_types_code_not_null | NOT NULL code |
| project_types | project_types_created_at_not_null | NOT NULL created_at |
| project_types | project_types_id_not_null | NOT NULL id |
| project_types | project_types_max_opm_specializations_not_null | NOT NULL max_opm_specializations |
| project_types | project_types_pkey | PRIMARY KEY (id) |
| project_types | project_types_updated_at_not_null | NOT NULL updated_at |
| projects | projects_created_at_not_null | NOT NULL created_at |
| projects | projects_current_pct_check | CHECK (((current_pct >= 0) AND (current_pct <= 100))) |
| projects | projects_current_stage_id_fkey | FOREIGN KEY (current_stage_id) REFERENCES project_stages(id) |
| projects | projects_id_not_null | NOT NULL id |
| projects | projects_is_deleted_not_null | NOT NULL is_deleted |
| projects | projects_lifecycle_status_check | CHECK (((lifecycle_status)::text = ANY (ARRAY[('draft'::character varying)::text, ('suggested_allocation'::character varying)::text, ('confirmed'::character varying)::text, ('sent_to_opm'::character varying)::text, ('spm_review'::character varying)::text, ('active'::character varying)::text, ('archived'::character varying)::text]))) |
| projects | projects_lifecycle_status_not_null | NOT NULL lifecycle_status |
| projects | projects_location_not_null | NOT NULL location |
| projects | projects_name_not_null | NOT NULL name |
| projects | projects_pkey | PRIMARY KEY (id) |
| projects | projects_project_type_id_fkey | FOREIGN KEY (project_type_id) REFERENCES project_types(id) |
| projects | projects_project_type_id_not_null | NOT NULL project_type_id |
| projects | projects_suggested_opm_id_fkey | FOREIGN KEY (suggested_opm_id) REFERENCES users(id) |
| projects | projects_suggested_opm_match_score_check | CHECK (((suggested_opm_match_score >= 0) AND (suggested_opm_match_score <= 100))) |
| projects | projects_updated_at_not_null | NOT NULL updated_at |
| roles | roles_code_key | UNIQUE (code) |
| roles | roles_code_not_null | NOT NULL code |
| roles | roles_created_at_not_null | NOT NULL created_at |
| roles | roles_id_not_null | NOT NULL id |
| roles | roles_label_not_null | NOT NULL label |
| roles | roles_pkey | PRIMARY KEY (id) |
| roles | roles_updated_at_not_null | NOT NULL updated_at |
| stored_files | stored_files_byte_size_check | CHECK (((byte_size >= 1) AND (byte_size <= 15728640))) |
| stored_files | stored_files_byte_size_not_null | NOT NULL byte_size |
| stored_files | stored_files_content_not_null | NOT NULL content |
| stored_files | stored_files_content_type_not_null | NOT NULL content_type |
| stored_files | stored_files_created_at_not_null | NOT NULL created_at |
| stored_files | stored_files_id_not_null | NOT NULL id |
| stored_files | stored_files_original_name_not_null | NOT NULL original_name |
| stored_files | stored_files_pkey | PRIMARY KEY (id) |
| stored_files | stored_files_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) |
| stored_files | stored_files_purpose_not_null | NOT NULL purpose |
| stored_files | stored_files_uploaded_by_fkey | FOREIGN KEY (uploaded_by) REFERENCES users(id) |
| stored_files | stored_files_uploaded_by_not_null | NOT NULL uploaded_by |
| stored_files | stored_files_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) |
| subcontractor_workers | subcontractor_workers_availability_status_check | CHECK (((availability_status)::text = ANY (ARRAY[('assigned'::character varying)::text, ('available'::character varying)::text]))) |
| subcontractor_workers | subcontractor_workers_created_at_not_null | NOT NULL created_at |
| subcontractor_workers | subcontractor_workers_current_project_id_fkey | FOREIGN KEY (current_project_id) REFERENCES projects(id) |
| subcontractor_workers | subcontractor_workers_discipline_id_fkey | FOREIGN KEY (discipline_id) REFERENCES disciplines(id) |
| subcontractor_workers | subcontractor_workers_full_name_not_null | NOT NULL full_name |
| subcontractor_workers | subcontractor_workers_id_not_null | NOT NULL id |
| subcontractor_workers | subcontractor_workers_pkey | PRIMARY KEY (id) |
| subcontractor_workers | subcontractor_workers_status_check | CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text]))) |
| subcontractor_workers | subcontractor_workers_status_not_null | NOT NULL status |
| subcontractor_workers | subcontractor_workers_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE |
| subcontractor_workers | subcontractor_workers_subcontractor_id_not_null | NOT NULL subcontractor_id |
| subcontractor_workers | subcontractor_workers_updated_at_not_null | NOT NULL updated_at |
| subcontractors | subcontractors_company_name_not_null | NOT NULL company_name |
| subcontractors | subcontractors_created_at_not_null | NOT NULL created_at |
| subcontractors | subcontractors_directory_status_check | CHECK ((directory_status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text]))) |
| subcontractors | subcontractors_directory_status_not_null | NOT NULL directory_status |
| subcontractors | subcontractors_id_not_null | NOT NULL id |
| subcontractors | subcontractors_is_deleted_not_null | NOT NULL is_deleted |
| subcontractors | subcontractors_pkey | PRIMARY KEY (id) |
| subcontractors | subcontractors_source_check | CHECK (((source)::text = ANY (ARRAY[('system_matched'::character varying)::text, ('directory'::character varying)::text]))) |
| subcontractors | subcontractors_source_not_null | NOT NULL source |
| subcontractors | subcontractors_trade_id_fkey | FOREIGN KEY (trade_id) REFERENCES trades(id) |
| subcontractors | subcontractors_trade_id_not_null | NOT NULL trade_id |
| subcontractors | subcontractors_updated_at_not_null | NOT NULL updated_at |
| trades | trades_code_key | UNIQUE (code) |
| trades | trades_code_not_null | NOT NULL code |
| trades | trades_created_at_not_null | NOT NULL created_at |
| trades | trades_id_not_null | NOT NULL id |
| trades | trades_pkey | PRIMARY KEY (id) |
| trades | trades_updated_at_not_null | NOT NULL updated_at |
| user_certifications | user_certifications_certification_type_id_fkey | FOREIGN KEY (certification_type_id) REFERENCES certification_types(id) |
| user_certifications | user_certifications_certification_type_id_not_null | NOT NULL certification_type_id |
| user_certifications | user_certifications_created_at_not_null | NOT NULL created_at |
| user_certifications | user_certifications_pkey | PRIMARY KEY (user_id, certification_type_id) |
| user_certifications | user_certifications_updated_at_not_null | NOT NULL updated_at |
| user_certifications | user_certifications_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| user_certifications | user_certifications_user_id_not_null | NOT NULL user_id |
| user_client_project_links | user_client_project_links_created_at_not_null | NOT NULL created_at |
| user_client_project_links | user_client_project_links_pkey | PRIMARY KEY (user_id, project_id) |
| user_client_project_links | user_client_project_links_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| user_client_project_links | user_client_project_links_project_id_not_null | NOT NULL project_id |
| user_client_project_links | user_client_project_links_updated_at_not_null | NOT NULL updated_at |
| user_client_project_links | user_client_project_links_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| user_client_project_links | user_client_project_links_user_id_not_null | NOT NULL user_id |
| user_discipline_scopes | user_discipline_scopes_created_at_not_null | NOT NULL created_at |
| user_discipline_scopes | user_discipline_scopes_discipline_id_fkey | FOREIGN KEY (discipline_id) REFERENCES disciplines(id) |
| user_discipline_scopes | user_discipline_scopes_discipline_id_not_null | NOT NULL discipline_id |
| user_discipline_scopes | user_discipline_scopes_pkey | PRIMARY KEY (user_id, discipline_id) |
| user_discipline_scopes | user_discipline_scopes_updated_at_not_null | NOT NULL updated_at |
| user_discipline_scopes | user_discipline_scopes_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| user_discipline_scopes | user_discipline_scopes_user_id_not_null | NOT NULL user_id |
| user_licenses | user_licenses_created_at_not_null | NOT NULL created_at |
| user_licenses | user_licenses_id_not_null | NOT NULL id |
| user_licenses | user_licenses_pkey | PRIMARY KEY (id) |
| user_licenses | user_licenses_updated_at_not_null | NOT NULL updated_at |
| user_licenses | user_licenses_upload_status_check | CHECK (((upload_status)::text = ANY (ARRAY[('none'::character varying)::text, ('pending'::character varying)::text, ('uploaded'::character varying)::text]))) |
| user_licenses | user_licenses_upload_status_not_null | NOT NULL upload_status |
| user_licenses | user_licenses_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| user_licenses | user_licenses_user_id_not_null | NOT NULL user_id |
| user_project_type_specializations | user_project_type_specializations_created_at_not_null | NOT NULL created_at |
| user_project_type_specializations | user_project_type_specializations_pkey | PRIMARY KEY (user_id, project_type_id) |
| user_project_type_specializations | user_project_type_specializations_project_type_id_fkey | FOREIGN KEY (project_type_id) REFERENCES project_types(id) |
| user_project_type_specializations | user_project_type_specializations_project_type_id_not_null | NOT NULL project_type_id |
| user_project_type_specializations | user_project_type_specializations_updated_at_not_null | NOT NULL updated_at |
| user_project_type_specializations | user_project_type_specializations_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| user_project_type_specializations | user_project_type_specializations_user_id_not_null | NOT NULL user_id |
| users | users_created_at_not_null | NOT NULL created_at |
| users | users_date_added_not_null | NOT NULL date_added |
| users | users_email_key | UNIQUE (email) |
| users | users_email_not_null | NOT NULL email |
| users | users_full_name_not_null | NOT NULL full_name |
| users | users_id_not_null | NOT NULL id |
| users | users_is_deleted_not_null | NOT NULL is_deleted |
| users | users_password_hash_not_null | NOT NULL password_hash |
| users | users_pkey | PRIMARY KEY (id) |
| users | users_role_id_fkey | FOREIGN KEY (role_id) REFERENCES roles(id) |
| users | users_role_id_not_null | NOT NULL role_id |
| users | users_status_check | CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('invited'::character varying)::text, ('suspended'::character varying)::text]))) |
| users | users_status_not_null | NOT NULL status |
| users | users_temp_password_issued_not_null | NOT NULL temp_password_issued |
| users | users_updated_at_not_null | NOT NULL updated_at |
| users_token | users_token_pkey | PRIMARY KEY (user_id) |
| users_token | users_token_token_key | UNIQUE (token) |
| users_token | users_token_token_not_null | NOT NULL token |
| users_token | users_token_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) |
| users_token | users_token_user_id_not_null | NOT NULL user_id |
| worker_certifications | worker_certifications_certification_type_id_fkey | FOREIGN KEY (certification_type_id) REFERENCES certification_types(id) |
| worker_certifications | worker_certifications_certification_type_id_not_null | NOT NULL certification_type_id |
| worker_certifications | worker_certifications_created_at_not_null | NOT NULL created_at |
| worker_certifications | worker_certifications_pkey | PRIMARY KEY (worker_id, certification_type_id) |
| worker_certifications | worker_certifications_updated_at_not_null | NOT NULL updated_at |
| worker_certifications | worker_certifications_worker_id_fkey | FOREIGN KEY (worker_id) REFERENCES subcontractor_workers(id) ON DELETE CASCADE |
| worker_certifications | worker_certifications_worker_id_not_null | NOT NULL worker_id |
| worker_employment_history | worker_employment_history_created_at_not_null | NOT NULL created_at |
| worker_employment_history | worker_employment_history_id_not_null | NOT NULL id |
| worker_employment_history | worker_employment_history_pkey | PRIMARY KEY (id) |
| worker_employment_history | worker_employment_history_updated_at_not_null | NOT NULL updated_at |
| worker_employment_history | worker_employment_history_worker_id_fkey | FOREIGN KEY (worker_id) REFERENCES subcontractor_workers(id) ON DELETE CASCADE |
| worker_employment_history | worker_employment_history_worker_id_not_null | NOT NULL worker_id |
| workspace_account_metadata | workspace_account_metadata_metadata_not_null | NOT NULL metadata |
| workspace_account_metadata | workspace_account_metadata_pkey | PRIMARY KEY (user_id) |
| workspace_account_metadata | workspace_account_metadata_user_id_fkey | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| workspace_account_metadata | workspace_account_metadata_user_id_not_null | NOT NULL user_id |
| workspace_company_metadata | workspace_company_metadata_metadata_not_null | NOT NULL metadata |
| workspace_company_metadata | workspace_company_metadata_pkey | PRIMARY KEY (subcontractor_id) |
| workspace_company_metadata | workspace_company_metadata_subcontractor_id_fkey | FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE |
| workspace_company_metadata | workspace_company_metadata_subcontractor_id_not_null | NOT NULL subcontractor_id |
| workspace_project_metadata | workspace_project_metadata_metadata_not_null | NOT NULL metadata |
| workspace_project_metadata | workspace_project_metadata_pkey | PRIMARY KEY (project_id) |
| workspace_project_metadata | workspace_project_metadata_project_id_fkey | FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE |
| workspace_project_metadata | workspace_project_metadata_project_id_not_null | NOT NULL project_id |
| workspace_settings | workspace_settings_pkey | PRIMARY KEY (singleton) |
| workspace_settings | workspace_settings_rules_not_null | NOT NULL rules |
| workspace_settings | workspace_settings_singleton_check | CHECK (singleton) |
| workspace_settings | workspace_settings_singleton_not_null | NOT NULL singleton |
| activity_log | activity_log_pkey | CREATE UNIQUE INDEX activity_log_pkey ON public.activity_log USING btree (id) |
| activity_log | idx_activity_log_occurred | CREATE INDEX idx_activity_log_occurred ON public.activity_log USING btree (occurred_at DESC) |
| activity_log | idx_activity_log_project | CREATE INDEX idx_activity_log_project ON public.activity_log USING btree (related_project_id) |
| activity_log | idx_activity_log_target_role | CREATE INDEX idx_activity_log_target_role ON public.activity_log USING btree (target_role_id, occurred_at DESC) |
| activity_types | activity_types_code_key | CREATE UNIQUE INDEX activity_types_code_key ON public.activity_types USING btree (code) |
| activity_types | activity_types_pkey | CREATE UNIQUE INDEX activity_types_pkey ON public.activity_types USING btree (id) |
| assignment_confirmations | assignment_confirmations_pkey | CREATE UNIQUE INDEX assignment_confirmations_pkey ON public.assignment_confirmations USING btree (id) |
| assignment_confirmations | idx_assignment_conf_project | CREATE INDEX idx_assignment_conf_project ON public.assignment_confirmations USING btree (project_id) |
| assignment_confirmations | idx_assignment_conf_target | CREATE INDEX idx_assignment_conf_target ON public.assignment_confirmations USING btree (target_user_id, status) |
| audit_log | audit_log_pkey | CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id) |
| audit_log | idx_audit_log_changed_at | CREATE INDEX idx_audit_log_changed_at ON public.audit_log USING btree (changed_at DESC) |
| audit_log | idx_audit_log_changed_by | CREATE INDEX idx_audit_log_changed_by ON public.audit_log USING btree (changed_by) |
| audit_log | idx_audit_log_table_record | CREATE INDEX idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id) |
| certification_types | certification_types_code_key | CREATE UNIQUE INDEX certification_types_code_key ON public.certification_types USING btree (code) |
| certification_types | certification_types_pkey | CREATE UNIQUE INDEX certification_types_pkey ON public.certification_types USING btree (id) |
| contracts | contracts_pkey | CREATE UNIQUE INDEX contracts_pkey ON public.contracts USING btree (id) |
| contracts | idx_contracts_project | CREATE INDEX idx_contracts_project ON public.contracts USING btree (project_id) |
| disciplines | disciplines_code_key | CREATE UNIQUE INDEX disciplines_code_key ON public.disciplines USING btree (code) |
| disciplines | disciplines_pkey | CREATE UNIQUE INDEX disciplines_pkey ON public.disciplines USING btree (id) |
| document_types | document_types_code_key | CREATE UNIQUE INDEX document_types_code_key ON public.document_types USING btree (code) |
| document_types | document_types_pkey | CREATE UNIQUE INDEX document_types_pkey ON public.document_types USING btree (id) |
| notification_recipients | idx_notif_recipients_unread | CREATE INDEX idx_notif_recipients_unread ON public.notification_recipients USING btree (recipient_user_id) WHERE (is_read = false) |
| notification_recipients | notification_recipients_pkey | CREATE UNIQUE INDEX notification_recipients_pkey ON public.notification_recipients USING btree (activity_log_id, recipient_user_id) |
| pending_progress_updates | idx_pending_updates_status | CREATE INDEX idx_pending_updates_status ON public.pending_progress_updates USING btree (status) |
| pending_progress_updates | pending_progress_updates_pkey | CREATE UNIQUE INDEX pending_progress_updates_pkey ON public.pending_progress_updates USING btree (id) |
| pending_progress_updates | uq_one_pending_update_per_project | CREATE UNIQUE INDEX uq_one_pending_update_per_project ON public.pending_progress_updates USING btree (project_id) WHERE ((status)::text = 'pending'::text) |
| pending_rework_requests | idx_rework_project | CREATE INDEX idx_rework_project ON public.pending_rework_requests USING btree (project_id, status) |
| pending_rework_requests | pending_rework_request_scope | CREATE UNIQUE INDEX pending_rework_request_scope ON public.pending_rework_requests USING btree (id, project_id, project_stage_id) |
| pending_rework_requests | pending_rework_requests_pkey | CREATE UNIQUE INDEX pending_rework_requests_pkey ON public.pending_rework_requests USING btree (id) |
| pending_subcontractor_requests | idx_subcon_requests_project | CREATE INDEX idx_subcon_requests_project ON public.pending_subcontractor_requests USING btree (project_id, status) |
| pending_subcontractor_requests | pending_subcontractor_requests_pkey | CREATE UNIQUE INDEX pending_subcontractor_requests_pkey ON public.pending_subcontractor_requests USING btree (id) |
| phase_checklist_templates | phase_checklist_templates_pkey | CREATE UNIQUE INDEX phase_checklist_templates_pkey ON public.phase_checklist_templates USING btree (id) |
| phase_checklist_templates | phase_checklist_templates_project_stage_id_code_key | CREATE UNIQUE INDEX phase_checklist_templates_project_stage_id_code_key ON public.phase_checklist_templates USING btree (project_stage_id, code) |
| project_documents | idx_project_documents_project | CREATE INDEX idx_project_documents_project ON public.project_documents USING btree (project_id) |
| project_documents | project_documents_pkey | CREATE UNIQUE INDEX project_documents_pkey ON public.project_documents USING btree (id) |
| project_documents | project_documents_project_id_document_type_id_key | CREATE UNIQUE INDEX project_documents_project_id_document_type_id_key ON public.project_documents USING btree (project_id, document_type_id) |
| project_engineers | idx_project_engineers_project | CREATE INDEX idx_project_engineers_project ON public.project_engineers USING btree (project_id) |
| project_engineers | idx_project_engineers_user | CREATE INDEX idx_project_engineers_user ON public.project_engineers USING btree (user_id) |
| project_engineers | project_engineers_pkey | CREATE UNIQUE INDEX project_engineers_pkey ON public.project_engineers USING btree (id) |
| project_notes | idx_project_notes_project | CREATE INDEX idx_project_notes_project ON public.project_notes USING btree (project_id) |
| project_notes | project_notes_pkey | CREATE UNIQUE INDEX project_notes_pkey ON public.project_notes USING btree (id) |
| project_phase_checklist_items | project_phase_checklist_items_id_project_id_project_stage_i_key | CREATE UNIQUE INDEX project_phase_checklist_items_id_project_id_project_stage_i_key ON public.project_phase_checklist_items USING btree (id, project_id, project_stage_id) |
| project_phase_checklist_items | project_phase_checklist_items_pkey | CREATE UNIQUE INDEX project_phase_checklist_items_pkey ON public.project_phase_checklist_items USING btree (id) |
| project_phase_checklist_items | project_phase_checklist_items_project_id_project_stage_id_c_key | CREATE UNIQUE INDEX project_phase_checklist_items_project_id_project_stage_id_c_key ON public.project_phase_checklist_items USING btree (project_id, project_stage_id, code) |
| project_phase_checklists | project_phase_checklists_pkey | CREATE UNIQUE INDEX project_phase_checklists_pkey ON public.project_phase_checklists USING btree (project_id, project_stage_id) |
| project_phase_evidence | phase_evidence_latest | CREATE INDEX phase_evidence_latest ON public.project_phase_evidence USING btree (checklist_item_id, id DESC) |
| project_phase_evidence | project_phase_evidence_pkey | CREATE UNIQUE INDEX project_phase_evidence_pkey ON public.project_phase_evidence USING btree (id) |
| project_phase_files | phase_files_project | CREATE INDEX phase_files_project ON public.project_phase_files USING btree (project_id, project_stage_id) |
| project_phase_files | project_phase_files_id_project_id_project_stage_id_key | CREATE UNIQUE INDEX project_phase_files_id_project_id_project_stage_id_key ON public.project_phase_files USING btree (id, project_id, project_stage_id) |
| project_phase_files | project_phase_files_pkey | CREATE UNIQUE INDEX project_phase_files_pkey ON public.project_phase_files USING btree (id) |
| project_phase_submission_files | project_phase_submission_files_pkey | CREATE UNIQUE INDEX project_phase_submission_files_pkey ON public.project_phase_submission_files USING btree (update_id, file_id) |
| project_phase_team | idx_phase_team_project | CREATE INDEX idx_phase_team_project ON public.project_phase_team USING btree (project_id) |
| project_phase_team | idx_phase_team_spm | CREATE INDEX idx_phase_team_spm ON public.project_phase_team USING btree (spm_user_id) |
| project_phase_team | project_phase_team_pkey | CREATE UNIQUE INDEX project_phase_team_pkey ON public.project_phase_team USING btree (id) |
| project_phase_team | project_phase_team_project_id_project_stage_id_key | CREATE UNIQUE INDEX project_phase_team_project_id_project_stage_id_key ON public.project_phase_team USING btree (project_id, project_stage_id) |
| project_phase_update_files | project_phase_update_files_pkey | CREATE UNIQUE INDEX project_phase_update_files_pkey ON public.project_phase_update_files USING btree (history_id, file_id) |
| project_phase_updates | one_pending_phase_update | CREATE UNIQUE INDEX one_pending_phase_update ON public.project_phase_updates USING btree (project_id) WHERE (status = 'pending'::text) |
| project_phase_updates | project_phase_updates_pkey | CREATE UNIQUE INDEX project_phase_updates_pkey ON public.project_phase_updates USING btree (id) |
| project_photos | idx_project_photos_project | CREATE INDEX idx_project_photos_project ON public.project_photos USING btree (project_id) |
| project_photos | project_photos_pkey | CREATE UNIQUE INDEX project_photos_pkey ON public.project_photos USING btree (id) |
| project_progress_history | idx_progress_history_client_visible | CREATE INDEX idx_progress_history_client_visible ON public.project_progress_history USING btree (project_id) WHERE (is_client_visible = true) |
| project_progress_history | idx_progress_history_project | CREATE INDEX idx_progress_history_project ON public.project_progress_history USING btree (project_id, recorded_at DESC) |
| project_progress_history | project_progress_history_pkey | CREATE UNIQUE INDEX project_progress_history_pkey ON public.project_progress_history USING btree (id) |
| project_rework_activities | project_rework_activities_pkey | CREATE UNIQUE INDEX project_rework_activities_pkey ON public.project_rework_activities USING btree (request_id, checklist_item_id) |
| project_rework_activities | rework_activities_project_phase | CREATE INDEX rework_activities_project_phase ON public.project_rework_activities USING btree (project_id, project_stage_id) |
| project_stage_discipline_links | project_stage_discipline_links_pkey | CREATE UNIQUE INDEX project_stage_discipline_links_pkey ON public.project_stage_discipline_links USING btree (project_stage_id, discipline_id, project_type_id) |
| project_stages | project_stages_code_key | CREATE UNIQUE INDEX project_stages_code_key ON public.project_stages USING btree (code) |
| project_stages | project_stages_pkey | CREATE UNIQUE INDEX project_stages_pkey ON public.project_stages USING btree (id) |
| project_subcontractor_assignments | idx_subcon_assignments_project | CREATE INDEX idx_subcon_assignments_project ON public.project_subcontractor_assignments USING btree (project_id) |
| project_subcontractor_assignments | idx_subcon_assignments_subcon | CREATE INDEX idx_subcon_assignments_subcon ON public.project_subcontractor_assignments USING btree (subcontractor_id) |
| project_subcontractor_assignments | project_subcontractor_assignments_pkey | CREATE UNIQUE INDEX project_subcontractor_assignments_pkey ON public.project_subcontractor_assignments USING btree (id) |
| project_subcontractor_matches | project_subcontractor_matches_pkey | CREATE UNIQUE INDEX project_subcontractor_matches_pkey ON public.project_subcontractor_matches USING btree (project_id, subcontractor_id) |
| project_subcontractor_selections | one_current_subcontractor_selection | CREATE UNIQUE INDEX one_current_subcontractor_selection ON public.project_subcontractor_selections USING btree (project_id) WHERE (status = ANY (ARRAY['contacted'::text, 'accepted'::text])) |
| project_subcontractor_selections | project_subcontractor_selections_pkey | CREATE UNIQUE INDEX project_subcontractor_selections_pkey ON public.project_subcontractor_selections USING btree (project_id, subcontractor_id) |
| project_type_stages | project_type_stages_pkey | CREATE UNIQUE INDEX project_type_stages_pkey ON public.project_type_stages USING btree (project_type_id, project_stage_id) |
| project_type_stages | project_type_stages_project_type_id_sort_order_key | CREATE UNIQUE INDEX project_type_stages_project_type_id_sort_order_key ON public.project_type_stages USING btree (project_type_id, sort_order) |
| project_types | project_types_code_key | CREATE UNIQUE INDEX project_types_code_key ON public.project_types USING btree (code) |
| project_types | project_types_pkey | CREATE UNIQUE INDEX project_types_pkey ON public.project_types USING btree (id) |
| projects | idx_projects_lifecycle_status | CREATE INDEX idx_projects_lifecycle_status ON public.projects USING btree (lifecycle_status) |
| projects | idx_projects_type | CREATE INDEX idx_projects_type ON public.projects USING btree (project_type_id) |
| projects | projects_pkey | CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id) |
| roles | roles_code_key | CREATE UNIQUE INDEX roles_code_key ON public.roles USING btree (code) |
| roles | roles_pkey | CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id) |
| stored_files | stored_files_pkey | CREATE UNIQUE INDEX stored_files_pkey ON public.stored_files USING btree (id) |
| stored_files | stored_files_project | CREATE INDEX stored_files_project ON public.stored_files USING btree (project_id, purpose, created_at DESC) |
| stored_files | stored_files_user | CREATE INDEX stored_files_user ON public.stored_files USING btree (user_id, purpose, created_at DESC) |
| subcontractor_workers | idx_subcon_workers_discipline | CREATE INDEX idx_subcon_workers_discipline ON public.subcontractor_workers USING btree (discipline_id) |
| subcontractor_workers | idx_subcon_workers_license_expiry | CREATE INDEX idx_subcon_workers_license_expiry ON public.subcontractor_workers USING btree (license_expiry) |
| subcontractor_workers | idx_subcon_workers_subcon | CREATE INDEX idx_subcon_workers_subcon ON public.subcontractor_workers USING btree (subcontractor_id) |
| subcontractor_workers | subcontractor_workers_company_status | CREATE INDEX subcontractor_workers_company_status ON public.subcontractor_workers USING btree (subcontractor_id, status) |
| subcontractor_workers | subcontractor_workers_pkey | CREATE UNIQUE INDEX subcontractor_workers_pkey ON public.subcontractor_workers USING btree (id) |
| subcontractor_workers | subcontractor_workers_project_status | CREATE INDEX subcontractor_workers_project_status ON public.subcontractor_workers USING btree (current_project_id, availability_status, status) |
| subcontractors | idx_subcontractors_trade | CREATE INDEX idx_subcontractors_trade ON public.subcontractors USING btree (trade_id) |
| subcontractors | subcontractors_pkey | CREATE UNIQUE INDEX subcontractors_pkey ON public.subcontractors USING btree (id) |
| trades | trades_code_key | CREATE UNIQUE INDEX trades_code_key ON public.trades USING btree (code) |
| trades | trades_pkey | CREATE UNIQUE INDEX trades_pkey ON public.trades USING btree (id) |
| user_certifications | user_certifications_pkey | CREATE UNIQUE INDEX user_certifications_pkey ON public.user_certifications USING btree (user_id, certification_type_id) |
| user_client_project_links | user_client_project_links_pkey | CREATE UNIQUE INDEX user_client_project_links_pkey ON public.user_client_project_links USING btree (user_id, project_id) |
| user_discipline_scopes | user_discipline_scopes_pkey | CREATE UNIQUE INDEX user_discipline_scopes_pkey ON public.user_discipline_scopes USING btree (user_id, discipline_id) |
| user_licenses | idx_user_licenses_expiry | CREATE INDEX idx_user_licenses_expiry ON public.user_licenses USING btree (license_expiry) WHERE (superseded_at IS NULL) |
| user_licenses | idx_user_licenses_user | CREATE INDEX idx_user_licenses_user ON public.user_licenses USING btree (user_id) |
| user_licenses | user_licenses_pkey | CREATE UNIQUE INDEX user_licenses_pkey ON public.user_licenses USING btree (id) |
| user_project_type_specializations | user_project_type_specializations_pkey | CREATE UNIQUE INDEX user_project_type_specializations_pkey ON public.user_project_type_specializations USING btree (user_id, project_type_id) |
| users | idx_users_role | CREATE INDEX idx_users_role ON public.users USING btree (role_id) |
| users | idx_users_status | CREATE INDEX idx_users_status ON public.users USING btree (status) |
| users | users_email_key | CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email) |
| users | users_pkey | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id) |
| users_token | users_token_pkey | CREATE UNIQUE INDEX users_token_pkey ON public.users_token USING btree (user_id) |
| users_token | users_token_token_key | CREATE UNIQUE INDEX users_token_token_key ON public.users_token USING btree (token) |
| worker_certifications | worker_certifications_pkey | CREATE UNIQUE INDEX worker_certifications_pkey ON public.worker_certifications USING btree (worker_id, certification_type_id) |
| worker_employment_history | idx_worker_history_worker | CREATE INDEX idx_worker_history_worker ON public.worker_employment_history USING btree (worker_id) |
| worker_employment_history | worker_employment_history_pkey | CREATE UNIQUE INDEX worker_employment_history_pkey ON public.worker_employment_history USING btree (id) |
| workspace_account_metadata | workspace_account_metadata_pkey | CREATE UNIQUE INDEX workspace_account_metadata_pkey ON public.workspace_account_metadata USING btree (user_id) |
| workspace_company_metadata | workspace_company_metadata_pkey | CREATE UNIQUE INDEX workspace_company_metadata_pkey ON public.workspace_company_metadata USING btree (subcontractor_id) |
| workspace_project_metadata | workspace_project_metadata_pkey | CREATE UNIQUE INDEX workspace_project_metadata_pkey ON public.workspace_project_metadata USING btree (project_id) |
| workspace_settings | workspace_settings_pkey | CREATE UNIQUE INDEX workspace_settings_pkey ON public.workspace_settings USING btree (singleton) |

## Enums, functions and triggers

No new enum is required. Lifecycle and review states use existing varchar/text CHECKs, not new enum values. Verified calculation and targeted impact functions are JavaScript domain functions, not missing PostgreSQL stored procedures. Built-ins used include now, hashtext, advisory locks, aggregates, window functions, JSON operations and standard PostgreSQL catalogs. Base audit/timestamp trigger functions remain required.

| Object | Type / definition | Migration |
|---|---|---|
| siteline_normalize_rework_status | function returns trigger | NEW recovery 004 |
| trg_enforce_opm_specialization_cap | function returns trigger | base schema / citext extension |
| trg_set_updated_audit | function returns trigger | base schema / citext extension |
| trg_write_audit_log | function returns trigger | base schema / citext extension |
| siteline_normalize_rework_status | CREATE TRIGGER siteline_normalize_rework_status BEFORE INSERT OR UPDATE OF status, rework_request_id ON public.project_phase_evidence FOR EACH ROW EXECUTE FUNCTION siteline_normalize_rework_status() | NEW recovery 004 |
| trg_audit_activity_log | CREATE TRIGGER trg_audit_activity_log AFTER INSERT OR DELETE OR UPDATE ON public.activity_log FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_assignment_conf | CREATE TRIGGER trg_audit_assignment_conf AFTER INSERT OR DELETE OR UPDATE ON public.assignment_confirmations FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_client_project_links | CREATE TRIGGER trg_audit_client_project_links AFTER INSERT OR DELETE OR UPDATE ON public.user_client_project_links FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_contracts | CREATE TRIGGER trg_audit_contracts AFTER INSERT OR DELETE OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_notification_recipients | CREATE TRIGGER trg_audit_notification_recipients AFTER INSERT OR DELETE OR UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_pending_updates | CREATE TRIGGER trg_audit_pending_updates AFTER INSERT OR DELETE OR UPDATE ON public.pending_progress_updates FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_phase_team | CREATE TRIGGER trg_audit_phase_team AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_team FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_progress_history | CREATE TRIGGER trg_audit_progress_history AFTER INSERT OR DELETE OR UPDATE ON public.project_progress_history FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_project_documents | CREATE TRIGGER trg_audit_project_documents AFTER INSERT OR DELETE OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_project_engineers | CREATE TRIGGER trg_audit_project_engineers AFTER INSERT OR DELETE OR UPDATE ON public.project_engineers FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_project_notes | CREATE TRIGGER trg_audit_project_notes AFTER INSERT OR DELETE OR UPDATE ON public.project_notes FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_project_photos | CREATE TRIGGER trg_audit_project_photos AFTER INSERT OR DELETE OR UPDATE ON public.project_photos FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_projects | CREATE TRIGGER trg_audit_projects AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_rework | CREATE TRIGGER trg_audit_rework AFTER INSERT OR DELETE OR UPDATE ON public.pending_rework_requests FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_share_access_log | CREATE TRIGGER trg_audit_share_access_log AFTER INSERT OR DELETE OR UPDATE ON public.share_link_access_log FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_share_excluded_docs | CREATE TRIGGER trg_audit_share_excluded_docs AFTER INSERT OR DELETE OR UPDATE ON public.share_link_excluded_documents FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_share_links | CREATE TRIGGER trg_audit_share_links AFTER INSERT OR DELETE OR UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_subcon_assignments | CREATE TRIGGER trg_audit_subcon_assignments AFTER INSERT OR DELETE OR UPDATE ON public.project_subcontractor_assignments FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_subcon_matches | CREATE TRIGGER trg_audit_subcon_matches AFTER INSERT OR DELETE OR UPDATE ON public.project_subcontractor_matches FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_subcon_requests | CREATE TRIGGER trg_audit_subcon_requests AFTER INSERT OR DELETE OR UPDATE ON public.pending_subcontractor_requests FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_subcon_workers | CREATE TRIGGER trg_audit_subcon_workers AFTER INSERT OR DELETE OR UPDATE ON public.subcontractor_workers FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_subcontractors | CREATE TRIGGER trg_audit_subcontractors AFTER INSERT OR DELETE OR UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_user_licenses | CREATE TRIGGER trg_audit_user_licenses AFTER INSERT OR DELETE OR UPDATE ON public.user_licenses FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_user_sessions | CREATE TRIGGER trg_audit_user_sessions AFTER INSERT OR DELETE OR UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_users | CREATE TRIGGER trg_audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_worker_certifications | CREATE TRIGGER trg_audit_worker_certifications AFTER INSERT OR DELETE OR UPDATE ON public.worker_certifications FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_audit_worker_history | CREATE TRIGGER trg_audit_worker_history AFTER INSERT OR DELETE OR UPDATE ON public.worker_employment_history FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_check_opm_specialization_cap | CREATE TRIGGER trg_check_opm_specialization_cap BEFORE INSERT ON public.user_project_type_specializations FOR EACH ROW EXECUTE FUNCTION trg_enforce_opm_specialization_cap() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.phase_checklist_templates FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.stored_files FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_certifications FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_discipline_scopes FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_project_type_specializations FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_checklists FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_checklist_items FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_evidence FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_files FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_updates FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_submission_files FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_update_files FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.project_type_required_certifications FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_integration_audit | CREATE TRIGGER trg_integration_audit AFTER INSERT OR DELETE OR UPDATE ON public.trade_required_certifications FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log() | base schema |
| trg_touch_assignment_conf | CREATE TRIGGER trg_touch_assignment_conf BEFORE UPDATE ON public.assignment_confirmations FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_contracts | CREATE TRIGGER trg_touch_contracts BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_notification_recipients | CREATE TRIGGER trg_touch_notification_recipients BEFORE UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_pending_updates | CREATE TRIGGER trg_touch_pending_updates BEFORE UPDATE ON public.pending_progress_updates FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_phase_team | CREATE TRIGGER trg_touch_phase_team BEFORE UPDATE ON public.project_phase_team FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_project_documents | CREATE TRIGGER trg_touch_project_documents BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_project_engineers | CREATE TRIGGER trg_touch_project_engineers BEFORE UPDATE ON public.project_engineers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_projects | CREATE TRIGGER trg_touch_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_rework | CREATE TRIGGER trg_touch_rework BEFORE UPDATE ON public.pending_rework_requests FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_share_links | CREATE TRIGGER trg_touch_share_links BEFORE UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_subcon_assignments | CREATE TRIGGER trg_touch_subcon_assignments BEFORE UPDATE ON public.project_subcontractor_assignments FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_subcon_requests | CREATE TRIGGER trg_touch_subcon_requests BEFORE UPDATE ON public.pending_subcontractor_requests FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_subcon_workers | CREATE TRIGGER trg_touch_subcon_workers BEFORE UPDATE ON public.subcontractor_workers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_subcontractors | CREATE TRIGGER trg_touch_subcontractors BEFORE UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_user_licenses | CREATE TRIGGER trg_touch_user_licenses BEFORE UPDATE ON public.user_licenses FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |
| trg_touch_users | CREATE TRIGGER trg_touch_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit() | base schema |

## New table RLS / permissions

For newly created project_rework_activities and project_type_stages: RLS enabled; PUBLIC/anon/authenticated receive no table privileges; verified_server_only policy denies PUBLIC; verified_service_access permits the trusted service_role with SELECT/INSERT/UPDATE. The owner bypasses ordinary RLS. Existing tables' ACLs/policies are left unchanged. The API still checks project and role ownership. No browser receives staff evidence or rework links. The new trigger function is SECURITY INVOKER, has a fixed search_path, and no PUBLIC execute grant.

## Actual local dry run

```json
{
  "mode": "dry-run (rolled back)",
  "added_columns": [
    "phase_checklist_templates.weight:integer",
    "project_phase_checklist_items.weight:integer",
    "project_phase_evidence.rework_request_id:uuid",
    "project_rework_activities.request_id:uuid",
    "project_rework_activities.project_id:uuid",
    "project_rework_activities.project_stage_id:smallint",
    "project_rework_activities.checklist_item_id:bigint",
    "project_rework_activities.withdrawn_evidence_id:bigint",
    "project_rework_activities.correction_evidence_id:bigint",
    "project_type_stages.project_type_id:smallint",
    "project_type_stages.project_stage_id:smallint",
    "project_type_stages.sort_order:smallint"
  ],
  "verified": {
    "weight_type": "integer",
    "weight_default": 10,
    "weight_nullable": false,
    "rework_links": true,
    "workflow_scope": true,
    "legacy_writer_bridge": true
  },
  "activities": 11,
  "evidence": 6,
  "history": 12,
  "rework_links": 0,
  "workflow_rows": 42
}
```

It rolled back. The test then applied twice only in disposable PGlite and compared all original evidence, history, checklist snapshots, activities and project fields. New nullable reference columns are excluded only from the before/after shape comparison. Existing values are preserved.

## Full recovery SQL

```sql
-- Recovery migration: base schema + migrations 001–003 only.
-- Run this file explicitly; do not run the legacy all-migrations runner for recovery.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('verified-activity-progress-recovery'));
SELECT set_config('siteline.recovery_new_tables',COALESCE((
  SELECT string_agg(name,',') FROM (VALUES ('project_rework_activities'),('project_type_stages')) t(name)
  WHERE to_regclass('public.'||name) IS NULL),''),true);

-- Existing integer activity values are retained. Existing non-integer column
-- types require a separately reviewed conversion, never a silent truncation.
DO $$ DECLARE t text; existing_type text; nullable text; existing_default text; BEGIN
  FOREACH t IN ARRAY ARRAY['phase_checklist_templates','project_phase_checklist_items'] LOOP
    SELECT data_type,is_nullable,column_default INTO existing_type,nullable,existing_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='weight';
    IF existing_type IS NOT NULL AND existing_type <> 'integer' THEN
      RAISE EXCEPTION '% .weight has type %, expected integer; stop for a separately reviewed conversion',t,existing_type;
    END IF;
    IF existing_type IS NOT NULL AND (nullable <> 'NO' OR existing_default IS DISTINCT FROM '10') THEN
      RAISE EXCEPTION '%.weight must already be NOT NULL DEFAULT 10; stop for a separately reviewed repair',t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 10 CHECK (weight > 0)',t);
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('public.%I',t)::regclass AND conname='verified_activity_weight_positive') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT verified_activity_weight_positive CHECK(weight > 0)',t);
    END IF;
  END LOOP;
END $$;

-- Explicit rejection + a rework link represents a withdrawal without widening
-- or dropping the legacy pending/approved/rejected status CHECK. API projection
-- supplies the logical Rework required state. No existing evidence is rewritten.
ALTER TABLE public.project_phase_evidence
  ADD COLUMN IF NOT EXISTS rework_request_id uuid REFERENCES public.pending_rework_requests(id);
-- Compatibility for the already-deployed Parts 1–3 writer: accept its logical
-- rework_required input by normalizing NEW only, before the old CHECK runs.
-- No existing row, approval, evidence or constraint is changed.
DO $bridge$ BEGIN
  IF to_regprocedure('public.siteline_normalize_rework_status()') IS NULL THEN
    EXECUTE $create$CREATE FUNCTION public.siteline_normalize_rework_status() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
      BEGIN
        IF NEW.status='rework_required' AND NEW.rework_request_id IS NOT NULL THEN
          NEW.status := 'rejected';
        END IF;
        RETURN NEW;
      END $function$ $create$;
    REVOKE ALL ON FUNCTION public.siteline_normalize_rework_status() FROM PUBLIC;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.project_phase_evidence'::regclass
    AND tgname='siteline_normalize_rework_status') THEN
    CREATE TRIGGER siteline_normalize_rework_status BEFORE INSERT OR UPDATE OF status,rework_request_id
      ON public.project_phase_evidence FOR EACH ROW EXECUTE FUNCTION public.siteline_normalize_rework_status();
  END IF;
END $bridge$;
CREATE UNIQUE INDEX IF NOT EXISTS pending_rework_request_scope
  ON public.pending_rework_requests(id,project_id,project_stage_id);
CREATE TABLE IF NOT EXISTS public.project_rework_activities (
  request_id uuid NOT NULL,
  project_id uuid NOT NULL,
  project_stage_id smallint NOT NULL,
  checklist_item_id bigint NOT NULL,
  withdrawn_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  correction_evidence_id bigint REFERENCES public.project_phase_evidence(id),
  PRIMARY KEY(request_id,checklist_item_id),
  FOREIGN KEY(request_id,project_id,project_stage_id)
    REFERENCES public.pending_rework_requests(id,project_id,project_stage_id),
  FOREIGN KEY(checklist_item_id,project_id,project_stage_id)
    REFERENCES public.project_phase_checklist_items(id,project_id,project_stage_id)
);
CREATE INDEX IF NOT EXISTS rework_activities_project_phase
  ON public.project_rework_activities(project_id,project_stage_id);

CREATE TABLE IF NOT EXISTS public.project_type_stages (
  project_type_id smallint NOT NULL REFERENCES public.project_types(id),
  project_stage_id smallint NOT NULL REFERENCES public.project_stages(id),
  sort_order smallint NOT NULL CHECK(sort_order>0),
  PRIMARY KEY(project_type_id,project_stage_id),
  UNIQUE(project_type_id,sort_order)
);
-- Recover the original seven-stage workflow only for types with NO stored
-- workflow. Existing 9/9/12 or custom workflow rows remain entirely untouched.
-- This adds lookup defaults, not project checklist snapshots or approvals.
INSERT INTO public.project_type_stages(project_type_id,project_stage_id,sort_order)
SELECT t.id,s.id,v.position FROM public.project_types t
CROSS JOIN (VALUES ('mobilization',1),('design',2),('foundation',3),
  ('structure',4),('mep rough-in',5),('finishes',6),('closeout',7)) v(code,position)
JOIN public.project_stages s ON lower(s.code)=v.code
WHERE NOT EXISTS(SELECT 1 FROM public.project_type_stages existing WHERE existing.project_type_id=t.id)
ON CONFLICT DO NOTHING;

-- Same server-only boundary as migration 003: browser roles have no table ACL.
-- Explicit false policies document that boundary; the trusted service role has
-- its own allow policy. Existing table policies and grants are never changed.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['project_rework_activities','project_type_stages'] LOOP
    IF NOT (t=ANY(string_to_array(current_setting('siteline.recovery_new_tables'),','))) THEN
      CONTINUE; -- Preserve policies and ACLs of tables that already existed.
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='verified_server_only') THEN
      EXECUTE format('CREATE POLICY verified_server_only ON public.%I FOR ALL TO PUBLIC USING(false) WITH CHECK(false)',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='verified_service_access') THEN
        EXECUTE format('CREATE POLICY verified_service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
      END IF;
      EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',t);
    END IF;
  END LOOP;
END $$;
COMMIT;

```
