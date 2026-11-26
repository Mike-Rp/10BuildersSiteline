import { readFile, writeFile, mkdir } from "node:fs/promises";
import { get, close } from "../src/common/pool-manager.js";
import { SPECIALTIES_BY_PROFESSION } from "../src/domain/engineer-credentials.js";
import { LICENSE_ELIGIBILITY_SQL } from "../src/common/utilities/license-eligibility.utility.js";

const apply = process.argv.includes("--apply");
const client = await (await get()).connect();
const snapshot = async () => (await client.query(`SELECT u.id,u.full_name,u.status,u.is_deleted,
 (${LICENSE_ELIGIBILITY_SQL}) AS eligible,
 ARRAY(SELECT d.code FROM engineer_qualified_scopes q JOIN disciplines d ON d.id=q.discipline_id WHERE q.user_id=u.id ORDER BY d.code) AS tags
 FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='spm' ORDER BY u.full_name`)).rows;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  const before = await snapshot();
  const view = (await client.query("SELECT pg_get_viewdef('public.engineer_qualified_scopes'::regclass,true) AS definition")).rows[0].definition;
  const disciplines = (await client.query("SELECT * FROM disciplines ORDER BY id")).rows;
  const installed = (await client.query("SELECT to_regclass('public.inquiry_engineer_specialties') IS NOT NULL AS ready")).rows[0].ready;
  const catalog = installed ? (await client.query("SELECT * FROM inquiry_engineer_specialties ORDER BY specialty")).rows : null;
  // Save enough to review the prior configuration before committing any change.
  const backup = new URL(`../audit-backups/engineer-specialties-${Date.now()}.json`, import.meta.url);
  if (apply) {
    await mkdir(new URL("../audit-backups/", import.meta.url), { recursive: true });
    await writeFile(backup, JSON.stringify({ view, disciplines, catalog, before }, null, 2));
  }
  const sql = (await readFile(new URL("../migrations/032-inquiry-engineer-specialties.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*$/mi, "").replace(/^COMMIT;\s*$/mi, "");
  await client.query(sql);
  // Recognize the entire existing profession-specific catalog, using only
  // specialties actually present on verified eligible license records.
  for (const [profession, specialties] of Object.entries(SPECIALTIES_BY_PROFESSION)) {
    await client.query(`INSERT INTO inquiry_engineer_specialties(specialty,profession)
      SELECT unnest($1::text[]),$2 ON CONFLICT (specialty) DO NOTHING`, [specialties, profession]);
  }
  await client.query(`INSERT INTO disciplines(id,code)
    SELECT (base.last_id+row_number() OVER (ORDER BY s.specialty))::smallint,s.specialty
    FROM inquiry_engineer_specialties s CROSS JOIN (SELECT coalesce(max(id),0) AS last_id FROM disciplines) base
    WHERE NOT EXISTS(SELECT 1 FROM disciplines d WHERE d.code=s.specialty)`);
  const after = await snapshot();
  const active = p => p.status === "active" && !p.is_deleted;
  const originallyMissing = before.filter(p => active(p) && !p.tags.length);
  const missingIds = new Set(originallyMissing.map(p => p.id));
  const recovered = after.filter(p => missingIds.has(p.id) && p.tags.length);
  const remaining = after.filter(p => missingIds.has(p.id) && !p.tags.length);
  for (const old of before) {
    const current = after.find(p => p.id === old.id);
    if (old.tags.some(tag => !current.tags.includes(tag))) throw new Error(`Existing qualification lost: ${old.full_name}`);
  }
  const report = { applied: apply, previously_missing: originallyMissing.length,
    recognized: recovered.length, active_eligible_before: before.filter(p => active(p) && p.eligible).length,
    active_eligible_after: after.filter(p => active(p) && p.eligible).length,
    recovered: recovered.map(p => ({ name:p.full_name,tags:p.tags,eligible:p.eligible })),
    remaining: remaining.map(p => ({name:p.full_name,id:p.id})) };
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  if (apply) await writeFile(new URL("../engineer-specialty-recognition.json", import.meta.url), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (apply) console.log(`Prior configuration saved: ${backup.pathname}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await close();
}
