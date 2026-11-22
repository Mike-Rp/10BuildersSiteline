import "dotenv/config";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { get, close } from "../src/common/pool-manager.js";

// This reviewed rollout deliberately excludes all unrelated pending migrations.
const args=process.argv.slice(2), apply=args.includes('--apply');
if(args.some(arg=>!['--apply','--dry-run','--confirm-backup'].includes(arg))||
  args.includes('--apply')&&args.includes('--dry-run')||args.includes('--confirm-backup')&&!apply)
  throw new Error('Use --dry-run (default), or --apply [--confirm-backup].');
if(apply&&!['localhost','127.0.0.1','::1'].includes(process.env.DB_SERVER)&&!args.includes('--confirm-backup'))
  throw new Error('Remote database changes require a verified backup and explicit --confirm-backup.');
const migrations=['032-inquiry-engineer-specialties.sql','033-intake-monitoring.sql'];
let client;
try {
  client=await(await get()).connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('phase-schema-migrations'))");
  const count=async()=> (await client.query("SELECT (SELECT count(*)::text FROM projects) AS projects,(SELECT count(*)::text FROM project_phase_evidence) AS evidence")).rows[0];
  const before=await count();
  for(const name of migrations) {
    const sql=(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replace(/^BEGIN;\s*/im,'').replace(/^COMMIT;\s*/im,'');
    await client.query(sql);
  }
  const after=await count();
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Migration changed existing project or evidence row counts.');
  if(apply) {
    await client.query('CREATE TABLE IF NOT EXISTS phase_schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of migrations)await client.query('INSERT INTO phase_schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode:apply?'applied':'dry-run rolled back',migrations,existingProjectAndEvidenceCountsPreserved:true}));
}catch(error){await client?.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({mode:'failed',code:error.code||error.name}));process.exitCode=1;}
finally{client?.release();await close();}
