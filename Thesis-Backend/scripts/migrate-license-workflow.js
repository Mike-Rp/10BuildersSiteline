// Applies migrations/009-engineer-license-workflow.sql with a dry run first.
//
//   npm run db:license-workflow                          dry run: runs it inside a transaction, reports, rolls back
//   npm run db:license-workflow -- --apply               applies it (local databases only, or CONFIRM_BACKUP=yes)
//
// The migration only adds four tables and one default setting. It is safe to run again.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { get, close } from "../src/common/pool-manager.js";

const NEW_TABLES = ["license_renewal_requests", "license_reminders_sent", "engineer_assignment_history", "license_overrides"];
const KEPT_TABLES = ["users", "projects", "user_licenses", "project_phase_team", "project_engineers", "assignment_confirmations", "activity_log"];
const apply = process.argv.includes("--apply");
const local = ["localhost", "127.0.0.1", "::1"].includes(process.env.DB_SERVER || "");
if (apply && !local && process.env.CONFIRM_BACKUP !== "yes") {
    console.error("Refusing to apply to a non-local database. Take a backup, then set CONFIRM_BACKUP=yes.");
    process.exit(1);
}

const client = await (await get()).connect();
const count = async (table) => (await client.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
const exists = async (table) => (await client.query("select to_regclass($1) is not null as ok", ["public." + table])).rows[0].ok;
try {
    console.log(`${apply ? "APPLYING" : "DRY RUN (rolled back at the end)"} to database ${process.env.DB_NAME || ""} on ${process.env.DB_SERVER || ""}`);
    const sql = (await readFile(new URL("../migrations/009-engineer-license-workflow.sql", import.meta.url), "utf8"))
        .replace(/^begin;\s*/im, "").replace(/^commit;\s*/im, "");
    await client.query("BEGIN");
    const before = { tables: {}, kept: {}, rules: (await client.query("select rules from public.workspace_settings where singleton")).rows[0]?.rules };
    for (const t of NEW_TABLES) before.tables[t] = await exists(t);
    for (const t of KEPT_TABLES) before.kept[t] = await count(t);
    await client.query(sql);
    const after = { rules: (await client.query("select rules from public.workspace_settings where singleton")).rows[0]?.rules, kept: {}, rows: {} };
    for (const t of KEPT_TABLES) after.kept[t] = await count(t);
    for (const t of NEW_TABLES) after.rows[t] = await count(t);

    console.log("\nNew tables:");
    for (const t of NEW_TABLES)
        console.log(`  ${t.padEnd(30)} ${before.tables[t] ? "already exists" : "will be created"}   rows after: ${after.rows[t]}`);
    const history = (await client.query("select role_code, count(*)::int as n from public.engineer_assignment_history group by role_code order by 1")).rows;
    console.log("\nHistory backfill (current holders):", history.map((r) => `${r.role_code}=${r.n}`).join(", ") || "none");
    console.log("\nSettings (workspace_settings.rules):");
    console.log("  before:", JSON.stringify(before.rules));
    console.log("  after: ", JSON.stringify(after.rules));
    console.log("\nExisting tables (row counts must not change):");
    let changed = false;
    for (const t of KEPT_TABLES) {
        const same = before.kept[t] === after.kept[t];
        if (!same) changed = true;
        console.log(`  ${t.padEnd(30)} ${before.kept[t]} -> ${after.kept[t]} ${same ? "ok" : "CHANGED"}`);
    }
    if (changed) throw new Error("An existing table changed; aborting.");

    if (apply) {
        await client.query("CREATE TABLE IF NOT EXISTS phase_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
        await client.query("INSERT INTO phase_schema_migrations(name) VALUES ('009-engineer-license-workflow.sql') ON CONFLICT DO NOTHING");
        await client.query("COMMIT");
        console.log("\nApplied.");
    } else {
        await client.query("ROLLBACK");
        const leftover = [];
        for (const t of NEW_TABLES) if (!before.tables[t] && await exists(t)) leftover.push(t);
        console.log(`\nRolled back. New tables left behind: ${leftover.length ? leftover.join(", ") : "none"}.`);
        console.log("Re-run with --apply to make these changes.");
    }
} catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    console.error("Failed, nothing was changed:", error.code || "", error.message);
    process.exitCode = 1;
} finally {
    client.release();
    await close();
}
