import { mkdir, writeFile } from "node:fs/promises";
import { get, close } from "../src/common/pool-manager.js";

const client = await (await get()).connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("LOCK TABLE project_inquiries IN SHARE ROW EXCLUSIVE MODE");
  await client.query("LOCK TABLE projects IN SHARE MODE");
  const fingerprint = async () => (await client.query(`SELECT count(*)::int AS count,
    md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY id),'')) AS checksum FROM projects p`)).rows[0];
  const before = await fingerprint();
  const targets = (await client.query("SELECT * FROM project_inquiries WHERE project_id IS NULL AND status <> 'converted' ORDER BY id FOR UPDATE")).rows;
  const preserved = (await client.query("SELECT count(*)::int AS count FROM project_inquiries WHERE project_id IS NOT NULL OR status='converted'")).rows[0].count;
  await mkdir(new URL("../audit-backups/", import.meta.url), { recursive: true });
  const backup = new URL(`../audit-backups/unconverted-inquiries-${Date.now()}.json`, import.meta.url);
  await writeFile(backup, JSON.stringify({ saved_at:new Date().toISOString(), purpose:"Recovery copy before user-requested deletion of unconverted inquiries", projects_before:before, inquiries:targets },null,2));
  const deleted = await client.query("DELETE FROM project_inquiries WHERE id=ANY($1::uuid[]) AND project_id IS NULL AND status <> 'converted' RETURNING id,status",[targets.map(row=>row.id)]);
  if (deleted.rowCount !== targets.length) throw new Error("Deletion count changed; rolling back.");
  const after = await fingerprint();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Project records changed; rolling back.");
  const remaining = (await client.query("SELECT count(*)::int AS count FROM project_inquiries")).rows[0].count;
  if (remaining !== preserved) throw new Error("Unexpected preserved inquiry count; rolling back.");
  await client.query("COMMIT");
  console.log(JSON.stringify({deleted:deleted.rowCount,deleted_statuses:deleted.rows.map(row=>row.status),preserved_inquiries:remaining,projects_unchanged:before.count,backup:backup.pathname}));
} catch(error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await close();
}
