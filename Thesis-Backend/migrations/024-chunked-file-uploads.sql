-- Temporary storage for authenticated uploads split to stay below serverless request limits.
-- Completed uploads are copied into stored_files and their chunks are removed.
begin;

create table if not exists public.stored_file_upload_chunks (
  upload_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  chunk_index smallint not null check (chunk_index >= 0),
  chunk_count smallint not null check (chunk_count between 2 and 5),
  original_name text not null,
  purpose text not null check (purpose in ('document','manpower')),
  content bytea not null check (octet_length(content) between 1 and 3145728),
  created_at timestamptz not null default now(),
  primary key (upload_id, chunk_index),
  check (chunk_index < chunk_count)
);
create index if not exists idx_stored_file_upload_chunks_expiry
  on public.stored_file_upload_chunks(created_at);

alter table public.stored_file_upload_chunks enable row level security;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on public.stored_file_upload_chunks from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on public.stored_file_upload_chunks from authenticated;
  end if;
end $$;

commit;
