-- Additive integration migration. No existing account, project or worker is removed.
begin;
create table if not exists public.stored_files (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id),
 user_id uuid references public.users(id), purpose text not null, original_name text not null,
 content_type text not null, byte_size integer not null check(byte_size between 1 and 10485760),
 content bytea not null, uploaded_by uuid not null references public.users(id),
 created_at timestamptz not null default now()
);
alter table public.stored_files drop constraint if exists stored_files_byte_size_check;
alter table public.stored_files add constraint stored_files_byte_size_check check(byte_size between 1 and 15728640);
alter table public.subcontractors add column if not exists directory_status text not null default 'approved';
alter table public.projects add column if not exists target_end_date date;
alter table public.projects add column if not exists location text not null default '';
alter table public.project_photos add column if not exists is_client_visible boolean not null default true;
create table if not exists public.workspace_settings (
 singleton boolean primary key default true check(singleton),
 rules jsonb not null default '{"grace":7,"cap":2,"response":3,"idle":15}'
);
insert into public.workspace_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.workspace_project_metadata (
 project_id uuid primary key references public.projects(id) on delete cascade,
 metadata jsonb not null default '{}'
);
create table if not exists public.workspace_account_metadata (
 user_id uuid primary key references public.users(id) on delete cascade,
 metadata jsonb not null default '{}'
);
create table if not exists public.workspace_company_metadata (
 subcontractor_id uuid primary key references public.subcontractors(id) on delete cascade,
 metadata jsonb not null default '{}'
);
create table if not exists public.project_subcontractor_selections (
 project_id uuid not null references public.projects(id) on delete cascade,
 subcontractor_id uuid not null references public.subcontractors(id),
 status text not null check(status in ('proposed','contacted','accepted','declined','replaced','archived')),
 contacted_at timestamptz, responded_at timestamptz,
 primary key(project_id,subcontractor_id)
);
create unique index if not exists one_current_subcontractor_selection
 on public.project_subcontractor_selections(project_id) where status in ('contacted','accepted');
do $$ declare t text; begin
 foreach t in array array['stored_files','workspace_settings','workspace_project_metadata',
  'workspace_account_metadata','workspace_company_metadata','project_subcontractor_selections'] loop
  execute format('alter table public.%I enable row level security',t);
  if exists(select 1 from pg_roles where rolname='anon') then
   execute format('revoke all on public.%I from anon',t);
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
   execute format('revoke all on public.%I from authenticated',t);
  end if;
 end loop;
end $$;
commit;
