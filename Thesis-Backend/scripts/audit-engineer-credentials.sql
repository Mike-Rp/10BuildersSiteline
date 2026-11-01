-- Read-only. Apply migration 015 before using this audit.
begin read only;
select l.id,l.user_id,u.full_name,l.profession,l.verification_status,l.license_expiry,
 case when l.profession is null then 'Profession needs review'
 when l.verification_status<>'verified' or l.verified_by is null or l.verified_at is null then 'Verification evidence needs review'
 when length(l.license_number) not between 1 and 120 or l.license_number<>btrim(l.license_number) or l.license_number ~ '[[:cntrl:]]' then 'Number requires review'
 when l.license_expiry <= (current_timestamp at time zone 'Asia/Manila')::date+30 then 'Expired or inside assignment notice window'
 else 'Review supporting document' end as review_reason
from user_licenses l join users u on u.id=l.user_id where l.superseded_at is null and
(l.profession is null or l.verification_status<>'verified' or l.verified_by is null or l.verified_at is null or l.upload_file_ref is null or l.upload_status<>'uploaded'
 or length(l.license_number) not between 1 and 120 or l.license_number<>btrim(l.license_number) or l.license_number ~ '[[:cntrl:]]' or l.license_expiry <= (current_timestamp at time zone 'Asia/Manila')::date+30);
select p.name,t.id as assignment_id,t.spm_user_id,s.code as phase
from project_phase_team t join projects p on p.id=t.project_id join project_stages s on s.id=t.project_stage_id
where p.lifecycle_status='active' and not coalesce(p.is_deleted,false) and not exists(
 select 1 from engineer_qualified_scopes q join project_stage_discipline_links r on r.discipline_id=q.discipline_id
 where q.user_id=t.spm_user_id and r.project_type_id=p.project_type_id and r.project_stage_id=t.project_stage_id);
rollback;
