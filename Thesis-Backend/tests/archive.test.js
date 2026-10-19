import { test,mock } from "node:test";
import assert from "node:assert/strict";
const access=await import("../src/common/utilities/access.utility.js");
const id="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const admin={id,role:"admin"},opm={id,role:"opm"},spm={id,role:"spm"};
let state;
function setup(options={}) {
 state={project:{id,current_stage_id:7,current_stage:"Closeout",lifecycle_status:"active",updated_at:"2026-08-01T00:00:00Z"},
   projects:null,items:[{id:"1",required:true,status:"approved"}],pending:false,headcount:14,
   mutations:[],events:[],queries:[],due:[],generic:[],stale:false,unresolved:[],declined:false,
   user:{id:other,status:"suspended",is_deleted:false},now:"2026-10-09T08:00:00Z",...options};
 return state;
}
const rows=values=>({rows:values,rowCount:values.length});
async function query(sql,args=[]) {
 sql=sql.replace(/\s+/g," ").trim();state.queries.push({sql,args});
 if(sql==="SELECT now() AS now") return rows([{now:state.now}]);
 if(sql.startsWith("SELECT p.*")) return rows(state.projects ?? [structuredClone(state.project)]);
 if(sql.startsWith("SELECT id FROM project_stages")) return rows([{id:7}]);
 if(sql.startsWith("INSERT INTO project_phase_checklists")) return rows([]);
 if(sql.startsWith("SELECT i.id")) return rows(state.items);
 if(sql.startsWith("SELECT 1 FROM project_phase_updates")) return rows(state.pending ? [{}] : []);
 if(sql.startsWith("SELECT count(*)::int AS headcount")) return rows([{headcount:state.headcount}]);
 if(sql.startsWith("SELECT id FROM audit_log")) return rows([{id:"101"}]);
 if(sql.startsWith("INSERT INTO audit_log")) {
   const event=JSON.parse(args[3]);state.events.push({...event,table:args[0],record_id:args[1],actor_id:args[2]});
   return rows([{id:"102",changed_at:state.now}]);
 }
 if(sql.startsWith("UPDATE projects") || sql.startsWith("UPDATE project_engineers") ||
   sql.startsWith("UPDATE subcontractor_workers") || sql.startsWith("UPDATE project_subcontractor_assignments")) {
   state.mutations.push(sql);
   if(sql.includes("lifecycle_status='archived'")) state.project.lifecycle_status="archived";
   return rows([{}]);
 }
 if(sql.startsWith("SELECT * FROM project_phase_team")) return rows(state.due);
 if(sql.startsWith("SELECT * FROM assignment_confirmations")) return rows(state.generic);
 if(sql.startsWith("UPDATE project_phase_team SET status='auto_expired'")) {
   state.due[0].status="auto_expired";state.mutations.push(sql);return rows([{}]);
 }
 if(sql.startsWith("UPDATE assignment_confirmations")) {state.mutations.push(sql);return rows([{}]);}
 if(sql.startsWith("SELECT 1 FROM projects")) return rows(state.stale ? [{}] : []);
 if(sql.startsWith("SELECT a.id,a.changed_at,a.new_values")) return rows(state.unresolved);
 if(sql.startsWith("SELECT 1 FROM project_phase_team")) return rows(state.declined ? [{}] : []);
 if(sql.startsWith("SELECT id,status,is_deleted FROM users")) return rows([state.user]);
 if(sql.startsWith("UPDATE users SET is_deleted=true")) {state.user.is_deleted=true;state.mutations.push(sql);return rows([{}]);}
 if(sql.startsWith("DELETE FROM users_token")) {state.mutations.push(sql);return rows([]);}
 if(sql.startsWith("UPDATE users SET status='active'")) {
   if(state.user.is_deleted || state.user.status!=="suspended") return rows([]);
   state.user.status="active";state.mutations.push(sql);return rows([{id:other}]);
 }
 if(sql.startsWith("SELECT count(*)::int AS total FROM (")) return rows([{total:1}]);
 if(sql.startsWith("SELECT * FROM (")) return rows([{project_id:id,project_name:"Historical site"}]);
 throw new Error("Unexpected archive query: "+sql);
}
mock.module("../src/common/utilities/query.utility.js",{defaultExport:query,namedExports:{execute:query}});
mock.module("../src/common/utilities/transaction.utility.js",{namedExports:{withTransaction:async fn=>fn({query})}});
mock.module("../src/common/utilities/access.utility.js",{namedExports:{...access,
 requireUser:async(req,res,roles)=>{
  if(!req.actor || !roles.includes(req.actor.role)){access.sendError(res,"Forbidden.",403);return null;}
  return req.actor;
 },hasProjectAccess:async()=>true,isProjectOpmOrAdmin:async user=>["admin","opm"].includes(user.role),
}});
const audit=await import("../src/services/archive/audit.utility.js");
const queries=await import("../src/services/archive/queries.js");
const policy=await import("../src/services/archive/policy.js");
const actions=await import("../src/services/archive/actions.controller.js");
const controller=await import("../src/services/archive/controller.js");
function response(){return {statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};}
const request=(actor=admin,body={})=>({actor,body,params:{id:other,view:"closed-projects"},query:{}});

