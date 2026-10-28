-- SITELINE bulk test dataset v1 (synthetic data).
-- Run AFTER the Thesis-Backend schema, as postgres in the Supabase SQL Editor.
-- Creates: 50 admins, 120 OPMs, 120 SPMs, 25 clients, 5 companies,
-- 5,000 workers (1,000 per company), and 50 connected projects.
-- All login passwords: Password@123. Worker records are not login accounts.
-- Insert-only: existing data stays intact; repeat runs do not duplicate this seed.
-- Counts are exact on an empty schema. Existing data adds to these totals.
-- Do not run the old dummy-data.sql afterwards: its reset rejects bulk accounts.
-- One atomic statement keeps helper tables alive throughout the import.
do $siteline_bulk$
begin
perform set_config('search_path','public, extensions',true);
perform pg_advisory_xact_lock(50001050);

begin
  if to_regclass('public.stored_files') is null
     or to_regclass('public.subcontractor_workers') is null then
    raise exception 'Run 20261017000002_thesis_backend_schema.sql first.';
  end if;
  if (select count(*) from public.roles where code in ('admin','opm','spm','client')) <> 4
     or (select count(*) from public.project_stages) <> 7
     or (select count(*) from public.project_types) <> 6
     or (select count(distinct project_stage_id) from public.phase_checklist_templates) <> 7 then
    raise exception 'Required Thesis-Backend reference data is missing.';
  end if;
end;

-- Temporary planning tables disappear at commit; no schema changes are required.
create temp table _bulk_users on commit drop as
select md5('siteline-bulk-v1/user/' || r.role || '/' || n)::uuid as id,
       r.role, n,
       r.role || lpad(n::text,3,'0') || '@siteline-test.example' as email,
       (array['Adrian','Bianca','Carlo','Diana','Enzo','Fatima','Gabriel','Hannah',
              'Isaac','Julia','Kevin','Lara','Marco','Nina','Oscar','Paula','Ramon',
              'Sofia','Tomas','Valerie'])[1 + (n-1)%20] || ' ' ||
       (array['Aguilar','Bautista','Cruz','Delos Reyes','Evangelista','Flores',
              'Garcia','Hernandez','Ignacio','Jimenez','Lim','Mendoza','Navarro',
              'Ocampo','Perez','Ramos','Santos','Torres','Uy','Villanueva'])
         [1 + ((n-1)/20)%20] || ' (' || upper(r.role) || ' ' || lpad(n::text,3,'0') || ')' as full_name
from (values ('admin',50),('opm',120),('spm',120),('client',25)) r(role,total)
cross join lateral generate_series(1,r.total) n;

-- Stop rather than attach the graph to an unrelated account with a colliding email/ID.
begin
  if exists (
    select 1 from _bulk_users b join public.users u on u.id=b.id or u.email=b.email
    join public.roles r on r.id=u.role_id
    where u.id<>b.id or lower(u.email::text)<>b.email or r.code<>b.role
  ) then
    raise exception 'A bulk test account email or ID belongs to another account. Nothing was inserted.';
  end if;
end;

insert into public.users
(id,full_name,email,phone,password_hash,temp_password_issued,role_id,status,date_added,created_by)
select b.id,b.full_name,b.email,'09' || lpad((700000000+b.n+
       case b.role when 'admin' then 0 when 'opm' then 1000 when 'spm' then 2000 else 3000 end)::text,9,'0'),
       '$2b$10$QFshXqNYLL4vxXhYHFuJg.Otz6t.BICP28NwCONpnd3BQ5CaVF11C',
       false,r.id,'active',current_date-90,
       (select id from _bulk_users where role='admin' and n=1)
from _bulk_users b join public.roles r on r.code=b.role
on conflict (id) do nothing;

-- Projects use only the three intake types: Residential (1), Commercial (2), Mixed-Use (3).
-- Number n cycles Residential, Commercial, Mixed-Use, then four more slots that are
-- Commercial / Commercial (alternating with Residential) / Commercial / Residential.
-- Project n and OPM n share a type, so each OPM manages a type they specialize in.
create temp table _bulk_type_map on commit drop as
select n,
       case (n-1)%6
         when 0 then 1 when 1 then 2 when 2 then 3
         when 3 then case when ((n-4)/6)%2=0 then 2 else 1 end
         when 4 then 2
         else 1 end as type_id
