-- =============================================================================
-- SITELINE / 10 Builders — Supabase database for the Thesis-Backend (Express API)
--
-- This is the schema the Express backend in "SITELINE Backend/Thesis-Backend"
-- expects, generated from its live PostgreSQL database (52 tables) and brought up
-- to date with its migrations 003 (stored files, directory approval, document and
-- activity types) and 004 (session and reference constraints). Migration 005 is
-- marked "proposal only" by its authors and is NOT included.
--
-- Differences for Supabase:
--   * The Express API connects directly to Postgres (DB_SERVER / DB_USER /
--     DB_PASSWORD in its .env). It keeps its own login (bcrypt + JWT), so
--     Supabase Auth is not used.
--   * Row Level Security is enabled on every table with NO policies, and all
--     privileges are revoked from the anon and authenticated roles, so nobody can
--     read or change data through the Supabase REST API or the public anon key.
--     The backend's database user (postgres) bypasses RLS, so the API is unaffected.
--
-- RUN ONCE in the Supabase SQL Editor. If the earlier SITELINE schema (the
-- "Supabase-direct" version, accounts linked to Supabase Auth) is present and
-- EMPTY, it is removed first. If it contains users, or this schema is already
-- installed, the script stops without changing anything.
-- =============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 0. Safety check and reset of the earlier SITELINE (Supabase-direct) schema
-- ----------------------------------------------------------------------------
do $$
declare
  old_rows bigint := 0;
begin
  if to_regclass('public.users') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash') then
      raise exception 'The Thesis-Backend schema is already installed. Nothing was changed.';
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = 'auth_user_id') then
      execute 'select count(*) from public.users' into old_rows;
      if old_rows > 0 then
        raise exception 'The earlier SITELINE schema contains % user(s). Export or remove them first; nothing was changed.', old_rows;
      end if;
    else
      raise exception 'A different public.users table exists. Use an empty project; nothing was changed.';
    end if;
  end if;
end $$;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;
drop schema if exists app cascade;
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists siteline_files_insert on storage.objects';
    execute 'drop policy if exists siteline_files_select on storage.objects';
  end if;
end $$;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Tables (columns, primary keys, unique and check constraints)
-- ----------------------------------------------------------------------------

create table public."activity_log" (
  "id" bigserial,
  "activity_type_id" smallint not null,
  "title" varchar(200) not null,
  "detail" text,
  "actor_user_id" uuid,
  "target_role_id" smallint,
  "anchor_reference" varchar(80),
  "related_project_id" uuid,
  "occurred_at" timestamptz not null default now(),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "activity_log_pkey" PRIMARY KEY (id)
);

create table public."activity_types" (
  "id" smallint not null,
  "code" varchar(20) not null,
  "icon" varchar(10),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "activity_types_pkey" PRIMARY KEY (id),
  constraint "activity_types_code_key" UNIQUE (code)
);

create table public."assignment_confirmations" (
  "id" bigserial,
  "project_id" uuid not null,
  "target_user_id" uuid not null,
  "role_context" varchar(10) not null,
  "match_score" smallint,
  "status" varchar(20) not null default 'pending'::character varying,
  "responded_at" timestamptz,
  "escalated_to_admin" boolean not null default false,
  "escalated_at" timestamptz,
  "reassigned_from_id" bigint,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "assignment_confirmations_match_score_check" CHECK (((match_score >= 0) AND (match_score <= 100))),
  constraint "assignment_confirmations_role_context_check" CHECK (((role_context)::text = ANY ((ARRAY['opm'::character varying, 'spm'::character varying])::text[]))),
  constraint "assignment_confirmations_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'declined'::character varying, 'auto_expired'::character varying, 'reassigned'::character varying])::text[]))),
  constraint "assignment_confirmations_pkey" PRIMARY KEY (id)
);

create table public."audit_log" (
  "id" bigserial,
  "table_name" varchar(60) not null,
  "record_id" text not null,
  "operation" varchar(10) not null,
  "changed_by" uuid,
  "changed_at" timestamptz not null default now(),
  "old_values" jsonb,
  "new_values" jsonb,
  constraint "audit_log_operation_check" CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[]))),
  constraint "audit_log_pkey" PRIMARY KEY (id)
);

create table public."certification_types" (
  "id" smallint not null,
  "code" varchar(40) not null,
  "issuing_body" varchar(100),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "certification_types_pkey" PRIMARY KEY (id),
  constraint "certification_types_code_key" UNIQUE (code)
);

create table public."contracts" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "contract_type" varchar(30) not null,
  "subcontractor_name" varchar(150),
  "trade_scope" varchar(150),
  "file_ref" text not null,
  "uploaded_by" uuid,
  "uploaded_at" timestamptz not null default now(),
  "is_locked" boolean not null default true,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "chk_client_subcon_fields" CHECK ((((contract_type)::text <> 'client_subcon_agreement'::text) OR ((subcontractor_name IS NOT NULL) AND (trade_scope IS NOT NULL)))),
  constraint "contracts_contract_type_check" CHECK (((contract_type)::text = ANY ((ARRAY['client_contract'::character varying, 'client_subcon_agreement'::character varying])::text[]))),
  constraint "contracts_pkey" PRIMARY KEY (id)
);

create table public."disciplines" (
  "id" smallint not null,
  "code" varchar(40) not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "disciplines_pkey" PRIMARY KEY (id),
  constraint "disciplines_code_key" UNIQUE (code)
);

create table public."document_types" (
  "id" smallint not null,
  "code" varchar(60) not null,
  "label" varchar(150) not null,
  "is_client_visible_default" boolean not null default false,
  "is_required_for_intake" boolean not null default true,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "document_types_pkey" PRIMARY KEY (id),
  constraint "document_types_code_key" UNIQUE (code)
);

create table public."notification_recipients" (
  "activity_log_id" bigint not null,
  "recipient_user_id" uuid not null,
  "is_read" boolean not null default false,
  "read_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "notification_recipients_pkey" PRIMARY KEY (activity_log_id, recipient_user_id)
);

create table public."pending_progress_updates" (
  "id" bigserial,
  "project_id" uuid not null,
  "prior_stage_id" smallint,
  "prior_pct" smallint,
  "requested_stage_id" smallint,
  "requested_pct" smallint,
  "note" text,
  "is_material_change" boolean not null default false,
  "submitted_by" uuid,
  "submitted_at" timestamptz not null default now(),
  "auto_approve_deadline_at" timestamptz,
  "status" varchar(20) not null default 'pending'::character varying,
  "escalated_at" timestamptz,
  "resolved_by" uuid,
  "resolved_at" timestamptz,
  "resulting_history_id" bigint,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "pending_progress_updates_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'auto_approved'::character varying, 'approved'::character varying, 'escalated'::character varying, 'rejected'::character varying])::text[]))),
  constraint "pending_progress_updates_pkey" PRIMARY KEY (id)
);

create table public."pending_rework_requests" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "project_stage_id" smallint,
  "reason" text,
  "submitted_by" uuid,
  "submitted_at" timestamptz not null default now(),
  "status" varchar(20) not null default 'pending'::character varying,
  "resolved_by" uuid,
  "resolved_at" timestamptz,
  "resolution_note" text,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  "issue_categories" text[] not null default '{}'::text[],
  "phase_update_id" bigint,
  "resulting_history_id" bigint,
  constraint "pending_rework_requests_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))),
  constraint "pending_rework_requests_pkey" PRIMARY KEY (id)
);

