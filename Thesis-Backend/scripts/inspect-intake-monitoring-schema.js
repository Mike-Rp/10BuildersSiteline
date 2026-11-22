import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { get, close } from "../src/common/pool-manager.js";

const tables = ["project_inquiries", "projects", "inquiry_engineer_specialties", "project_subcontractor_selections",
  "project_phase_responsibilities", "project_phase_checklist_items", "project_phase_evidence", "project_phase_files",
  "project_phase_evidence_files", "project_phase_team", "project_checklist_definitions"];
let client;
try {
  client = await (await get()).connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='15s'");
  const columns = (await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,ordinal_position", [tables])).rows;
  const constraints = (await client.query("SELECT c.relname AS table_name,n.conname,pg_get_constraintdef(n.oid) AS definition FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,n.conname", [tables])).rows;
  const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1)", [tables])).rows;
  const policies = (await client.query("SELECT tablename,policyname,roles,cmd FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1)", [tables])).rows;
  const installed = (await client.query("SELECT to_regclass('public.phase_schema_migrations') IS NOT NULL AS ready")).rows[0].ready;
  const migrations = installed ? (await client.query("SELECT name FROM phase_schema_migrations ORDER BY name")).rows : [];
  await client.query("ROLLBACK");
  const outputIndex = process.argv.indexOf("--out");
  if (outputIndex >= 0) {
    if (!process.argv[outputIndex + 1]) throw new Error("--out needs a file path");
    await writeFile(process.argv[outputIndex + 1], JSON.stringify({ columns, constraints, indexes, policies, migrations }, null, 2));
  }
  console.log(JSON.stringify({ connected: true, readOnly: true, tables: [...new Set(columns.map(c => c.table_name))], columns: columns.length, constraints: constraints.length, migrations: migrations.map(m => m.name) }));
} catch (error) {
  console.error(JSON.stringify({ connected: false, code: error.code || error.name }));
  process.exitCode = 1;
} finally {
  await client?.query("ROLLBACK").catch(() => {});
  client?.release();
  await close();
}
