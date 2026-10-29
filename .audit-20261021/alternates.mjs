import { overallChecklistProgress } from "../src/project-progress.ts"
import { projectPhaseNames } from "../src/model.ts"
// End to end: the Supabase schema + demo data in an in-process Postgres, the real
// Thesis-Backend (Express) in front of it, and the frontend's own login/loader.
// Uses the backend bundled in this repository; all writes stay in the test database.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { login, setApiBase, setToken, api, apiEnvelope, downloadApiFile } from "../src/api/client.ts"
import { saveApiAccount, saveApiProject, createCompany, uploadFile, sendApiWorkflow, persistAdminChanges } from "../src/api/actions.ts"
import { randomUUID } from "node:crypto"
import { loadState } from "../src/api/load.ts"
import { projectDocumentIndex, projectDocumentIndexFor } from "../src/project-document-index.ts"
import { clientDocumentIndex, clientProjectViews } from "../src/client-access.ts"


const auditResults=[],auditMetrics=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==="string"?input:input.url||String(input));
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw Error("Audit network guard: hosted request blocked");
 let role="anonymous";
 try {const token=new Headers(init.headers||{}).get("authorization")?.replace(/^Bearer /,"");if(token)role=JSON.parse(Buffer.from(token.split(".")[1],"base64url")).details?.role||"legacy";}catch{}
 const start=performance.now();
 const response=await nativeFetch(input,init);
 const bytes=(await response.clone().arrayBuffer()).byteLength;
 auditMetrics.push({role,path:url.pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,":id"),status:response.status,ms:Number((performance.now()-start).toFixed(2)),bytes});
 return response;
};
const finding=(name,expected,actual,pass)=>auditResults.push({name,expected,actual,result:pass?"PASS":"FAIL"});
process.on("exit",()=>{
 fs.writeFileSync(new URL("./alternate-results.json",import.meta.url),JSON.stringify(auditResults,null,2));
 fs.writeFileSync(new URL("./alternate-metrics.json",import.meta.url),JSON.stringify(auditMetrics,null,2));
});

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const backend = here("../Thesis-Backend/")
const schema = here("../supabase/migrations/20261017000002_thesis_backend_schema.sql")
const dummy = here("../supabase/seed/dummy-data.sql")
const available = fs.existsSync(backend + "src/index.js")

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
const until = async (fn, ms = 30000) => {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (await fn()) return
    } catch {
      /* not ready yet */
    }
    if (Date.now() > end) throw new Error("Timed out waiting for the backend.")
    await new Promise((r) => setTimeout(r, 250))
  }
}

