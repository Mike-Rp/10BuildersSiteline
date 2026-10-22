import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertLocalDatabase } from "./migrate-verified-progress.js";

const migrationUrl = new URL("../migrations/007-standard-phase-scope-revision.sql", import.meta.url);
async function summary(db) {
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM project_phase_checklist_items WHERE required) AS required_activities,
    (SELECT count(*)::int FROM project_phase_checklist_items WHERE NOT required) AS historical_activities,
    (SELECT count(*)::int FROM project_phase_evidence) AS evidence_rows,
    (SELECT count(*)::int FROM project_progress_history) AS history_rows,
    (SELECT count(*)::int FROM audit_log WHERE new_values->>'_checklist_scope_revision'='standard-4-3-4-v1') AS scope_revision_events`);
  return rows[0];
}

export async function reviseStandardChecklists(db, { apply = false } = {}) {
  const sql = (await readFile(migrationUrl, "utf8")).replace(/^BEGIN;\s*/m, "").replace(/^COMMIT;\s*/m, "");
  await db.query("BEGIN");
  try {
    const before = await summary(db);
    if (db.exec) await db.exec(sql);
    else await db.query(sql);
    const after = await summary(db);
    const phases = (await db.query(`SELECT p.id AS project_id,p.name,s.code AS phase,
      count(*) FILTER(WHERE i.required)::int AS required_activities,
      coalesce(sum(i.weight) FILTER(WHERE i.required),0)::int AS required_total
      FROM projects p JOIN project_phase_checklist_items i ON i.project_id=p.id
      JOIN project_stages s ON s.id=i.project_stage_id
      WHERE p.lifecycle_status='active' AND NOT coalesce(p.is_deleted,false)
      GROUP BY p.id,p.name,s.id,s.code ORDER BY p.id,s.id`)).rows;
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry-run (rolled back)", before, after, phases };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !["--print-dry-run", "--dry-run", "--apply"].includes(arg))) {
      throw new Error("Use --print-dry-run, --dry-run or --apply.");
    }
    if (args.includes("--print-dry-run")) {
      console.log((await readFile(migrationUrl, "utf8")).replace(/^COMMIT;\s*$/m, "ROLLBACK;"));
    } else {
      const dotenv = await import("dotenv");
      dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
      assertLocalDatabase(process.env.DB_SERVER);
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ host: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        ssl: false, connectionTimeoutMillis: 10000, max: 1 });
      const client = await pool.connect();
      try { console.log(JSON.stringify(await reviseStandardChecklists(client, { apply: args.includes("--apply") }), null, 2)); }
      finally { client.release(); }
    }
  } catch (error) {
    console.error(error.code ? `Local checklist revision failed (${error.code}).` : error.message);
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
