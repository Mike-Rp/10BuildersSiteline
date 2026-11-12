import {test,mock} from "node:test";
import assert from "node:assert/strict";
import {HISTORY_UNAVAILABLE} from "../src/domain/monthly-report.js";
import {reportCsv} from "../src/domain/report-export.js";

const project={id:"p",name:"Green Cross Department",created_at:"2026-11-06T08:06:25.925Z",status:"archived",type:"Commercial"};
const cutoff="2026-11-13T00:00:00Z";
const source=()=>({projects:[{id:"p",project_type_id:1}],project_type_stages:[{project_type_id:1,project_stage_id:1,sort_order:1}],
  project_stages:[{id:1,code:"Foundation"}],project_phase_checklists:[{project_id:"p",project_stage_id:1}],
  project_phase_checklist_items:[{id:1,project_id:"p",project_stage_id:1,required:true,weight:10}],project_phase_evidence:[],
  project_progress_history:[{id:1,project_stage_id:1,entry_type:"update",is_client_visible:true,recorded_at:"2026-11-07T00:00:00Z",note:"Shared update"},
    {id:2,project_stage_id:1,entry_type:"issue",is_client_visible:false,recorded_at:"2026-11-07T00:00:00Z",note:"Private issue"}]});
let fixture;
const reset=()=>fixture={user:{id:"admin",role:"admin"},allowed:true,configured:true,baseline:{project_id:"p",covered_from:"2026-10-01T00:00:00Z",data:source()},events:[],phases:[{project_id:"p",project_stage_id:1}],queries:[]};
async function query(sql){
  fixture.queries.push(sql);
  if(sql.startsWith("SET TRANSACTION"))return {rows:[]};
  if(sql.includes("select p.id"))return {rows:[project]};
  if(sql.includes("select now()"))return {rows:[{cutoff}]};
  if(sql.includes("to_regclass"))return {rows:[{baseline:fixture.configured?"monthly_report_baselines":null,events:fixture.configured?"monthly_report_events":null}]};
  if(sql.includes("from monthly_report_baselines"))return {rows:fixture.baseline?[fixture.baseline]:[]};
  if(sql.includes("from monthly_report_events"))return {rows:fixture.events};
  if(sql.includes("from project_phase_team"))return {rows:fixture.phases};
  throw new Error(`Unexpected SQL: ${sql}`);
}
mock.module("../src/common/utilities/transaction.utility.js",{namedExports:{withTransaction:async fn=>fn({query})}});
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
mock.module("../src/common/utilities/access.utility.js",{namedExports:{
  requireUser:async()=>fixture.user,hasProjectAccess:async()=>fixture.allowed,isUuid:()=>true,HttpError,
  handleError:(res,error)=>{res.status=error.status||500;res.body={message:error.message};},
  sendOk:(res,message,count,data)=>{res.status=200;res.body=data;},
}});
const {monthlyReport,exportMonthlyReport,signReport}=await import("../src/services/reports/controller.js");
const response=()=>({set(){return this;}});
async function preview(){const res=response();await monthlyReport({params:{id:"p"},query:{month:"2026-11"}},res);return res;}
async function exported(snapshot,format="print"){const res=response();await exportMonthlyReport({params:{id:"p"},body:{snapshot,format}},res);return res;}

test("GET and snapshot exports preserve missing, partial and valid historical coverage",async t=>{
  const secret=process.env.JWT_SECRET;process.env.JWT_SECRET="monthly-report-isolated-tests";
  t.after(()=>{if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;});
  for(const coverage of ["no migration","no baseline","late baseline","valid"]){
    reset();
    if(coverage==="no migration")fixture.configured=false;
    if(coverage==="no baseline")fixture.baseline=null;
    if(coverage==="late baseline")fixture.baseline.covered_from="2026-11-08T00:00:00Z";
    const res=await preview();assert.equal(res.status,200);
    const {report,snapshot}=res.body;
    assert.equal(report.period.start,"2026-10-31T16:00:00.000Z");
    if(coverage==="valid"){assert.equal(report.opening.percentage,0);assert.deepEqual(report.limitations,[]);}
    else {assert.equal(report.opening.percentage,null);assert.equal(report.approvals,null);assert.ok(report.limitations.includes(HISTORY_UNAVAILABLE));}
    assert.equal(report.closing.percentage,["valid","late baseline"].includes(coverage)?0:null);
    fixture.events=[];fixture.baseline=null; // Export must use the original signed result.
    const before=fixture.queries.length;
    assert.deepEqual((await exported(snapshot)).body.report,report);
    assert.equal((await exported(snapshot,"csv")).body.csv,reportCsv(report));
    assert.ok(fixture.queries.slice(before).every(sql=>!sql.includes("monthly_report_")),"export must not reconstruct history");
    fixture.allowed=false;assert.equal((await exported(snapshot)).status,404);
  }
});

test("client visibility and signed snapshot identity survive both export formats",async t=>{
  process.env.JWT_SECRET="monthly-report-client-tests";t.after(()=>delete process.env.JWT_SECRET);
  reset();fixture.user={id:"c",role:"client"};
  const {body:{report,snapshot}}=await preview();
  assert.equal(report.updates.length,1);assert.equal(report.updates[0].text,"Shared update");
  for(const format of ["csv","print"]){const res=await exported(snapshot,format);assert.equal(res.status,200);assert.doesNotMatch(JSON.stringify(res.body),/Private issue|reviewed_by|pending|withdrawals/);}
  assert.equal((await exported(snapshot+"x")).status,400);
  fixture.user={id:"other",role:"client"};assert.equal((await exported(snapshot)).status,403);
  fixture.allowed=false;assert.equal((await preview()).status,404);
});

test("Site PM export rechecks pending-detail phase scope even when there is no activity",async t=>{
  process.env.JWT_SECRET="monthly-report-site-tests";t.after(()=>delete process.env.JWT_SECRET);
  reset();fixture.user={id:"s",role:"spm"};
  const {body:{report,snapshot}}=await preview();
  assert.deepEqual(report.activity,[]);assert.deepEqual(report.detailPhaseIds,["1"]);
  assert.equal((await exported(snapshot)).status,200);
  fixture.phases=[];
  for(const format of ["print","csv"])assert.equal((await exported(snapshot,format)).status,403);
  const legacy={...report};delete legacy.detailPhaseIds;
  assert.equal((await exported(signReport(legacy,fixture.user))).status,403);
});

test("approval changes after preview do not change export or the reporting cutoff",async t=>{
  process.env.JWT_SECRET="monthly-report-cutoff-tests";t.after(()=>delete process.env.JWT_SECRET);
  reset();
  const {body:{report,snapshot}}=await preview();
  const approved={id:1,project_stage_id:1,checklist_item_id:1,status:"approved",reviewed_by:"opm",reviewed_at:cutoff};
  fixture.events=[{id:1,project_id:"p",source_table:"project_phase_evidence",operation:"INSERT",after_row:approved,before_row:null,occurred_at:cutoff,transaction_id:1}];
  assert.equal((await preview()).body.report.closing.earned,0,"cutoff is exclusive");
  fixture.events[0].occurred_at="2026-11-12T00:00:00Z";
  assert.equal((await preview()).body.report.closing.earned,10);
  assert.deepEqual((await exported(snapshot)).body.report,report);
  assert.equal((await exported(snapshot,"csv")).body.csv,reportCsv(report));
});
