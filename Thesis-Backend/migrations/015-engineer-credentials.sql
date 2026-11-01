-- Apply after 014. No inference of profession from old tags.
begin;
alter table user_licenses add column if not exists profession text;
alter table user_licenses add column if not exists verification_status text not null default 'needs_review' check(verification_status in ('needs_review','verified'));
alter table user_licenses add column if not exists verified_by uuid references users(id);
alter table user_licenses add column if not exists verified_at timestamptz;
alter table user_licenses add column if not exists verification_note text;
alter table license_renewal_requests add column if not exists profession text;
alter table license_renewal_requests add column if not exists replaces_license_id uuid references user_licenses(id);
update user_licenses l set verification_status='verified',verified_by=q.reviewed_by,verified_at=q.reviewed_at,verification_note=q.review_note
 from license_renewal_requests q where q.resulting_license_id=l.id and q.status='verified' and q.reviewed_by is not null and q.reviewed_at is not null and l.verified_at is null;
drop index if exists one_open_license_renewal;
create unique index if not exists one_open_profession_renewal on license_renewal_requests(user_id,coalesce(profession,'')) where status='under_review';
create table if not exists engineer_specializations(
 user_id uuid not null references users(id),specialization text not null,recorded_by uuid not null references users(id),recorded_at timestamptz not null default now(),primary key(user_id,specialization));
create table if not exists engineer_specialization_history(
 id bigserial primary key,user_id uuid not null references users(id),specializations jsonb not null,recorded_by uuid not null references users(id),recorded_at timestamptz not null default now());
create index if not exists credential_profession_lookup on user_licenses(user_id,profession) where superseded_at is null;
-- This mapping means eligible site coordination, not authority over every system in a phase.
create or replace view engineer_qualified_scopes as
select distinct e.user_id,d.id as discipline_id
from engineer_specializations e
join (values ('Civil','Civil','Civil Engineer'),('Structural','Structural','Civil Engineer'),('Geotechnical','Geotechnical','Civil Engineer'),('Mechanical','Mechanical','Mechanical Engineer'),('Electrical','Electrical','Electrical Engineer'),('Plumbing','Sanitary','Sanitary Engineer'),('Interior/Finishes','Civil','Civil Engineer'),('Landscape','Civil','Civil Engineer')) as mapping(requirement,specialization,profession) on mapping.specialization=e.specialization
join disciplines d on d.code=mapping.requirement
join user_licenses l on l.user_id=e.user_id and l.profession=mapping.profession
where l.superseded_at is null and l.verification_status='verified' and l.verified_by is not null and l.verified_at is not null
 and l.upload_status='uploaded' and l.upload_file_ref is not null and length(l.license_number) between 1 and 120
 and l.license_number=btrim(l.license_number) and l.license_number !~ '[[:cntrl:]]'
 and l.license_expiry > (current_timestamp at time zone 'Asia/Manila')::date + 30;
alter table engineer_specializations enable row level security;
alter table engineer_specialization_history enable row level security;
revoke all on engineer_specializations,engineer_specialization_history,engineer_qualified_scopes from public;
commit;
