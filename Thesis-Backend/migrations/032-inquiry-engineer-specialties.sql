-- Add detailed qualification codes without changing existing phase assignments
-- or the broad discipline links used by legacy projects and other workflows.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siteline-inquiry-engineer-specialties-v1'));

CREATE TABLE IF NOT EXISTS public.inquiry_engineer_specialties (
  specialty text PRIMARY KEY,
  profession text NOT NULL
);
REVOKE ALL ON public.inquiry_engineer_specialties FROM PUBLIC;

INSERT INTO public.inquiry_engineer_specialties (specialty, profession) VALUES
    ('Structural Engineering', 'Civil Engineer'),
    ('Geotechnical Engineering', 'Civil Engineer'),
    ('Foundation Engineering', 'Civil Engineer'),
    ('Construction Engineering', 'Civil Engineer'),
    ('Fire Protection Engineering (Mechanical Systems)', 'Mechanical Engineer'),
    ('Mechanical Building Services Engineering', 'Mechanical Engineer'),
    ('Electrical Design Engineering', 'Electrical Engineer'),
    ('Lighting Engineering', 'Electrical Engineer'),
    ('Electrical Installation Engineering', 'Electrical Engineer'),
    ('Fire Detection and Alarm Systems Engineering', 'Electronics Engineer'),
    ('Plumbing Systems Engineering', 'Sanitary Engineer'),
    ('Construction Surveying', 'Geodetic Engineer')
ON CONFLICT (specialty) DO NOTHING;

-- Allocate IDs only to new codes while holding the catalog against concurrent writes.
LOCK TABLE public.disciplines IN SHARE ROW EXCLUSIVE MODE;
DROP VIEW public.engineer_qualified_scopes;
ALTER TABLE public.disciplines ALTER COLUMN code TYPE varchar(120);
INSERT INTO public.disciplines (id, code)
SELECT (base.last_id + row_number() OVER (ORDER BY s.specialty))::smallint, s.specialty
FROM public.inquiry_engineer_specialties s
CROSS JOIN (SELECT coalesce(max(id), 0) AS last_id FROM public.disciplines) base
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines d WHERE d.code = s.specialty);

CREATE OR REPLACE VIEW public.engineer_qualified_scopes AS
WITH mapping(requirement, specialization, profession, legacy) AS (
  VALUES
    ('Civil','Civil','Civil Engineer',true), ('Structural','Structural','Civil Engineer',true),
    ('Geotechnical','Geotechnical','Civil Engineer',true), ('Mechanical','Mechanical','Mechanical Engineer',true),
    ('Electrical','Electrical','Electrical Engineer',true), ('Plumbing','Sanitary','Sanitary Engineer',true),
    ('Interior/Finishes','Civil','Civil Engineer',true), ('Landscape','Civil','Civil Engineer',true)
  UNION ALL
  SELECT specialty, specialty, profession, false FROM public.inquiry_engineer_specialties
)
SELECT DISTINCT l.user_id, d.id AS discipline_id
FROM public.user_licenses l
JOIN mapping ON mapping.profession=l.profession
JOIN public.disciplines d ON d.code=mapping.requirement
WHERE l.superseded_at IS NULL AND l.verification_status='verified' AND l.verified_by IS NOT NULL AND l.verified_at IS NOT NULL
 AND l.revoked_at IS NULL AND NOT l.correction_required
 AND l.upload_status='uploaded' AND l.upload_file_ref IS NOT NULL
 AND l.license_number ~ '^[0-9]{7}$'
 AND l.license_expiry > (current_timestamp AT TIME ZONE 'Asia/Manila')::date + 30
 AND (mapping.specialization=ANY(l.specializations) OR (mapping.legacy AND l.specializations IS NULL AND EXISTS(
  SELECT 1 FROM public.engineer_specializations e WHERE e.user_id=l.user_id AND e.specialization=mapping.specialization)));
REVOKE ALL ON public.engineer_qualified_scopes FROM PUBLIC;
COMMIT;
