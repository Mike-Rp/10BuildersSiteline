-- Keep one coordinating Site PM per phase for existing workflow compatibility.
-- Additional engineers own explicitly allocated specialization responsibilities.
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_phase_team' and column_name='assigned_disciplines') then
  raise exception 'Apply migration 019 before migration 020.';
 end if;
end $$;
create table if not exists public.project_phase_responsibilities (
 id bigserial primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 project_stage_id smallint not null references public.project_stages(id),
 user_id uuid not null references public.users(id),
 assigned_disciplines text[] not null check(cardinality(assigned_disciplines) between 1 and 3 and array_position(assigned_disciplines,null) is null),
 is_coordinator boolean not null default false,
 status text not null default 'pending' check(status in ('pending','confirmed','declined','released')),
 completion_status text not null default 'unfinished' check(completion_status in ('unfinished','submitted','approved','returned')),
 completion_note text,
 completion_file_id uuid references public.project_phase_files(id),
 review_note text,
 reviewed_by uuid references public.users(id),
 reviewed_at timestamptz,
 responded_at timestamptz,
 created_by uuid references public.users(id),
 created_at timestamptz not null default now(),
 unique(project_id,project_stage_id,user_id),
 check(completion_status<>'approved' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists responsibility_engineer_commitments on public.project_phase_responsibilities(user_id,project_id) where status in ('pending','confirmed');
create unique index if not exists one_responsibility_coordinator on public.project_phase_responsibilities(project_id,project_stage_id) where is_coordinator;
alter table public.project_phase_responsibilities enable row level security;
revoke all on public.project_phase_responsibilities from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on public.project_phase_responsibilities to service_role;
  grant usage,select on sequence public.project_phase_responsibilities_id_seq to service_role;
  if not exists(select 1 from pg_policies where tablename='project_phase_responsibilities' and policyname='service_responsibilities') then
   create policy service_responsibilities on public.project_phase_responsibilities for all to service_role using(true) with check(true);
  end if;
 end if;
end $$;
-- No historical participants or completion approvals are inferred.
