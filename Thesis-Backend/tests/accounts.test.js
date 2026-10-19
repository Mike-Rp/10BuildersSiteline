import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const access=await import("../src/common/utilities/access.utility.js");
let state;
const admin={id:"11111111-1111-4111-8111-111111111111",role:"admin"};
const personId="22222222-2222-4222-8222-222222222222";
const projectId="33333333-3333-4333-8333-333333333333";
const roles={admin:1,opm:2,spm:3,client:4};
const originalSecret=process.env.JWT_SECRET;
process.env.JWT_SECRET="account-test-secret-not-a-real-credential";
after(()=>{ if(originalSecret===undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=originalSecret; });

function setup(options={}) {
  state={users:[],projects:[{id:projectId,name:"Intake draft",lifecycle_status:"draft",client_name:null}],
    links:[],tokens:[],queries:[],total:1,listed:[],...options};
  return state;
}
function response() {
  return {statusCode:200,body:null,status(n){this.statusCode=n;return this;},
    json(body){this.body=body;return this;},send(body){this.body=body;return this;}};
}
const request=(body={},actor=admin)=>({body,actor,params:{id:projectId},query:{}});
async function query(sql,args=[]) {
  sql=sql.replace(/\s+/g," ").trim();
  state.queries.push({sql,args});
  const rows=r=>({rows:r,rowCount:r.length});
  if(sql.includes("CROSS JOIN LATERAL")) return rows(sql.startsWith("SELECT count") ? [{total:state.total}] : state.listed);
  if(sql.startsWith("SELECT id FROM roles")) return rows(roles[args[0]] ? [{id:roles[args[0]]}] : []);
  if(sql.startsWith("SELECT id FROM project_types")) return rows([{id:1}]);
  if(sql.startsWith("SELECT id,client_name,lifecycle_status FROM projects")) return rows(state.projects.filter(p=>p.id===args[0]));
  if(sql.startsWith("SELECT id FROM projects")) return rows(state.projects.filter(p=>args[0].includes(p.id)));
  if(sql.startsWith("SELECT id, code FROM disciplines")) return rows(args[0].filter(code=>["Civil","Structural"].includes(code)).map((code,i)=>({id:i+1,code})));
  if(sql.startsWith("SELECT u.id")) {
    return rows(state.users.filter(u=>u.email.toLowerCase()===args[0]));
  }
  if(sql.startsWith("INSERT INTO users ")) {
    if(state.users.some(u=>u.email.toLowerCase()===args[2])) throw Object.assign(new Error("Duplicate email"),{code:"23505"});
    const u={id:args[0],full_name:args[1],email:args[2],phone:args[3],password_hash:args[4],
      role_id:args[5],role:Object.keys(roles).find(role=>roles[role]===args[5]),status:"invited",temp_password_issued:true};
    state.users.push(u);
    return rows([{id:u.id,full_name:u.full_name,email:u.email,phone:u.phone,status:u.status,date_added:"2026-10-09"}]);
  }
  if(sql.startsWith("DELETE FROM user_discipline_scopes")) return rows([]);
  if(sql.startsWith("INSERT INTO user_discipline_scopes")) return rows([{}]);
  if(sql.startsWith("DELETE FROM user_client_project_links")) {
    state.links=sql.includes("project_id=$1") ? state.links.filter(l=>l.project_id!==args[0] || l.user_id===args[1]) : state.links.filter(l=>l.user_id!==args[0]);
    return rows([]);
  }
  if(sql.startsWith("INSERT INTO user_client_project_links")) {
    if(!state.links.some(l=>l.user_id===args[0] && l.project_id===args[1])) state.links.push({user_id:args[0],project_id:args[1]});
    return rows([{}]);
  }
  if(sql.startsWith("UPDATE projects SET client_name")) {
    state.projects.find(p=>p.id===args[0]).client_name=args[1]; return rows([{}]);
  }
  if(sql.startsWith("SELECT 1 FROM user_client_project_links")) {
    return rows(state.links.filter(l=>{
      const p=state.projects.find(p=>p.id===l.project_id);
      return p && ["active","archived"].includes(p.lifecycle_status) && !p.is_deleted &&
        (args.length===1 ? l.user_id===args[0] : l.project_id===args[0] && l.user_id===args[1]);
    }));
  }
  if(sql.startsWith("UPDATE users SET status='active'")) {state.users.find(u=>u.id===args[0]).status="active";return rows([{}]);}
  if(sql.startsWith("SELECT 1 FROM users_token")) return rows(state.tokens.filter(t=>t.user_id===args[0]));
  if(sql.startsWith("INSERT INTO users_token") || sql.startsWith("UPDATE users_token")) {
    state.tokens=[{user_id:args[0],token:args[1]}];return rows([{}]);
  }
  throw new Error("Unexpected query: "+sql);
}
mock.module("../src/common/utilities/query.utility.js",{defaultExport:query,namedExports:{execute:query}});
mock.module("../src/common/utilities/transaction.utility.js",{namedExports:{withTransaction:async callback=>{
  const before=structuredClone(state);
  try {return await callback({query});}
  catch(error) {const queries=state.queries;state=before;state.queries=queries;throw error;}
}}});
mock.module("../src/common/utilities/access.utility.js",{namedExports:{...access,
  requireUser:async(req,res,allowed)=>{
    if(!req.actor){access.sendError(res,"No token.",401);return null;}
    if(allowed && !allowed.includes(req.actor.role)){access.sendError(res,"Forbidden.",403);return null;}
    return req.actor;
  },
}});
const {accountListQuery}=await import("../src/services/accounts/account-list.utility.js");
const accounts=await import("../src/services/accounts/manage.controller.js");
const intakeClients=await import("../src/services/projects/intake-client.controller.js");
const auth=await import("../src/services/auth/controller.js");

test("role filters use existing role codes and both count/data queries share search and scope conditions",()=>{
  const q=accountListQuery({role:"client",q:"Residence",status:"invited",page:"2",pageSize:"10"});
  assert.deepEqual(q.params,["client","invited","%Residence%"]);
  assert.deepEqual(q.dataParams,["client","invited","%Residence%",10,10]);
  assert.match(q.countSql,/unnest\(scopes.scope\)/);
  assert.match(q.countSql,/u.status ILIKE/);
  assert.match(q.dataSql,/u.id ASC LIMIT \$4 OFFSET \$5/);
});
test("All filter includes every role and legacy limit/offset and role IDs remain supported",()=>{
  const all=accountListQuery({role:"all",limit:"10",offset:"20",role_ids:"1,4"});
  assert.deepEqual(all.params,[[1,4]]);
  assert.equal(all.page,3);
  assert.match(all.countSql,/u.role_id = ANY\(\$1::smallint\[\]\)/);
});
test("invalid pagination, role and status filters are rejected",()=>{
  for(const q of [{page:"0"},{pageSize:"0"},{page:"1bad"},{role:"owner"},{status:"deleted"},{role_ids:"text"}]) {
    assert.throws(()=>accountListQuery(q));
  }
});
test("Team Accounts returns client project scope and complete pagination metadata",async()=>{
  setup({total:23,listed:[{id:personId,role:"client",scope:["Alden Heights"]}]});
  const req=request();req.query={role:"client",page:"2",pageSize:"10"};
  const res=response();await accounts.listAccounts(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.count,23);
  assert.equal(res.body.pagination.total_pages,3);
  assert.equal(res.body.pagination.page,2);
  assert.equal(res.body.pagination.has_next,true);
  assert.deepEqual(res.body.data[0].scope,["Alden Heights"]);
});
test("only Admin can list or create team accounts",async()=>{
  setup();
  for(const handler of [accounts.listAccounts,accounts.createAccount]) {
    const res=response();await handler(request({}, {id:personId,role:"spm"}),res);
    assert.equal(res.statusCode,403);
  }
  assert.equal(state.queries.length,0);
});
test("Admin accounts are created without scope and start Invited",async()=>{
  setup();
  const res=response();await accounts.createAccount(request({full_name:"New Admin",email:"new@example.test",role:"admin",password:"ExamplePass123"}),res);
  assert.equal(res.statusCode,201);
  assert.equal(res.body.data.status,"invited");
  assert.equal(res.body.data.temp_password,"ExamplePass123");
  assert.equal(await bcrypt.compare("ExamplePass123",state.users[0].password_hash),true);
  assert.equal(res.body.data.password_hash,undefined);
});
test("OPM maximum two specializations and SPM maximum three disciplines are enforced",async()=>{
  for(const body of [
    {role:"opm",scope:{project_types:["A","B","C"]}},
    {role:"spm",scope:{disciplines:["A","B","C","D"]}},
  ]) {
    setup();const res=response();
    await accounts.createAccount(request({...body,full_name:"Engineer",email:"e@example.test"}),res);
    assert.equal(res.statusCode,422);
    assert.equal(state.users.length,0);
  }
});
test("unknown scope values roll back the newly inserted user",async()=>{
  setup();const res=response();
  await accounts.createAccount(request({full_name:"Engineer",email:"e@example.test",role:"spm",scope:{disciplines:["Unknown"]}}),res);
  assert.equal(res.statusCode,400);
  assert.equal(state.users.length,0);
});
test("client popup creates a user and saves company name on the existing project",async()=>{
  setup();const res=response();
  await intakeClients.createIntakeClient(request({project_id:projectId,company_name:"Marbrisa Land Corp.",
    contact_person:"Maria Santos",email:"Maria@Example.test",contact_number:"09123456789"}),res);
  assert.equal(res.statusCode,201);
  assert.equal(state.users[0].role,"client");
  assert.equal(state.users[0].full_name,"Maria Santos");
  assert.equal(state.users[0].status,"invited");
  assert.equal(state.projects[0].client_name,"Marbrisa Land Corp.");
  assert.equal(state.links[0].project_id,projectId);
  assert.equal(res.body.data.temp_password.length,10);
  assert.equal(state.queries.some(q=>/CREATE TABLE|ALTER TABLE|INSERT INTO clients\b/i.test(q.sql)),false);
});
test("returning client is reused without replacing credentials or deleting their other projects",async()=>{
  setup({users:[{id:personId,email:"maria@example.test",full_name:"Maria Santos",role:"client",status:"active",password_hash:"original"}],
    links:[{user_id:personId,project_id:"44444444-4444-4444-8444-444444444444"}]});
  const res=response();
  await intakeClients.createIntakeClient(request({project_id:projectId,company_name:"Returning Corp.",
    contact_person:"Maria Santos",email:"maria@example.test"}),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.reused,true);
  assert.equal(res.body.data.temp_password,undefined);
  assert.equal(state.users.length,1);
  assert.equal(state.users[0].password_hash,"original");
  assert.equal(state.links.length,2);
});
test("popup cannot reuse a staff email as a client",async()=>{
  setup({users:[{id:personId,email:"staff@example.test",full_name:"Staff",role:"opm",status:"active"}]});
  const res=response();
  await intakeClients.createIntakeClient(request({project_id:projectId,company_name:"Corp",contact_person:"Staff",email:"staff@example.test"}),res);
  assert.equal(res.statusCode,409);
  assert.equal(state.links.length,0);
});
test("popup refuses edits after intake approval",async()=>{
  setup({projects:[{id:projectId,lifecycle_status:"active"}]});
  const res=response();
  await intakeClients.createIntakeClient(request({project_id:projectId,company_name:"Corp",contact_person:"Person",email:"p@example.test"}),res);
  assert.equal(res.statusCode,409);
  assert.equal(state.users.length,0);
});
test("invited client cannot log in before project approvals",async()=>{
  const hash=await bcrypt.hash("TestPassword123",4);
  setup({users:[{id:personId,full_name:"Client",email:"c@example.test",role:"client",role_id:4,status:"invited",password_hash:hash}],
    links:[{user_id:personId,project_id:projectId}]});
  const res=response();await auth.login({body:{email:"c@example.test",password:"TestPassword123"}},res);
  assert.equal(res.statusCode,403);
  assert.equal(state.users[0].status,"invited");
  assert.equal(state.tokens.length,0);
});
test("approved project's invited client activates on first login and JWT excludes password hashes",async()=>{
  const hash=await bcrypt.hash("TestPassword123",4);
  setup({projects:[{id:projectId,lifecycle_status:"active"}],
    users:[{id:personId,full_name:"Client",email:"c@example.test",role:"client",role_id:4,status:"invited",password_hash:hash}],
    links:[{user_id:personId,project_id:projectId}]});
  const res=response();await auth.login({body:{email:"c@example.test",password:"TestPassword123"}},res);
  assert.equal(res.statusCode,200);
  assert.equal(state.users[0].status,"active");
  const payload=jwt.decode(res.body.data.token);
  const encoded=JSON.parse(Buffer.from(payload.details.user,"base64").toString("utf8"));
  assert.equal(encoded.password_hash,undefined);
  assert.equal(encoded.password,undefined);
});
test("existing client project links do not grant access to an unapproved draft",async()=>{
  setup({links:[{user_id:personId,project_id:projectId}]});
  assert.equal(await access.hasProjectAccess({id:personId,role:"client"},projectId,{query}),false);
  state.projects[0].lifecycle_status="active";
  assert.equal(await access.hasProjectAccess({id:personId,role:"client"},projectId,{query}),true);
});