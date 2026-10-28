// Reproducible catalog audit. No environment/database credentials are read.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {citext} from "@electric-sql/pglite/contrib/citext"
import {migrateActivityProgress} from "../Thesis-Backend/scripts/check-activity-progress.js"
const root=fileURLToPath(new URL("../",import.meta.url))
const read=p=>fs.readFileSync(path.join(root,p),"utf8")
const db=new PGlite({extensions:{citext}})
const migration="Thesis-Backend/migrations/004-verified-activity-progress.sql"
try {
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  const base="supabase/migrations/20261017000002_thesis_backend_schema.sql"
  await db.exec(read(base).replace(/^create extension if not exists pgcrypto.*$/m,""))
  for(const name of ["001-phase-checklists.sql","002-phase-update-confirmation.sql","003-react-integration.sql"])
    await db.exec(read("Thesis-Backend/migrations/"+name))
  await db.exec(read("supabase/seed/dummy-data.sql"))
  const before=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public'")).rows
  const client={query:(sql,args)=>/DO \$\$|-- Recovery migration/.test(sql)?db.exec(sql).then(rows=>rows.at(-1)):db.query(sql,args)}
  const dry=await migrateActivityProgress(client)
  await migrateActivityProgress(client,{apply:true})
  function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith(".js")?[path.join(dir,e.name)]:[])}
  const sources=files(path.join(root,"Thesis-Backend/src")).map(file=>({file:path.relative(root,file).replaceAll("\\","/"),text:fs.readFileSync(file,"utf8")}))
  const columns=(await db.query(`select table_name,column_name,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' order by table_name,ordinal_position`)).rows
  const tables=[...new Set(columns.map(c=>c.table_name))].filter(table=>sources.some(s=>new RegExp("\\b"+table+"\\b").test(s.text)))
  const existingSql=[base,...["001-phase-checklists.sql","002-phase-update-confirmation.sql","003-react-integration.sql"].map(n=>"Thesis-Backend/migrations/"+n)]
  const owner=table=>existingSql.filter(p=>new RegExp("(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE)\\s+(?:public\\.)?\\\"?"+table+"\\b","i").test(read(p))).map(p=>path.basename(p)).join(", ")||"base schema"
  const clean=value=>String(value??"—").replaceAll("|","\\|").replaceAll("\n"," ")
  let out=`# Verified activity progress: schema dependency audit\n\nGenerated from a disposable local database; no hosted database inspected.\n\nBranch: part-4-lifecycle-checks. Confirmed ancestors: d0662ec, ea4ed5b, 3d3027e, de158ce.\n\nThe checkout already contains 004-verified-activity-values.sql (double precision) and 005-targeted-rework.sql (replaces a CHECK), plus a separate 004-project-type-workflows.sql. The new explicitly applied recovery 004 supersedes those two progress/rework schema steps for a schema + 001–003 database. It does not silently execute the separate project-type remapping migration.\n\n## Important limits\n\n- A missing weight error proves the connected database lacks that column. It does not prove the migration file is absent from Git. No hosted schema inspection or live Vercel request was made.\n- Integer columns are added with NOT NULL DEFAULT 10 and positive CHECKs. A previously installed double-precision weight is rejected for separately reviewed conversion; it is never truncated.\n- Existing workflow rows are preserved. Only types with no mapping receive the original seven-stage lookup defaults. Existing 9/9/12 mappings are preserved; this migration does not remap historical phase relationships or create missing project scope.\n- Staff verified aggregates use current approval provenance. Clients still lack the new authorized aggregate projection in Parts 1–4; complete client fractions and compact displays remain Part 5. Legacy percentages must not be presented as newly verified values.\n- Normalized withdrawal is a reviewed rejection linked to its request. API projections retain the Rework required label. An additive trigger accepts the already-deployed writer's rework_required input without dropping the old status CHECK. Deploy the compatibility projections with the reviewed branch for consistent labels.\n\n## Dependency table\n\nEvery column on every public relation referenced by backend source is listed below, including baseline columns for completeness. This is deliberately broader than newly introduced dependencies. Source lists identify table consumers; the PostgreSQL preparation regression checks actual static SQL column/alias resolution. Runtime-built SQL is additionally exercised by the role/API integration tests, not claimed to be statically proven.\n\n`
  for(const table of tables){
    const uses=sources.filter(s=>new RegExp("\\b"+table+"\\b").test(s.text)).map(s=>s.file)
    out+=`### ${table}\n\nUsed by: ${uses.map(s=>"`"+s+"`").join(", ")}.\n\n| Column | SQL type | Nullable | Default | Migration exists / source |\n|---|---|---|---|---|\n`
    for(const c of columns.filter(c=>c.table_name===table)){
      const existed=before.some(b=>b.table_name===table&&b.column_name===c.column_name)
      out+=`| ${c.column_name} | ${c.data_type==="ARRAY"?c.udt_name.slice(1)+"[]":c.data_type==="USER-DEFINED"?c.udt_name:c.data_type} | ${c.is_nullable} | ${clean(c.column_default)} | ${existed?owner(table):"NEW 004-verified-activity-progress.sql"} |\n`
    }out+="\n"
  }
  out+="## Constraints and indexes\n\nAll returned objects exist after the explicit recovery path. Existing baseline objects are retained; new objects are created by recovery 004. Positive activity checks, composite request/activity FKs and latest-evidence indexes are included.\n\n| Table | Object | Definition |\n|---|---|---|\n"
  const constraints=(await db.query("select c.relname as table_name,t.conname as name,pg_get_constraintdef(t.oid) as definition from pg_constraint t join pg_class c on c.oid=t.conrelid where c.relnamespace='public'::regnamespace order by c.relname,t.conname")).rows
  const indexes=(await db.query("select tablename as table_name,indexname as name,indexdef as definition from pg_indexes where schemaname='public' order by tablename,indexname")).rows
  for(const o of [...constraints,...indexes].filter(o=>tables.includes(o.table_name)))out+=`| ${o.table_name} | ${o.name} | ${clean(o.definition)} |\n`
  out+="\n## Enums, functions and triggers\n\nNo new enum is required. Lifecycle and review states use existing varchar/text CHECKs, not new enum values. Verified calculation and targeted impact functions are JavaScript domain functions, not missing PostgreSQL stored procedures. Built-ins used include now, hashtext, advisory locks, aggregates, window functions, JSON operations and standard PostgreSQL catalogs. Base audit/timestamp trigger functions remain required.\n\n| Object | Type / definition | Migration |\n|---|---|---|\n"
  const functions=(await db.query("select p.proname,pg_get_function_result(p.oid) as result from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'citext%' order by p.proname")).rows
  for(const f of functions)out+=`| ${f.proname} | function returns ${f.result} | ${f.proname==="siteline_normalize_rework_status"?"NEW recovery 004":"base schema / citext extension"} |\n`
  const triggers=(await db.query("select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where not tgisinternal order by tgname")).rows
  for(const t of triggers)out+=`| ${t.tgname} | ${clean(t.definition)} | ${t.tgname==="siteline_normalize_rework_status"?"NEW recovery 004":"base schema"} |\n`
  out+="\n## New table RLS / permissions\n\nFor newly created project_rework_activities and project_type_stages: RLS enabled; PUBLIC/anon/authenticated receive no table privileges; verified_server_only policy denies PUBLIC; verified_service_access permits the trusted service_role with SELECT/INSERT/UPDATE. The owner bypasses ordinary RLS. Existing tables' ACLs/policies are left unchanged. The API still checks project and role ownership. No browser receives staff evidence or rework links. The new trigger function is SECURITY INVOKER, has a fixed search_path, and no PUBLIC execute grant.\n\n## Actual local dry run\n\n```json\n"+JSON.stringify(dry,null,2)+"\n```\n\nIt rolled back. The test then applied twice only in disposable PGlite and compared all original evidence, history, checklist snapshots, activities and project fields. New nullable reference columns are excluded only from the before/after shape comparison. Existing values are preserved.\n\n## Full recovery SQL\n\n```sql\n"+read(migration)+"\n```\n"
  fs.writeFileSync(path.join(root,"docs/VERIFIED_PROGRESS_SCHEMA_AUDIT.md"),out)
  console.log(JSON.stringify({tables:tables.length,columns:columns.filter(c=>tables.includes(c.table_name)).length,constraints:constraints.length,indexes:indexes.length,dry_run:dry}))
}finally{await db.close()}