test("each role has exactly its requested archive tabs",()=>{
 assert.equal(queries.ARCHIVE_VIEWS.admin.length,4);
 assert.equal(queries.ARCHIVE_VIEWS.opm.length,3);
 assert.equal(queries.ARCHIVE_VIEWS.spm.length,3);
 for(const role of ["admin","opm","spm"]) for(const view of queries.ARCHIVE_VIEWS[role]) {
  const q=queries.archiveQuery({id,role},view);
  assert.match(q.countSql,/SELECT count/);
  assert.equal(q.dataParams.slice(-2)[0],20);
 }
});
test("OPM and SPM archive queries bind the authenticated identity, not a supplied user_id",()=>{
 const q=queries.archiveQuery(spm,"completed-projects",{user_id:other});
 assert.equal(q.params[0],id);
 assert.equal(q.params.includes(other),false);
 assert.throws(()=>queries.archiveQuery(spm,"suspended-accounts"),/unavailable/);
});
test("archive pagination and suspension review thresholds are validated",()=>{
 for(const q of [{page:0},{pageSize:101},{threshold_days:0},{threshold_days:"bad"}]) {
  assert.throws(()=>queries.archiveQuery(admin,"suspended-accounts",q));
 }
 const q=queries.archiveQuery(opm,"accepted-projects",{page:2,pageSize:10,q:"Warehouse"});
 assert.deepEqual(q.dataParams.slice(-2),[10,10]);
 assert.equal(q.params[1],"%Warehouse%");
});
test("three business days skip weekends in Asia/Taipei",()=>{
 assert.equal(audit.businessDeadline("2026-10-09T08:00:00Z").toISOString(),"2026-10-14T08:00:00.000Z");
 assert.equal(audit.businessDeadline("2026-10-12T08:00:00Z").toISOString(),"2026-10-15T08:00:00.000Z");
 assert.throws(()=>audit.businessDeadline(null));
});
test("empty optional response notes are accepted but a decline/removal reason is mandatory",()=>{
 assert.equal(audit.archiveNote(" "),null);
 assert.equal(audit.archiveNote("Accepted after review."),"Accepted after review.");
 assert.throws(()=>audit.archiveNote(" ",true));
});
test("workflow notes refer to the existing audit snapshot without adding a table",async()=>{
 setup();
 await audit.recordArchiveEvent({query},id,"project_phase_team","7","phase_response",{reason:"Existing commitment.",response:"declined"});
 assert.equal(state.events[0].reference_audit_id,"101");
 assert.equal(state.events[0].reason,"Existing commitment.");
 assert.equal(state.queries.some(q=>/CREATE TABLE|ALTER TABLE/.test(q.sql)),false);
});
test("Closeout archives only after all required deliverables are approved",async()=>{
 setup({items:[{id:"1",required:true,status:"pending"}]});
 assert.equal(await policy.maybeCloseProject({query},state.project,id),false);
 assert.equal(state.events.length,0);
 assert.equal(state.mutations.length,0);
});
test("unconfigured Closeout deliverables cannot be treated as complete",async()=>{
 setup({items:[]});
 assert.equal(await policy.maybeCloseProject({query},state.project,id),false);
 assert.equal(state.mutations.length,0);
});
test("pending progress, issue, or subcontractor reviews defer project closure",async()=>{
 setup({pending:true});
 assert.equal(await policy.maybeCloseProject({query},state.project,id),false);
 assert.equal(state.events.length,0);
});
test("closed project snapshots final headcount before workers and engineers are released",async()=>{
 setup();
 assert.equal(await policy.maybeCloseProject({query},state.project,id),true);
 assert.equal(state.events[0].archive_category,"closed");
 assert.equal(state.events[0].final_headcount,14);
 assert.equal(state.project.lifecycle_status,"archived");
 assert.equal(state.mutations.some(sql=>sql.startsWith("UPDATE subcontractor_workers")),true);
 assert.equal(state.mutations.some(sql=>sql.startsWith("UPDATE project_engineers")),true);
});
test("ordinary stages cannot close a project even with an approved checklist",async()=>{
 setup({project:{id,current_stage_id:4,current_stage:"Structure",lifecycle_status:"active"}});
 assert.equal(await policy.maybeCloseProject({query},state.project,id),false);
 assert.equal(state.queries.length,0);
});
test("maintenance expires overdue SPM responses but never auto-removes suspended users",async()=>{
 setup({project:{id,current_stage_id:4,current_stage:"Structure",lifecycle_status:"spm_review",updated_at:"2026-10-08T00:00:00Z"},
   due:[{id:"7",spm_user_id:other,response_deadline_at:"2026-10-07T08:00:00Z"}]});
 const result=await policy.sweepArchive({query});
 assert.equal(result.expired_assignments,1);
 assert.equal(state.due[0].status,"auto_expired");
 assert.equal(state.events[0]._archive_event,"phase_expired");
 assert.equal(state.user.is_deleted,false);
});
test("SPM response windows do not expire while intake still awaits OPM acceptance",async()=>{
 setup({project:{id,current_stage_id:null,current_stage:null,lifecycle_status:"sent_to_opm"},
   due:[{id:"7",spm_user_id:other,response_deadline_at:"2026-10-01T00:00:00Z"}]});
 const result=await policy.sweepArchive({query});
 assert.equal(result.expired_assignments,0);
 assert.equal(state.events.length,0);
});
test("changes requested today are not archived merely because an intake was created long ago",async()=>{
 setup({project:{id,lifecycle_status:"spm_review",updated_at:"2026-08-01T00:00:00Z"},stale:true,
   unresolved:[{id:"99",reason:"Missing revisions",changed_at:"2026-10-08T00:00:00Z",changed_by:other}]});
 const result=await policy.sweepArchive({query});
 assert.equal(result.dead_end_intakes,0);
 assert.equal(state.project.lifecycle_status,"spm_review");
});
test("unrevived intake archives after 30 idle days while retaining original reason and flagged date",async()=>{
 setup({project:{id,lifecycle_status:"spm_review",updated_at:"2026-08-01T00:00:00Z"},stale:true,
   unresolved:[{id:"99",reason:"Missing revisions",changed_at:"2026-08-01T00:00:00Z",changed_by:other}]});
 const result=await policy.sweepArchive({query});
 assert.equal(result.dead_end_intakes,1);
 assert.equal(state.events[0].reason,"Missing revisions");
 assert.equal(state.events[0].flagged_at,"2026-08-01T00:00:00Z");
 assert.equal(state.events[0].flagged_by,other);
});
test("Admin removal of a suspended account records a reason and retains the user row",async()=>{
 setup();const res=response();
 await actions.archiveSuspendedAccount(request(admin,{reason:"Resigned from company."}),res);
 assert.equal(res.statusCode,200);
 assert.equal(state.user.is_deleted,true);
 assert.equal(state.events[0].reason,"Resigned from company.");
 assert.equal(state.queries.some(q=>/^DELETE FROM users\b/.test(q.sql)),false);
});
test("permanently removed accounts cannot be reinstated",async()=>{
 setup({user:{id:other,status:"suspended",is_deleted:true}});const res=response();
 await actions.reinstateAccount(request(admin),res);
 assert.equal(res.statusCode,409);
 assert.equal(state.events.length,0);
});
test("SPM cannot remove accounts or manually run global archive maintenance",async()=>{
 for(const method of [actions.archiveSuspendedAccount,actions.runArchiveSweep]) {
  setup();const res=response();await method(request(spm,{reason:"Reason"}),res);
  assert.equal(res.statusCode,403);
  assert.equal(state.queries.length,0);
 }
});
test("archive GET requests return read-only data and never mutate records",async()=>{
 setup();const res=response();
 await controller.getArchive(request(admin),res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.read_only,true);
 assert.equal(state.queries.every(q=>q.sql.startsWith("SELECT")),true);
});
test("archived projects cannot receive new changes requests",async()=>{
 setup({project:{id,lifecycle_status:"archived",current_stage:"Closeout"}});const res=response();
 await actions.requestChanges(request(opm,{reason:"New revisions"}),res);
 assert.equal(res.statusCode,409);
 assert.equal(state.events.length,0);
});
