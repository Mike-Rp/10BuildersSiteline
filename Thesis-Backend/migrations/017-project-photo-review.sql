-- Track site gallery photo review outcomes and return notes.
begin;

alter table public.project_photos
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.users(id),
  add column if not exists reviewed_at timestamptz;

update public.project_photos
set review_status = case when is_client_visible then 'released' else 'pending' end
where review_status = 'pending' and is_client_visible;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='project_photos_review_status_check') then
    alter table public.project_photos add constraint project_photos_review_status_check
      check (review_status in ('pending','released','rejected'));
  end if;
end $$;

commit;
