-- ID numbers for subcontractor companies, their workers and staff. Additive and re-runnable.
-- Company code: at least 5 digits from a sequence starting at 2000, stepping by 100 (02000, 02100, ...).
-- Worker ID: <company code>-<seq> (02000-0045).
-- Neither has a ceiling: 02000-9999 is followed by 02000-10000, and company 99900 by 100000.
-- Staff ID: 10B-<seq> (10B-00012). IDs are text, never reused, never joined on: the uuid stays the key.
begin;

-- Pads to at least `width` digits and never truncates: zero_pad(45, 4) = '0045', zero_pad(12345, 4) = '12345'.
create or replace function public.zero_pad(n bigint, width integer) returns text language sql immutable as $$
 select case when length(n::text) >= width then n::text else lpad(n::text, width, '0') end
$$;

-- 1. Company code, assigned by the database when a company is created and never changed.
-- Codes go up by 100 (02000, 02100, 02200) so a one-digit typo does not land on another real company.
create sequence if not exists public.subcontractor_company_code_seq start 2000 increment 100;
alter sequence public.subcontractor_company_code_seq increment by 100 no maxvalue;
alter table public.subcontractors
 add column if not exists company_code varchar(12) default public.zero_pad(nextval('public.subcontractor_company_code_seq'), 5);
alter table public.subcontractors alter column company_code type varchar(12);
alter table public.subcontractors alter column company_code set default public.zero_pad(nextval('public.subcontractor_company_code_seq'), 5);
alter table public.subcontractors alter column company_code set not null;
alter table public.subcontractors drop constraint if exists subcontractors_company_code_format;
alter table public.subcontractors add constraint subcontractors_company_code_format check (company_code ~ '^([0-9]{5}|[1-9][0-9]{5,})$');
create unique index if not exists subcontractors_company_code_key on public.subcontractors(company_code);

create or replace function public.forbid_company_code_change() returns trigger language plpgsql as $$
begin
 if new.company_code is distinct from old.company_code then
  raise exception 'A company code cannot be changed.';
 end if;
 return new;
end $$;
drop trigger if exists subcontractors_company_code_frozen on public.subcontractors;
create trigger subcontractors_company_code_frozen before update on public.subcontractors
 for each row execute function public.forbid_company_code_change();

-- 2. Per-company worker counter. Locked by the upsert, so concurrent imports cannot issue the same number.
create table if not exists public.subcontractor_worker_counters (
 subcontractor_id uuid primary key references public.subcontractors(id),
 last_seq integer not null default 0 check (last_seq >= 0)
);
alter table public.subcontractor_worker_counters drop constraint if exists subcontractor_worker_counters_last_seq_check;
alter table public.subcontractor_worker_counters add constraint subcontractor_worker_counters_last_seq_check check (last_seq >= 0);

create or replace function public.issue_worker_id_number(p_subcontractor uuid) returns text language plpgsql as $$
declare v_code text; v_seq integer;
begin
 select company_code into v_code from public.subcontractors where id = p_subcontractor;
 if v_code is null then raise exception 'Unknown subcontractor.'; end if;
 insert into public.subcontractor_worker_counters(subcontractor_id, last_seq) values (p_subcontractor, 1)
  on conflict (subcontractor_id) do update set last_seq = public.subcontractor_worker_counters.last_seq + 1
  returning last_seq into v_seq;
 return v_code || '-' || public.zero_pad(v_seq, 4);
end $$;

-- 3. Worker columns. full_name stays; the three parts feed the Excel template.
alter table public.subcontractor_workers
 add column if not exists id_number varchar(20),
 add column if not exists first_name varchar(100),
 add column if not exists middle_name varchar(100),
 add column if not exists last_name varchar(100),
 add column if not exists suffix varchar(4);