from generate_series(1,120) n;

-- Every OPM has two specializations: their project's type and the next intake type.
-- Filter existing rows before the cap trigger.
insert into public.user_project_type_specializations(user_id,project_type_id)
select u.id,t.id from _bulk_users u
join _bulk_type_map m on m.n=u.n
join public.project_types t on t.id in (m.type_id,1+m.type_id%3)
where u.role='opm' and not exists (
  select 1 from public.user_project_type_specializations x
  where x.user_id=u.id and x.project_type_id=t.id
);

create temp table _bulk_companies on commit drop as
select md5('siteline-bulk-v1/company/' || n)::uuid as id,n,t.id as trade_id,
       d.id as discipline_id,v.company_name,v.role_title,v.cert_code
from (values
 (1,'Structural / Rebar','Structural','Atlas Test Structural Works','Rebar Installer','TESDA-Welding'),
 (2,'Electrical','Electrical','Beacon Test Electrical Systems','Electrician','PRC-Electrical'),
 (3,'Mechanical / Plumbing','Plumbing','Cascade Test Mechanical and Plumbing','Plumber','PRC-Mechanical'),
 (4,'Facade','Facade','Vista Test Facade Specialists','Facade Installer','DOLE-Safety'),
 (5,'Waterproofing','Waterproofing','Shield Test Waterproofing','Waterproofing Technician','DOLE-Safety')
) v(n,trade_code,discipline_code,company_name,role_title,cert_code)
join public.trades t on t.code=v.trade_code
join public.disciplines d on d.code=v.discipline_code;

insert into public.subcontractors
(id,company_name,trade_id,contact_email,meta_description,source,directory_status,created_by)
select c.id,c.company_name,c.trade_id,'company' || c.n || '@siteline-test.example',
       'Synthetic bulk test company: 1,000 workers, including assigned and available crews.',
       'directory','approved',(select id from _bulk_users where role='admin' and n=c.n)
from _bulk_companies c on conflict (id) do nothing;

create temp table _bulk_projects on commit drop as
select md5('siteline-bulk-v1/project/' || series.n)::uuid as id,series.n,
       (array['Cedar Heights','Harbor Point','Maple Grove','Riverstone','Summit Park',
              'Orchard Place','Lakeside','Northgate','Palm Crest','Westhaven'])[1+(series.n-1)%10]
       || ' ' || t.code || ' ' || lpad(series.n::text,3,'0') as name,
       t.id as project_type_id,
       case when series.n<=30 then 'active' when series.n<=35 then 'sent_to_opm'
            when series.n<=40 then 'spm_review' when series.n<=45 then 'draft' else 'archived' end as lifecycle,
       case when series.n<=30 then 1+(series.n-1)%7 when series.n>=46 then 7 else 1 end as stage_order,
       o.id as opm_id,l.id as lead_id,s.id as other_id,c.id as client_id,
       c.full_name as client_name,a.id as admin_id
from generate_series(1,50) series(n)
join _bulk_type_map m on m.n=series.n
join public.project_types t on t.id=m.type_id
join _bulk_users o on o.role='opm' and o.n=series.n
join _bulk_users l on l.role='spm' and l.n=2*series.n-1
join _bulk_users s on s.role='spm' and s.n=2*series.n
join _bulk_users c on c.role='client' and c.n=1+(series.n-1)%25
join _bulk_users a on a.role='admin' and a.n=series.n;

-- Compute project-wide progress from approved / initialized required items.
-- Active projects have all earlier stages and the first current-stage item approved.
create temp table _bulk_progress on commit drop as
select p.id, round(100.0*count(*) filter (
  where p.lifecycle='archived' or (p.lifecycle='active' and
    (s.sort_order<p.stage_order or (s.sort_order=p.stage_order and t.sort_order=1)))
) / nullif(count(*),0))::smallint as pct
from _bulk_projects p
cross join public.phase_checklist_templates t
join public.project_stages s on s.id=t.project_stage_id
where t.required group by p.id;

insert into public.projects
(id,name,project_type_id,client_name,floor_area_sqm,floor_count,target_start_date,
 current_stage_id,current_pct,crew_required,crew_assigned,lifecycle_status,
 suggested_opm_id,suggested_opm_match_score,headcount_suggested,headcount_tier,archived_at,created_by)
