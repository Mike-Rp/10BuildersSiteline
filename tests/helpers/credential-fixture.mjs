// Explicit qualification evidence for disposable test fixtures only. Never used by application code.
import fs from "node:fs"
export async function installCredentialFixture(db) {
  await db.exec(
    fs.readFileSync(
      new URL(
        "../../Thesis-Backend/migrations/015-engineer-credentials.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  )
  const admin = (
    await db.query(
      "select u.id from users u join roles r on r.id=u.role_id where r.code='admin' order by u.id limit 1",
    )
  ).rows[0]?.id
  if (!admin) return
  // Legacy lifecycle fixtures explicitly scope ambiguous work packages to Civil coordination. Production mappings are not changed.
  await db.exec(
    "insert into project_stage_discipline_links(project_type_id,project_stage_id,discipline_id) select distinct l.project_type_id,l.project_stage_id,d.id from project_stage_discipline_links l cross join disciplines d where d.code='Civil' and not exists(select 1 from project_stage_discipline_links x join disciplines known on known.id=x.discipline_id where x.project_type_id=l.project_type_id and x.project_stage_id=l.project_stage_id and known.code in ('Civil','Structural','Geotechnical','Electrical','Mechanical','Plumbing','Interior/Finishes','Landscape')) on conflict do nothing",
  )
  await db.query(
    "update user_licenses set profession=coalesce(profession,'Civil Engineer'),verification_status='verified',verified_by=$1,verified_at=coalesce(verified_at,now())",
    [admin],
  )
  // Fixture records deliberately have reviewed credentials supporting their declared test specializations.
  const aliases = {
    Civil: ["Civil", "Civil Engineer"],
    Structural: ["Structural", "Civil Engineer"],
    Geotechnical: ["Geotechnical", "Civil Engineer"],
    Mechanical: ["Mechanical", "Mechanical Engineer"],
    Electrical: ["Electrical", "Electrical Engineer"],
    Plumbing: ["Sanitary", "Sanitary Engineer"],
  }
  const rows = (
    await db.query(
      "select s.user_id,d.code from user_discipline_scopes s join disciplines d on d.id=s.discipline_id",
    )
  ).rows
  for (const row of rows) {
    const pair = aliases[row.code]
    if (!pair) continue
    await db.query(
      "insert into engineer_specializations(user_id,specialization,recorded_by) values($1,$2,$3) on conflict do nothing",
      [row.user_id, pair[0], admin],
    )
    await db.query(
      `insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,created_by,profession,verification_status,verified_by,verified_at)
 select $1,l.license_number,l.license_expiry,l.upload_status,l.upload_file_ref,$3,$2,'verified',$3,now() from user_licenses l where l.user_id=$1 and l.superseded_at is null and not exists(select 1 from user_licenses x where x.user_id=$1 and x.profession=$2 and x.superseded_at is null) order by l.created_at limit 1`,
      [row.user_id, pair[1], admin],
    )
  }
  // General lifecycle suites use deliberately dual-qualified Site PM fixtures.
  const staff = (
    await db.query(
      "select u.id from users u join roles r on r.id=u.role_id where r.code='spm'",
    )
  ).rows
  for (const user of staff) {
    for (const tag of ["Civil", "Structural", "Electrical"])
      await db.query(
        "insert into engineer_specializations(user_id,specialization,recorded_by) values($1,$2,$3) on conflict do nothing",
        [user.id, tag, admin],
      )
    await db.query(
      `insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,created_by,profession,verification_status,verified_by,verified_at)
    select $1,l.license_number,l.license_expiry,l.upload_status,l.upload_file_ref,$2,'Electrical Engineer','verified',$2,now() from user_licenses l where l.user_id=$1 and l.superseded_at is null and not exists(select 1 from user_licenses x where x.user_id=$1 and x.profession='Electrical Engineer' and x.superseded_at is null) order by l.created_at limit 1`,
      [user.id, admin],
    )
  }
}
