-- Files can live in a private Supabase Storage bucket instead of a bytea column.
-- Additive and idempotent: existing rows keep their bytes and keep working, and
-- the application only uses Storage once this has run AND the storage keys are set.
begin;

alter table public.stored_files
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;
alter table public.stored_files alter column content drop not null;

alter table public.project_phase_files
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;
alter table public.project_phase_files alter column content drop not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='stored_files_has_bytes') then
    alter table public.stored_files add constraint stored_files_has_bytes
      check (content is not null or (storage_bucket is not null and storage_path is not null));
  end if;
  if not exists(select 1 from pg_constraint where conname='phase_files_has_bytes') then
    alter table public.project_phase_files add constraint phase_files_has_bytes
      check (content is not null or (storage_bucket is not null and storage_path is not null));
  end if;
end $$;

create index if not exists idx_stored_files_storage_path on public.stored_files(storage_bucket, storage_path)
  where storage_path is not null;

commit;
