begin;
create table if not exists company_foreman_contacts (
 id uuid primary key, company_id uuid not null references subcontractors(id) on delete cascade,
 full_name text not null, phone text not null, created_at timestamptz not null default now(),
 unique(id,company_id)
);
-- Contacts are not users. Keep historical identities when directory contacts change.
update workspace_company_metadata m set metadata=jsonb_set(m.metadata,'{foremen}',(
 select jsonb_agg(case when coalesce(f->>'name','')<>'' and coalesce(f->>'phone','')<>''
   then f||jsonb_build_object('id',case when coalesce(f->>'id','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then f->>'id'
     else md5(m.subcontractor_id::text||':'||(f->>'phone')||':'||(f->>'name'))::uuid::text end) else f end order by n)
 from jsonb_array_elements(m.metadata->'foremen') with ordinality a(f,n)
)) where case when jsonb_typeof(m.metadata->'foremen')='array' then jsonb_array_length(m.metadata->'foremen')>0 else false end;
insert into company_foreman_contacts(id,company_id,full_name,phone)
select (f->>'id')::uuid,m.subcontractor_id,f->>'name',f->>'phone'
from workspace_company_metadata m cross join lateral jsonb_array_elements(case when jsonb_typeof(m.metadata->'foremen')='array' then m.metadata->'foremen' else '[]'::jsonb end) f
where coalesce(f->>'name','')<>'' and coalesce(f->>'phone','')<>''
on conflict(id) do nothing;
create table if not exists project_phase_foremen (
 project_id uuid not null references projects(id), phase text not null,
 company_id uuid not null references subcontractors(id), foreman_id uuid not null,
 foreman_name text not null, foreman_phone text not null,
 assigned_by uuid not null references users(id), assigned_at timestamptz not null default now(),
 primary key(project_id,phase),
 foreign key(foreman_id,company_id) references company_foreman_contacts(id,company_id)
);
create table if not exists project_allocation_requests (
 id bigint generated always as identity primary key,
 project_id uuid not null references projects(id),
 status text not null check(status in ('draft','pending_admin','approved','rejected','applied','declined','cancelled')),
 base_revision integer not null, proposal jsonb not null, reason text not null,
 existing_company_ids uuid[] not null default '{}',
 responses jsonb not null default '{}'::jsonb,
 requested_by uuid not null references users(id), requested_at timestamptz not null default now(),
 reviewed_by uuid references users(id), reviewed_at timestamptz, review_note text
);
create unique index if not exists one_open_phase_allocation_request on project_allocation_requests(project_id)
where status in ('draft','pending_admin','approved');
create table if not exists project_allocation_events (
 id bigint generated always as identity primary key, project_id uuid not null references projects(id),
 request_id bigint references project_allocation_requests(id), actor_id uuid not null references users(id),
 action text not null, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists phase_foreman_company_projects on project_phase_foremen(company_id,project_id);
create index if not exists allocation_requests_status on project_allocation_requests(status,requested_at);
-- Existing accepted plans are not rewritten, and no foreman assignment is guessed.
alter table company_foreman_contacts enable row level security;
alter table project_phase_foremen enable row level security;
alter table project_allocation_requests enable row level security;
alter table project_allocation_events enable row level security;
revoke all on company_foreman_contacts,project_phase_foremen,project_allocation_requests,project_allocation_events from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on company_foreman_contacts,project_phase_foremen,project_allocation_requests,project_allocation_events to service_role;
  grant usage,select on sequence project_allocation_requests_id_seq,project_allocation_events_id_seq to service_role;
  if not exists(select 1 from pg_policies where tablename='company_foreman_contacts' and policyname='backend_access') then
   create policy backend_access on company_foreman_contacts to service_role using(true) with check(true);
   create policy backend_access on project_phase_foremen to service_role using(true) with check(true);
   create policy backend_access on project_allocation_requests to service_role using(true) with check(true);
   create policy backend_access on project_allocation_events to service_role using(true) with check(true);
  end if;
 end if;
end $$;
commit;
