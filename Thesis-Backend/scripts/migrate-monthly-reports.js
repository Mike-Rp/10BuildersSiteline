import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {assertLocalDatabase} from "./migrate-verified-progress.js";
export async function migrateMonthlyReports(db,{apply=false}={}) {
  const sql=(await readFile(new URL("../migrations/008-monthly-report-history.sql",import.meta.url),"utf8")).replace(/^BEGIN;\s*/m,"").replace(/^COMMIT;\s*/m,"");
  await db.query("BEGIN");
  try {
    if(db.exec)await db.exec(sql);else await db.query(sql);
    const summary=(await db.query(`select (select count(*)::int from monthly_report_baselines) as baselines,
      (select count(*)::int from monthly_report_events) as events,
      (select min(covered_from) from monthly_report_baselines) as coverage_from`)).rows[0];
    await db.query(apply?"COMMIT":"ROLLBACK");
    return {mode:apply?"applied":"dry-run (rolled back)",...summary};
  }catch(error){await db.query("ROLLBACK");throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let pool;
  try{
    const args=process.argv.slice(2);
    if(args.length>1||args.some(a=>!["--dry-run","--apply","--print-dry-run"].includes(a)))throw new Error("Use --dry-run, --apply or --print-dry-run.");
    if(args.includes("--print-dry-run"))console.log((await readFile(new URL("../migrations/008-monthly-report-history.sql",import.meta.url),"utf8")).replace(/^COMMIT;\s*$/m,"ROLLBACK;"));
    else{
      const dotenv=await import("dotenv");dotenv.config({path:fileURLToPath(new URL("../.env",import.meta.url)),quiet:true});
      assertLocalDatabase(process.env.DB_SERVER);
      const {default:pg}=await import("pg");
      pool=new pg.Pool({host:process.env.DB_SERVER,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:false,max:1,connectionTimeoutMillis:10000});
      const client=await pool.connect();
      try{console.log(JSON.stringify(await migrateMonthlyReports(client,{apply:args.includes("--apply")}),null,2));}finally{client.release();}
    }
  }catch(error){console.error(error.message);process.exitCode=1;}finally{await pool?.end();}
}
