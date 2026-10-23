-- Project-type workflows. Run with the backend migration runner after migration 003.
-- Existing evidence IDs, approvals, assignments, files and current percentages are retained.
begin;
select pg_advisory_xact_lock(21021,4);
create table if not exists public.project_type_stages(
 project_type_id smallint not null references public.project_types(id),
 project_stage_id smallint not null references public.project_stages(id),
 sort_order smallint not null check(sort_order>0),
 primary key(project_type_id,project_stage_id),
 unique(project_type_id,sort_order)
);
alter table public.project_type_stages enable row level security;
create temp table _type_phases(type text,name text,position smallint,disciplines text[]) on commit drop;
insert into _type_phases values
('Residential','Mobilization',1,ARRAY['Civil','Geotechnical']::text[]),
('Residential','Design',2,ARRAY['Civil','Structural','Mechanical','Electrical','Plumbing']::text[]),
('Residential','Foundation',3,ARRAY['Geotechnical','Structural']::text[]),
('Residential','Structure',4,ARRAY['Structural']::text[]),
('Residential','Envelope',5,ARRAY['Structural','Civil']::text[]),
('Residential','MEP Rough-In',6,ARRAY['Mechanical','Electrical','Plumbing']::text[]),
('Residential','Finishes',7,ARRAY['Interior/Finishes','Electrical','Plumbing']::text[]),
('Residential','Landscape & Site Works',8,ARRAY['Landscape','Civil']::text[]),
('Residential','Closeout',9,ARRAY['Civil','Interior/Finishes']::text[]),
('Commercial','Mobilization',1,ARRAY['Civil','Geotechnical']::text[]),
('Commercial','Design',2,ARRAY['Civil','Structural','Mechanical','Electrical','Plumbing','Acoustic']::text[]),
('Commercial','Foundation',3,ARRAY['Geotechnical','Structural']::text[]),
('Commercial','Structure',4,ARRAY['Structural']::text[]),
('Commercial','Envelope / Curtain Wall',5,ARRAY['Structural','Civil']::text[]),
('Commercial','MEP Rough-In',6,ARRAY['Mechanical','Electrical','Plumbing','Fire Protection']::text[]),
('Commercial','Fire & Life Safety',7,ARRAY['Fire Protection','Electrical']::text[]),
('Commercial','Fit-Out / Finishes',8,ARRAY['Interior/Finishes','Acoustic','Electrical']::text[]),
('Commercial','Closeout',9,ARRAY['Civil','Fire Protection','Interior/Finishes']::text[]),
('Mixed-Use','Mobilization',1,ARRAY['Civil','Geotechnical']::text[]),
('Mixed-Use','Design',2,ARRAY['Civil','Structural','Mechanical','Electrical','Plumbing','Acoustic']::text[]),
('Mixed-Use','Foundation',3,ARRAY['Geotechnical','Structural']::text[]),
('Mixed-Use','Podium Structure',4,ARRAY['Structural','Civil']::text[]),
('Mixed-Use','Tower Structure',5,ARRAY['Structural']::text[]),
('Mixed-Use','Envelope / Curtain Wall',6,ARRAY['Structural','Civil']::text[]),
('Mixed-Use','MEP Rough-In',7,ARRAY['Mechanical','Electrical','Plumbing','Fire Protection']::text[]),
('Mixed-Use','Fire & Life Safety',8,ARRAY['Fire Protection','Electrical']::text[]),
('Mixed-Use','Retail/Commercial Fit-Out',9,ARRAY['Interior/Finishes','Acoustic','Electrical']::text[]),
('Mixed-Use','Residential Fit-Out',10,ARRAY['Interior/Finishes','Plumbing','Electrical']::text[]),
('Mixed-Use','Landscape & Site Works',11,ARRAY['Landscape','Civil']::text[]),
('Mixed-Use','Closeout',12,ARRAY['Civil','Fire Protection','Interior/Finishes']::text[]);
-- Keep the existing stage IDs, including MEP Rough-in, so dependent evidence stays attached.
-- Canonical label is shared with the supplied workflow reference.
update public.project_stages set code='MEP Rough-In' where lower(code)='mep rough-in' and code<>'MEP Rough-In';
insert into public.project_stages(id,code,sort_order)
select (base.max_id+row_number() over(order by n.name))::smallint,n.name,100
from (select distinct name from _type_phases where name not in(select code from public.project_stages)) n
cross join (select coalesce(max(id),0) as max_id from public.project_stages) base;
delete from public.project_type_stages w using public.project_types pt where w.project_type_id=pt.id and pt.code in('Residential','Commercial','Mixed-Use');
insert into public.project_type_stages(project_type_id,project_stage_id,sort_order)
select pt.id,s.id,r.position from _type_phases r join public.project_types pt on pt.code=r.type
join public.project_stages s on s.code=r.name on conflict do nothing;
-- Legacy project types retain their original workflow.
insert into public.project_type_stages(project_type_id,project_stage_id,sort_order)
select pt.id,s.id,s.sort_order from public.project_types pt cross join public.project_stages s
where pt.code not in('Residential','Commercial','Mixed-Use') and s.id between 1 and 7 on conflict do nothing;
insert into public.disciplines(id,code)
select (base.max_id+row_number() over(order by n.code))::smallint,n.code
from(select distinct unnest(disciplines) as code from _type_phases) n
cross join(select coalesce(max(id),0) as max_id from public.disciplines) base
where not exists(select 1 from public.disciplines d where d.code=n.code);
delete from public.project_stage_discipline_links l using public.project_types pt
where l.project_type_id=pt.id and pt.code in('Residential','Commercial','Mixed-Use');
insert into public.project_stage_discipline_links(project_type_id,project_stage_id,discipline_id)
select pt.id,s.id,d.id from _type_phases r join public.project_types pt on pt.code=r.type
join public.project_stages s on s.code=r.name cross join lateral unnest(r.disciplines) tag(code)
join public.disciplines d on d.code=tag.code;
-- Null means a newly introduced phase still needs an explicit assignment.
alter table public.project_phase_team alter column spm_user_id drop not null;
do $migrate$
declare c record; r record;
begin
 if exists(select 1 from public.phase_schema_migrations where name='004-project-type-workflows') then return; end if;
 -- Composite checklist/file foreign keys must move together, without dropping protection.
 for c in select conrelid::regclass as relation,conname from pg_constraint
 where contype='f' and conrelid in('public.project_phase_checklist_items'::regclass,'public.project_phase_evidence'::regclass)
 and confrelid in('public.project_phase_checklists'::regclass,'public.project_phase_checklist_items'::regclass,'public.project_phase_files'::regclass)
 loop execute format('alter table %s alter constraint %I deferrable initially deferred',c.relation,c.conname); end loop;
 create temp table _phase_remap(type_id smallint,old_id smallint,new_id smallint) on commit drop;
 insert into _phase_remap
 select pt.id,old.id,new.id from (values
 ('Commercial','Finishes','Fit-Out / Finishes'),
 ('Mixed-Use','Structure','Podium Structure'),
 ('Mixed-Use','Finishes','Retail/Commercial Fit-Out')
 ) m(type,old_name,new_name) join public.project_types pt on pt.code=m.type
 join public.project_stages old on old.code=m.old_name join public.project_stages new on new.code=m.new_name;
 -- All project-scoped stage references move as a unit, including pending reviews and history.
 for r in select cols.table_name,cols.column_name from information_schema.columns cols
 where cols.table_schema='public' and cols.column_name in('project_stage_id','prior_stage_id','selected_stage_id','requested_stage_id')
 and exists(select 1 from information_schema.columns pc where pc.table_schema=cols.table_schema and pc.table_name=cols.table_name and pc.column_name='project_id')
 loop execute format('update public.%I x set %I=m.new_id from _phase_remap m,public.projects p where x.project_id=p.id and p.project_type_id=m.type_id and x.%I=m.old_id',r.table_name,r.column_name,r.column_name); end loop;
 update public.projects p set current_stage_id=m.new_id from _phase_remap m
 where p.project_type_id=m.type_id and p.current_stage_id=m.old_id;
 set constraints all immediate;
 for c in select conrelid::regclass as relation,conname from pg_constraint
 where contype='f' and conrelid in('public.project_phase_checklist_items'::regclass,'public.project_phase_evidence'::regclass)
 and confrelid in('public.project_phase_checklists'::regclass,'public.project_phase_checklist_items'::regclass,'public.project_phase_files'::regclass)
 loop execute format('alter table %s alter constraint %I not deferrable',c.relation,c.conname); end loop;
 insert into public.project_phase_team(project_id,project_stage_id,spm_user_id,status,is_lead)
 select p.id,w.project_stage_id,null,'pending',false from public.projects p
 join public.project_type_stages w on w.project_type_id=p.project_type_id
 where p.lifecycle_status<>'draft' and not coalesce(p.is_deleted,false)
 on conflict(project_id,project_stage_id) do nothing;
 insert into public.phase_schema_migrations(name) values('004-project-type-workflows');
end $migrate$;
-- Existing phases retain their checklist templates. Remapped finishes/structure inherit the old templates.
insert into public.phase_checklist_templates(project_stage_id,code,title,required,sort_order)
select target.id,t.code,t.title,t.required,t.sort_order from (values
 ('Structure','Podium Structure'),('Structure','Tower Structure'),
 ('Finishes','Fit-Out / Finishes'),('Finishes','Retail/Commercial Fit-Out'),('Finishes','Residential Fit-Out')
) m(source,target) join public.project_stages source on source.code=m.source
join public.project_stages target on target.code=m.target
join public.phase_checklist_templates t on t.project_stage_id=source.id
on conflict(project_stage_id,code) do nothing;
-- Added phases require an administrator-configured checklist; do not invent completion or approvals.
commit;
