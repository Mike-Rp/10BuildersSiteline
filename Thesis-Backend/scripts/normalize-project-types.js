// Moves legacy project types (Infrastructure, Industrial, Renovation) to the three intake types.
//
//   npm run db:normalize-types                       dry run: prints what would change, writes nothing
//   CONFIRM_BACKUP=yes npm run db:normalize-types -- --apply     applies it (take a backup first)
//
// Only projects.project_type_id and projects.name change, only for the exact projects in
// project-type-normalization.js, in one transaction. It is safe to run again.
import "dotenv/config";
import { get, close } from "../src/common/pool-manager.js";
import { buildPlan, normalizeProjectTypes } from "./project-type-normalization.js";

const apply = process.argv.includes("--apply");
if (apply && process.env.CONFIRM_BACKUP !== "yes") {
    console.error("Refusing to apply. Take a database backup, then set CONFIRM_BACKUP=yes and run with --apply.");
    process.exit(1);
}
const client = await (await get()).connect();
try {
    console.log(`${apply ? "APPLYING" : "DRY RUN (nothing will be written)"} to database ${process.env.DB_NAME || ""} on ${process.env.DB_SERVER || ""}`);
    await client.query("BEGIN");
    const report = await normalizeProjectTypes(client, { apply, plan: buildPlan() });
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    const pad = (text, width) => String(text).padEnd(width);
    console.log(pad("STATUS", 22) + pad("FROM → TO", 36) + "NAME");
    // Projects that do not exist in this database are only counted, not listed.
    for (const r of report.filter((row) => row.status !== "not present"))
        console.log(pad(r.status, 22) + pad(`${r.from} → ${r.to}`, 36) + (r.name === r.newName ? r.name : `${r.name}  →  ${r.newName}`));
    const counts = {};
    for (const r of report) counts[r.status] = (counts[r.status] || 0) + 1;
    console.log("\nSummary:", JSON.stringify(counts));
    if (!apply && counts["will change"]) console.log("Re-run with CONFIRM_BACKUP=yes and --apply to make these changes.");
}
catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    console.error("Failed, nothing was changed:", error.code || error.message);
    process.exitCode = 1;
}
finally {
    client.release();
    await close();
}
