-- Compatibility for databases created from the repository's original schema.
-- Existing id_number values and an existing database default are preserved.
begin;
alter table public.users add column if not exists id_number varchar(20);
do $$
declare
  highest_id bigint;
  sequence_value bigint;
  sequence_called boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='id_number' and column_default is not null
  ) then
    create sequence if not exists public.staff_id_seq minvalue 1 maxvalue 99999;
    select max(substring(id_number from '^10[Bb]-?([0-9]{5})$')::bigint) into highest_id from public.users;
    select last_value,is_called into sequence_value,sequence_called from public.staff_id_seq;
    perform setval('public.staff_id_seq', greatest(coalesce(highest_id,0),sequence_value),
      sequence_called or coalesce(highest_id,0)>=sequence_value);
    alter table public.users alter column id_number set default
      ('10B-' || lpad(nextval('public.staff_id_seq')::text,5,'0'));
  end if;
end $$;
create unique index if not exists users_id_number_unique on public.users(id_number);
commit;
