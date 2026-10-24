-- Manpower lists submitted by a Site PM and approved by an Admin. Additive and re-runnable.
-- A submission holds the validated rows until an Admin approves it. Workers and their ID numbers are created
-- only on approval, so a list that is rejected or withdrawn never uses up an ID number.
begin;

create table if not exists public.manpower_submissions (
 id uuid primary key,
 subcontractor_id uuid not null references public.subcontractors(id),
 submitted_by uuid not null references public.users(id),
 file_name varchar(255),
 payload jsonb not null,
 new_count integer not null check (new_count >= 0),
 existing_count integer not null check (existing_count >= 0),
 status varchar(10) not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
 decision_note text,
 decided_by uuid references public.users(id),
 decided_at timestamptz,
 result jsonb,
 created_at timestamptz not null default now(),
 check ((status = 'pending' and decided_at is null) or (status <> 'pending' and decided_at is not null))
);
create index if not exists idx_manpower_submissions_company on public.manpower_submissions(subcontractor_id, created_at desc);
-- One list per company waits for approval at a time, so two lists can never be approved against each other.
create unique index if not exists one_pending_manpower_submission on public.manpower_submissions(subcontractor_id) where status = 'pending';

insert into public.phase_schema_migrations (name) values ('011-manpower-submissions.sql') on conflict do nothing;

-- Keep the Supabase REST API locked out, as in the base schema.
alter table public.manpower_submissions enable row level security;
revoke all on public.manpower_submissions from anon, authenticated;

commit;
