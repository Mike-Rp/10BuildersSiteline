begin;
create table if not exists public.admin_recovery_sets (
 id uuid primary key,
 user_id uuid not null references public.users(id),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 refresh_required boolean not null default false
);
create unique index if not exists one_active_admin_recovery_set on public.admin_recovery_sets(user_id) where revoked_at is null;
create table if not exists public.admin_recovery_codes (
 id uuid primary key,
 set_id uuid not null references public.admin_recovery_sets(id),
 position smallint not null check(position between 1 and 5),
 code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'),
 used_at timestamptz,
 unique(set_id,position)
);
create table if not exists public.admin_recovery_challenges (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 code_id uuid not null references public.admin_recovery_codes(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(expires_at>created_at)
);
create index if not exists admin_recovery_challenge_expiry on public.admin_recovery_challenges(expires_at);
create table if not exists public.admin_recovery_attempts (
 bucket text primary key,
 window_started_at timestamptz not null default now(),
 attempts integer not null check(attempts>0)
);
do $$ declare target text; begin
 foreach target in array array['admin_recovery_sets','admin_recovery_codes','admin_recovery_challenges','admin_recovery_attempts'] loop
  execute format('alter table public.%I enable row level security',target);
  execute format('revoke all on public.%I from public',target);
  if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on public.%I from anon',target);end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on public.%I from authenticated',target);end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
   execute format('grant all on public.%I to service_role',target);
   if not exists(select 1 from pg_policies where schemaname='public' and tablename=target and policyname='service_admin_recovery') then
    execute format('create policy service_admin_recovery on public.%I for all to service_role using(true) with check(true)',target);
   end if;
  end if;
 end loop;
end $$;
commit;
