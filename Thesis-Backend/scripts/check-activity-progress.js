import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertLocalDatabase } from "./migrate-verified-progress.js";

export const migrationUrl = new URL("../migrations/004-verified-activity-progress.sql",import.meta.url);
const body = async () => (await fs.readFile(migrationUrl,"utf8"))
  .replace(/^BEGIN;\s*/mi,"").replace(/^COMMIT;\s*$/mi,"");

export async function schemaState(db) {
  return (await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN
    ('phase_checklist_templates','project_phase_checklist_items','project_phase_evidence','project_rework_activities','project_type_stages')
    ORDER BY table_name,ordinal_position`)).rows;
}

export async function verifyActivityProgress(db) {
  const columns=await schemaState(db);
  for(const table of ["phase_checklist_templates","project_phase_checklist_items"]) {
    const column=columns.find(c=>c.table_name===table&&c.column_name==="weight");
    if(!column||column.data_type!=="integer"||column.is_nullable!=="NO"||column.column_default!=="10") {
      throw new Error(`${table}.weight must be integer NOT NULL DEFAULT 10.`);
    }
    const invalid=await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE weight IS NULL OR weight<=0`);
    if(invalid.rows[0].n)throw new Error(`${table} contains invalid activity values.`);
  }
  if(!columns.some(c=>c.table_name==="project_phase_evidence"&&c.column_name==="rework_request_id"))throw new Error("Missing evidence rework reference.");
  const references=await db.query("SELECT to_regclass('public.project_rework_activities') IS NOT NULL AS rework,to_regclass('public.project_type_stages') IS NOT NULL AS workflows");
  if(!references.rows[0].rework||!references.rows[0].workflows)throw new Error("Missing rework links or project workflow scope.");
  const invalidScope=await db.query(`SELECT t.id FROM project_types t WHERE NOT EXISTS
    (SELECT 1 FROM project_type_stages w WHERE w.project_type_id=t.id)`);
  if(invalidScope.rowCount)throw new Error("A project type has no workflow. Review its real workflow before deployment.");
  const bridge=await db.query("SELECT 1 FROM pg_trigger WHERE tgrelid='public.project_phase_evidence'::regclass AND tgname='siteline_normalize_rework_status' AND tgenabled='O'");
  if(!bridge.rowCount)throw new Error("Missing enabled rework writer compatibility trigger.");
  return {weight_type:"integer",weight_default:10,weight_nullable:false,rework_links:true,workflow_scope:true,legacy_writer_bridge:true};
}

export async function migrateActivityProgress(db,{apply=false,check=false}={}) {
  if(check)return {mode:"check",verified:await verifyActivityProgress(db)};
  const before=await schemaState(db);
  await db.query("BEGIN");
  try {
    await db.query(await body());
    const verified=await verifyActivityProgress(db),after=await schemaState(db);
    const added=after.filter(c=>!before.some(b=>b.table_name===c.table_name&&b.column_name===c.column_name));
    const counts=(await db.query(`SELECT
      (SELECT count(*)::int FROM project_phase_checklist_items) AS activities,
      (SELECT count(*)::int FROM project_phase_evidence) AS evidence,
      (SELECT count(*)::int FROM project_progress_history) AS history,
      (SELECT count(*)::int FROM project_rework_activities) AS rework_links,
      (SELECT count(*)::int FROM project_type_stages) AS workflow_rows`)).rows[0];
    await db.query(apply?"COMMIT":"ROLLBACK");
    return {mode:apply?"applied":"dry-run (rolled back)",added_columns:added.map(c=>`${c.table_name}.${c.column_name}:${c.data_type}`),verified,...counts};
  } catch(error){await db.query("ROLLBACK");throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let pool;
  try {
    const args=process.argv.slice(2);
    if(args.length!==1||!["--dry-run","--apply","--check","--print-dry-run","--print-verify"].includes(args[0]))throw new Error("Choose --dry-run, --apply, --check, --print-dry-run or --print-verify.");
    if(args[0]==="--print-dry-run")console.log(`BEGIN;\n${await body()}\n${await fs.readFile(new URL("./verify-activity-progress.sql",import.meta.url),"utf8")}\nROLLBACK;`);
    else if(args[0]==="--print-verify")console.log(await fs.readFile(new URL("./verify-activity-progress.sql",import.meta.url),"utf8"));
    else {
      const dotenv=await import("dotenv");dotenv.config({path:fileURLToPath(new URL("../.env",import.meta.url)),quiet:true});
      assertLocalDatabase(process.env.DB_SERVER); // Always before opening a connection.
      const {default:pg}=await import("pg");
      pool=new pg.Pool({host:process.env.DB_SERVER,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,
        user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:false,connectionTimeoutMillis:10000,max:1});
      const db=await pool.connect();
      try {console.log(JSON.stringify(await migrateActivityProgress(db,{apply:args[0]==="--apply",check:args[0]==="--check"})));}
      finally {db.release();}
    }
  }catch(error){console.error(error.code?`Local migration failed (${error.code}).`:error.message);process.exitCode=1;}
  finally {await pool?.end();}
}
