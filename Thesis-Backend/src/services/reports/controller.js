import { createHmac, timingSafeEqual } from "node:crypto";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, hasProjectAccess, isUuid, HttpError, handleError, sendOk } from "../../common/utilities/access.utility.js";
import { buildMonthlyReport, reportPeriod } from "../../domain/monthly-report.js";
import { reportCsv } from "../../domain/report-export.js";

async function authorizedProject(db,user,id) {
  if(!isUuid(id))throw new HttpError(400,"Invalid project ID.");
  if(!await hasProjectAccess(user,id,db))throw new HttpError(404,"Project not found.");
  const project=(await db.query(`select p.id,p.name,p.created_at,p.lifecycle_status as status,t.code as type
    from projects p left join project_types t on t.id=p.project_type_id where p.id=$1 and not coalesce(p.is_deleted,false)`,[id])).rows[0];
  if(!project||(user.role==="client"&&!["active","archived"].includes(project.status)))throw new HttpError(404,"Project not found.");
  return project;
}
const signature=text=>createHmac("sha256",process.env.JWT_SECRET).update(text).digest("base64url");
export function signReport(report,user) {
  const data=Buffer.from(JSON.stringify({userId:user.id,role:user.role,expires:Date.now()+30*60*1000,report})).toString("base64url");
  return `${data}.${signature(data)}`;
}
export function verifyReport(token,user) {
  if(typeof token!=="string"||token.length>4*1024*1024)throw new HttpError(400,"Invalid report snapshot.");
  const [data,mac,...extra]=token.split(".");
  const expected=signature(data||"");
  if(extra.length||!mac||mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw new HttpError(400,"Invalid report snapshot.");
  let saved;
  try {saved=JSON.parse(Buffer.from(data,"base64url").toString("utf8"));}catch{throw new HttpError(400,"Invalid report snapshot.");}
  if(saved.userId!==user.id||saved.role!==user.role||saved.expires<Date.now())throw new HttpError(403,"Report snapshot expired or belongs to another account. Refresh the report.");
  return saved.report;
}

export async function monthlyReport(req,res) {
  try {
    const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
    const data=await withTransaction(async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const project=await authorizedProject(db,user,req.params.id);
      const now=(await db.query("select now() as cutoff")).rows[0].cutoff;
      let period;try{period=reportPeriod(req.query.month,new Date(now));}catch(error){throw new HttpError(400,error.message);}
      let baseline=null,events=[];
      const configured=(await db.query("select to_regclass('public.monthly_report_baselines') as baseline,to_regclass('public.monthly_report_events') as events")).rows[0];
      if(configured.baseline&&configured.events){
        baseline=(await db.query("select covered_from,data from monthly_report_baselines where project_id=$1",[project.id])).rows[0]||null;
        if(baseline)events=(await db.query(`select id,project_id,occurred_at,transaction_id,source_table,operation,before_row,after_row
          from monthly_report_events where (project_id=$1 or project_id is null) and occurred_at>=$2 order by occurred_at,id`,[project.id,baseline.covered_from])).rows;
      }
      const visiblePhaseIds=user.role==="spm"?(await db.query("select project_stage_id from project_phase_team where project_id=$1 and spm_user_id=$2",[project.id,user.id])).rows.map(r=>String(r.project_stage_id)):[];
      const report=buildMonthlyReport({project,baseline,events,period,role:user.role,visiblePhaseIds});
      return {report,snapshot:signReport(report,user)};
    });
    res.set("Cache-Control","private, no-store");
    return sendOk(res,"Monthly report generated.",1,data);
  }catch(error){return handleError(res,error);}
}

export async function exportMonthlyReport(req,res) {
  try {
    const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
    const report=verifyReport(req.body?.snapshot,user);
    if(report.project.id!==req.params.id)throw new HttpError(400,"Report snapshot does not match this project.");
    if(!["csv","print"].includes(req.body?.format))throw new HttpError(400,"Choose CSV or print export.");
    await withTransaction(async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await authorizedProject(db,user,req.params.id);
      if(user.role==="spm"){
        // A revoked phase assignment cannot keep access through an old signed snapshot.
        const stages=(await db.query(`select s.code from project_phase_team t join project_stages s on s.id=t.project_stage_id
          where t.project_id=$1 and t.spm_user_id=$2`,[report.project.id,user.id])).rows.map(r=>r.code);
        if(report.activity.some(row=>!stages.includes(row.phase)))throw new HttpError(403,"Your phase access changed. Refresh the report.");
      }
    });
    res.set("Cache-Control","private, no-store");
    return sendOk(res,"Report export authorized.",1,req.body.format==="csv"?{csv:reportCsv(report)}:{report});
  }catch(error){return handleError(res,error);}
}