select p.id,p.name,p.project_type_id,p.client_name,1500+p.n*125,1+(p.n-1)%12,
       case when p.lifecycle in ('active','archived') then current_date-120 else current_date+30 end,
       s.id,g.pct,100,case when p.lifecycle='active' then 100 else 0 end,p.lifecycle,
       case when p.lifecycle<>'draft' then p.opm_id end,
       case when p.lifecycle<>'draft' then 90 end,100,'large',
       case when p.lifecycle='archived' then now()-interval '7 days' end,p.admin_id
from _bulk_projects p join public.project_stages s on s.sort_order=p.stage_order
join _bulk_progress g on g.id=p.id
on conflict (id) do nothing;

insert into public.user_client_project_links(user_id,project_id)
select client_id,id from _bulk_projects on conflict do nothing;

create temp table _bulk_team on commit drop as
select p.*,s.id as stage_id,
       case when s.code in ('Design','MEP Rough-in','Finishes') then p.other_id else p.lead_id end as spm_id,
       s.sort_order=1 as is_lead
from _bulk_projects p cross join public.project_stages s where p.lifecycle<>'draft';

-- Scope managers to the disciplines required by their assigned stages/types.
insert into public.user_discipline_scopes(user_id,discipline_id)
select distinct t.spm_id,d.discipline_id from _bulk_team t
join public.project_stage_discipline_links d on d.project_stage_id=t.stage_id
and d.project_type_id=t.project_type_id
on conflict do nothing;
insert into public.user_discipline_scopes(user_id,discipline_id)
select u.id,d.id from _bulk_users u join public.disciplines d
on d.code=case when u.n%2=1 then 'Civil' else 'Electrical' end
where u.role='spm' on conflict do nothing;

insert into public.project_phase_team
(project_id,project_stage_id,spm_user_id,is_lead,status,response_deadline_at,responded_at)
select t.id,t.stage_id,t.spm_id,t.is_lead,
       case when t.lifecycle in ('sent_to_opm','spm_review') then 'pending' else 'confirmed' end,
       case when t.lifecycle in ('sent_to_opm','spm_review') then now()+interval '3 days' end,
       case when t.lifecycle in ('active','archived') then now()-interval '130 days' end
from _bulk_team t on conflict (project_id,project_stage_id) do nothing;

insert into public.project_engineers(id,project_id,user_id,project_role_label,assigned_at)
select md5('siteline-bulk-v1/engineer/' || p.n || '/' || v.user_id)::uuid,p.id,v.user_id,
       v.label,now()-interval '130 days'
from _bulk_projects p cross join lateral (values
 (p.opm_id,'Office PM (oversight)'),(p.lead_id,'Lead Site PM'),(p.other_id,'Site PM')
) v(user_id,label) where p.lifecycle<>'draft' on conflict (id) do nothing;

insert into public.assignment_confirmations
(project_id,target_user_id,role_context,match_score,status,responded_at,created_by)
select p.id,v.user_id,v.role,90,
       case when p.lifecycle='sent_to_opm' or (p.lifecycle='spm_review' and v.role='spm')
            then 'pending' else 'accepted' end,
       case when p.lifecycle='sent_to_opm' or (p.lifecycle='spm_review' and v.role='spm')
            then null else now()-interval '130 days' end,p.admin_id
from _bulk_projects p cross join lateral (values
 (p.opm_id,'opm'),(p.lead_id,'spm'),(p.other_id,'spm')
) v(user_id,role) where p.lifecycle<>'draft' and not exists (
 select 1 from public.assignment_confirmations x
 where x.project_id=p.id and x.target_user_id=v.user_id and x.role_context=v.role
);

-- Real PDF bytes for downloadable synthetic licenses and documents.
create temp table _bulk_binary on commit drop as
select decode('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1MDAgMTYwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA5NiA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDEwMCBUZCAoU0lURUxJTkUgc3ludGhldGljIHRlc3QgZG9jdW1lbnQgLSBub3QgYSByZWFsIHBlcm1pdCBvciBsaWNlbnNlLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzODYgMDAwMDAgbiAKdHJhaWxlcgo8PCAvUm9vdCAxIDAgUiAvU2l6ZSA2ID4+CnN0YXJ0eHJlZgo0NTYKJSVFT0YK','base64') as pdf,
       decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64') as png;

