import "dotenv/config";
import process from "node:process";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { migrationPlan } from "./migration-plan.js";

const modes = ["--plan", "--dry-run", "--apply"];
const args = process.argv.slice(2);
if (args.some(arg => ![...modes, "--confirm-backup"].includes(arg)) || args.filter(arg => modes.includes(arg)).length > 1) {
  throw new Error("Use --plan, --dry-run, or --apply [--confirm-backup]. The default is --plan.");
}
const mode = args.find(arg => modes.includes(arg)) || "--plan";
if (args.includes("--confirm-backup") && mode !== "--apply") throw new Error("--confirm-backup is only valid with --apply.");
if (!process.env.DB_SERVER || !process.env.DB_NAME || !process.env.DB_USER) {
  throw new Error("Set DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD, and DB_PORT for the intended database.");
}
const local = ["localhost", "127.0.0.1", "::1"].includes(process.env.DB_SERVER);
if (mode === "--apply" && !local && !args.includes("--confirm-backup")) {
  throw new Error("Remote database changes require a verified backup and explicit --confirm-backup.");
}

export async function getMigrationPlan(db, files) {
  const exists = (await db.query("select to_regclass('public.phase_schema_migrations') is not null as ready")).rows[0].ready;
  const appliedNames = exists
    ? (await db.query("select name from public.phase_schema_migrations")).rows.map(row => row.name)
    : [];
  return { appliedNames, plan: migrationPlan(files, appliedNames) };
}

export async function inspectPhotoReviewSchema(db) {
  const result = await db.query(`select
    (select count(*)::int from information_schema.columns
      where table_schema='public' and table_name='project_photos'
        and column_name=any(array['review_status','review_note','reviewed_by','reviewed_at'])) as review_columns,
    exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
      where n.nspname='public' and r.relname='project_photos' and c.conname='project_photos_review_status_check') as status_constraint`);
  const row = result.rows[0];
  return { reviewColumns: row.review_columns, expectedReviewColumns: 4, statusConstraint: row.status_constraint,
    ready: row.review_columns === 4 && row.status_constraint };
}

const pool = new pg.Pool({
  host: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 10000,
});
const client = await pool.connect();
try {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  if (mode === "--plan") {
    const { appliedNames, plan } = await getMigrationPlan(client, files);
    const photoReviewSchema = await inspectPhotoReviewSchema(client);
    console.log(JSON.stringify({ database: process.env.DB_NAME, host: process.env.DB_SERVER, mode: "plan only", appliedMigrations: appliedNames, photoReviewSchema, migrations: plan }, null, 2));
  } else {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('phase-schema-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS phase_schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { plan } = await getMigrationPlan(client, files);
    const executable = plan.filter(step => step.action === "runner");
    for (const step of executable) {
      const sql = (await readFile(new URL(step.name, directory), "utf8"))
        .replace(/^BEGIN;\s*/im, "").replace(/^COMMIT;\s*/im, "");
      await client.query(sql);
      await client.query("INSERT INTO phase_schema_migrations (name) VALUES ($1)", [step.name]);
      console.log(`${mode === "--apply" ? "Applied" : "Dry-run applied"}: ${step.name}`);
    }
    if (mode === "--apply") await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(JSON.stringify({
      database: process.env.DB_NAME,
      host: process.env.DB_SERVER,
      mode: mode === "--apply" ? "applied" : "dry-run (rolled back)",
      dedicatedMigrations: plan.filter(step => step.action === "dedicated"),
    }, null, 2));
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", error.code ?? error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