create table public."pending_subcontractor_requests" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "subcontractor_id" uuid not null,
  "trade_id" smallint,
  "requested_by" uuid,
  "requested_at" timestamptz not null default now(),
  "has_conflict" boolean not null default false,
  "status" varchar(20) not null default 'pending'::character varying,
  "resolved_by" uuid,
  "resolved_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "pending_subcontractor_requests_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))),
  constraint "pending_subcontractor_requests_pkey" PRIMARY KEY (id)
);

create table public."phase_checklist_templates" (
  "id" bigserial,
  "project_stage_id" smallint not null,
  "code" text not null,
  "title" text not null,
  "required" boolean not null default true,
  "sort_order" integer not null,
  constraint "phase_checklist_templates_pkey" PRIMARY KEY (id),
  constraint "phase_checklist_templates_project_stage_id_code_key" UNIQUE (project_stage_id, code)
);

create table public."phase_schema_migrations" (
  "name" text not null,
  "applied_at" timestamptz not null default now(),
  constraint "phase_schema_migrations_pkey" PRIMARY KEY (name)
);

create table public."project_documents" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "document_type_id" smallint not null,
  "status" varchar(20) not null default 'not_uploaded'::character varying,
  "file_ref" text,
  "uploaded_by" uuid,
  "uploaded_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_documents_status_check" CHECK (((status)::text = ANY ((ARRAY['not_uploaded'::character varying, 'uploaded'::character varying])::text[]))),
  constraint "project_documents_pkey" PRIMARY KEY (id),
  constraint "project_documents_project_id_document_type_id_key" UNIQUE (project_id, document_type_id)
);

create table public."project_engineers" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "user_id" uuid not null,
  "project_role_label" varchar(80),
  "assigned_at" timestamptz not null default now(),
  "unassigned_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_engineers_pkey" PRIMARY KEY (id)
);

create table public."project_notes" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "author_id" uuid,
  "note_text" text not null,
  "noted_at" timestamptz not null default now(),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_notes_pkey" PRIMARY KEY (id)
);

create table public."project_phase_checklist_items" (
  "id" bigserial,
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "code" text not null,
  "title" text not null,
  "required" boolean not null default true,
  "sort_order" integer not null,
  constraint "project_phase_checklist_items_pkey" PRIMARY KEY (id),
  constraint "project_phase_checklist_items_id_project_id_project_stage_i_key" UNIQUE (id, project_id, project_stage_id),
  constraint "project_phase_checklist_items_project_id_project_stage_id_c_key" UNIQUE (project_id, project_stage_id, code)
);

create table public."project_phase_checklists" (
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "initialized_at" timestamptz not null default now(),
  constraint "project_phase_checklists_pkey" PRIMARY KEY (project_id, project_stage_id)
);

create table public."project_phase_evidence" (
  "id" bigserial,
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "checklist_item_id" bigint not null,
  "file_id" uuid,
  "status" text not null default 'pending'::text,
  "submitted_by" uuid not null,
  "submitted_at" timestamptz not null default now(),
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_note" text,
  "submission_note" text,
  "phase_update_id" bigint,
  constraint "project_phase_evidence_check" CHECK ((((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((status <> 'pending'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL)))),
  constraint "project_phase_evidence_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  constraint "project_phase_evidence_pkey" PRIMARY KEY (id)
);

create table public."project_phase_files" (
  "id" uuid not null,
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "original_name" text not null,
  "content_type" text not null,
  "byte_size" integer not null,
  "content" bytea not null,
  "uploaded_by" uuid not null,
  "uploaded_at" timestamptz not null default now(),
  constraint "project_phase_files_byte_size_check" CHECK (((byte_size > 0) AND (byte_size <= 10485760))),
  constraint "project_phase_files_pkey" PRIMARY KEY (id),
  constraint "project_phase_files_id_project_id_project_stage_id_key" UNIQUE (id, project_id, project_stage_id)
);

create table public."project_phase_submission_files" (
  "update_id" bigint not null,
  "file_id" uuid not null,
  constraint "project_phase_submission_files_pkey" PRIMARY KEY (update_id, file_id)
);

create table public."project_phase_team" (
  "id" bigserial,
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "spm_user_id" uuid not null,
  "is_lead" boolean not null default false,
  "status" varchar(20) not null default 'pending'::character varying,
  "response_deadline_at" timestamptz,
  "responded_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_phase_team_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'declined'::character varying, 'auto_expired'::character varying, 'reassigned'::character varying])::text[]))),
  constraint "project_phase_team_pkey" PRIMARY KEY (id),
  constraint "project_phase_team_project_id_project_stage_id_key" UNIQUE (project_id, project_stage_id)
);

create table public."project_phase_update_files" (
  "history_id" bigint not null,
  "file_id" uuid not null,
  constraint "project_phase_update_files_pkey" PRIMARY KEY (history_id, file_id)
);

create table public."project_phase_updates" (
  "id" bigserial,
  "project_id" uuid not null,
  "selected_stage_id" smallint not null,
  "prior_stage_id" smallint,
  "prior_pct" smallint,
  "note" text,
  "issue_categories" text[] not null default '{}'::text[],
  "issue_reason" text,
  "submitted_by" uuid not null,
  "submitted_at" timestamptz not null default now(),
  "status" text not null default 'pending'::text,
  "resolved_by" uuid,
  "resolved_at" timestamptz,
  "resolution_note" text,
  "history_id" bigint,
  constraint "project_phase_updates_check" CHECK ((((status = 'pending'::text) AND (resolved_by IS NULL) AND (resolved_at IS NULL)) OR ((status <> 'pending'::text) AND (resolved_by IS NOT NULL) AND (resolved_at IS NOT NULL)))),
  constraint "project_phase_updates_issue_categories_check" CHECK ((issue_categories <@ ARRAY['failed_inspection'::text, 'material_defect'::text, 'rework_required'::text, 'design_change'::text, 'weather_delay'::text, 'manpower_shortage'::text, 'safety_incident'::text, 'other'::text])),
  constraint "project_phase_updates_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  constraint "project_phase_updates_pkey" PRIMARY KEY (id)
);

create table public."project_photos" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "file_ref" text not null,
  "caption" varchar(300),
  "taken_date" date,
  "uploaded_by" uuid,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_photos_pkey" PRIMARY KEY (id)
);

create table public."project_progress_history" (
  "id" bigserial,
  "project_id" uuid not null,
  "project_stage_id" smallint not null,
  "pct" smallint,
  "note" text,
  "is_issue" boolean not null default false,
  "is_client_visible" boolean not null default true,
  "recorded_by" uuid,
  "recorded_at" timestamptz not null default now(),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  "issue_categories" text[] not null default '{}'::text[],
  "entry_type" text not null default 'update'::text,
  constraint "project_progress_history_pct_check" CHECK (((pct >= 0) AND (pct <= 100))),
  constraint "project_progress_history_pkey" PRIMARY KEY (id)
);

create table public."project_stage_discipline_links" (
  "project_stage_id" integer not null,
  "discipline_id" integer not null,
  "project_type_id" integer not null
);

create table public."project_stages" (
  "id" smallint not null,
  "code" varchar(30) not null,
  "sort_order" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_stages_pkey" PRIMARY KEY (id),
  constraint "project_stages_code_key" UNIQUE (code)
);

create table public."project_subcontractor_assignments" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "subcontractor_id" uuid not null,
  "trade_id" smallint not null,
  "worker_count" smallint not null default 0,
  "status" varchar(20) not null default 'active'::character varying,
  "assigned_at" timestamptz not null default now(),
  "released_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_subcontractor_assignments_status_check" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'released'::character varying])::text[]))),
  constraint "project_subcontractor_assignments_pkey" PRIMARY KEY (id)
);

