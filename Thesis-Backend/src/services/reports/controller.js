import { createHmac, timingSafeEqual } from "node:crypto";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, hasProjectAccess, isUuid, HttpError, handleError, sendOk } from "../../common/utilities/access.utility.js";
import { buildMonthlyReport, reportPeriod } from "../../domain/monthly-report.js";
import { buildMonthlySummary, summaryView } from "../../domain/monthly-summary.js";
import { reportCsv, summaryCsv } from "../../domain/report-export.js";

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

// One cutoff for every report in the request: the transaction's now().
async function requestPeriod(db,month) {
  const now=(await db.query("select now() as cutoff")).rows[0].cutoff;
  try{return reportPeriod(month,new Date(now));}catch(error){throw new HttpError(400,error.message);}
}
// Baselines, events and Site PM phase scope for several projects in three queries.
// Events without a project (global type workflows) belong to every project, as in a single report.
async function reportHistory(db,user,projectIds) {
  const history=new Map(projectIds.map(id=>[id,{baseline:null,events:[],visiblePhaseIds:[]}]));
  if(!projectIds.length)return history;
  const configured=(await db.query("select to_regclass('public.monthly_report_baselines') as baseline,to_regclass('public.monthly_report_events') as events")).rows[0];
  if(configured.baseline&&configured.events){
    const baselines=(await db.query("select project_id,covered_from,data from monthly_report_baselines where project_id=any($1::uuid[])",[projectIds])).rows;
    for(const row of baselines)history.get(row.project_id).baseline={covered_from:row.covered_from,data:row.data};
    if(baselines.length){
      const from=baselines.reduce((min,row)=>new Date(row.covered_from)<min?new Date(row.covered_from):min,new Date(baselines[0].covered_from));
      const events=(await db.query(`select id,project_id,occurred_at,transaction_id,source_table,operation,before_row,after_row
        from monthly_report_events where (project_id=any($1::uuid[]) or project_id is null) and occurred_at>=$2 order by occurred_at,id`,[baselines.map(r=>r.project_id),from])).rows;
      for(const event of events){
        if(event.project_id!==null){history.get(event.project_id).events.push(event);continue;}
        for(const row of baselines)if(new Date(event.occurred_at)>=new Date(row.covered_from))history.get(row.project_id).events.push(event);
      }
    }
  }
  if(user.role==="spm")for(const row of (await db.query("select project_id,project_stage_id from project_phase_team where project_id=any($1::uuid[]) and spm_user_id=$2",[projectIds,user.id])).rows)
    history.get(row.project_id).visiblePhaseIds.push(String(row.project_stage_id));
  return history;
}

export async function monthlyReport(req,res) {
  try {
    const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
    const data=await withTransaction(async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const project=await authorizedProject(db,user,req.params.id);
      const period=await requestPeriod(db,req.query.month);
      const {baseline,events,visiblePhaseIds}=(await reportHistory(db,user,[project.id])).get(project.id);
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
    if(report?.project?.id!==req.params.id)throw new HttpError(400,"Report snapshot does not match this project.");
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

// The same project access rules as hasProjectAccess and authorizedProject, for every project at once.
const ACCESS={
  admin:"true",
  opm:`(p.suggested_opm_id=$1 or exists(select 1 from project_engineers e where e.project_id=p.id and e.user_id=$1 and e.unassigned_at is null))`,
  spm:`(exists(select 1 from project_phase_team t where t.project_id=p.id and t.spm_user_id=$1)
    or exists(select 1 from project_engineers e where e.project_id=p.id and e.user_id=$1 and e.unassigned_at is null))`,
  client:`(exists(select 1 from user_client_project_links l where l.project_id=p.id and l.user_id=$1) and p.lifecycle_status in ('active','archived'))`,
};
async function authorizedProjects(db,user) {
  const access=ACCESS[user.role];
  if(!access)throw new HttpError(403,"Reports are not available for this account.");
  return (await db.query(`select p.id,p.name,p.created_at,p.lifecycle_status as status,t.code as type
    from projects p left join project_types t on t.id=p.project_type_id
    where not coalesce(p.is_deleted,false) and ${access} order by p.name,p.id`,user.role==="admin"?[]:[user.id])).rows;
}
const projectionFor=role=>role==="client"?"client":role==="spm"?"site":"staff";

export async function monthlySummary(req,res) {
  try {
    const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
    const data=await withTransaction(async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const period=await requestPeriod(db,req.query.month);
      const all=await authorizedProjects(db,user);
      // A project created on or after the cutoff did not exist during the reporting period.
      const projects=all.filter(p=>new Date(p.created_at)<new Date(period.cutoff));
      const history=await reportHistory(db,user,projects.map(p=>p.id));
      const reports=projects.map(project=>buildMonthlyReport({project,period,role:user.role,...history.get(project.id)}));
      const summary=buildMonthlySummary({reports,period,projection:projectionFor(user.role),excludedAfterCutoff:all.length-projects.length});
      const phases=user.role==="spm"?Object.fromEntries(projects.map(p=>[p.id,history.get(p.id).visiblePhaseIds])):null;
      return {summary,snapshot:signReport({kind:"monthly-summary",summary,phases},user)};
    });
    res.set("Cache-Control","private, no-store");
    return sendOk(res,"Monthly summary generated.",data.summary.rows.length,data);
  }catch(error){return handleError(res,error);}
}

export async function exportMonthlySummary(req,res) {
  try {
    const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
    const saved=verifyReport(req.body?.snapshot,user);
    if(saved?.kind!=="monthly-summary")throw new HttpError(400,"Invalid report snapshot.");
    if(!["csv","print"].includes(req.body?.format))throw new HttpError(400,"Choose CSV or print export.");
    const {summary}=saved,view=summaryView(summary,req.body?.filters);
    await withTransaction(async db=>{
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      // Access removed after the preview cannot be exported through an old signed snapshot.
      const current=new Set((await authorizedProjects(db,user)).map(p=>p.id));
      if(view.rows.some(row=>!current.has(row.id)))throw new HttpError(403,"Your project access changed. Refresh the report.");
      if(user.role==="spm"){
        const ids=view.rows.map(row=>row.id),assigned=new Map(ids.map(id=>[id,new Set()]));
        if(ids.length)for(const row of (await db.query("select project_id,project_stage_id from project_phase_team where project_id=any($1::uuid[]) and spm_user_id=$2",[ids,user.id])).rows)
          assigned.get(row.project_id).add(String(row.project_stage_id));
        if(ids.some(id=>(saved.phases?.[id]||[]).some(phase=>!assigned.get(id).has(phase))))throw new HttpError(403,"Your phase access changed. Refresh the report.");
      }
    });
    res.set("Cache-Control","private, no-store");
    return sendOk(res,"Summary export authorized.",view.rows.length,req.body.format==="csv"?{csv:summaryCsv(summary,view)}:{summary,view});
  }catch(error){return handleError(res,error);}
}
