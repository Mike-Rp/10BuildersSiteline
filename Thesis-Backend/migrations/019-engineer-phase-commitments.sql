-- Legacy responsibilities stay unclassified until reviewed; never infer a historical tag.
alter table public.project_phase_team add column if not exists assigned_disciplines text[];
alter table public.project_phase_team add column if not exists scope_recorded_at timestamptz;
alter table public.project_phase_team add column if not exists scope_recorded_by uuid references public.users(id);
alter table public.project_phase_team drop constraint if exists engineer_assignment_scope_nonempty;
alter table public.project_phase_team add constraint engineer_assignment_scope_nonempty
 check(assigned_disciplines is null or (cardinality(assigned_disciplines)>0 and array_position(assigned_disciplines,null) is null));
create index if not exists engineer_phase_commitments on public.project_phase_team(spm_user_id,project_id,project_stage_id)
 where status in ('pending','confirmed');
