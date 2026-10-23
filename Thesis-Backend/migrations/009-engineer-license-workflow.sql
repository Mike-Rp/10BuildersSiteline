-- Expired engineer license workflow. Additive and re-runnable.
-- Creates four new tables and one default setting. No existing table, column or row is changed or removed.
begin;

-- Renewal uploads wait here until an Administrator verifies them. The engineer's current license
-- (user_licenses) stays in force until then; verifying inserts the new user_licenses row.
create table if not exists public.license_renewal_requests (
 id bigserial primary key,
 user_id uuid not null references public.users(id),
 license_number varchar(120) not null,
 license_expiry date not null,
 file_ref text not null,
 status text not null default 'under_review' check(status in ('under_review','verified','rejected')),
 submitted_by uuid references public.users(id),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references public.users(id),
 reviewed_at timestamptz,
 review_note text,
 resulting_license_id uuid references public.user_licenses(id),
 check((status='under_review' and reviewed_by is null and reviewed_at is null)
    or (status<>'under_review' and reviewed_by is not null and reviewed_at is not null)),
 check(status<>'rejected' or length(btrim(coalesce(review_note,'')))>0)
);
create unique index if not exists one_open_license_renewal on public.license_renewal_requests(user_id) where status='under_review';
create index if not exists idx_license_renewal_user on public.license_renewal_requests(user_id, submitted_at desc);

-- One row per reminder actually sent, so a reminder is never sent twice for the same license expiry.
create table if not exists public.license_reminders_sent (
 id bigserial primary key,
 user_id uuid not null references public.users(id),
 license_expiry date not null,
 reminder_key text not null,
 sent_at timestamptz not null default now(),
 unique(user_id, license_expiry, reminder_key)
);

-- Who held each phase (Site PM) or the project's Office PM role, and when. Rows are closed, never deleted.
create table if not exists public.engineer_assignment_history (
 id bigserial primary key,
 project_id uuid not null references public.projects(id),
 project_stage_id smallint references public.project_stages(id),
 role_code text not null check(role_code in ('spm','opm')),
 user_id uuid not null references public.users(id),
 kind text not null default 'original' check(kind in ('original','took_over')),
 started_at timestamptz not null,
 ended_at timestamptz,
 completed_at timestamptz,
 created_by uuid references public.users(id),
 created_at timestamptz not null default now(),
 check((role_code='spm' and project_stage_id is not null) or (role_code='opm' and project_stage_id is null)),
 check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists one_open_engineer_history
 on public.engineer_assignment_history(project_id, coalesce(project_stage_id,0), role_code) where ended_at is null;
create index if not exists idx_engineer_history_user on public.engineer_assignment_history(user_id);

-- Administrator override after the grace period. The reason is Administrator-only (enforced by the API).
create table if not exists public.license_overrides (
 id bigserial primary key,
 project_id uuid not null references public.projects(id),
 project_stage_id smallint references public.project_stages(id),
 role_code text not null check(role_code in ('spm','opm')),
 from_user_id uuid not null references public.users(id),
 to_user_id uuid not null references public.users(id),
 reason text not null check(length(btrim(reason))>0),
 expired_on date,
 grace_ended_on date,
 status text not null default 'pending_acceptance' check(status in ('pending_acceptance','accepted','declined','cancelled')),
 response_deadline_at timestamptz,
 requested_by uuid references public.users(id),
 requested_at timestamptz not null default now(),
 responded_at timestamptz,
 response_note text,
 check(from_user_id<>to_user_id),
 check((role_code='spm' and project_stage_id is not null) or (role_code='opm' and project_stage_id is null))
);
create unique index if not exists one_open_license_override
 on public.license_overrides(project_id, coalesce(project_stage_id,0), role_code) where status='pending_acceptance';
create index if not exists idx_license_override_to on public.license_overrides(to_user_id, status);

-- Backfill current holders so history starts from what already exists. Skips anything already recorded.
insert into public.engineer_assignment_history(project_id, project_stage_id, role_code, user_id, kind, started_at, created_by)
select t.project_id, t.project_stage_id, 'spm', t.spm_user_id, 'original', coalesce(t.responded_at, t.created_at), t.spm_user_id
  from public.project_phase_team t join public.projects p on p.id=t.project_id
 where t.status='confirmed' and not coalesce(p.is_deleted,false)
   and not exists(select 1 from public.engineer_assignment_history h
     where h.project_id=t.project_id and h.project_stage_id=t.project_stage_id and h.role_code='spm' and h.ended_at is null);
insert into public.engineer_assignment_history(project_id, project_stage_id, role_code, user_id, kind, started_at, created_by)
select p.id, null, 'opm', p.suggested_opm_id, 'original', coalesce(c.responded_at, p.created_at), p.suggested_opm_id
  from public.projects p
  join lateral (select ac.responded_at from public.assignment_confirmations ac
                 where ac.project_id=p.id and ac.role_context='opm' and ac.status='accepted' and ac.target_user_id=p.suggested_opm_id
                 order by ac.responded_at desc nulls last limit 1) c on true
 where p.suggested_opm_id is not null and not coalesce(p.is_deleted,false)
   and not exists(select 1 from public.engineer_assignment_history h
     where h.project_id=p.id and h.project_stage_id is null and h.role_code='opm' and h.ended_at is null);

-- Default reminder days. Existing rule values (including grace) are left exactly as they are.
update public.workspace_settings
   set rules = jsonb_build_object('reminderDays', '[60,30,14,7,0]'::jsonb) || rules
 where singleton and not (rules ? 'reminderDays');

do $$ declare t text; begin
 foreach t in array array['license_renewal_requests','license_reminders_sent','engineer_assignment_history','license_overrides'] loop
  execute format('alter table public.%I enable row level security',t);
  if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on public.%I from anon',t); end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on public.%I from authenticated',t); end if;
 end loop;
end $$;
commit;
