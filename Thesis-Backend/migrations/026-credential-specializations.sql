-- Null means a historical credential whose tag association has not been reviewed.
-- Preserve existing account-level records; do not infer credential associations.
BEGIN;
ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS specializations text[];
ALTER TABLE license_renewal_requests ADD COLUMN IF NOT EXISTS specializations text[];
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='license_specialization_limit') THEN
  ALTER TABLE user_licenses ADD CONSTRAINT license_specialization_limit CHECK(specializations IS NULL OR (cardinality(specializations)<=3 AND array_position(specializations,NULL) IS NULL));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='submission_specialization_limit') THEN
  ALTER TABLE license_renewal_requests ADD CONSTRAINT submission_specialization_limit CHECK(specializations IS NULL OR (cardinality(specializations)<=3 AND array_position(specializations,NULL) IS NULL));
 END IF;
END $$;
CREATE OR REPLACE VIEW engineer_qualified_scopes AS
SELECT DISTINCT l.user_id,d.id AS discipline_id
FROM user_licenses l
JOIN (VALUES ('Civil','Civil','Civil Engineer'),('Structural','Structural','Civil Engineer'),('Geotechnical','Geotechnical','Civil Engineer'),('Mechanical','Mechanical','Mechanical Engineer'),('Electrical','Electrical','Electrical Engineer'),('Plumbing','Sanitary','Sanitary Engineer'),('Interior/Finishes','Civil','Civil Engineer'),('Landscape','Civil','Civil Engineer')) AS mapping(requirement,specialization,profession)
 ON mapping.profession=l.profession
JOIN disciplines d ON d.code=mapping.requirement
WHERE l.superseded_at IS NULL AND l.verification_status='verified' AND l.verified_by IS NOT NULL AND l.verified_at IS NOT NULL
 AND l.upload_status='uploaded' AND l.upload_file_ref IS NOT NULL
 AND length(l.license_number) BETWEEN 1 AND 120 AND l.license_number=btrim(l.license_number) AND l.license_number !~ '[[:cntrl:]]'
 AND l.license_expiry > (current_timestamp AT TIME ZONE 'Asia/Manila')::date + 30
 AND (mapping.specialization=ANY(l.specializations) OR (l.specializations IS NULL AND EXISTS(
  SELECT 1 FROM engineer_specializations e WHERE e.user_id=l.user_id AND e.specialization=mapping.specialization)));
REVOKE ALL ON engineer_qualified_scopes FROM PUBLIC;
COMMIT;
