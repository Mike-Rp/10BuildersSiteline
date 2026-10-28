import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";

if (!process.env.DB_SERVER || !process.env.DB_NAME || !process.env.DB_USER) {
  throw new Error("Set DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD, and DB_PORT for the intended database.");
}
const pool = new pg.Pool({
  host: process.env.DB_SERVER, database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, port: process.env.DB_PORT, connectionTimeoutMillis: 10000,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('phase-schema-migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS phase_schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const directory = new URL("../migrations/", import.meta.url);
  const names = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of names) {
    const applied = await client.query("SELECT 1 FROM phase_schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) continue;
    const sql = (await readFile(new URL(name, directory), "utf8"))
      .replace(/^BEGIN;\s*/m, "").replace(/^COMMIT;\s*/m, "");
    await client.query(sql);
    await client.query("INSERT INTO phase_schema_migrations (name) VALUES ($1)", [name]);
    console.log("Applied:", name);
  }
  await client.query("COMMIT");
  console.log("Phase migrations complete.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", error.code ?? error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
