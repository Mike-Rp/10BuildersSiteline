import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function migrateMixedUseScope(client, { apply = false } = {}) {
  const sql = (await readFile(new URL("../migrations/014-mixed-use-project-scope.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*/m, "").replace(/^COMMIT;\s*/m, "");
  await client.query("BEGIN");
  try {
    if (client.exec) await client.exec(sql); else await client.query(sql);
    const { rows } = await client.query(`SELECT s.code AS phase, array_agg(d.code ORDER BY d.code) AS disciplines
      FROM project_stages s JOIN project_stage_discipline_links l ON l.project_stage_id=s.id
      JOIN project_types t ON t.id=l.project_type_id JOIN disciplines d ON d.id=l.discipline_id
      WHERE t.code='Mixed-Use' AND s.code IN ('Office Fit-Out','Hotel Fit-Out','Site Works')
      GROUP BY s.code ORDER BY s.code`);
    if (rows.length !== 3) throw new Error("Mixed-Use scope prerequisites are incomplete; apply project-type workflow migration 004 first.");
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { mode: apply ? "applied" : "dry-run (rolled back)", phases: rows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let close;
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !["--dry-run", "--apply"].includes(arg))) throw new Error("Use --dry-run or --apply.");
    const manager = await import("../src/common/pool-manager.js");
    close = manager.close;
    const client = await (await manager.get()).connect();
    try { console.log(JSON.stringify(await migrateMixedUseScope(client, { apply: args.includes("--apply") }), null, 2)); }
    finally { client.release(); }
  } catch (error) {
    console.error(error.code ? `Mixed-Use scope setup failed (${error.code}).` : error.message);
    process.exitCode = 1;
  } finally { await close?.(); }
}
