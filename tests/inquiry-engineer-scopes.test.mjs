import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { PROJECT_PHASE_DEFINITIONS } from "../src/model.ts";
import { qualifyingSpecializations } from "../Thesis-Backend/src/domain/engineer-credentials.js";
import { allocatePhaseCoverage } from "../Thesis-Backend/src/domain/engineer-phase-coverage.js";
import { configuredInquiryScopes, projectEngineerScopesSql } from "../Thesis-Backend/src/services/projects/phase-engineer-scopes.utility.js";
import { validateScopedQualifications } from "../Thesis-Backend/src/services/projects/type-phases.utility.js";
import { prepareInquiryLead } from "../Thesis-Backend/src/services/projects/inquiry-staffing.js";
import { getSpm } from "../Thesis-Backend/src/services/projects/recommend.controller.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("detailed inquiry requirements match verified specialties and retain legacy assignments", { timeout: 60000 }, async t => {
  const pg = new PGlite({ extensions: { citext } });
  t.after(() => pg.close());
  const db = { query: async (sql, params) => {
    const result = await pg.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  } };
  await pg.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;");
  await pg.exec(read("supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m, ""));
  const migrate = name => pg.exec(read(`Thesis-Backend/migrations/${name}.sql`));
  for (const name of ["001-phase-checklists", "002-phase-update-confirmation", "003-react-integration", "004-verified-activity-progress", "009-engineer-license-workflow"])
    await migrate(name);
  await pg.exec(read("supabase/seed/dummy-data.sql"));
  for (const name of ["004-project-type-workflows", "014-mixed-use-project-scope", "015-engineer-credentials", "019-engineer-phase-commitments",
    "020-engineer-phase-responsibilities", "025-independent-spm-workspaces", "026-credential-specializations", "027-workflow-reliability", "031-project-inquiries"])
    await migrate(name);

  const before = (await db.query("select * from project_phase_team order by id")).rows;
  assert.equal(await configuredInquiryScopes(db, "Residential", ["Foundation"]), undefined);
  await migrate("032-inquiry-engineer-specialties");
  await migrate("032-inquiry-engineer-specialties");
  assert.deepEqual((await db.query("select * from project_phase_team order by id")).rows, before);

  const catalog = new Set((await db.query("select specialty from inquiry_engineer_specialties")).rows.map(row => row.specialty));
  for (const [type, definitions] of Object.entries(PROJECT_PHASE_DEFINITIONS)) {
    const phases = definitions.map(phase => phase.name);
    const scopes = await configuredInquiryScopes(db, type, phases);
    assert.deepEqual(Object.keys(scopes), phases);
    assert.ok(Object.values(scopes).flat().every(tag => catalog.has(tag)));
  }
  const { rows: [site] } = await db.query("select u.id from users u join roles r on r.id=u.role_id where r.code='spm' and u.status='active' limit 1");
  const { rows: [admin] } = await db.query("select u.id from users u join roles r on r.id=u.role_id where r.code='admin' limit 1");
  const { rows: [type] } = await db.query("select id from project_types where code='Residential'");
  await db.query("update user_licenses set superseded_at=now() where user_id=$1", [site.id]);
  const confirmed = ["Foundation Engineering", "Structural Engineering", "Civil"];
  const { rows: [credential] } = await db.query(`insert into user_licenses
    (user_id,license_number,license_expiry,upload_status,upload_file_ref,profession,verification_status,verified_by,verified_at,specializations)
    values($1,'0000123',current_date+365,'uploaded','test-proof','Civil Engineer','verified',$2,now(),$3)
    returning *,license_expiry::text as license_expiry`, [site.id, admin.id, confirmed]);
  const today = (await db.query("select current_date::text as day")).rows[0].day;
  assert.deepEqual(qualifyingSpecializations([credential], confirmed, today), confirmed);
  const qualified = (await db.query(`select d.code from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id
    where q.user_id=$1 order by d.code`, [site.id])).rows.map(row => row.code);
  assert.deepEqual(qualified, ["Civil", "Foundation Engineering", "Interior/Finishes", "Landscape", "Structural Engineering"]);
  const requiredScopes = await configuredInquiryScopes(db, "Residential", ["Foundation"]);
  await pg.exec("update projects set lifecycle_status='archived'");
  const candidates = {};
  const schedule = { start: "2092-01-01", end: "2092-02-01" };
  const [suggested] = await getSpm("Residential", ["Foundation"], candidates, schedule, {}, { db, requiredScopes });
  assert.deepEqual(suggested.required_specializations, requiredScopes.Foundation);
  assert.deepEqual(suggested.missing_specializations, ["Geotechnical Engineering"]);
  assert.deepEqual(candidates.Foundation.find(candidate => candidate.id === site.id).qualifiedTags,
    ["Foundation Engineering", "Structural Engineering"]);
  const recommendation = allocatePhaseCoverage(requiredScopes.Foundation, [{ id: site.id, qualifiedTags: qualified }]);
  assert.deepEqual(recommendation.missing, ["Geotechnical Engineering"]);
  const team = [{ stage: "Foundation", user_id: site.id, engineers: [{ user_id: site.id, assigned_disciplines: recommendation.engineers[0].tags }] }];
  const options = { requireCoverage: true, requiredScopes, lock: false, existingCommitments: [] };
  await validateScopedQualifications(db, type.id, team, options);
  const lead = await prepareInquiryLead(db, team, ["Foundation"], type.id, "Residential", schedule, null, requiredScopes);
  assert.equal(lead.id, site.id);
  const invalid = structuredClone(team);
  invalid[0].engineers[0].assigned_disciplines = ["Foundation Engineering", "Geotechnical Engineering"];
  await assert.rejects(validateScopedQualifications(db, type.id, invalid, options), { status: 409 });

  const { rows: [project] } = await db.query("select id from projects where project_type_id=$1 limit 1", [type.id]);
  const query = `select ${projectEngineerScopesSql("p", "s.id", "s.code")} as scopes
    from projects p cross join project_stages s where p.id=$1 and s.code='Foundation'`;
  assert.deepEqual((await db.query(query, [project.id])).rows[0].scopes, ["Geotechnical", "Structural"]);
  await db.query("update projects set phase_scope=$2 where id=$1", [project.id, { phases: ["Foundation"], engineerScopes: requiredScopes }]);
  assert.deepEqual((await db.query(query, [project.id])).rows[0].scopes, requiredScopes.Foundation);
  await validateScopedQualifications(db, type.id, team, { ...options, requiredScopes: undefined, projectId: project.id });

  await db.query("update projects set lifecycle_status='spm_review',target_start_date=$2,target_end_date=$3 where id=$1",
    [project.id, schedule.start, schedule.end]);
  await db.query(`insert into project_engineers(project_id,user_id,project_role_label,created_by,updated_by)
    values($1,$2,'Site PM',$3,$3)`, [project.id, site.id, admin.id]);
  const blockedCandidates = {};
  await getSpm("Residential", ["Foundation"], candidates, schedule, {}, { db, requiredScopes, blockedCandidates });
  assert.ok(!candidates.Foundation.some(candidate => candidate.id === site.id));
  assert.equal(blockedCandidates.Foundation.find(candidate => candidate.id === site.id)?.reason, "schedule");
});