create table public."project_subcontractor_matches" (
  "project_id" uuid not null,
  "subcontractor_id" uuid not null,
  "match_score" smallint,
  "cert_coverage_pct" smallint,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_subcontractor_matches_cert_coverage_pct_check" CHECK (((cert_coverage_pct >= 0) AND (cert_coverage_pct <= 100))),
  constraint "project_subcontractor_matches_match_score_check" CHECK (((match_score >= 0) AND (match_score <= 100))),
  constraint "project_subcontractor_matches_pkey" PRIMARY KEY (project_id, subcontractor_id)
);

create table public."project_type_required_certifications" (
  "project_type_id" smallint not null,
  "certification_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_type_required_certifications_pkey" PRIMARY KEY (project_type_id, certification_type_id)
);

create table public."project_types" (
  "id" smallint not null,
  "code" varchar(30) not null,
  "max_opm_specializations" smallint not null default 2,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "project_types_pkey" PRIMARY KEY (id),
  constraint "project_types_code_key" UNIQUE (code)
);

create table public."projects" (
  "id" uuid not null default gen_random_uuid(),
  "name" varchar(200) not null,
  "project_type_id" smallint not null,
  "client_name" varchar(150),
  "floor_area_sqm" numeric(10,2),
  "floor_count" smallint,
  "target_start_date" date,
  "current_stage_id" smallint,
  "current_pct" smallint,
  "crew_required" smallint,
  "crew_assigned" smallint,
  "lifecycle_status" varchar(30) not null default 'draft'::character varying,
  "suggested_opm_id" uuid,
  "suggested_opm_match_score" smallint,
  "headcount_suggested" smallint,
  "headcount_tier" varchar(20),
  "archived_at" timestamptz,
  "is_deleted" boolean not null default false,
  "deleted_at" timestamptz,
  "deleted_by" uuid,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "projects_current_pct_check" CHECK (((current_pct >= 0) AND (current_pct <= 100))),
  constraint "projects_lifecycle_status_check" CHECK (((lifecycle_status)::text = ANY ((ARRAY['draft'::character varying, 'suggested_allocation'::character varying, 'confirmed'::character varying, 'sent_to_opm'::character varying, 'spm_review'::character varying, 'active'::character varying, 'archived'::character varying])::text[]))),
  constraint "projects_suggested_opm_match_score_check" CHECK (((suggested_opm_match_score >= 0) AND (suggested_opm_match_score <= 100))),
  constraint "projects_pkey" PRIMARY KEY (id)
);

create table public."roles" (
  "id" smallint not null,
  "code" varchar(20) not null,
  "label" varchar(50) not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "roles_pkey" PRIMARY KEY (id),
  constraint "roles_code_key" UNIQUE (code)
);

create table public."share_link_access_log" (
  "id" bigserial,
  "share_link_id" uuid not null,
  "accessed_at" timestamptz not null default now(),
  "ip_address" inet,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "share_link_access_log_pkey" PRIMARY KEY (id)
);

create table public."share_link_excluded_documents" (
  "share_link_id" uuid not null,
  "document_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "share_link_excluded_documents_pkey" PRIMARY KEY (share_link_id, document_type_id)
);

create table public."share_links" (
  "id" uuid not null default gen_random_uuid(),
  "project_id" uuid not null,
  "token" varchar(64) not null,
  "scope" varchar(20) not null,
  "expiry_option" varchar(10) not null,
  "expires_at" timestamptz,
  "revoked" boolean not null default false,
  "revoked_at" timestamptz,
  "revoked_by" uuid,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "share_links_expiry_option_check" CHECK (((expiry_option)::text = ANY ((ARRAY['24h'::character varying, '7d'::character varying, '30d'::character varying, 'none'::character varying])::text[]))),
  constraint "share_links_scope_check" CHECK (((scope)::text = ANY ((ARRAY['overview'::character varying, 'milestone'::character varying, 'documents'::character varying])::text[]))),
  constraint "share_links_pkey" PRIMARY KEY (id),
  constraint "share_links_token_key" UNIQUE (token)
);

create table public."subcontractor_workers" (
  "id" uuid not null default gen_random_uuid(),
  "subcontractor_id" uuid not null,
  "full_name" varchar(150) not null,
  "role_title" varchar(100),
  "phone" varchar(30),
  "status" varchar(20) not null default 'active'::character varying,
  "discipline_id" smallint,
  "license_number" varchar(120),
  "license_expiry" date,
  "availability_status" varchar(20),
  "availability_note" varchar(200),
  "current_project_id" uuid,
  "current_project_until" varchar(30),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "subcontractor_workers_availability_status_check" CHECK (((availability_status)::text = ANY ((ARRAY['assigned'::character varying, 'available'::character varying])::text[]))),
  constraint "subcontractor_workers_status_check" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),
  constraint "subcontractor_workers_pkey" PRIMARY KEY (id)
);

create table public."subcontractors" (
  "id" uuid not null default gen_random_uuid(),
  "company_name" varchar(150) not null,
  "trade_id" smallint not null,
  "contact_email" citext,
  "meta_description" varchar(300),
  "source" varchar(20) not null,
  "committed_until" date,
  "is_deleted" boolean not null default false,
  "deleted_at" timestamptz,
  "deleted_by" uuid,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "subcontractors_source_check" CHECK (((source)::text = ANY ((ARRAY['system_matched'::character varying, 'directory'::character varying])::text[]))),
  constraint "subcontractors_pkey" PRIMARY KEY (id)
);

create table public."trade_required_certifications" (
  "trade_id" smallint not null,
  "certification_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "trade_required_certifications_pkey" PRIMARY KEY (trade_id, certification_type_id)
);

create table public."trades" (
  "id" smallint not null,
  "code" varchar(60) not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "trades_pkey" PRIMARY KEY (id),
  constraint "trades_code_key" UNIQUE (code)
);

create table public."user_certifications" (
  "user_id" uuid not null,
  "certification_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_certifications_pkey" PRIMARY KEY (user_id, certification_type_id)
);

create table public."user_client_project_links" (
  "user_id" uuid not null,
  "project_id" uuid not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_client_project_links_pkey" PRIMARY KEY (user_id, project_id)
);

create table public."user_discipline_scopes" (
  "user_id" uuid not null,
  "discipline_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_discipline_scopes_pkey" PRIMARY KEY (user_id, discipline_id)
);

create table public."user_licenses" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "license_number" varchar(120),
  "license_expiry" date,
  "upload_file_ref" text,
  "upload_status" varchar(20) not null default 'none'::character varying,
  "superseded_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_licenses_upload_status_check" CHECK (((upload_status)::text = ANY ((ARRAY['none'::character varying, 'pending'::character varying, 'uploaded'::character varying])::text[]))),
  constraint "user_licenses_pkey" PRIMARY KEY (id)
);

create table public."user_project_type_specializations" (
  "user_id" uuid not null,
  "project_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_project_type_specializations_pkey" PRIMARY KEY (user_id, project_type_id)
);

create table public."user_sessions" (
  "id" bigserial,
  "user_id" uuid not null,
  "login_at" timestamptz not null default now(),
  "logout_at" timestamptz,
  "ip_address" inet,
  "user_agent" text,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "user_sessions_pkey" PRIMARY KEY (id)
);

