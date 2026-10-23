-- Site PM photos stay internal until the Office PM or Administrator releases them. Additive and re-runnable.
-- Photos already client-visible are left as they are; only the release trail is added.
begin;

alter table public.project_photos add column if not exists released_by uuid references public.users(id);
alter table public.project_photos add column if not exists released_at timestamptz;

commit;
