import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function assertLocalDatabase(host) {
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Verified-progress migrations require an explicit localhost database.");
  }
}

export async function migrateTargetedRework(client, { apply = false } = {}) {
  const sql = (await readFile(new URL("../migrations/005-targeted-rework.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*/m, "").replace(/^COMMIT;\s*/m, "");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('targeted-rework'))");
    await client.query(sql);
    const { rows } = await client.query(`SELECT
      (SELECT count(*)::int FROM phase_checklist_templates) AS templates,
      (SELECT count(*)::int FROM project_phase_checklist_items) AS project_activities,
      (SELECT count(*)::int FROM project_phase_evidence) AS evidence_rows,
      (SELECT count(*)::int FROM project_progress_history) AS history_rows,
      (SELECT count(*)::int FROM project_phase_checklist_items WHERE weight=10) AS default_value_activities,
      (SELECT count(*)::int FROM project_rework_activities) AS rework_links`);
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry-run (rolled back)", ...rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  let pool;
  try {
    assertLocalDatabase(process.env.DB_SERVER);
    const args = process.argv.slice(2);
    if (args.some(arg => !["--dry-run", "--apply"].includes(arg)) || args.length > 1) {
      throw new Error("Use --dry-run or --apply.");
    }
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ host: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      ssl: false, connectionTimeoutMillis: 10000, max: 1 });
    const client = await pool.connect();
    try { console.log(JSON.stringify(await migrateTargetedRework(client, { apply: args.includes("--apply") }))); }
    finally { client.release(); }
  } catch (error) {
    console.error(error.code ? `Local migration failed (${error.code}).` : error.message);
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