test("the frontend loads each role's data through the real backend", { skip: !available && "Thesis-Backend folder not found", timeout: 240000 }, async (t) => {
  const db = new PGlite({ extensions: { citext } })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(fs.readFileSync(schema, "utf8").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  await db.exec(fs.readFileSync(here("../Thesis-Backend/migrations/003-react-integration.sql"),"utf8"))
  const dummySql = fs.readFileSync(dummy, "utf8")
  await db.exec(dummySql)
  await db.exec(dummySql) // the demo data can be loaded again

  // Before migration the existing projects still use the legacy seven-stage workflow.
  await db.exec(`create table project_type_stages(
   project_type_id smallint not null references project_types(id),
   project_stage_id smallint not null references project_stages(id),sort_order smallint not null,
   primary key(project_type_id,project_stage_id),unique(project_type_id,sort_order));
   insert into project_type_stages select t.id,s.id,s.sort_order from project_types t cross join project_stages s;`)

  const dbPort = await freePort()
  const apiPort = await freePort()
  const pg = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
  await pg.start()
  const server = spawn(process.execPath, ["src/index.js"], {
    cwd: backend,
    env: {
      ...process.env,
      NODE_ENV: "development",
      DB_SERVER: "127.0.0.1", DB_PORT: String(dbPort), DB_NAME: "postgres", DB_USER: "postgres", DB_PASSWORD: "x",
      DB_POOL_MAX: "1", PGSSLMODE: "disable",
      JWT_SECRET: "test-secret-only-for-this-test-0123456789",
      PORT: String(apiPort), HOST: "127.0.0.1", ARCHIVE_MAINTENANCE_ENABLED: "false",
    },
    stdio: "ignore",
  })
  t.after(async () => {
    server.kill()
    await pg.stop()
    await db.close()
  })
  setApiBase(`http://127.0.0.1:${apiPort}/api/v1`)
  await until(async () => (await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok)

  const asUser = async (email) => {
    setToken("")
    const user = await login(email, "Password@123")
    return { user, state: await loadState(user) }
  }
  const names = (state) => state.projects.map((p) => p.name).sort()

  await t.test("wrong passwords and suspended accounts are refused", async () => {
    await assert.rejects(login("patricia.domingo@10builders.com", "wrong"), /Invalid credentials/)
    await assert.rejects(login("jomar.reyes@10builders.com", "Password@123"), /Invalid credentials|unavailable/)
  })

  await t.test("admin sees every account, project and company with real progress", async () => {
    const { state } = await asUser("patricia.domingo@10builders.com")
    assert.equal(state.accounts.length, 11)
    assert.equal(state.projects.length, 7)
    assert.equal(state.companies.length, 6)
    const byName = Object.fromEntries(state.projects.map((p) => [p.name, p]))
    assert.deepEqual([byName["Rosaria Business Park"].status, byName["Rosaria Business Park"].progress], ["active", 60])
    assert.equal(byName["Meralco Ave. Fit-out"].progress, 67)
    assert.equal(byName["Brookfield Warehouse Ext."].progress, 33)
    assert.deepEqual([byName["Cavite Cold Storage Facility"].status, byName["Cavite Cold Storage Facility"].progress], ["completed", 100])
    assert.equal(byName["Alden Heights Residences — Tower B"].status, "pending")
    assert.equal(byName["Riverside Mixed-Use Plaza"].status, "draft")
    const rosaria = byName["Rosaria Business Park"]
    assert.equal(rosaria.team.length, 7)
    assert.equal(rosaria.docs.filter((d) => d.uploaded).length, 7)
    assert.equal(rosaria.workflow.photos.length, 2)
    assert.equal(rosaria.workflow.pendingUpdate,undefined,"Retired manual-percentage requests must not appear in the new review queue")
    assert.equal(rosaria.workflow.checklist.Structure.filter((i) => i.status === "approved").length, 3)
    const karlo = state.accounts.find((a) => a.name === "Karlo M. Espiritu")
    assert.deepEqual(karlo.scope.sort(), ["Civil", "Structural", "Waterproofing"])
    assert.match(karlo.license, /PRC Registered Engineer/)
    const maria = state.accounts.find((a) => a.name === "Maria L. Santos")
    assert.equal(maria.scope.length, 3, "a client is linked to their projects")
    assert.equal(state.projects.every((p) => state.accounts.some((a) => a.id === p.clientId)), true)
  })

  await t.test("each role sees only its own projects", async () => {
    assert.deepEqual(names((await asUser("lea.fernandez@10builders.com")).state), ["Meralco Ave. Fit-out", "Rosaria Business Park"])
    assert.deepEqual(names((await asUser("renz.villaverde@10builders.com")).state), [
      "Alden Heights Residences — Tower B", "Brookfield Warehouse Ext.", "Cavite Cold Storage Facility", "Sto. Niño Townhomes — Phase 2",
    ])
    assert.deepEqual(names((await asUser("karlo.espiritu@10builders.com")).state), ["Alden Heights Residences — Tower B", "Brookfield Warehouse Ext."])
    assert.deepEqual(names((await asUser("f.uy@aldenheights-hoa.com")).state), ["Meralco Ave. Fit-out"])
    assert.deepEqual(names((await asUser("maria.santos@rosariabiz.ph")).state), ["Brookfield Warehouse Ext.", "Cavite Cold Storage Facility", "Rosaria Business Park"])
  })

  await t.test("a client only gets client-visible documents and no company directory", async () => {
    const { state } = await asUser("f.uy@aldenheights-hoa.com")
    assert.equal(state.companies.length, 0)
    const docs = state.projects[0].docs
    assert.equal(docs.filter((d) => d.uploaded && d.clientVisible).length, 4)
    assert.equal(docs.filter((d) => d.uploaded && !d.clientVisible).length, 0, "internal documents are not returned")
  })

  await t.test("a Site PM's names come from the project, and files download", async () => {
    const { user, state } = await asUser("mikaela.bautista@10builders.com")
    assert.ok(state.accounts.some((a) => a.id === user.id))
    const rosaria = state.projects.find((p) => p.name === "Rosaria Business Park")
    assert.ok(rosaria.team.every((tm) => state.accounts.some((a) => a.id === tm.accountId && a.name)))
    const doc = rosaria.docs.find((d) => d.uploaded)
    const blob = await downloadApiFile(doc.id)
    assert.ok(blob && blob.size > 100, "the PDF can be downloaded with the session token")
    assert.equal((await blob.text()).startsWith("%PDF"), true)
  })


  await t.test("admin account edits, new accounts, company files and rules survive reload", async () => {
    let {user,state}=await asUser("patricia.domingo@10builders.com")
    const self=state.accounts.find(a=>a.id===user.id)
    await saveApiAccount({...self,phone:"+639171234567"},true)
    const created=await saveApiAccount({...self,id:randomUUID(),name:"Integration Admin",email:"integration.admin@example.test",docs:[]},false,"Password@123")
    assert.ok(created.id)
    assert.equal((await api("/accounts/"+created.id)).email,"integration.admin@example.test")
    const fileId=randomUUID()
    await uploadFile(fileId,new File(["%PDF-1.4\nIntegration company document"],"company.pdf",{type:"application/pdf"}))
    const source=state.companies[0]
    const saved=await createCompany({...source,id:randomUUID(),name:"Integration Construction",status:"approved",
      documents:[{id:fileId,label:"Company Profile",name:"company.pdf",uploaded:true,owner:self.name,date:"2026-10-18",clientVisible:false}],manpowerDocuments:[]})
    assert.ok(saved.id)
    state=await loadState(user)
    assert.equal(state.companies.find(c=>c.id===saved.id).documents[0].id,fileId)
    assert.equal((await downloadApiFile(fileId)).type,"application/pdf")
    const after={...state,rules:{...state.rules,grace:9}}
    await persistAdminChanges(state,after)
    assert.equal((await loadState(user)).rules.grace,9)
    assert.equal((await loadState(user)).accounts.find(a=>a.id===self.id).phone,"+639171234567")
    await assert.rejects(uploadFile(randomUUID(),new File(["not a pdf"],"fake.pdf",{type:"application/pdf"})),/Supported files/)
  })

  let newProjectId
  await t.test("project intake, confirmations, registered documents and allocation persist", async () => {
    let {user,state}=await asUser("patricia.domingo@10builders.com")
    const draft=state.projects.find(p=>p.name.startsWith("Alden Heights"))
    const source=state.projects.find(p=>p.name==="Brookfield Warehouse Ext.")
    const project={...draft,id:randomUUID(),name:"Integration Test Site",type:source.type,clientId:source.clientId,
      opmId:source.opmId,area:"100",floors:"1",start:"2027-01-15",end:"2027-10-15",docs:[],clientSubcon:"",clientSubconEmail:"",
      team:source.team.map(t=>({...t,status:"pending"}))}
    for(const id of new Set([project.opmId,...project.team.map(t=>t.accountId)])){
      const account=state.accounts.find(a=>a.id===id)
      const fileId=randomUUID()
      await uploadFile(fileId,new File(["%PDF-1.4\nVerified license"],"license.pdf",{type:"application/pdf"}))
      await saveApiAccount({...account,expiry:"2028-12-31",docs:[{id:fileId,label:"PRC License",name:"license.pdf",uploaded:true,owner:account.name,date:"2026-10-18",clientVisible:false}]},true)
    }
    newProjectId=await saveApiProject(project,false)
    state=await loadState(user)
    assert.equal(state.projects.find(p=>p.id===newProjectId).end,"2027-10-15")
    const opm=state.accounts.find(a=>a.id===project.opmId)
    ;({user,state}=await asUser(opm.email))
    await sendApiWorkflow(state,state.accounts.find(a=>a.id===user.id),{type:"accept_opm",projectId:newProjectId})
    for(let index=0;index<6;index++){
      const id=randomUUID()
      await uploadFile(id,new File(["%PDF-1.4\nRegistered document"],"registered.pdf",{type:"application/pdf"}))
      state=await loadState(user)
      await sendApiWorkflow(state,state.accounts.find(a=>a.id===user.id),{type:"upload_registered",projectId:newProjectId,
       docIndex:index,doc:{id,name:"registered.pdf",uploaded:true}})
    }
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    const fresh=state.projects.find(p=>p.id===newProjectId)
    for(const id of new Set(fresh.team.map(t=>t.accountId))){
      const email=state.accounts.find(a=>a.id===id).email
      const session=await asUser(email)
      await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),
        {type:"accept_assignment",projectId:newProjectId})
    }
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    assert.equal((await api("/projects/"+newProjectId)).lifecycle_status,"spm_review","Confirmations alone must not bypass agreement and allocation")
    const lead=state.accounts.find(a=>a.id===fresh.team[0].accountId)
    const session=await asUser(lead.email)
    const leadActor=session.state.accounts.find(a=>a.id===session.user.id)
    const company=session.state.companies.find(c=>c.status==="approved")
    await sendApiWorkflow(session.state,leadActor,{type:"contact_company",projectId:newProjectId,companyId:company.id})
    await sendApiWorkflow(session.state,leadActor,{type:"respond_company",projectId:newProjectId,companyId:company.id,accepted:false})
    assert.equal((await loadState(session.user)).projects.find(p=>p.id===newProjectId).workflow.selections.find(c=>c.companyId===company.id).status,"declined")
  })

  await t.test("SPM evidence and notes persist and OPM approval updates the checklist", async () => {
    let {user,state}=await asUser("karlo.espiritu@10builders.com")
    const project=state.projects.find(p=>p.name==="Brookfield Warehouse Ext.")
    const actor=state.accounts.find(a=>a.id===user.id)
    await sendApiWorkflow(state,actor,{type:"add_note",projectId:project.id,note:"Integration test site diary entry"})
    state=await loadState(user)
    assert.ok(state.projects.find(p=>p.id===project.id).workflow.notes.some(n=>n.text==="Integration test site diary entry"))
    const item=state.projects.find(p=>p.id===project.id).workflow.checklist[project.phase].find(i=>i.status==="missing")
    const id=randomUUID()
    await uploadFile(id,new File(["%PDF-1.4\nChecklist evidence"],"evidence.pdf",{type:"application/pdf"}))
    await sendApiWorkflow(state,actor,{type:"submit_checklist",projectId:project.id,itemId:item.id,doc:{id,name:"evidence.pdf"},note:"Verified on site"})
    const opmSession=await asUser("renz.villaverde@10builders.com")
    await sendApiWorkflow(opmSession.state,opmSession.state.accounts.find(a=>a.id===opmSession.user.id),
      {type:"approve_checklist",projectId:project.id,itemId:item.id})
    const approved=(await loadState(opmSession.user)).projects.find(p=>p.id===project.id).workflow.checklist[project.phase].find(i=>i.id===item.id)
    assert.equal(approved.status,"approved")
  })


  await t.test("a lead's company request can be reviewed and directory allocation activates the project",async()=>{
    let {user,state}=await asUser("patricia.domingo@10builders.com")
    const p=state.projects.find(p=>p.id===newProjectId)
    await api("/projects/"+p.id+"/workspace",{method:"PUT",json:{...p,location:"Integration construction site"}})
    const lead=state.accounts.find(a=>a.id===p.team[0].accountId)
    let session=await asUser(lead.email)
    let actor=session.state.accounts.find(a=>a.id===session.user.id)
    await sendApiWorkflow(session.state,actor,{type:"request_company",projectId:p.id,company:{
      ...session.state.companies[0],id:randomUUID(),name:"Lead Suggested Company",status:"pending",documents:[],manpowerDocuments:[]}})
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    const request=state.companies.find(c=>c.name==="Lead Suggested Company")
    assert.equal(request.status,"pending")
    assert.equal(request.projectId,p.id)
    await api("/subcontractors/"+request.id+"/workspace",{method:"PUT",json:{...request,status:"approved"}})
    const company=state.companies.find(c=>c.name==="Integration Construction")
    await db.query("insert into subcontractor_workers(subcontractor_id,full_name,availability_status) select $1,'Integration worker '||n,'available' from generate_series(1,100)n",[company.id])
    session=await asUser(lead.email);actor=session.state.accounts.find(a=>a.id===session.user.id)
    await sendApiWorkflow(session.state,actor,{type:"contact_company",projectId:p.id,companyId:company.id})
    await sendApiWorkflow(session.state,actor,{type:"respond_company",projectId:p.id,companyId:company.id,accepted:true})
    const id=randomUUID()
    await uploadFile(id,new File(["%PDF-1.4\nSigned agreement"],"signed.pdf",{type:"application/pdf"}))
    await sendApiWorkflow(session.state,actor,{type:"upload_agreement",projectId:p.id,doc:{id,name:"signed.pdf"}})
    const active=await api("/projects/"+p.id)
    assert.equal(active.lifecycle_status,"active")
    assert.equal(active.crew_assigned,active.crew_required)
    assert.ok(active.crew_assigned>0)
    await assert.rejects(sendApiWorkflow(session.state,actor,{type:"upload_agreement",projectId:p.id,doc:{id,name:"signed.pdf"}}),/Only an intake/)
  })


  await t.test("client-provided agreement review and issue resolution gate activation",async()=>{
    let {user,state}=await asUser("patricia.domingo@10builders.com")
    const project=state.projects.find(p=>p.id===newProjectId)
    const docId=randomUUID()
    await uploadFile(docId,new File(["%PDF-1.4\nClient agreement"],"client-agreement.pdf",{type:"application/pdf"}))
    const agreement={id:docId,label:"Client & Subcontractor Agreement",name:"client-agreement.pdf",uploaded:true,clientVisible:false,owner:user.full_name,date:"2026-10-18"}
    await api("/projects/"+project.id+"/workspace",{method:"PUT",json:{...project,clientSubcon:"Client Construction",docs:[...project.docs,agreement]}})
    await db.query("update projects set lifecycle_status='spm_review' where id=$1",[project.id])
    const lead=state.accounts.find(a=>a.id===project.team[0].accountId)
    let session=await asUser(lead.email),actor=session.state.accounts.find(a=>a.id===session.user.id)
    assert.ok(await downloadApiFile(docId),"Assigned lead can read the client's agreement")
    await sendApiWorkflow(session.state,actor,{type:"report_client_subcon_issue",projectId:project.id,note:"Agreement scope needs clarification"})
    await assert.rejects(sendApiWorkflow(session.state,actor,{type:"acknowledge_client_subcon",projectId:project.id}),/open issues resolved/)
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    const issue=state.projects.find(p=>p.id===project.id).clientSubconReview.issues[0]
    assert.equal(issue.text,"Agreement scope needs clarification")
    await api("/projects/"+project.id+"/workspace-command",{method:"POST",json:{type:"resolve_client_subcon_issue",issueId:issue.id,note:"Scope clarified with the client"}})
    session=await asUser(lead.email);actor=session.state.accounts.find(a=>a.id===session.user.id)
    await sendApiWorkflow(session.state,actor,{type:"acknowledge_client_subcon",projectId:project.id})
    await sendApiWorkflow(session.state,actor,{type:"activate_project",projectId:project.id})
    assert.equal((await api("/projects/"+project.id)).lifecycle_status,"active")
    assert.equal((await loadState(session.user)).projects.find(p=>p.id===project.id).clientSubconReview.issues[0].status,"resolved")
  })

  await t.test("a combined progress update is visible after reload and can be approved",async()=>{
    let {user,state}=await asUser("karlo.espiritu@10builders.com")
    const project=state.projects.find(p=>p.name==="Brookfield Warehouse Ext.")
    await sendApiWorkflow(state,state.accounts.find(a=>a.id===user.id),{type:"submit_progress",projectId:project.id,note:"Combined progress note saved through the API"})
    state=await loadState(user)
    assert.equal(state.projects.find(p=>p.id===project.id).workflow.pendingUpdate.note,"Combined progress note saved through the API")
    const session=await asUser("renz.villaverde@10builders.com")
    await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"approve_update",projectId:project.id})
    const after=await loadState(session.user)
    assert.ok(after.projects.find(p=>p.id===project.id).history.some(h=>h.text==="Combined progress note saved through the API"))
    const item=after.projects.find(p=>p.id===project.id).workflow.checklist[project.phase].find(i=>i.status==="approved"&&i.doc)
    assert.ok((await downloadApiFile(item.doc.id)).size>0)
  })

  await t.test("first-login reset and employee resignation persist and revoke access",async()=>{
    let {user,state}=await asUser("patricia.domingo@10builders.com")
    const template=state.accounts.find(a=>a.id===user.id)
    const saved=await saveApiAccount({...template,id:randomUUID(),name:"Resignation Test Admin",email:"resignation.admin@example.test",docs:[]},false,"Password@123")
    const invited=await login("resignation.admin@example.test","Password@123")
    assert.equal(invited.temp_password_issued,true)
    await assert.rejects(api("/auth/reset-password",{method:"POST",json:{password:"short"}}),/8 to 72/)
    await api("/auth/reset-password",{method:"POST",json:{password:"NewPassword@123"}})
    assert.equal((await api("/auth/me")).temp_password_issued,false)
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    const id=randomUUID()
    await uploadFile(id,new File(["%PDF-1.4\nResignation letter"],"resignation.pdf",{type:"application/pdf"}))
    await api("/accounts/"+saved.id+"/resignation",{method:"POST",json:{noticeDays:0,letter:{id,name:"resignation.pdf"}}})
    assert.equal((await loadState(user)).accounts.find(a=>a.id===saved.id).status,"deactivated")
    await assert.rejects(login("resignation.admin@example.test","NewPassword@123"),/Invalid credentials/)
    ;({user,state}=await asUser("patricia.domingo@10builders.com"))
    await api("/workspace/preferences",{method:"POST",json:{muted:["notice"]}})
    assert.deepEqual((await loadState(user)).muted,["notice"])
  })

  await t.test("clients cannot change rules, upload files, or read another client's project",async()=>{
    const {user,state}=await asUser("f.uy@aldenheights-hoa.com")
    await assert.rejects(api("/workspace/settings",{method:"PUT",json:{grace:1,cap:1,response:1,idle:1}}),/Forbidden|denied|permission/i)
    await assert.rejects(uploadFile(randomUUID(),new File(["%PDF-1.4"],"test.pdf",{type:"application/pdf"})),/Forbidden|denied|permission/i)
    await assert.rejects(api("/projects/"+newProjectId+"/documents"),/not found/i)
  })


  await t.test("workspace loading uses a bounded number of requests and preserves client filtering",async()=>{
    const {user}=await asUser("patricia.domingo@10builders.com")
    const original=globalThis.fetch,requests=[]
    try{
      globalThis.fetch=(url,...args)=>{requests.push(String(url));return original(url,...args)}
      const state=await loadState(user)
      assert.ok(state.projects.length>5)
      assert.ok(requests.some(p=>p.includes("/workspace/project-data")))
      assert.ok(!requests.some(p=>/\/projects\/[0-9a-f-]+\//.test(p)),"Initial loading must not fan out per project")
      assert.ok(requests.length<=8,"Request count must stay independent of project count")
    }finally{globalThis.fetch=original}
    await asUser("f.uy@aldenheights-hoa.com")
    const parts=await api("/workspace/project-data")
    assert.equal(parts.length,1)
    for(const part of parts){
      assert.deepEqual(part.notes,[])
      assert.deepEqual(part.contracts,[])
      assert.equal(part.overview,undefined)
      assert.ok(part.documents.every(d=>d.client_visible))
      assert.ok(part.photos.every(p=>p.is_client_visible))
      assert.ok(!("suggested_opm_id" in part.list))
    }
  })

  await t.test("the document repository shows each role only its own projects and files", async () => {
    const admin = await asUser("patricia.domingo@10builders.com")
    const adminProjects = new Map(admin.state.projects.map((p) => [p.id, p]))
    const fileIds = (index) =>
      new Set(index.flatMap((c) => c.folders.flatMap((f) => f.files.map((x) => x.doc.id))))
    const count = (index) => index.reduce((n, c) => n + c.fileCount, 0)
    const roles = {
      opm: await asUser("renz.villaverde@10builders.com"),
      karlo: await asUser("karlo.espiritu@10builders.com"),
      rafael: await asUser("rafael.mercado@10builders.com"),
    }
    for (const [name, { user, state }] of Object.entries(roles)) {
      assert.ok(state.projects.length > 0, name + " has projects")
      for (const p of state.projects) {
        assert.ok(adminProjects.has(p.id), name + ": a project outside the database list")
        const mine = fileIds(projectDocumentIndexFor(p, user))
        const everything = fileIds(projectDocumentIndex(adminProjects.get(p.id)))
        for (const id of mine) assert.ok(everything.has(id), name + ": file " + id + " is not an original file of " + p.name)
        assert.equal(count(projectDocumentIndexFor(p, user)), mine.size, "counts equal the files shown (no file is listed twice)")
      }
    }
    // Karlo and Rafael keep independent assignments and document visibility.
    const karloIds = new Set(roles.karlo.state.projects.map((p) => p.id))
    const rafaelIds = new Set(roles.rafael.state.projects.map((p) => p.id))
    for (const p of roles.karlo.state.projects.filter((x) => !rafaelIds.has(x.id)))
      assert.equal(count(projectDocumentIndexFor(p, roles.rafael.user)), 0, "Rafael sees nothing of Karlo-only " + p.name)
    for (const p of roles.rafael.state.projects.filter((x) => !karloIds.has(x.id)))
      assert.equal(count(projectDocumentIndexFor(p, roles.karlo.user)), 0, "Karlo sees nothing of Rafael-only " + p.name)
    // The Office PM index never lists a project the Office PM does not manage.
    for (const p of admin.state.projects.filter((x) => x.opmId !== roles.opm.user.id))
      assert.equal(count(projectDocumentIndexFor(p, roles.opm.user)), 0)
    // Clients: only their projects, and only explicitly client-visible, uploaded originals.
    const client = await asUser("f.uy@aldenheights-hoa.com")
    const views = clientProjectViews(client.state, client.user.id)
    assert.ok(views.length > 0 && views.length < admin.state.projects.length)
    for (const view of views) {
      const source = adminProjects.get(view.id)
      assert.ok(source, "a client project exists in the database list")
      const originals = [...source.docs, ...source.workflow.photos]
      for (const category of clientDocumentIndex(view))
        for (const folder of category.folders)
          for (const file of folder.files) {
            const doc = originals.find((d) => d.id === file.id)
            assert.ok(doc && doc.uploaded && doc.clientVisible, "client file " + file.id + " is an original, client-visible upload")
          }
    }
  })

  await t.test("the Engineer Directory pages /accounts with a stable order and exact counts", async () => {
    await asUser("patricia.domingo@10builders.com")
    const engineers = "role_ids=1,2,3&sortBy=name"
    const everything = (await apiEnvelope("/accounts?page=1&pageSize=100&" + engineers)).data
    assert.ok(everything.length > 3, "the demo data has enough engineers to span several pages")
    const seen = []
    let total
    for (let page = 1; ; page++) {
      const body = await apiEnvelope("/accounts?page=" + page + "&pageSize=3&" + engineers)
      total = body.pagination.total
      assert.equal(body.pagination.page, page)
      seen.push(...body.data.map((row) => row.id))
      if (!body.pagination.has_next) break
      assert.ok(page < 50, "paging must terminate")
    }
    // No duplicated and no skipped records between pages, in the same order as one big page.
    assert.equal(new Set(seen).size, seen.length)
    assert.deepEqual(seen, everything.map((row) => row.id))
    assert.equal(total, everything.length)
    // Filters change the count with the same filter the rows use.
    const spm = await apiEnvelope("/accounts?page=1&pageSize=2&role_ids=3&sortBy=name")
    assert.ok(spm.data.every((row) => row.role === "spm"))
    assert.equal(spm.pagination.total, everything.filter((row) => row.role === "spm").length)
    // A page past the end is empty but reports the real total, so the UI can clamp.
    const beyond = await apiEnvelope("/accounts?page=999&pageSize=3&" + engineers)
    assert.equal(beyond.data.length, 0)
    assert.equal(beyond.pagination.total, total)
    // Only the Administrator may list accounts: role scoping is never widened.
    await asUser("karlo.espiritu@10builders.com")
    await assert.rejects(apiEnvelope("/accounts?page=1&pageSize=3"), /403|permission|forbidden|allowed|access/i)
  })

  await t.test("project-wide checklist aggregates require complete stored scope, count latest approvals once, and stay staff-only", async () => {
    const admin = await asUser("patricia.domingo@10builders.com")
    const project = admin.state.projects.find(p => p.status === "active" && p.team.length > 1)
    assert.ok(project)
    const before = overallChecklistProgress(projectPhaseNames(project), project.checklistProgress)
    assert.equal(before.percentage, null, "uninitialized future scope cannot be treated as zero")
    await db.query(`insert into project_phase_checklists(project_id,project_stage_id)
      select project_id,project_stage_id from project_phase_team where project_id=$1 on conflict do nothing`, [project.id])
    await db.query(`insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order)
      select t.project_id,t.project_stage_id,c.code,c.title,c.required,c.sort_order from project_phase_team t
      join phase_checklist_templates c on c.project_stage_id=t.project_stage_id where t.project_id=$1 on conflict do nothing`, [project.id])
    const reload = async () => {
      const state = await loadState(admin.user)
      const p = state.projects.find(p => p.id === project.id)
      return overallChecklistProgress(projectPhaseNames(p), p.checklistProgress)
    }
    const complete = await reload()
    assert.ok(complete.required > 0)
    const expected = await db.query(`select count(*)::int as total from project_phase_checklist_items where project_id=$1 and required`, [project.id])
    assert.equal(complete.required, expected.rows[0].total)
    const item = (await db.query(`select i.* from project_phase_checklist_items i where i.project_id=$1 and i.required
      and not exists(select 1 from project_phase_evidence e where e.checklist_item_id=i.id) order by i.id limit 1`, [project.id])).rows[0]
    assert.ok(item)
    const insert = async status => db.query(`insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by,reviewed_by,reviewed_at)
      values($1,$2,$3,$4,$5,$5,now())`, [project.id,item.project_stage_id,item.id,status,admin.user.id])
    await insert("approved")
    await insert("approved")
    assert.equal((await reload()).approved, complete.approved + 1, "repeated evidence versions count one activity")
    await insert("rejected")
    assert.equal((await reload()).approved, complete.approved, "latest rejected state does not count an older approval")
    const stored = (await db.query("select current_pct from projects where id=$1", [project.id])).rows[0]
    assert.equal(Number(stored.current_pct), project.progress, "read aggregates never change workflow progress")
    const client = await asUser("f.uy@aldenheights-hoa.com")
    const raw = await api("/workspace/project-data")
    assert.ok(raw.every(p => !("checklistProgress" in p)))
    assert.ok(clientProjectViews(client.state,client.user.id).every(p => !("checklistProgress" in p)))
  })


  await t.test("migrated workflows drive details, filters, validation and unassigned phases",async()=>{
    const migration=fs.readFileSync(here("../Thesis-Backend/migrations/004-project-type-workflows.sql"),"utf8");
    await db.exec(migration);
    await db.exec(migration);
    let {user,state}=await asUser("patricia.domingo@10builders.com");
    const expected={Residential:9,Commercial:9,"Mixed-Use":12};
    for(const [type,count] of Object.entries(expected))assert.equal(state.backendPhases[type].length,count);
    for(const p of state.projects.filter(p=>p.status!=="draft")){
      assert.deepEqual(projectPhaseNames(p),state.backendPhases[p.type].map(p=>p.name));
      assert.ok(p.team.filter(t=>!t.accountId).every(t=>t.status==="pending"));
      const detail=await api("/projects/"+p.id);
      assert.deepEqual(detail.phase_team.map(t=>t.stage),projectPhaseNames(p));
      const stages=await api("/projects/"+p.id+"/stages");
      assert.deepEqual(stages.map(s=>s.code),projectPhaseNames(p));
    }
    const commercial=state.projects.find(p=>p.type==="Commercial"&&p.status==="active");
    await assert.rejects(api("/projects/"+commercial.id+"/phase-overview?stage=Tower%20Structure"),/project type|conflicting/i);
    const unassigned=commercial.team.find(t=>!t.accountId);
    assert.ok(unassigned);
    const spm=state.accounts.find(a=>a.role==="spm"&&a.status==="active");
    await sendApiWorkflow(state,state.accounts.find(a=>a.id===user.id),{type:"reassign_phase",projectId:commercial.id,phase:unassigned.phase,accountId:spm.id});
    state=await loadState(user);
    const assigned=state.projects.find(p=>p.id===commercial.id).team.find(t=>t.phase===unassigned.phase);
    assert.equal(assigned.accountId,spm.id);
    assert.equal(assigned.status,"pending","No automatic acceptance for the added phase");
    const raw=await api("/projects/"+commercial.id);
    await assert.rejects(api("/projects/intake",{method:"POST",json:{
      name:"Incomplete type workflow",project_type:"Commercial",floor_area_sqm:1000,floor_count:2,
      target_start_date:"2026-12-01",client_name:"Workflow client",suggested_opm_id:commercial.opmId,
      phase_team:[{stage:"Mobilization",user_id:spm.id,is_lead:true}]
    }}),/every phase/i);
    const created=await api("/projects/intake",{method:"POST",json:{
      name:"Complete type workflow",project_type:"Commercial",floor_area_sqm:1000,floor_count:2,
      target_start_date:"2026-12-01",client_name:"Workflow client",suggested_opm_id:commercial.opmId,
      phase_team:state.backendPhases.Commercial.map((p,i)=>({stage:p.name,user_id:spm.id,is_lead:i===0}))
    }});
    assert.equal((await api("/projects/"+created.project.id)).phase_team.length,9);
    const client=await asUser("f.uy@aldenheights-hoa.com");
    assert.ok(client.state.projects.every(p=>projectPhaseNames(p).length===expected[p.type]));
    assert.ok((await api("/workspace/project-data")).every(p=>!("checklistProgress" in p)));
  });


 await t.test("AUDIT local adversarial and full-workflow probes",async()=>{
  let session=await asUser("patricia.domingo@10builders.com");
  const adminUser=session.user;
  const root="http://127.0.0.1:"+apiPort+"/api/v1";
  const raw=async(path,method="GET",body,token=undefined)=>{
   const headers={};if(token===undefined)token=(await import("../src/api/client.ts")).getToken();
   if(token)headers.Authorization="Bearer "+token;
   if(body!==undefined)headers["Content-Type"]="application/json";
   const response=await fetch(root+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   let data;try{data=await response.json()}catch{data={nonJson:true}};
   return {status:response.status,body:data,data:data?.data};
  };
  const authAdmin=async()=>{session=await asUser("patricia.domingo@10builders.com");return session;};
  const idOf=async(email)=>(await db.query("select id from users where email=$1",[email])).rows[0].id;
  const leadId=await idOf("karlo.espiritu@10builders.com");
  const otherId=await idOf("mikaela.bautista@10builders.com");
  const opmId=await idOf("lea.fernandez@10builders.com");
  const wrongTypeOpmId=await idOf("renz.villaverde@10builders.com");
  const clientId=await idOf("f.uy@aldenheights-hoa.com");
  const pw=String.fromCharCode(80,97,115,115,119,111,114,100,64,49,50,51);
  const health=await raw("/health","GET",undefined,"");
  finding("health",200,health.status,health.status===200&&health.body.database===true);
  const preflight=await fetch(root+"/workspace/project-data",{method:"OPTIONS",headers:{Origin:"https://audit.invalid","Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}});
  finding("CORS restricted origin","Reject unrelated origins",{status:preflight.status,allowOrigin:preflight.headers.get("access-control-allow-origin")},preflight.headers.get("access-control-allow-origin")!=="*");
  const unauth=await raw("/projects","GET",undefined,"");finding("unauthenticated project request",401,unauth.status,unauth.status===401);
  const badResponses=[];
  for(let i=0;i<6;i++)badResponses.push((await raw("/auth/login","POST",{email:"patricia.domingo@10builders.com",password:"audit-invalid"},"")).status);
  const seventh=await raw("/auth/login","POST",{email:"patricia.domingo@10builders.com",password:pw},"");
  finding("server-side five-attempt lockout","429 or equivalent blocks subsequent correct login",{failures:badResponses,seventh:seventh.status},seventh.status!==200);
  const unknown=await raw("/auth/login","POST",{email:"absent@audit.invalid",password:"audit-invalid"},"");
  const wrong=await raw("/auth/login","POST",{email:"patricia.domingo@10builders.com",password:"audit-invalid"},"");
  finding("unknown and wrong-password messages identical","same status and message",{unknown:unknown.status,wrong:wrong.status,equal:unknown.body.message===wrong.body.message},unknown.status===wrong.status&&unknown.body.message===wrong.body.message);
  const inactive=await raw("/auth/login","POST",{email:"jomar.reyes@10builders.com",password:pw},"");
  finding("inactive account rejected",401,inactive.status,inactive.status===401);
  finding("inactive-specific safe message","inactive-specific after verified password",inactive.body.message,/inactive/i.test(inactive.body.message||""));
  for(const path of ["/engineer/licenses","/engineer/certifications"]){
   const r=await raw(path,"GET",undefined,"");
   finding("anonymous "+path,"401/403",{status:r.status,rows:Array.isArray(r.data)?r.data.length:Object.keys(r.data||{}).length},[401,403].includes(r.status));
  }
  const jwt=(await import("../Thesis-Backend/node_modules/jsonwebtoken/index.js")).default;
  const expired=jwt.sign({details:{id:adminUser.id,role:"admin"}}, "test-secret-only-for-this-test-0123456789",{expiresIn:-1});
  await db.query("update users_token set token=$2 where user_id=$1",[adminUser.id,expired]);
  const expiredRead=await raw("/workspace","GET",undefined,expired);
  const refreshed=await raw("/auth","PUT",undefined,expired);
  finding("expired token refresh rejected","401/403",{modernRead:expiredRead.status,refresh:refreshed.status},[401,403].includes(refreshed.status));
  await authAdmin();
  // Establish only test prerequisites; all writes use the isolated local database/API.
  for(const id of [leadId,otherId,opmId,wrongTypeOpmId]){
   const a=session.state.accounts.find(a=>a.id===id);
   const file=randomUUID();await uploadFile(file,new File(["%PDF-1.4 audit license"],"audit-license.pdf",{type:"application/pdf"}));
   await saveApiAccount({...a,expiry:"2035-12-31",docs:[{id:file,label:"PRC License",name:"audit-license.pdf",uploaded:true,owner:a.name,date:"2026-10-21",clientVisible:false}]},true);
  }
  session=await authAdmin();
  const workflow=(type="Commercial")=>session.state.backendPhases[type].map((p,i)=>({stage:p.name,user_id:i===0?leadId:otherId,is_lead:i===0}));
  const intake=(extra={})=>({name:"Audit commercial workflow "+randomUUID().slice(0,6),project_type:"Commercial",floor_area_sqm:500,floor_count:2,target_start_date:"2027-02-01",client_user_id:clientId,suggested_opm_id:opmId,phase_team:workflow(),crew_required:2,...extra});
  const invalidStart=await raw("/projects/intake","POST",intake({target_start_date:"2000-01-01"}));
  finding("server rejects past intake start","4xx",invalidStart.status,invalidStart.status>=400);
  const tooFar=await raw("/projects/intake","POST",intake({target_start_date:"2099-01-01"}));
  finding("server rejects intake beyond ten years","4xx",tooFar.status,tooFar.status>=400);
  const mismatch=await raw("/projects/intake","POST",intake({suggested_opm_id:wrongTypeOpmId}));
  finding("server enforces OPM type match","4xx",mismatch.status,mismatch.status>=400);
  const legacy=await raw("/projects/intake/drafts","POST",{name:"Audit legacy type",project_type:"Industrial"});
  finding("only three project types allowed","4xx",legacy.status,legacy.status>=400);
  const made=await raw("/projects/intake","POST",intake());
  if(made.status>=400)throw Error("Audit happy-path setup failed status "+made.status);
  const pid=made.data.project.id;
  const reversed=await raw("/projects/"+pid+"/workspace","PUT",{end:"2000-01-01",docs:[]});
  finding("server rejects end before start","4xx",reversed.status,reversed.status>=400);
  const pendingClient=await asUser("f.uy@aldenheights-hoa.com");
  const pendingRead=await raw("/projects/"+pid);
  finding("client cannot read pending project by direct ID","404/403",pendingRead.status,[404,403].includes(pendingRead.status));
  session=await asUser("lea.fernandez@10builders.com");
  await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"accept_opm",projectId:pid});
  session=await asUser("mikaela.bautista@10builders.com");
  const phases=await api("/projects/"+pid+"/stages"),design=phases.find(p=>p.code==="Design");
  const premature=await raw("/confirmations/projects/"+pid+"/phase-team/"+design.id+"/accept","POST",{});
  finding("SPM acceptance waits for six docs and Lead","4xx",premature.status,premature.status>=400);
  // Reset this deliberate gate probe only, so the ordered scenario can continue.
  await db.query("update project_phase_team set status='pending',responded_at=null where project_id=$1 and project_stage_id=$2",[pid,design.id]);
  session=await asUser("karlo.espiritu@10builders.com");
  const companies=session.state.companies.filter(c=>c.status==="approved");
  const contactEarly=await raw("/projects/"+pid+"/workspace-command","POST",{type:"contact_company",companyId:companies[0].id,expectedVersion:-1});
  finding("contact waits for all prior gates","4xx",contactEarly.status,contactEarly.status>=400);
  finding("stale expectedVersion rejected",409,contactEarly.status,contactEarly.status===409);
  if(contactEarly.status===200)await raw("/projects/"+pid+"/workspace-command","POST",{type:"respond_company",companyId:companies[0].id,accepted:false});
  session=await asUser("lea.fernandez@10builders.com");
  for(let i=0;i<6;i++){
   const id=randomUUID();await uploadFile(id,new File(["%PDF-1.4 audit registered"],"audit-document.pdf",{type:"application/pdf"}));
   await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"upload_registered",projectId:pid,docIndex:i,doc:{id,name:"audit-document.pdf",uploaded:true}});
  }
  const opmActivation=await raw("/projects/"+pid+"/workspace-command","POST",{type:"activate_project"});
  finding("OPM is recognized as activation actor","Actor allowed; prerequisites may block with 409",opmActivation.status,opmActivation.status!==403);
  for(const email of ["karlo.espiritu@10builders.com","mikaela.bautista@10builders.com"]){
   session=await asUser(email);
   await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"accept_assignment",projectId:pid});
  }
  session=await asUser("karlo.espiritu@10builders.com");
  const declinedAgain=await raw("/projects/"+pid+"/workspace-command","POST",{type:"contact_company",companyId:companies[0].id});
  finding("declined company cannot be recontacted",409,declinedAgain.status,declinedAgain.status===409);
  const company=companies.find(c=>c.id!==companies[0].id);
  await db.query("insert into subcontractor_workers(subcontractor_id,full_name,availability_status) select $1,'Audit crew '||n,'available' from generate_series(1,3)n",[company.id]);
  const contact=await raw("/projects/"+pid+"/workspace-command","POST",{type:"contact_company",companyId:company.id});
  const accepted=await raw("/projects/"+pid+"/workspace-command","POST",{type:"respond_company",companyId:company.id,accepted:true});
  const locked=await raw("/projects/"+pid+"/workspace-command","POST",{type:"contact_company",companyId:companies[0].id});
  finding("accepted company locked",409,locked.status,locked.status===409);
  const agreementId=randomUUID();await uploadFile(agreementId,new File(["%PDF-1.4 audit signed agreement"],"audit-signed.pdf",{type:"application/pdf"}));
  const uploaded=await raw("/projects/"+pid+"/workspace-command","POST",{type:"upload_agreement",doc:{id:agreementId}});
  const active=await api("/projects/"+pid);
  finding("ordered API path reaches active","active",{contact:contact.status,accepted:accepted.status,agreement:uploaded.status,lifecycle:active.lifecycle_status},active.lifecycle_status==="active");
  finding("activation waits for explicit OPM activation","spm_review after agreement upload",active.lifecycle_status,active.lifecycle_status==="spm_review");
  session=await asUser("f.uy@aldenheights-hoa.com");
  finding("client sees activated project",true,session.state.projects.some(p=>p.id===pid),session.state.projects.some(p=>p.id===pid));
  // Alternate allocation API can be reached by an OPM despite read-only UI.
  const second=companies.find(c=>c.id!==company.id);
  await db.query("insert into subcontractor_workers(subcontractor_id,full_name,availability_status) values($1,'Audit second company worker','available')",[second.id]);
  const requestId=randomUUID();
  await db.query("insert into pending_subcontractor_requests(id,project_id,subcontractor_id,trade_id,requested_by,status) select $1,$2,id,trade_id,$3,'pending' from subcontractors where id=$4",[requestId,pid,leadId,second.id]);
  session=await asUser("lea.fernandez@10builders.com");
  const secondApproved=await raw("/subcontractor-requests/"+requestId+"/approve","POST",{note:"Audit alternate route"});
  const assignments=(await db.query("select count(*)::int as n from project_subcontractor_assignments where project_id=$1 and status='active'",[pid])).rows[0].n;
  finding("OPM allocation is read-only and one company enforced","403 and one active company",{status:secondApproved.status,activeCompanies:assignments},secondApproved.status===403&&assignments===1);

  // Further real API alternate paths on the same isolated database.
  const prepare=async(documents=true)=>{
    await authAdmin();
    const r=await raw("/projects/intake","POST",intake());
    if(r.status!==200)throw Error("Alternate intake setup failed "+r.status);
    const id=r.data.project.id;
    session=await asUser("lea.fernandez@10builders.com");
    await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"accept_opm",projectId:id});
    if(documents)for(let i=0;i<6;i++){
      const file=randomUUID();await uploadFile(file,new File(["%PDF-1.4 alternate"],"alternate.pdf",{type:"application/pdf"}));
      await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{type:"upload_registered",projectId:id,docIndex:i,doc:{id:file,name:"alternate.pdf",uploaded:true}});
    }
    return id;
  };
  await authAdmin();
  const changes=await raw("/projects/intake","POST",intake());
  const changesId=changes.data.project.id;
  session=await asUser("lea.fernandez@10builders.com");
  const requested=await raw("/archive/projects/"+changesId+"/changes-requested","POST",{reason:"Audit plans need revision"});
  const confirmationId=(await db.query("select id from assignment_confirmations where project_id=$1 and role_context='opm' order by id desc limit 1",[changesId])).rows[0].id;
  const acceptedDespiteChanges=await raw("/confirmations/"+confirmationId+"/accept","POST",{});
  finding("changes request is retained",200,requested.status,requested.status===200);
  finding("unresolved changes block acceptance","409/422",acceptedDespiteChanges.status,[409,422].includes(acceptedDespiteChanges.status));
  const declinePid=await prepare();
  session=await asUser("mikaela.bautista@10builders.com");
  const declineStages=await api("/projects/"+declinePid+"/stages"),declineStage=declineStages.find(p=>p.code==="Design");
  const decline=await raw("/confirmations/projects/"+declinePid+"/phase-team/"+declineStage.id+"/decline","POST",{reason:"Audit scheduling conflict"});
  await authAdmin();
  const declinedAssignment=(await db.query("select id from project_phase_team where project_id=$1 and project_stage_id=$2",[declinePid,declineStage.id])).rows[0].id;
  const reassigned=await raw("/archive/phase-assignments/"+declinedAssignment+"/reassign","POST",{new_user_id:leadId,note:"Audit replacement"});
  const restored=(await db.query("select status from project_phase_team where id=$1",[declinedAssignment])).rows[0].status;
  finding("phase decline then reassignment preserves pending status","200 -> pending",{decline:decline.status,reassign:reassigned.status,status:restored},decline.status===200&&reassigned.status===200&&restored==="pending");
  const expiryPid=await prepare(false);
  await db.query("update project_phase_team set response_deadline_at=now()-interval '4 days' where project_id=$1 and is_lead",[expiryPid]);
  await authAdmin();
  const maintenance=await raw("/archive/maintenance","POST",{});
  const expiry=(await db.query("select status from project_phase_team where project_id=$1 and is_lead",[expiryPid])).rows[0].status;
  const queue=await raw("/archive/assignments/escalated");
  finding("overdue lead expires and appears in escalation queue","auto_expired",{maintenance:maintenance.status,status:expiry,queueStatus:queue.status,queueRows:Array.isArray(queue.data)?queue.data.length:0},maintenance.status===200&&expiry==="auto_expired"&&queue.status===200);
  // Check hold, workload and cooldown separately from active/license validation.
  await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,$2) on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata",[wrongTypeOpmId,JSON.stringify({assignmentHold:true})]);
  const held=await raw("/projects/intake","POST",intake({suggested_opm_id:wrongTypeOpmId}));
  finding("assignment hold enforced",422,held.status,held.status===422);
  await db.query("update workspace_account_metadata set metadata=metadata-'assignmentHold' || jsonb_build_object('cooldown',9999999999999) where user_id=$1",[wrongTypeOpmId]);
  const cooldown=await raw("/projects/intake","POST",intake({suggested_opm_id:wrongTypeOpmId}));
  finding("OPM cooldown enforced","4xx",cooldown.status,cooldown.status>=400);
  await db.query("update workspace_settings set rules=jsonb_set(rules,'{cap}','1')");
  const capped=await raw("/projects/intake","POST",intake());
  finding("OPM workload cap enforced","4xx",capped.status,capped.status>=400);
  await db.query("update workspace_settings set rules=jsonb_set(rules,'{cap}','5')");
  session=await asUser("karlo.espiritu@10builders.com");
  const note=await raw("/projects/"+pid+"/notes","POST",{note_text:"Audit actual field note"});
  const image=randomUUID();await uploadFile(image,new File([Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489","hex")],"audit-photo.png",{type:"image/png"}));
  const photo=await raw("/projects/"+pid+"/workspace-command","POST",{type:"add_photo",doc:{id:image,clientVisible:true},note:"Audit actual site photo"});
  finding("notes and site photos persist","200",{note:note.status,photo:photo.status},note.status===200&&photo.status===200);
  const overview=await api("/projects/"+pid+"/phase-overview"),item=overview.checklist.items.find(i=>i.required);
  if(item){
   const submit=await raw("/projects/"+pid+"/checklist-items/"+item.id+"/submit","POST",{submission_note:"Audit first submission"});
   const evidence=submit.data?.evidence_id||submit.data?.id;
   session=await asUser("lea.fernandez@10builders.com");
   const rejected=await raw("/projects/"+pid+"/evidence/"+evidence+"/reject","POST",{review_note:"Audit missing proof"});
   session=await asUser("karlo.espiritu@10builders.com");
   const resubmit=await raw("/projects/"+pid+"/checklist-items/"+item.id+"/submit","POST",{submission_note:"Audit corrected"});
   session=await asUser("lea.fernandez@10builders.com");
   const reapproved=await raw("/projects/"+pid+"/evidence/"+(resubmit.data?.evidence_id||resubmit.data?.id)+"/approve","POST",{review_note:"Audit verified"});
   finding("checklist reject-resubmit-approve","200 each",{submit:submit.status,reject:rejected.status,resubmit:resubmit.status,approve:reapproved.status},[submit,rejected,resubmit,reapproved].every(r=>r.status===200||r.status===201));
  }
  session=await asUser("karlo.espiritu@10builders.com");
  const issue=await raw("/projects/"+pid+"/issues","POST",{reason:"Audit rework inspection"});
  session=await asUser("lea.fernandez@10builders.com");
  const resolved=await raw("/rework-requests/"+issue.data?.id+"/approve","POST",{resolution_note:"Audit reviewed rework"});
  finding("rework issue and OPM decision persist","201/200",{issue:issue.status,approve:resolved.status},issue.status===201&&resolved.status===200);
  const askUpdate=await raw("/projects/"+pid+"/notes","POST",{note_text:"Audit OPM requested update"});
  finding("OPM update request saved as note",200,askUpdate.status,askUpdate.status===200);
  // Anonymous legacy contract upload replaces a real local-only audit contract.
  const contract=await db.query("insert into contracts(project_id,contract_type,subcontractor_name,trade_scope,file_ref) values($1,'client_contract','Audit','Audit','audit-original-reference') returning id",[pid]);
  const legacyContract=await raw("/projects/intake/upload-contract","POST",{project_id:pid},"");
  const kept=(await db.query("select count(*)::int as n from contracts where id=$1",[contract.rows[0].id])).rows[0].n;
  finding("original contract retained and unauthenticated replacement denied","401/403; original retained",{status:legacyContract.status,originalRetained:kept===1},[401,403].includes(legacyContract.status)&&kept===1);
  // The backend currently permits an arbitrary selected phase; verify the consequences.
  session=await asUser("karlo.espiritu@10builders.com");
  const jump=await raw("/projects/"+pid+"/phase-updates","POST",{stage:"Closeout",note:"Audit closeout jump"});
  session=await asUser("lea.fernandez@10builders.com");
  const jumpApproved=await raw("/projects/"+pid+"/phase-updates/"+jump.data?.id+"/approve","POST",{resolution_note:"Audit selected phase review"});
  finding("cannot jump to Closeout before intervening phases","4xx",{submit:jump.status,approve:jumpApproved.status},jump.status>=400||jumpApproved.status>=400);
  if(jumpApproved.status===200){
   session=await asUser("karlo.espiritu@10builders.com");
   const closeout=await api("/projects/"+pid+"/phase-overview");
   for(const i of closeout.checklist.items.filter(i=>i.required&&i.status!=="approved")){
    session=await asUser("karlo.espiritu@10builders.com");
    const s=await raw("/projects/"+pid+"/checklist-items/"+i.id+"/submit","POST",{submission_note:"Audit closeout item"});
    session=await asUser("lea.fernandez@10builders.com");
    await raw("/projects/"+pid+"/evidence/"+(s.data?.evidence_id||s.data?.id)+"/approve","POST",{review_note:"Audit closeout verified"});
   }
   const final=await api("/projects/"+pid);
   const otherApproved=(await db.query("select count(*)::int as n from project_phase_checklist_items i join project_stages s on s.id=i.project_stage_id where i.project_id=$1 and s.code<>'Closeout' and required and not exists(select 1 from project_phase_evidence e where e.checklist_item_id=i.id and e.status='approved')",[pid])).rows[0].n;
   finding("completion requires all earlier required work","not archived while unfinished",{lifecycle:final.lifecycle_status,unfinishedEarlierItems:otherApproved},final.lifecycle_status!=="archived"||otherApproved===0);
  }

  // A metadata-only legacy request demonstrates unauthenticated writes without uploading disk files.
  const beforeLic=(await db.query("select count(*)::int as n from user_licenses where user_id=$1",[opmId])).rows[0].n;
  const unsafeLicense=await raw("/engineer/licenses","POST",{user_id:opmId,license_number:"AUDIT-NO-AUTH",license_expiry:"2035-12-31"},"");
  const afterLic=(await db.query("select count(*)::int as n from user_licenses where user_id=$1",[opmId])).rows[0].n;
  finding("anonymous license writes denied","401/403 and no data change",{status:unsafeLicense.status,added:afterLic-beforeLic},[401,403].includes(unsafeLicense.status)&&afterLic===beforeLic);
  const noFiles=await raw("/auth/reset-password","POST",{password:"audit-nonsecret-change"});
  finding("password-reset endpoint absent","404/405",noFiles.status,[404,405].includes(noFiles.status));
  // Record exact local seed quality and unconfigured added phases.
  const quality=await db.query("select count(*)::int as projects,count(*) filter(where target_end_date is null)::int as missing_end_dates from projects");
  const unconfigured=await db.query("select count(*)::int as n from project_type_stages w where not exists(select 1 from phase_checklist_templates t where t.project_stage_id=w.project_stage_id and required)");
  auditResults.push({name:"seed/workflow quality",actual:{...quality.rows[0],unconfiguredTypePhases:unconfigured.rows[0].n}});
  console.log("AUDIT_PROBES "+JSON.stringify({checks:auditResults.length,failed:auditResults.filter(p=>p.result==="FAIL").length}));
 });

  await t.test("the API refuses requests without a session", async () => {
    setToken("")
    await assert.rejects(api("/projects"), /token/i)
  })
})