create table public."users" (
  "id" uuid not null default gen_random_uuid(),
  "full_name" varchar(150) not null,
  "email" citext not null,
  "phone" varchar(30),
  "password_hash" text not null,
  "temp_password_issued" boolean not null default true,
  "role_id" smallint not null,
  "status" varchar(20) not null default 'invited'::character varying,
  "date_added" date not null default CURRENT_DATE,
  "last_login_at" timestamptz,
  "is_deleted" boolean not null default false,
  "deleted_at" timestamptz,
  "deleted_by" uuid,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "users_status_check" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'invited'::character varying, 'suspended'::character varying])::text[]))),
  constraint "users_pkey" PRIMARY KEY (id),
  constraint "users_email_key" UNIQUE (email)
);

create table public."users_token" (
  "user_id" uuid not null,
  "token" varchar not null
);

create table public."worker_certifications" (
  "worker_id" uuid not null,
  "certification_type_id" smallint not null,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "worker_certifications_pkey" PRIMARY KEY (worker_id, certification_type_id)
);

create table public."worker_employment_history" (
  "id" uuid not null default gen_random_uuid(),
  "worker_id" uuid not null,
  "external_project_name" varchar(200),
  "role_title" varchar(100),
  "period_start" date,
  "period_end" date,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_by" uuid,
  "updated_at" timestamptz not null default now(),
  constraint "worker_employment_history_pkey" PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- 2. Foreign keys
-- ----------------------------------------------------------------------------
alter table public."activity_log" add constraint "activity_log_activity_type_id_fkey" FOREIGN KEY (activity_type_id) REFERENCES activity_types(id);
alter table public."activity_log" add constraint "activity_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);
alter table public."activity_log" add constraint "activity_log_related_project_id_fkey" FOREIGN KEY (related_project_id) REFERENCES projects(id);
alter table public."activity_log" add constraint "activity_log_target_role_id_fkey" FOREIGN KEY (target_role_id) REFERENCES roles(id);
alter table public."assignment_confirmations" add constraint "assignment_confirmations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."assignment_confirmations" add constraint "assignment_confirmations_reassigned_from_id_fkey" FOREIGN KEY (reassigned_from_id) REFERENCES assignment_confirmations(id);
alter table public."assignment_confirmations" add constraint "assignment_confirmations_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES users(id);
alter table public."contracts" add constraint "contracts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."contracts" add constraint "contracts_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
alter table public."notification_recipients" add constraint "notification_recipients_activity_log_id_fkey" FOREIGN KEY (activity_log_id) REFERENCES activity_log(id) ON DELETE CASCADE;
alter table public."notification_recipients" add constraint "notification_recipients_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."pending_progress_updates" add constraint "pending_progress_updates_prior_stage_id_fkey" FOREIGN KEY (prior_stage_id) REFERENCES project_stages(id);
alter table public."pending_progress_updates" add constraint "pending_progress_updates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."pending_progress_updates" add constraint "pending_progress_updates_requested_stage_id_fkey" FOREIGN KEY (requested_stage_id) REFERENCES project_stages(id);
alter table public."pending_progress_updates" add constraint "pending_progress_updates_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
alter table public."pending_progress_updates" add constraint "pending_progress_updates_resulting_history_id_fkey" FOREIGN KEY (resulting_history_id) REFERENCES project_progress_history(id);
alter table public."pending_progress_updates" add constraint "pending_progress_updates_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id);
alter table public."pending_rework_requests" add constraint "pending_rework_requests_phase_update_id_fkey" FOREIGN KEY (phase_update_id) REFERENCES project_phase_updates(id);
alter table public."pending_rework_requests" add constraint "pending_rework_requests_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."pending_rework_requests" add constraint "pending_rework_requests_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."pending_rework_requests" add constraint "pending_rework_requests_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
alter table public."pending_rework_requests" add constraint "pending_rework_requests_resulting_history_id_fkey" FOREIGN KEY (resulting_history_id) REFERENCES project_progress_history(id);
alter table public."pending_rework_requests" add constraint "pending_rework_requests_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id);
alter table public."pending_subcontractor_requests" add constraint "pending_subcontractor_requests_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."pending_subcontractor_requests" add constraint "pending_subcontractor_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id);
alter table public."pending_subcontractor_requests" add constraint "pending_subcontractor_requests_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
alter table public."pending_subcontractor_requests" add constraint "pending_subcontractor_requests_subcontractor_id_fkey" FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id);
alter table public."pending_subcontractor_requests" add constraint "pending_subcontractor_requests_trade_id_fkey" FOREIGN KEY (trade_id) REFERENCES trades(id);
alter table public."phase_checklist_templates" add constraint "phase_checklist_templates_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."project_documents" add constraint "project_documents_document_type_id_fkey" FOREIGN KEY (document_type_id) REFERENCES document_types(id);
alter table public."project_documents" add constraint "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_documents" add constraint "project_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
alter table public."project_engineers" add constraint "project_engineers_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_engineers" add constraint "project_engineers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."project_notes" add constraint "project_notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES users(id);
alter table public."project_notes" add constraint "project_notes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_phase_checklist_items" add constraint "project_phase_checklist_items_project_id_project_stage_id_fkey" FOREIGN KEY (project_id, project_stage_id) REFERENCES project_phase_checklists(project_id, project_stage_id);
alter table public."project_phase_checklists" add constraint "project_phase_checklists_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
alter table public."project_phase_checklists" add constraint "project_phase_checklists_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."project_phase_evidence" add constraint "project_phase_evidence_checklist_item_id_project_id_projec_fkey" FOREIGN KEY (checklist_item_id, project_id, project_stage_id) REFERENCES project_phase_checklist_items(id, project_id, project_stage_id);
alter table public."project_phase_evidence" add constraint "project_phase_evidence_file_id_project_id_project_stage_id_fkey" FOREIGN KEY (file_id, project_id, project_stage_id) REFERENCES project_phase_files(id, project_id, project_stage_id);
alter table public."project_phase_evidence" add constraint "project_phase_evidence_phase_update_id_fkey" FOREIGN KEY (phase_update_id) REFERENCES project_phase_updates(id);
alter table public."project_phase_evidence" add constraint "project_phase_evidence_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
alter table public."project_phase_evidence" add constraint "project_phase_evidence_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id);
alter table public."project_phase_files" add constraint "project_phase_files_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
alter table public."project_phase_files" add constraint "project_phase_files_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."project_phase_files" add constraint "project_phase_files_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
alter table public."project_phase_submission_files" add constraint "project_phase_submission_files_file_id_fkey" FOREIGN KEY (file_id) REFERENCES project_phase_files(id);
alter table public."project_phase_submission_files" add constraint "project_phase_submission_files_update_id_fkey" FOREIGN KEY (update_id) REFERENCES project_phase_updates(id);
alter table public."project_phase_team" add constraint "project_phase_team_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_phase_team" add constraint "project_phase_team_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."project_phase_team" add constraint "project_phase_team_spm_user_id_fkey" FOREIGN KEY (spm_user_id) REFERENCES users(id);
alter table public."project_phase_update_files" add constraint "project_phase_update_files_file_id_fkey" FOREIGN KEY (file_id) REFERENCES project_phase_files(id);
alter table public."project_phase_update_files" add constraint "project_phase_update_files_history_id_fkey" FOREIGN KEY (history_id) REFERENCES project_progress_history(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_history_id_fkey" FOREIGN KEY (history_id) REFERENCES project_progress_history(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_prior_stage_id_fkey" FOREIGN KEY (prior_stage_id) REFERENCES project_stages(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_selected_stage_id_fkey" FOREIGN KEY (selected_stage_id) REFERENCES project_stages(id);
alter table public."project_phase_updates" add constraint "project_phase_updates_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id);
alter table public."project_photos" add constraint "project_photos_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_photos" add constraint "project_photos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
alter table public."project_progress_history" add constraint "project_progress_history_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_progress_history" add constraint "project_progress_history_project_stage_id_fkey" FOREIGN KEY (project_stage_id) REFERENCES project_stages(id);
alter table public."project_progress_history" add constraint "project_progress_history_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES users(id);
alter table public."project_subcontractor_assignments" add constraint "project_subcontractor_assignments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_subcontractor_assignments" add constraint "project_subcontractor_assignments_subcontractor_id_fkey" FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id);
alter table public."project_subcontractor_assignments" add constraint "project_subcontractor_assignments_trade_id_fkey" FOREIGN KEY (trade_id) REFERENCES trades(id);
alter table public."project_subcontractor_matches" add constraint "project_subcontractor_matches_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."project_subcontractor_matches" add constraint "project_subcontractor_matches_subcontractor_id_fkey" FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE;
alter table public."project_type_required_certifications" add constraint "project_type_required_certifications_certification_type_id_fkey" FOREIGN KEY (certification_type_id) REFERENCES certification_types(id) ON DELETE CASCADE;
alter table public."project_type_required_certifications" add constraint "project_type_required_certifications_project_type_id_fkey" FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE CASCADE;
alter table public."projects" add constraint "projects_current_stage_id_fkey" FOREIGN KEY (current_stage_id) REFERENCES project_stages(id);
alter table public."projects" add constraint "projects_project_type_id_fkey" FOREIGN KEY (project_type_id) REFERENCES project_types(id);
alter table public."projects" add constraint "projects_suggested_opm_id_fkey" FOREIGN KEY (suggested_opm_id) REFERENCES users(id);
alter table public."share_link_access_log" add constraint "share_link_access_log_share_link_id_fkey" FOREIGN KEY (share_link_id) REFERENCES share_links(id) ON DELETE CASCADE;
alter table public."share_link_excluded_documents" add constraint "share_link_excluded_documents_document_type_id_fkey" FOREIGN KEY (document_type_id) REFERENCES document_types(id);
alter table public."share_link_excluded_documents" add constraint "share_link_excluded_documents_share_link_id_fkey" FOREIGN KEY (share_link_id) REFERENCES share_links(id) ON DELETE CASCADE;
alter table public."share_links" add constraint "share_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."share_links" add constraint "share_links_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES users(id);
alter table public."subcontractor_workers" add constraint "subcontractor_workers_current_project_id_fkey" FOREIGN KEY (current_project_id) REFERENCES projects(id);
alter table public."subcontractor_workers" add constraint "subcontractor_workers_discipline_id_fkey" FOREIGN KEY (discipline_id) REFERENCES disciplines(id);
alter table public."subcontractor_workers" add constraint "subcontractor_workers_subcontractor_id_fkey" FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE;
alter table public."subcontractors" add constraint "subcontractors_trade_id_fkey" FOREIGN KEY (trade_id) REFERENCES trades(id);
alter table public."trade_required_certifications" add constraint "trade_required_certifications_certification_type_id_fkey" FOREIGN KEY (certification_type_id) REFERENCES certification_types(id) ON DELETE CASCADE;
alter table public."trade_required_certifications" add constraint "trade_required_certifications_trade_id_fkey" FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE;
alter table public."user_certifications" add constraint "user_certifications_certification_type_id_fkey" FOREIGN KEY (certification_type_id) REFERENCES certification_types(id);
alter table public."user_certifications" add constraint "user_certifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."user_client_project_links" add constraint "user_client_project_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."user_client_project_links" add constraint "user_client_project_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."user_discipline_scopes" add constraint "user_discipline_scopes_discipline_id_fkey" FOREIGN KEY (discipline_id) REFERENCES disciplines(id);
alter table public."user_discipline_scopes" add constraint "user_discipline_scopes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."user_licenses" add constraint "user_licenses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."user_project_type_specializations" add constraint "user_project_type_specializations_project_type_id_fkey" FOREIGN KEY (project_type_id) REFERENCES project_types(id);
alter table public."user_project_type_specializations" add constraint "user_project_type_specializations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."user_sessions" add constraint "user_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."users" add constraint "users_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id);
alter table public."worker_certifications" add constraint "worker_certifications_certification_type_id_fkey" FOREIGN KEY (certification_type_id) REFERENCES certification_types(id);
alter table public."worker_certifications" add constraint "worker_certifications_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES subcontractor_workers(id) ON DELETE CASCADE;
alter table public."worker_employment_history" add constraint "worker_employment_history_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES subcontractor_workers(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX idx_activity_log_occurred ON public.activity_log USING btree (occurred_at DESC);
CREATE INDEX idx_activity_log_project ON public.activity_log USING btree (related_project_id);
CREATE INDEX idx_activity_log_target_role ON public.activity_log USING btree (target_role_id, occurred_at DESC);
CREATE INDEX idx_assignment_conf_project ON public.assignment_confirmations USING btree (project_id);
CREATE INDEX idx_assignment_conf_target ON public.assignment_confirmations USING btree (target_user_id, status);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log USING btree (changed_at DESC);
CREATE INDEX idx_audit_log_changed_by ON public.audit_log USING btree (changed_by);
CREATE INDEX idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX idx_contracts_project ON public.contracts USING btree (project_id);
CREATE INDEX idx_notif_recipients_unread ON public.notification_recipients USING btree (recipient_user_id) WHERE (is_read = false);
CREATE INDEX idx_pending_updates_status ON public.pending_progress_updates USING btree (status);
CREATE UNIQUE INDEX uq_one_pending_update_per_project ON public.pending_progress_updates USING btree (project_id) WHERE ((status)::text = 'pending'::text);
CREATE INDEX idx_rework_project ON public.pending_rework_requests USING btree (project_id, status);
CREATE INDEX idx_subcon_requests_project ON public.pending_subcontractor_requests USING btree (project_id, status);
CREATE INDEX idx_project_documents_project ON public.project_documents USING btree (project_id);
CREATE INDEX idx_project_engineers_project ON public.project_engineers USING btree (project_id);
CREATE INDEX idx_project_engineers_user ON public.project_engineers USING btree (user_id);
CREATE INDEX idx_project_notes_project ON public.project_notes USING btree (project_id);
CREATE INDEX phase_evidence_latest ON public.project_phase_evidence USING btree (checklist_item_id, id DESC);
CREATE INDEX phase_files_project ON public.project_phase_files USING btree (project_id, project_stage_id);
CREATE INDEX idx_phase_team_project ON public.project_phase_team USING btree (project_id);
CREATE INDEX idx_phase_team_spm ON public.project_phase_team USING btree (spm_user_id);
CREATE UNIQUE INDEX one_pending_phase_update ON public.project_phase_updates USING btree (project_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_project_photos_project ON public.project_photos USING btree (project_id);
CREATE INDEX idx_progress_history_client_visible ON public.project_progress_history USING btree (project_id) WHERE (is_client_visible = true);
CREATE INDEX idx_progress_history_project ON public.project_progress_history USING btree (project_id, recorded_at DESC);
CREATE INDEX idx_subcon_assignments_project ON public.project_subcontractor_assignments USING btree (project_id);
CREATE INDEX idx_subcon_assignments_subcon ON public.project_subcontractor_assignments USING btree (subcontractor_id);
CREATE INDEX idx_projects_lifecycle_status ON public.projects USING btree (lifecycle_status);
CREATE INDEX idx_projects_type ON public.projects USING btree (project_type_id);
CREATE INDEX idx_share_access_log_link ON public.share_link_access_log USING btree (share_link_id, accessed_at DESC);
CREATE INDEX idx_share_links_project ON public.share_links USING btree (project_id);
CREATE UNIQUE INDEX idx_share_links_token ON public.share_links USING btree (token);
CREATE INDEX idx_subcon_workers_discipline ON public.subcontractor_workers USING btree (discipline_id);
CREATE INDEX idx_subcon_workers_license_expiry ON public.subcontractor_workers USING btree (license_expiry);
CREATE INDEX idx_subcon_workers_subcon ON public.subcontractor_workers USING btree (subcontractor_id);
CREATE INDEX idx_subcontractors_trade ON public.subcontractors USING btree (trade_id);
CREATE INDEX idx_user_licenses_expiry ON public.user_licenses USING btree (license_expiry) WHERE (superseded_at IS NULL);
CREATE INDEX idx_user_licenses_user ON public.user_licenses USING btree (user_id);
CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id);
CREATE INDEX idx_users_role ON public.users USING btree (role_id);
CREATE INDEX idx_users_status ON public.users USING btree (status);
CREATE INDEX idx_worker_history_worker ON public.worker_employment_history USING btree (worker_id);

-- ----------------------------------------------------------------------------
-- 4. Functions and triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enforce_opm_specialization_cap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count SMALLINT;
  v_cap SMALLINT;
BEGIN
  SELECT count(*) INTO v_count
  FROM user_project_type_specializations
  WHERE user_id = NEW.user_id;

  SELECT max_opm_specializations INTO v_cap
  FROM project_types WHERE id = NEW.project_type_id;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'User % already holds the maximum of % project-type specializations', NEW.user_id, v_cap
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_set_updated_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_write_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_actor UUID;
  v_record_id TEXT;
  v_row JSONB;
BEGIN
  v_actor := NULLIF(current_setting('app.current_user_id', true), '')::uuid;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_record_id := v_row ->> 'id';

  IF v_record_id IS NULL THEN
    SELECT string_agg(v_row ->> a.attname, ':' ORDER BY array_position(i.indkey::int2[], a.attnum))
      INTO v_record_id
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = TG_RELID AND i.indisprimary;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, operation, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_actor, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, operation, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_actor, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE -- INSERT
    INSERT INTO audit_log (table_name, record_id, operation, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_actor, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$function$;

CREATE TRIGGER trg_audit_activity_log AFTER INSERT OR DELETE OR UPDATE ON public.activity_log FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_assignment_conf AFTER INSERT OR DELETE OR UPDATE ON public.assignment_confirmations FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_assignment_conf BEFORE UPDATE ON public.assignment_confirmations FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_contracts AFTER INSERT OR DELETE OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_contracts BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_notification_recipients AFTER INSERT OR DELETE OR UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_notification_recipients BEFORE UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_pending_updates AFTER INSERT OR DELETE OR UPDATE ON public.pending_progress_updates FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_pending_updates BEFORE UPDATE ON public.pending_progress_updates FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_rework AFTER INSERT OR DELETE OR UPDATE ON public.pending_rework_requests FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_rework BEFORE UPDATE ON public.pending_rework_requests FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_subcon_requests AFTER INSERT OR DELETE OR UPDATE ON public.pending_subcontractor_requests FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_subcon_requests BEFORE UPDATE ON public.pending_subcontractor_requests FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_project_documents AFTER INSERT OR DELETE OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_project_documents BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_project_engineers AFTER INSERT OR DELETE OR UPDATE ON public.project_engineers FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_project_engineers BEFORE UPDATE ON public.project_engineers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_project_notes AFTER INSERT OR DELETE OR UPDATE ON public.project_notes FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_phase_team AFTER INSERT OR DELETE OR UPDATE ON public.project_phase_team FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_phase_team BEFORE UPDATE ON public.project_phase_team FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_project_photos AFTER INSERT OR DELETE OR UPDATE ON public.project_photos FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_progress_history AFTER INSERT OR DELETE OR UPDATE ON public.project_progress_history FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_projects AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_subcon_assignments AFTER INSERT OR DELETE OR UPDATE ON public.project_subcontractor_assignments FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_subcon_assignments BEFORE UPDATE ON public.project_subcontractor_assignments FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_subcon_matches AFTER INSERT OR DELETE OR UPDATE ON public.project_subcontractor_matches FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_share_access_log AFTER INSERT OR DELETE OR UPDATE ON public.share_link_access_log FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_share_excluded_docs AFTER INSERT OR DELETE OR UPDATE ON public.share_link_excluded_documents FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_share_links AFTER INSERT OR DELETE OR UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_share_links BEFORE UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_subcontractors AFTER INSERT OR DELETE OR UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_subcontractors BEFORE UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_subcon_workers AFTER INSERT OR DELETE OR UPDATE ON public.subcontractor_workers FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_subcon_workers BEFORE UPDATE ON public.subcontractor_workers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_client_project_links AFTER INSERT OR DELETE OR UPDATE ON public.user_client_project_links FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_user_licenses AFTER INSERT OR DELETE OR UPDATE ON public.user_licenses FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_user_licenses BEFORE UPDATE ON public.user_licenses FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_check_opm_specialization_cap BEFORE INSERT ON public.user_project_type_specializations FOR EACH ROW EXECUTE FUNCTION trg_enforce_opm_specialization_cap();
CREATE TRIGGER trg_audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_touch_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_set_updated_audit();
CREATE TRIGGER trg_audit_user_sessions AFTER INSERT OR DELETE OR UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_worker_certifications AFTER INSERT OR DELETE OR UPDATE ON public.worker_certifications FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();
CREATE TRIGGER trg_audit_worker_history AFTER INSERT OR DELETE OR UPDATE ON public.worker_employment_history FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log();

-- ----------------------------------------------------------------------------
-- 5. Backend migration 003 (stored files, directory approval, document and activity types)
-- ----------------------------------------------------------------------------
-- REVIEW REQUIRED. Run once with psql -v ON_ERROR_STOP=1 after approval and backup.
-- No account/project assignments or real licenses are invented by this migration.

CREATE TABLE IF NOT EXISTS stored_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  purpose TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stored_files_project ON stored_files(project_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS stored_files_user ON stored_files(user_id, purpose, created_at DESC);

-- Existing companies remain approved. New SPM directory submissions need Admin review.
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS directory_status TEXT NOT NULL DEFAULT 'approved';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='subcontractors_directory_status_check') THEN
    ALTER TABLE subcontractors ADD CONSTRAINT subcontractors_directory_status_check
      CHECK (directory_status IN ('pending','approved','declined'));
  END IF;
END $$;

-- Seed stable canonical codes without renumbering existing reference rows.
WITH wanted(code,label,visible,required) AS (VALUES
  ('notice_to_proceed','Notice to Proceed',true,true),
  ('building_permit','Approved Building Permit',true,true),
  ('owner_contract','Signed Owner-Contractor Agreement',false,true),
  ('registered_plans','Structural & Architectural Plans (Registered)',true,true),
  ('environmental_certificate','Environmental Compliance Certificate',true,true),
  ('budget_boq','Project Budget & Bill of Quantities',false,true),
  ('subcontractor_agreement','Site PM – Subcontractor Agreement',false,false)
), missing AS (SELECT * FROM wanted WHERE NOT EXISTS (SELECT 1 FROM document_types d WHERE d.code=wanted.code))
INSERT INTO document_types(id,code,label,is_client_visible_default,is_required_for_intake)
SELECT (SELECT COALESCE(max(id),0) FROM document_types)+row_number() OVER (ORDER BY code),code,label,visible,required FROM missing;

WITH wanted(code) AS (VALUES ('request'),('approval'),('progress'),('notice'),('login'),('logout'),('account'),('system')),
missing AS (SELECT code FROM wanted WHERE NOT EXISTS (SELECT 1 FROM activity_types t WHERE t.code=wanted.code))
INSERT INTO activity_types(id,code)
SELECT (SELECT COALESCE(max(id),0) FROM activity_types)+row_number() OVER (ORDER BY code),code FROM missing;

-- Leave historical audit rows intact. Future snapshots exclude credential and binary content.
CREATE OR REPLACE FUNCTION trg_write_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor UUID; record TEXT; snapshot JSONB; old_snapshot JSONB; new_snapshot JSONB;
BEGIN
  actor := NULLIF(current_setting('app.current_user_id', true),'')::uuid;
  IF TG_OP <> 'INSERT' THEN old_snapshot := to_jsonb(OLD)-'password_hash'-'token'-'content'; END IF;
  IF TG_OP <> 'DELETE' THEN new_snapshot := to_jsonb(NEW)-'password_hash'-'token'-'content'; END IF;
  snapshot := COALESCE(new_snapshot,old_snapshot);
  record := snapshot->>'id';
  IF record IS NULL THEN
    SELECT string_agg(snapshot->>a.attname, ':' ORDER BY a.attnum) INTO record
    FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid=TG_RELID AND i.indisprimary;
  END IF;
  IF record IS NULL THEN RAISE EXCEPTION 'Audited table % requires a primary key',TG_TABLE_NAME; END IF;
  INSERT INTO audit_log(table_name,record_id,operation,changed_by,old_values,new_values)
  VALUES(TG_TABLE_NAME,record,TG_OP,actor,old_snapshot,new_snapshot);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['stored_files','user_certifications','user_discipline_scopes',
    'user_project_type_specializations','phase_checklist_templates','project_phase_checklists',
    'project_phase_checklist_items','project_phase_evidence','project_phase_files','project_phase_updates',
    'project_phase_submission_files','project_phase_update_files','project_type_required_certifications','trade_required_certifications'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(table_name) AND tgname='trg_integration_audit') THEN
      EXECUTE format('CREATE TRIGGER trg_integration_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_write_audit_log()',table_name);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 6. Backend migration 004 (session and reference constraints)
-- ----------------------------------------------------------------------------
-- REVIEW REQUIRED. Read-only preflight found one orphan token and no duplicate user sessions
-- or stage/discipline/type tuples. This removes only tokens that cannot authenticate any user.
-- No account, password, project, license, worker or assignment record is removed.

DELETE FROM users_token t WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=t.user_id);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM users_token GROUP BY user_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Review duplicate user sessions before adding their primary key';
  END IF;
  IF EXISTS(SELECT 1 FROM users_token GROUP BY token HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Review duplicate tokens before adding their unique constraint';
  END IF;
  IF EXISTS(SELECT 1 FROM project_stage_discipline_links GROUP BY project_stage_id,discipline_id,project_type_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Review duplicate stage mappings before adding their primary key';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users_token'::regclass AND contype='p') THEN
    ALTER TABLE users_token ADD PRIMARY KEY(user_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users_token'::regclass AND conname='users_token_token_key') THEN
    ALTER TABLE users_token ADD CONSTRAINT users_token_token_key UNIQUE(token);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users_token'::regclass AND conname='users_token_user_id_fkey') THEN
    ALTER TABLE users_token ADD CONSTRAINT users_token_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='project_stage_discipline_links'::regclass AND contype='p') THEN
    ALTER TABLE project_stage_discipline_links ADD PRIMARY KEY(project_stage_id,discipline_id,project_type_id);
    ALTER TABLE project_stage_discipline_links ADD FOREIGN KEY(project_stage_id) REFERENCES project_stages(id);
    ALTER TABLE project_stage_discipline_links ADD FOREIGN KEY(discipline_id) REFERENCES disciplines(id);
    ALTER TABLE project_stage_discipline_links ADD FOREIGN KEY(project_type_id) REFERENCES project_types(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS subcontractor_workers_company_status ON subcontractor_workers(subcontractor_id,status);
CREATE INDEX IF NOT EXISTS subcontractor_workers_project_status ON subcontractor_workers(current_project_id,availability_status,status);


-- ----------------------------------------------------------------------------
-- 7. Reference data (copied from the live backend database)
-- ----------------------------------------------------------------------------
insert into public.roles (id, code, label) values
  (1, 'admin', 'Admin'),
  (2, 'opm', 'Office PM'),
  (3, 'spm', 'Site PM'),
  (4, 'client', 'Client');
insert into public.disciplines (id, code) values
  (1, 'Civil'),
  (2, 'Geotechnical'),
  (3, 'Structural'),
  (4, 'Mechanical'),
  (5, 'Electrical'),
  (6, 'Plumbing'),
  (7, 'Fire Protection'),
  (8, 'Acoustic'),
  (9, 'Facade'),
  (10, 'Waterproofing'),
  (11, 'Fire & Life Safety'),
  (12, 'Renovation'),
  (13, 'General Labor');
insert into public.project_types (id, code, max_opm_specializations) values
  (1, 'Residential', 2),
  (2, 'Commercial', 2),
  (3, 'Mixed-Use', 2),
  (4, 'Infrastructure', 2),
  (5, 'Industrial', 2),
  (6, 'Renovation', 2);
insert into public.project_stages (id, code, sort_order) values
  (1, 'Mobilization', 1),
  (2, 'Design', 2),
  (3, 'Foundation', 3),
  (4, 'Structure', 4),
  (5, 'MEP Rough-in', 5),
  (6, 'Finishes', 6),
  (7, 'Closeout', 7);
insert into public.trades (id, code) values
  (1, 'Structural / Rebar'),
  (2, 'Electrical'),
  (3, 'Mechanical / Plumbing'),
  (4, 'Facade'),
  (5, 'Waterproofing'),
  (6, 'Fire & Life Safety');
insert into public.certification_types (id, code, issuing_body) values
  (1, 'PRC-Civil', 'PRC'),
  (2, 'PRC-Architect', 'PRC'),
  (3, 'PRC-Mechanical', 'PRC'),
  (4, 'PRC-Electrical', 'PRC'),
  (5, 'DOLE-Safety', 'DOLE'),
  (6, 'BFP-FireSafety', 'BFP'),
  (7, 'TESDA-Welding', 'TESDA');
insert into public.project_stage_discipline_links (project_stage_id, discipline_id, project_type_id) values
  (1, 1, 2),
  (1, 1, 1),
  (1, 1, 6),
  (1, 1, 3),
  (1, 1, 5),
  (1, 1, 4),
  (1, 2, 4),
  (1, 2, 6),
  (1, 2, 2),
  (1, 2, 5),
  (1, 2, 3),
  (2, 1, 4),
  (2, 1, 2),
  (2, 1, 6),
  (2, 1, 1),
  (2, 1, 3),
  (2, 1, 5),
  (2, 3, 1),
  (2, 3, 4),
  (2, 3, 5),
  (2, 3, 6),
  (2, 3, 3),
  (2, 3, 2),
  (2, 4, 6),
  (2, 4, 3),
  (2, 4, 5),
  (2, 4, 2),
  (2, 4, 4),
  (2, 5, 2),
  (2, 5, 5),
  (2, 5, 3),
  (2, 5, 4),
  (2, 5, 6),
  (2, 6, 6),
  (2, 6, 2),
  (2, 6, 3),
  (2, 6, 4),
  (2, 6, 5),
  (2, 8, 3),
  (3, 2, 3),
  (3, 2, 1),
  (3, 2, 2),
  (3, 2, 4),
  (3, 2, 6),
  (3, 2, 5),
  (3, 3, 3),
  (3, 3, 4),
  (3, 3, 1),
  (3, 3, 2),
  (3, 3, 5),
  (3, 3, 6),
  (4, 3, 4),
  (4, 3, 5),
  (4, 3, 2),
  (4, 3, 1),
  (4, 3, 6),
  (4, 3, 3),
  (5, 4, 1),
  (5, 4, 4),
  (5, 4, 3),
  (5, 4, 5),
  (5, 4, 6),
  (5, 4, 2),
  (5, 5, 1),
  (5, 5, 3),
  (5, 5, 4),
  (5, 5, 2),
  (5, 5, 5),
  (5, 5, 6),
  (5, 6, 5),
  (5, 6, 2),
  (5, 6, 1),
  (5, 6, 6),
  (5, 6, 4),
  (5, 6, 3),
  (5, 7, 2),
  (5, 7, 3),
  (5, 7, 4),
  (5, 7, 5),
  (5, 7, 6),
  (5, 8, 3),
  (6, 1, 1),
  (6, 2, 1),
  (6, 3, 1),
  (6, 4, 2),
  (6, 4, 5),
  (6, 4, 4),
  (6, 4, 6),
  (6, 4, 3),
  (6, 4, 1),
  (6, 5, 1),
  (6, 6, 1),
  (6, 7, 1),
  (6, 7, 3),
  (6, 8, 1),
  (6, 9, 1),
  (7, 1, 4),
  (7, 1, 1),
  (7, 1, 2),
  (7, 1, 3),
  (7, 1, 5),
  (7, 1, 6),
  (7, 2, 1),
  (7, 2, 6),
  (7, 2, 3),
  (7, 2, 5),
  (7, 2, 2),
  (7, 2, 4),
  (7, 3, 3),
  (7, 3, 5),
  (7, 3, 2),
  (7, 3, 1),
  (7, 3, 6),
  (7, 3, 4),
  (7, 4, 3),
  (7, 4, 2),
  (7, 4, 5),
  (7, 4, 4),
  (7, 4, 6),
  (7, 4, 1),
  (7, 5, 2),
  (7, 5, 3),
  (7, 5, 6),
  (7, 5, 4),
  (7, 5, 1),
  (7, 5, 5),
  (7, 6, 6),
  (7, 6, 2),
  (7, 6, 3),
  (7, 6, 4),
  (7, 6, 5),
  (7, 6, 1),
  (7, 7, 4),
  (7, 7, 5),
  (7, 7, 3),
  (7, 7, 1),
  (7, 7, 2),
  (7, 7, 6),
  (7, 8, 2),
  (7, 8, 1),
  (7, 8, 4),
  (7, 8, 5),
  (7, 8, 6),
  (7, 8, 3);
insert into public.phase_checklist_templates (id, project_stage_id, code, title, required, sort_order) values
  ('1', 4, 'work_inspection', 'Activity/Work Inspection Checklist (rebar & formwork per level)', true, 1),
  ('2', 4, 'inspection_testing', 'Inspection and Testing Records (concrete cylinder tests)', true, 2),
  ('3', 4, 'method_statement', 'Method Statement (structural pour/lifting)', true, 3),
  ('4', 4, 'quality_control', 'Quality Control/QA-QC Checklist', true, 4),
  ('5', 4, 'previous_acceptance', 'Previous Activity Acceptance/Clearance (Foundation)', true, 5);
select setval(pg_get_serial_sequence('public.phase_checklist_templates', 'id'), (select max(id) from public.phase_checklist_templates));

-- Checklist templates for the other six stages (migration 001 only seeds Structure).
-- Titles match the SITELINE frontend checklists so every phase has required evidence.
insert into public.phase_checklist_templates (project_stage_id, code, title, required, sort_order)
select s.id, v.code, v.title, true, v.sort_order
from (values
  ('Mobilization', 'work_permits',        'Work Permits / Site Mobilization Clearance', 1),
  ('Mobilization', 'approved_drawings',   'Approved Drawings and Specifications (site layout)', 2),
  ('Mobilization', 'work_inspection',     'Activity/Work Inspection Checklist (site setup)', 3),
  ('Design',       'approved_drawings',   'Approved Drawings and Specifications', 1),
  ('Design',       'quality_control',     'Quality Control/QA-QC Checklist (design review)', 2),
  ('Design',       'previous_acceptance', 'Previous Activity Acceptance/Clearance (Mobilization)', 3),
  ('Foundation',   'work_inspection',     'Activity/Work Inspection Checklist (excavation & formwork)', 1),
  ('Foundation',   'inspection_testing',  'Inspection and Testing Records (soil compaction / rebar)', 2),
  ('Foundation',   'method_statement',    'Method Statement (concrete pour)', 3),
  ('Foundation',   'previous_acceptance', 'Previous Activity Acceptance/Clearance (Design)', 4),
  ('MEP Rough-in', 'work_inspection',     'Activity/Work Inspection Checklist (rough-in)', 1),
  ('MEP Rough-in', 'inspection_testing',  'Inspection and Testing Records (pressure/insulation resistance tests)', 2),
  ('MEP Rough-in', 'work_permits',        'Work Permits or Clearances (electrical/fire)', 3),
  ('MEP Rough-in', 'previous_acceptance', 'Previous Activity Acceptance/Clearance (Structure)', 4),
  ('Finishes',     'work_inspection',     'Activity/Work Inspection Checklist', 1),
  ('Finishes',     'quality_control',     'Quality Control/QA-QC Checklist', 2),
  ('Finishes',     'previous_acceptance', 'Previous Activity Acceptance/Clearance (MEP Rough-in)', 3),
  ('Closeout',     'inspection_testing',  'Inspection and Testing Records (final systems testing)', 1),
  ('Closeout',     'work_permits',        'Work Permits or Clearances (occupancy/certificate of completion)', 2),
  ('Closeout',     'approved_drawings',   'Approved Drawings and Specifications (as-built)', 3),
  ('Closeout',     'previous_acceptance', 'Previous Activity Acceptance/Clearance (Finishes)', 4)
) as v (stage, code, title, sort_order)
join public.project_stages s on s.code = v.stage
on conflict (project_stage_id, code) do nothing;

insert into public.phase_schema_migrations (name) values
  ('001-phase-checklists.sql'), ('002-phase-update-confirmation.sql'),
  ('003-integration-foundation.sql'), ('004-session-and-reference-constraints.sql')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 8. Lock the Supabase REST API out of these tables (the Express backend uses a direct connection)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