insert into public.stored_files
(id,user_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
select md5('siteline-bulk-v1/license-file/' || u.id)::uuid,u.id,'license',
       'SYNTHETIC-' || upper(u.role) || '-' || lpad(u.n::text,3,'0') || '.pdf',
       'application/pdf',octet_length(b.pdf),b.pdf,
       (select id from _bulk_users where role='admin' and n=1)
from _bulk_users u cross join _bulk_binary b where u.role in ('opm','spm')
on conflict (id) do nothing;

insert into public.user_licenses(id,user_id,license_number,license_expiry,upload_file_ref,upload_status)
select md5('siteline-bulk-v1/license/' || u.id)::uuid,u.id,
       'TEST-' || upper(u.role) || '-' || lpad(u.n::text,5,'0'),current_date+730,
       'db://' || md5('siteline-bulk-v1/license-file/' || u.id)::uuid,'uploaded'
from _bulk_users u where u.role in ('opm','spm') on conflict (id) do nothing;

insert into public.user_certifications(user_id,certification_type_id)
select u.id,c.id from _bulk_users u join public.certification_types c
on c.code in ('DOLE-Safety',case when u.n%2=1 then 'PRC-Civil' else 'PRC-Electrical' end)
where u.role in ('opm','spm') on conflict do nothing;

-- 600 assigned, 380 available, 20 inactive workers per company.
create temp table _bulk_workers on commit drop as
select md5('siteline-bulk-v1/worker/' || c.n || '/' || series.n)::uuid as id,
       c.id as company_id,c.n as company_n,c.discipline_id,c.role_title,c.cert_code,series.n,
       case when series.n<=600 then p.id end as project_id
from _bulk_companies c cross join generate_series(1,1000) series(n)
left join _bulk_projects p on p.n=1+(series.n-1)/20 and series.n<=600;

insert into public.subcontractor_workers
(id,subcontractor_id,full_name,role_title,phone,status,discipline_id,
 availability_status,availability_note,current_project_id,current_project_until,created_by)
select w.id,w.company_id,
       (array['Antonio','Benito','Carlos','Danilo','Eduardo','Felipe','Gerardo','Hector',
              'Isidro','Jose','Luis','Manuel','Noel','Orlando','Pedro','Ricardo',
              'Samuel','Teodoro','Victor','Wilfredo'])[1+(w.n-1)%20] || ' ' ||
       (array['Abad','Bernardo','Castillo','Dizon','Espinosa','Francisco','Gonzales',
              'Herrera','Ilagan','Jacinto','Lazaro','Manalo','Natividad','Ortiz',
              'Pascual','Quizon','Rivera','Soriano','Tolentino','Valdez'])
         [1+((w.n-1)/20)%20] || ' (W' || w.company_n || '-' || lpad(w.n::text,4,'0') || ')',
       case when w.n%20=1 then 'Crew Foreman' else w.role_title end,
       '09' || lpad((800000000+w.company_n*10000+w.n)::text,9,'0'),
       case when w.n>980 then 'inactive' else 'active' end,w.discipline_id,
       case when w.n<=600 then 'assigned' when w.n<=980 then 'available' end,
       case when w.n<=600 then 'Assigned to a linked bulk test project'
            when w.n<=980 then 'Available for assignment testing' else 'Inactive test record' end,
       w.project_id,case when w.project_id is not null then (current_date+120)::text end,
       (select id from _bulk_users where role='admin' and n=w.company_n)
from _bulk_workers w on conflict (id) do nothing;

insert into public.worker_certifications(worker_id,certification_type_id)
select w.id,c.id from _bulk_workers w join public.certification_types c
on c.code='DOLE-Safety' or c.code=w.cert_code on conflict do nothing;

insert into public.worker_employment_history
(id,worker_id,external_project_name,role_title,period_start,period_end)
select md5('siteline-bulk-v1/employment/' || w.id)::uuid,w.id,
       'Synthetic prior assignment ' || lpad(w.company_n::text,2,'0') || '-' || (1+(w.n-1)%50),
       w.role_title,current_date-730,current_date-365
from _bulk_workers w on conflict (id) do nothing;

insert into public.project_subcontractor_assignments
(id,project_id,subcontractor_id,trade_id,worker_count,status,assigned_at,released_at,created_by)
select md5('siteline-bulk-v1/assignment/' || p.n || '/' || c.n)::uuid,
       p.id,c.id,c.trade_id,20,case when p.lifecycle='active' then 'active' else 'released' end,
       now()-interval '130 days',case when p.lifecycle='archived' then now()-interval '7 days' end,p.opm_id
from _bulk_projects p cross join _bulk_companies c
where p.lifecycle in ('active','archived') on conflict (id) do nothing;

-- Pending projects have candidates for testing allocation and matching screens.
insert into public.project_subcontractor_matches(project_id,subcontractor_id,match_score,cert_coverage_pct)
select p.id,c.id,80+(p.n+c.n)%20,100 from _bulk_projects p cross join _bulk_companies c
where p.lifecycle in ('sent_to_opm','spm_review') on conflict do nothing;

create temp table _bulk_docs on commit drop as
select md5('siteline-bulk-v1/document/' || p.n || '/' || d.code)::uuid as id,
       md5('siteline-bulk-v1/document-file/' || p.n || '/' || d.code)::uuid as file_id,
       p.id as project_id,p.opm_id,d.id as type_id,d.label
from _bulk_projects p cross join public.document_types d
where p.lifecycle in ('active','spm_review','archived') and d.is_required_for_intake;

insert into public.stored_files
(id,project_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
select d.file_id,d.project_id,'document','TEST - ' || d.label || '.pdf',
       'application/pdf',octet_length(b.pdf),b.pdf,d.opm_id
from _bulk_docs d cross join _bulk_binary b on conflict (id) do nothing;

-- Missing placeholders on draft / sent-to-OPM intakes support upload testing.
insert into public.project_documents
(id,project_id,document_type_id,status,file_ref,uploaded_by,uploaded_at)
select md5('siteline-bulk-v1/document/' || p.n || '/' || t.code)::uuid,p.id,t.id,
       case when d.id is null then 'not_uploaded' else 'uploaded' end,
       case when d.id is not null then 'db://' || d.file_id end,
       case when d.id is not null then p.opm_id end,
       case when d.id is not null then now()-interval '130 days' end
from _bulk_projects p cross join public.document_types t
left join _bulk_docs d on d.project_id=p.id and d.type_id=t.id
where t.is_required_for_intake on conflict (project_id,document_type_id) do nothing;

insert into public.stored_files
(id,project_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
select md5('siteline-bulk-v1/photo-file/' || p.n)::uuid,p.id,'photo',
       'TEST-site-' || lpad(p.n::text,3,'0') || '.png','image/png',
       octet_length(b.png),b.png,p.lead_id
from _bulk_projects p cross join _bulk_binary b where p.lifecycle in ('active','archived')
on conflict (id) do nothing;
insert into public.project_photos(id,project_id,file_ref,caption,taken_date,uploaded_by)
select md5('siteline-bulk-v1/photo/' || p.n)::uuid,p.id,
       'db://' || md5('siteline-bulk-v1/photo-file/' || p.n)::uuid,
       'Synthetic one-pixel photo for download testing',current_date-14,p.lead_id
from _bulk_projects p where p.lifecycle in ('active','archived') on conflict (id) do nothing;

-- Separate file records keep contract download IDs and purposes consistent.
insert into public.stored_files
(id,project_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
select md5('siteline-bulk-v1/contract-file/' || p.n || '/' || v.kind)::uuid,p.id,'contract',
       'TEST-' || v.kind || '.pdf','application/pdf',octet_length(b.pdf),b.pdf,p.opm_id
from _bulk_projects p cross join (values ('client_contract'),('client_subcon_agreement')) v(kind)
cross join _bulk_binary b where p.lifecycle in ('active','archived') on conflict (id) do nothing;
insert into public.contracts
(id,project_id,contract_type,subcontractor_name,trade_scope,file_ref,uploaded_by)
select md5('siteline-bulk-v1/contract/' || p.n || '/' || v.kind)::uuid,p.id,v.kind,
       case when v.kind='client_subcon_agreement' then c.company_name end,
       case when v.kind='client_subcon_agreement' then 'Structural / Rebar' end,
       'db://' || md5('siteline-bulk-v1/contract-file/' || p.n || '/' || v.kind)::uuid,p.opm_id
from _bulk_projects p cross join (values ('client_contract'),('client_subcon_agreement')) v(kind)
join _bulk_companies c on c.n=1
where p.lifecycle in ('active','archived') on conflict (id) do nothing;

-- Initialize every stage, so project-wide progress can be derived from evidence.
insert into public.project_phase_checklists(project_id,project_stage_id)
select p.id,s.id from _bulk_projects p cross join public.project_stages s
where p.lifecycle in ('active','archived') on conflict do nothing;
insert into public.project_phase_checklist_items
(project_id,project_stage_id,code,title,required,sort_order)
select p.id,t.project_stage_id,t.code,t.title,t.required,t.sort_order
from _bulk_projects p cross join public.phase_checklist_templates t
where p.lifecycle in ('active','archived')
on conflict (project_id,project_stage_id,code) do nothing;

create temp table _bulk_evidence on commit drop as
select i.*,p.n,t.spm_id,p.opm_id,
       md5('siteline-bulk-v1/evidence-file/' || p.n || '/' || i.project_stage_id || '/' || i.code)::uuid as file_id,
       case when p.lifecycle='archived' or s.sort_order<p.stage_order
                 or (s.sort_order=p.stage_order and i.sort_order=1) then 'approved'
            when p.n=6 then 'rejected' else 'pending' end as evidence_status
from _bulk_projects p
join public.project_phase_checklist_items i on i.project_id=p.id
join public.project_stages s on s.id=i.project_stage_id
join _bulk_team t on t.id=p.id and t.stage_id=i.project_stage_id
where p.lifecycle='archived' or (p.lifecycle='active' and (
  s.sort_order<p.stage_order or (s.sort_order=p.stage_order and
    (i.sort_order=1 or (p.n<=6 and i.sort_order=2)))));

insert into public.project_phase_files
(id,project_id,project_stage_id,original_name,content_type,byte_size,content,uploaded_by)
select e.file_id,e.project_id,e.project_stage_id,'TEST-evidence-' || e.code || '.pdf',
       'application/pdf',octet_length(b.pdf),b.pdf,e.spm_id
from _bulk_evidence e cross join _bulk_binary b on conflict (id) do nothing;
insert into public.project_phase_updates
(project_id,selected_stage_id,prior_stage_id,prior_pct,note,submitted_by,status)
select p.id,s.id,s.id,g.pct,'SITELINE bulk v1: awaiting Office PM review',t.spm_id,'pending'
from _bulk_projects p join public.project_stages s on s.sort_order=p.stage_order
join _bulk_team t on t.id=p.id and t.stage_id=s.id
join _bulk_progress g on g.id=p.id
where p.n between 1 and 5 and not exists (
 select 1 from public.project_phase_updates u where u.project_id=p.id
);

insert into public.project_phase_evidence
(project_id,project_stage_id,checklist_item_id,file_id,status,submitted_by,submitted_at,
 reviewed_by,reviewed_at,review_note,submission_note,phase_update_id)
select e.project_id,e.project_stage_id,e.id,e.file_id,e.evidence_status,e.spm_id,
       now()-interval '15 days',
       case when e.evidence_status<>'pending' then e.opm_id end,
       case when e.evidence_status<>'pending' then now()-interval '14 days' end,
       case e.evidence_status when 'approved' then 'Synthetic approved evidence'
            when 'rejected' then 'Synthetic rejection: submit revised evidence' end,
       'SITELINE bulk test evidence',
       case when e.evidence_status='pending' then (
         select u.id from public.project_phase_updates u
         where u.project_id=e.project_id and u.note='SITELINE bulk v1: awaiting Office PM review'
       ) end
from _bulk_evidence e where not exists (
 select 1 from public.project_phase_evidence x where x.checklist_item_id=e.id and x.file_id=e.file_id
);

insert into public.project_progress_history
(project_id,project_stage_id,pct,note,recorded_by,recorded_at,entry_type)
select p.id,s.id,g.pct,'SITELINE bulk v1: checklist-derived progress',p.opm_id,
       now()-interval '14 days','update'
from _bulk_projects p join public.project_stages s on s.sort_order=p.stage_order
join _bulk_progress g on g.id=p.id where p.lifecycle in ('active','archived') and not exists (
 select 1 from public.project_progress_history h
 where h.project_id=p.id and h.note='SITELINE bulk v1: checklist-derived progress'
);

-- Five pending phase submissions and five pending progress reviews.
insert into public.project_phase_submission_files(update_id,file_id)
select u.id,e.file_id from public.project_phase_updates u join _bulk_evidence e
on e.project_id=u.project_id and e.evidence_status='pending'
where u.note='SITELINE bulk v1: awaiting Office PM review' on conflict do nothing;
insert into public.pending_progress_updates
(project_id,prior_stage_id,prior_pct,requested_stage_id,requested_pct,note,submitted_by,
 auto_approve_deadline_at,status)
select p.id,s.id,g.pct,s.id,least(99,g.pct+4),
       'SITELINE bulk v1: progress review',t.spm_id,now()+interval '3 days','pending'
from _bulk_projects p join public.project_stages s on s.sort_order=p.stage_order
join _bulk_team t on t.id=p.id and t.stage_id=s.id
join _bulk_progress g on g.id=p.id where p.n between 7 and 11 and not exists (
 select 1 from public.pending_progress_updates u where u.project_id=p.id
);

insert into public.project_notes(id,project_id,author_id,note_text)
select md5('siteline-bulk-v1/note/' || p.n)::uuid,p.id,p.opm_id,
       'Synthetic scenario: ' || p.lifecycle || '. Admin: admin' || lpad(p.n::text,3,'0') ||
       ', OPM: opm' || lpad(p.n::text,3,'0') || ', SPMs: spm' ||
       lpad((2*p.n-1)::text,3,'0') || ' and spm' || lpad((2*p.n)::text,3,'0') || '.'
from _bulk_projects p where p.lifecycle<>'draft' on conflict (id) do nothing;

-- Let serial IDs allocate normally; no fixed activity/confirmation IDs or sequence resets.
insert into public.activity_log
(activity_type_id,title,detail,actor_user_id,target_role_id,related_project_id,anchor_reference)
select a.id,'Bulk test project ready',p.name || ' / ' || p.lifecycle,p.admin_id,r.id,p.id,'Active sites'
from _bulk_projects p join public.activity_types a on a.code='notice'
join public.roles r on r.code='opm'
where p.lifecycle<>'draft' and not exists (
 select 1 from public.activity_log x where x.related_project_id=p.id and x.title='Bulk test project ready'
);
insert into public.notification_recipients(activity_log_id,recipient_user_id,is_read)
select a.id,v.user_id,false from _bulk_projects p
join public.activity_log a on a.related_project_id=p.id and a.title='Bulk test project ready'
cross join lateral (values (p.admin_id),(p.opm_id),(p.lead_id),(p.other_id)) v(user_id)
on conflict do nothing;

end
$siteline_bulk$;

-- Verification queries use saved rows, not temporary helper tables.
-- These can also be run separately after the import.
select r.code as role,count(*) as accounts
from public.users u join public.roles r on r.id=u.role_id
where exists (
  select 1 from (values ('admin',50),('opm',120),('spm',120),('client',25)) v(role,total)
  cross join lateral generate_series(1,v.total) series(n)
  where u.id=md5('siteline-bulk-v1/user/' || v.role || '/' || series.n)::uuid
) group by r.code order by r.code;
select c.company_name,count(w.id) as workers,
       count(w.id) filter (where w.availability_status='assigned') as assigned,
       count(w.id) filter (where w.availability_status='available') as available,
       count(w.id) filter (where w.status='inactive') as inactive
from public.subcontractors c
join generate_series(1,5) series(n) on c.id=md5('siteline-bulk-v1/company/' || series.n)::uuid
join public.subcontractor_workers w on w.subcontractor_id=c.id
group by series.n,c.company_name order by series.n;
select series.n,p.name,p.lifecycle_status,o.email as opm_email,
       l.email as lead_spm_email,c.email as client_email
from public.projects p
join generate_series(1,50) series(n) on p.id=md5('siteline-bulk-v1/project/' || series.n)::uuid
left join public.users o on o.id=p.suggested_opm_id
left join public.users l on l.id=md5('siteline-bulk-v1/user/spm/' || (2*series.n-1))::uuid
left join public.users c on c.id=md5('siteline-bulk-v1/user/client/' || (1+(series.n-1)%25))::uuid
order by series.n;

-- License grace period: 30 days (Administrators can change it in Settings).
do $$ begin
  if to_regclass('public.workspace_settings') is not null then
    update public.workspace_settings set rules = rules || '{"grace":30}'::jsonb where singleton;
  end if;
end $$;