-- Same list as SUFFIX_LABELS in src/identity.ts.
alter table public.subcontractor_workers drop constraint if exists subcontractor_workers_suffix_check;
alter table public.subcontractor_workers add constraint subcontractor_workers_suffix_check
 check (suffix is null or suffix in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V'));

-- Every ID ever issued. One active per worker; a transfer archives the old row and links it to the new number.
create table if not exists public.worker_id_numbers (
 id bigserial primary key,
 worker_id uuid not null references public.subcontractor_workers(id),
 subcontractor_id uuid not null references public.subcontractors(id),
 id_number varchar(20) not null unique,
 status varchar(10) not null default 'active' check (status in ('active', 'archived')),
 issued_at timestamptz not null default now(),
 archived_at timestamptz,
 replaced_by varchar(20) references public.worker_id_numbers(id_number),
 issued_by uuid references public.users(id),
 check ((status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null))
);
-- Widen databases that ran this file when IDs were capped at 10 characters.
alter table public.subcontractor_workers alter column id_number type varchar(20);
alter table public.worker_id_numbers alter column id_number type varchar(20), alter column replaced_by type varchar(20);
create unique index if not exists one_active_worker_id on public.worker_id_numbers(worker_id) where status = 'active';
create index if not exists idx_worker_id_numbers_sub on public.worker_id_numbers(subcontractor_id);

-- Seed data appended an old worker code to the name: "Pedro Abad (W1-0015)". The ID number replaces it.
update public.subcontractor_workers set full_name = regexp_replace(full_name, '\s*\(W[0-9]+-[0-9]{4}\)$', '')
 where full_name ~ '\(W[0-9]+-[0-9]{4}\)$';

-- Backfill names from full_name (first word, last word) and issue IDs in creation order.
-- Any other trailing "(...)" note is ignored, and a trailing suffix on a name of three or more words
-- is split off first: "Juan Santos Jr." -> Santos, Jr.
update public.subcontractor_workers w
 set first_name = split_part(n.base, ' ', 1),
     last_name = case when position(' ' in n.base) > 0 then regexp_replace(n.base, '^.*\s', '') else n.base end,
     suffix = case when n.raw_suffix is null then null
                   when lower(rtrim(n.raw_suffix, '.')) in ('jr', 'sr') then initcap(rtrim(n.raw_suffix, '.')) || '.'
                   else upper(n.raw_suffix) end
 from (
  select s.id, s.raw_suffix,
         case when s.raw_suffix is null then s.name
              else rtrim(btrim(left(s.name, length(s.name) - length(s.raw_suffix))), ',') end as base
  from (
   select id, name, substring(name from '(?i)^\S+ .+ ((?:jr|sr)\.?|ii|iii|iv|v)$') as raw_suffix
   from (select id, btrim(regexp_replace(regexp_replace(full_name, '\s*\([^()]*\)\s*$', ''), '\s+', ' ', 'g')) as name
         from public.subcontractor_workers where first_name is null) c
  ) s
 ) n
 where w.id = n.id;
do $$
declare r record; v_id text;
begin
 for r in select id, subcontractor_id from public.subcontractor_workers where id_number is null order by created_at, id loop
  v_id := public.issue_worker_id_number(r.subcontractor_id);
  update public.subcontractor_workers set id_number = v_id where id = r.id;
  insert into public.worker_id_numbers(worker_id, subcontractor_id, id_number) values (r.id, r.subcontractor_id, v_id);
 end loop;
end $$;
alter table public.subcontractor_workers alter column id_number set not null;
alter table public.subcontractor_workers drop constraint if exists subcontractor_workers_id_number_format;
alter table public.subcontractor_workers add constraint subcontractor_workers_id_number_format check (id_number ~ '^([0-9]{5}|[1-9][0-9]{5,})-([0-9]{4}|[1-9][0-9]{4,})$');
create unique index if not exists subcontractor_workers_id_number_key on public.subcontractor_workers(id_number);

-- Every new worker gets the next number for their company. A typed ID is ignored, so an ID can only come
-- from the counter and can never collide with a number the counter issues later.
create or replace function public.assign_worker_id_number() returns trigger language plpgsql as $$
begin
 new.id_number := public.issue_worker_id_number(new.subcontractor_id);
 return new;
end $$;
drop trigger if exists subcontractor_workers_assign_id on public.subcontractor_workers;
create trigger subcontractor_workers_assign_id before insert on public.subcontractor_workers
 for each row execute function public.assign_worker_id_number();

create or replace function public.record_worker_id_number() returns trigger language plpgsql as $$
begin
 insert into public.worker_id_numbers(worker_id, subcontractor_id, id_number, issued_by)
  values (new.id, new.subcontractor_id, new.id_number, new.created_by)
  on conflict (id_number) do nothing;
 return new;
end $$;
drop trigger if exists subcontractor_workers_record_id on public.subcontractor_workers;
create trigger subcontractor_workers_record_id after insert on public.subcontractor_workers
 for each row execute function public.record_worker_id_number();

-- id_number and subcontractor_id may only change through transfer_worker(), so the ID history cannot drift.
create or replace function public.guard_worker_identity() returns trigger language plpgsql as $$
begin
 if (new.id_number is distinct from old.id_number or new.subcontractor_id is distinct from old.subcontractor_id)
    and coalesce(current_setting('siteline.transfer', true), '') <> 'on' then
  raise exception 'Use transfer_worker() to move a worker to another company.';
 end if;
 return new;
end $$;
drop trigger if exists subcontractor_workers_guard_identity on public.subcontractor_workers;
create trigger subcontractor_workers_guard_identity before update on public.subcontractor_workers
 for each row execute function public.guard_worker_identity();

-- Transfer to another company: archive the current ID, issue a new one, never reuse the old number.
create or replace function public.transfer_worker(p_worker uuid, p_new_subcontractor uuid, p_actor uuid) returns text
language plpgsql as $$
declare v_old public.worker_id_numbers%rowtype; v_new text;
begin
 select * into v_old from public.worker_id_numbers where worker_id = p_worker and status = 'active' for update;
 if not found then raise exception 'Worker has no active ID number.'; end if;
 if v_old.subcontractor_id = p_new_subcontractor then raise exception 'The worker is already in this company.'; end if;
 v_new := public.issue_worker_id_number(p_new_subcontractor);
 perform set_config('siteline.transfer', 'on', true);
 update public.worker_id_numbers set status = 'archived', archived_at = now() where id = v_old.id;
 update public.subcontractor_workers set subcontractor_id = p_new_subcontractor, id_number = v_new,
  updated_by = p_actor, updated_at = now() where id = p_worker;
 -- the insert trigger only fires on new workers, so record the new ID here
 insert into public.worker_id_numbers(worker_id, subcontractor_id, id_number, issued_by)
  values (p_worker, p_new_subcontractor, v_new, p_actor);
 update public.worker_id_numbers set replaced_by = v_new where id = v_old.id;
 perform set_config('siteline.transfer', 'off', true);
 return v_new;
end $$;

-- 4. Staff ID and generated work email. users.email stays the sign-in; work_email is the mailbox IT creates.
create sequence if not exists public.staff_id_seq start 1;
alter sequence public.staff_id_seq no maxvalue;
alter table public.users
 add column if not exists id_number varchar(16) default ('10B-' || public.zero_pad(nextval('public.staff_id_seq'), 5)),
 add column if not exists work_email citext;
alter table public.users alter column id_number type varchar(16);
alter table public.users alter column id_number set default ('10B-' || public.zero_pad(nextval('public.staff_id_seq'), 5));
alter table public.users alter column id_number set not null;
alter table public.users drop constraint if exists users_id_number_format;
alter table public.users add constraint users_id_number_format check (id_number ~ '^10B-([0-9]{5}|[1-9][0-9]{5,})$');
create unique index if not exists users_id_number_key on public.users(id_number);
create unique index if not exists users_work_email_key on public.users(work_email) where work_email is not null;

insert into public.phase_schema_migrations (name) values ('010-id-numbers.sql') on conflict do nothing;

-- Keep the Supabase REST API locked out, as in the base schema.
alter table public.subcontractor_worker_counters enable row level security;
alter table public.worker_id_numbers enable row level security;
revoke all on public.subcontractor_worker_counters, public.worker_id_numbers from anon, authenticated;
revoke all on sequence public.subcontractor_company_code_seq, public.staff_id_seq from anon, authenticated;
revoke all on function public.issue_worker_id_number(uuid), public.transfer_worker(uuid, uuid, uuid) from anon, authenticated, public;

commit;
