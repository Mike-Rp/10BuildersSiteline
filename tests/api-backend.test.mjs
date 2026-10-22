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
import XLSX from "xlsx"
import { loadState } from "../src/api/load.ts"
import { projectDocumentIndex, projectDocumentIndexFor } from "../src/project-document-index.ts"
import { clientDocumentIndex, clientProjectViews } from "../src/client-access.ts"

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

test("the frontend loads each role's data through the real backend", { skip: !available && "Thesis-Backend folder not found", timeout: 120000 }, async (t) => {
  const db = new PGlite({ extensions: { citext } })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(fs.readFileSync(schema, "utf8").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  for(const migration of ["001-phase-checklists.sql","002-phase-update-confirmation.sql","003-react-integration.sql","004-verified-activity-progress.sql"]) {
    await db.exec(fs.readFileSync(here("../Thesis-Backend/migrations/"+migration),"utf8"))
  }
  // Re-running the recovery migration is safe on the original strict status CHECK.
  await db.exec(fs.readFileSync(here("../Thesis-Backend/migrations/004-verified-activity-progress.sql"),"utf8"))
  const dummySql=fs.readFileSync(dummy,"utf8")
  await db.exec(dummySql)
  await db.exec(dummySql)

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

  await t.test("Excel uploads are restricted to manpower and cannot be linked as project or company documents", async () => {
    const {state}=await asUser("patricia.domingo@10builders.com")
    const book=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Worker","Trade"],["Sample","Carpenter"]]),"Manpower")
    const excel=new File([XLSX.write(book,{type:"buffer",bookType:"xlsx"})],"manpower.xlsx")
    await assert.rejects(uploadFile(randomUUID(),excel),/Supported files/)
    await assert.rejects(uploadFile(randomUUID(),new File(["workers"],"manpower.csv"),"manpower"),/Excel/)
    await assert.rejects(uploadFile(randomUUID(),new File(["fake"],"manpower.xlsx"),"manpower"),/valid Excel/)
    const id=randomUUID()
    await uploadFile(id,excel,"manpower")
    const doc={id,label:"Manpower list",name:excel.name,uploaded:true,owner:"Administrator",date:"2026-10-22",clientVisible:false}
    const source=state.companies[0]
    const company=await createCompany({...source,id:randomUUID(),name:"Manpower Format Test",documents:[],manpowerDocuments:[doc]})
    assert.ok(company.id)
    await assert.rejects(api(`/subcontractors/${company.id}/workspace`,{method:"PUT",json:{...source,name:"Manpower Format Test",status:"approved",documents:[doc],manpowerDocuments:[]}}),/Supported files/)
    const active=state.projects.find(p=>p.status==='active')
    await assert.rejects(api(`/projects/${active.id}/workspace`,{method:"PUT",json:{docs:[doc]}}),/Supported files/)
    assert.equal((await db.query("select metadata->'manpowerDocuments'->0->>'id' as id from workspace_company_metadata where subcontractor_id=$1",[company.id])).rows[0].id,id)
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

  await t.test("trusted weighted phase/project totals remain separate and staff-only",async()=>{
    const {user,state}=await asUser("patricia.domingo@10builders.com")
    const project=state.projects.find(p=>p.status==="active" && p.verifiedProgress?.project.total>0)
    assert.ok(project)
    const trusted=project.verifiedProgress
    const expected=(await db.query(`select coalesce(sum(i.weight) filter(where i.required),0) as total,
      coalesce(sum(i.weight) filter(where i.required and e.status='approved' and e.reviewed_by is not null and e.reviewed_at is not null),0) as earned
      from project_phase_checklist_items i left join lateral(select status,reviewed_by,reviewed_at from project_phase_evidence
        where checklist_item_id=i.id order by id desc limit 1)e on true where i.project_id=$1`,[project.id])).rows[0]
    assert.equal(trusted.project.total,expected.total)
    assert.equal(trusted.project.earned,expected.earned)
    assert.equal(trusted.project.percentage,expected.earned/expected.total*100)
    assert.equal(trusted.phases.length,project.team.length)
    assert.ok(trusted.phases.every(p=>p.total>0))
    const loaded=await loadState(user)
    assert.deepEqual(loaded.projects.find(p=>p.id===project.id).verifiedProgress,trusted)
    await asUser("f.uy@aldenheights-hoa.com")
    assert.ok((await api("/workspace/project-data")).every(p=>!("verifiedProgress" in p)))
    const clientUser=await login("f.uy@aldenheights-hoa.com","Password@123")
    assert.ok((await loadState(clientUser)).projects.every(p=>!("verifiedProgress" in p)))
  })

  await t.test("individual bundled activity review previews impact, rejects stale requests, and never approves siblings",async()=>{
    let session=await asUser("patricia.domingo@10builders.com")
    const project=session.state.projects.find(p=>p.name==="Rosaria Business Park")
    // Explicitly prepare complete scope only in this disposable integration fixture.
    await db.query(`insert into project_phase_checklists(project_id,project_stage_id)
      select project_id,project_stage_id from project_phase_team where project_id=$1 on conflict do nothing`,[project.id])
    await db.query(`insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order,weight)
      select t.project_id,t.project_stage_id,c.code,c.title,c.required,c.sort_order,c.weight from project_phase_team t
      join phase_checklist_templates c on c.project_stage_id=t.project_stage_id where t.project_id=$1 on conflict do nothing`,[project.id])
    const owner=project.team.find(t=>t.phase===project.phase).accountId
    const spmEmail=session.state.accounts.find(a=>a.id===owner).email
    const opmEmail=session.state.accounts.find(a=>a.id===project.opmId).email
    const base="/projects/"+project.id
    const selected=(await db.query(`select i.id from project_phase_checklist_items i
      left join lateral(select status from project_phase_evidence where checklist_item_id=i.id order by id desc limit 1)e on true
      where i.project_id=$1 and i.project_stage_id=(select current_stage_id from projects where id=$1)
      and coalesce(e.status,'missing') not in ('approved','pending') order by i.id limit 2`,[project.id])).rows
    assert.equal(selected.length,2)
    await asUser(spmEmail)
    const submitted=await api(base+"/phase-updates",{method:"POST",json:{note:"Independent activity review test",submitted_item_ids:selected.map(i=>String(i.id))}})
    const [first,second]=submitted.checklist_submissions.map(e=>String(e.id))
    await assert.rejects(api(base+`/evidence/${first}/review-preview`),error=>error.status===403)
    await assert.rejects(api(base+`/evidence/${first}/approve`,{method:"POST",json:{}}),error=>error.status===403)
    session=await asUser(opmEmail)
    const before=(await loadState(session.user)).projects.find(p=>p.id===project.id).verifiedProgress
    const preview=await api(base+`/evidence/${first}/review-preview`)
    const secondOldPreview=await api(base+`/evidence/${second}/review-preview`)
    assert.equal(preview.after.phase.earned-preview.before.phase.earned,10,JSON.stringify(preview))
    assert.equal(preview.after.project.earned-preview.before.project.earned,10,JSON.stringify(preview))
    await sendApiWorkflow(session.state,session.state.accounts.find(a=>a.id===session.user.id),{
      type:"approve_checklist",projectId:project.id,phase:project.phase,itemId:String(selected[0].id),
      evidenceId:first,expectedReviewToken:preview.review_token,note:"First activity checked separately"})
    const statuses=()=>db.query("select id::text,status,review_note from project_phase_evidence where id=any($1::bigint[]) order by id",[[first,second]])
    assert.deepEqual((await statuses()).rows.map(e=>e.status),["approved","pending"])
    assert.equal((await api(base+"/phase-updates")).find(u=>String(u.id)===String(submitted.id)).status,"pending")
    await assert.rejects(api(base+`/evidence/${first}/approve`,{method:"POST",json:{}}),/already reviewed|superseded/)
    await assert.rejects(api(base+`/evidence/${second}/approve`,{method:"POST",json:{expected_review_token:secondOldPreview.review_token}}),/changed/)
    assert.equal((await statuses()).rows[1].status,"pending")
    await assert.rejects(api(base+`/evidence/${second}/reject`,{method:"POST",json:{}}),/required/)
    const fresh=await api(base+`/evidence/${second}/review-preview`)
    await api(base+`/evidence/${second}/reject`,{method:"POST",json:{expected_review_token:fresh.review_token,review_note:"Provide a complete test report"}})
    const afterReview=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(afterReview.verifiedProgress.project.earned,before.project.earned+10)
    const stageBefore=afterReview.phase,pctBefore=afterReview.progress
    await api(base+`/phase-updates/${submitted.id}/approve`,{method:"POST",json:{resolution_note:"Report recorded; activities reviewed independently"}})
    const afterNote=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(afterNote.phase,stageBefore)
    assert.equal(afterNote.progress,pctBefore)
    assert.deepEqual(afterNote.verifiedProgress,afterReview.verifiedProgress)
    assert.deepEqual((await statuses()).rows.map(e=>e.status),["approved","rejected"])
    assert.match((await statuses()).rows[1].review_note,/complete test report/)
    const foreignProject=session.state.projects.find(p=>p.id!==project.id && p.status==="active")
    await assert.rejects(api(`/projects/${foreignProject.id}/evidence/${second}/review-preview`),error=>[403,404].includes(error.status))
    const unrelated="renz.villaverde@10builders.com"
    if(unrelated!==opmEmail){await asUser(unrelated);await assert.rejects(api(base+`/evidence/${second}/review-preview`),error=>[403,404].includes(error.status))}
    await asUser("f.uy@aldenheights-hoa.com")
    await assert.rejects(api(base+`/evidence/${second}/review-preview`),error=>error.status===403)
    assert.ok((await api("/workspace/project-data")).every(p=>!p.overview && !("verifiedProgress" in p)))
  })

  await t.test("activity review rolls back approval and cached progress if audit recording fails",async()=>{
    let session=await asUser("patricia.domingo@10builders.com")
    const project=session.state.projects.find(p=>p.name==="Rosaria Business Park")
    const spmEmail=session.state.accounts.find(a=>a.id===project.team.find(t=>t.phase===project.phase).accountId).email
    const opmEmail=session.state.accounts.find(a=>a.id===project.opmId).email
    const item=(await db.query(`select i.id from project_phase_checklist_items i
      join lateral(select status from project_phase_evidence where checklist_item_id=i.id order by id desc limit 1)e on true
      where i.project_id=$1 and e.status='rejected' order by i.id limit 1`,[project.id])).rows[0]
    assert.ok(item)
    const base="/projects/"+project.id
    await asUser(spmEmail)
    await assert.rejects(api(base+`/checklist-items/${item.id}/submit`,{method:"POST",json:{pct:100}}),error=>error.status===422)
    const submitted=await api(base+`/checklist-items/${item.id}/submit`,{method:"POST",json:{submission_note:"Corrected activity evidence"}})
    await assert.rejects(api(base+`/evidence/${submitted.id}/approve`,{method:"POST",json:{}}),error=>error.status===403)
    session=await asUser(opmEmail)
    const before=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    const preview=await api(base+`/evidence/${submitted.id}/review-preview`)
    await db.exec(`create function test_fail_review_history() returns trigger language plpgsql as $$
      begin raise exception 'Deliberate test-only audit failure'; end $$;
      create trigger test_fail_review_history before insert on project_progress_history
      for each row execute function test_fail_review_history();`)
    try {
      await assert.rejects(api(base+`/evidence/${submitted.id}/approve`,{method:"POST",json:{expected_review_token:preview.review_token}}),error=>error.status===500)
      assert.equal((await db.query("select status from project_phase_evidence where id=$1",[submitted.id])).rows[0].status,"pending")
      const after=(await loadState(session.user)).projects.find(p=>p.id===project.id)
      assert.equal(after.progress,before.progress)
      assert.deepEqual(after.verifiedProgress,before.verifiedProgress)
    } finally {await db.exec("drop trigger test_fail_review_history on project_progress_history; drop function test_fail_review_history();")}
    await api(base+`/evidence/${submitted.id}/approve`,{method:"POST",json:{expected_review_token:preview.review_token}})
    const after=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(after.phase,before.phase,"finishing checklist review does not move to a different phase")
    assert.equal(after.verifiedProgress.project.earned,before.verifiedProgress.project.earned+10)
    assert.equal((await db.query("select count(*)::int as n from project_phase_evidence where checklist_item_id=$1",[item.id])).rows[0].n>=2,true)
  })


  await t.test("targeted rework withdraws only selected credit, preserves history, and needs fresh evidence approval",async()=>{
    let session=await asUser("patricia.domingo@10builders.com")
    const project=session.state.projects.find(p=>p.name==="Rosaria Business Park"),base="/projects/"+project.id
    const spmEmail=session.state.accounts.find(a=>a.id===project.team.find(t=>t.phase===project.phase).accountId).email
    const opmEmail=session.state.accounts.find(a=>a.id===project.opmId).email
    const before=project.verifiedProgress
    const items=project.workflow.checklist[project.phase].filter(i=>i.status==="approved")
    assert.ok(items.length>=2)
    const target=items[0],unaffected=items[1]
    const issue=async ids=>api(base+"/rework-requests",{method:"POST",json:{reason:"Inspection requires correction",affected_activity_ids:ids}})
    const review=async(id,selected)=>api(`/rework-requests/${id}/preview`,{method:"POST",json:selected===undefined?{}:{selected_activity_ids:selected}})
    await asUser(spmEmail)
    const dismissed=await issue([target.id]),first=await issue([target.id]),overlap=await issue([target.id])
    await assert.rejects(api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{resolution_note:"Attempt"}}),error=>error.status===403)
    const other=(await db.query("select id::text from project_phase_checklist_items where project_id=$1 and id<>$2 and project_stage_id<>(select current_stage_id from projects where id=$1) limit 1",[project.id,target.id])).rows[0]
    await assert.rejects(issue([other.id]),error=>error.status===422)
    await assert.rejects(issue([target.id,target.id]),error=>error.status===400)
    session=await asUser(opmEmail)
    assert.deepEqual((await loadState(session.user)).projects.find(p=>p.id===project.id).verifiedProgress,before,"flagging never deducts")
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),/pending rework/)
    await assert.rejects(api(`/rework-requests/${dismissed.id}/reject`,{method:"POST",json:{}}),/reason/)
    await api(`/rework-requests/${dismissed.id}/reject`,{method:"POST",json:{resolution_note:"No correction needed for this report"}})
    assert.deepEqual((await loadState(session.user)).projects.find(p=>p.id===project.id).verifiedProgress,before)
    const impact=await review(first.id),staleOverlap=await review(overlap.id)
    assert.equal(impact.before.phase.earned-impact.after.phase.earned,target.weight)
    assert.equal(impact.before.project.earned-impact.after.project.earned,target.weight)
    await assert.rejects(api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{expected_review_token:impact.review_token,selected_activity_ids:[target.id]}}),/reason/)
    await db.exec(`create function test_fail_rework_audit() returns trigger language plpgsql as $$
      begin raise exception 'Deliberate rework audit failure'; end $$;
      create trigger test_fail_rework_audit before insert on project_progress_history for each row execute function test_fail_rework_audit();`)
    try {
      await assert.rejects(api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{resolution_note:"Must roll back",selected_activity_ids:[target.id],expected_review_token:impact.review_token}}),error=>error.status===500)
      assert.equal((await db.query("select status from pending_rework_requests where id=$1",[first.id])).rows[0].status,"pending")
      assert.equal((await db.query("select id::text from project_phase_evidence where checklist_item_id=$1 order by id desc limit 1",[target.id])).rows[0].id,target.evidenceId)
      assert.deepEqual((await loadState(session.user)).projects.find(p=>p.id===project.id).verifiedProgress,before)
    } finally {await db.exec("drop trigger test_fail_rework_audit on project_progress_history;drop function test_fail_rework_audit();")}
    await api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{resolution_note:"Replace the failed inspection evidence",selected_activity_ids:[target.id],expected_review_token:impact.review_token}})
    let after=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(after.verifiedProgress.project.earned,before.project.earned-target.weight)
    assert.equal(after.verifiedProgress.project.total,before.project.total)
    assert.equal(after.workflow.checklist[project.phase].find(i=>i.id===unaffected.id).status,"approved")
    assert.equal(after.workflow.checklist[project.phase].find(i=>i.id===target.id).status,"rework_required")
    assert.equal((await db.query("select status from project_phase_evidence where id=$1",[target.evidenceId])).rows[0].status,"approved","original review is preserved")
    await assert.rejects(api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{resolution_note:"Repeat"}}),error=>error.status===409)
    await assert.rejects(api(`/rework-requests/${overlap.id}/approve`,{method:"POST",json:{resolution_note:"Stale duplicate",selected_activity_ids:[target.id],expected_review_token:staleOverlap.review_token}}),error=>error.status===409)
    const zero=await review(overlap.id)
    assert.equal(zero.loss.project,0)
    assert.equal(zero.loss.phase,0)
    await api(`/rework-requests/${overlap.id}/approve`,{method:"POST",json:{resolution_note:"Continue the same correction; no additional deduction",selected_activity_ids:[target.id],expected_review_token:zero.review_token}})
    after=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(after.verifiedProgress.project.earned,before.project.earned-target.weight)
    await asUser(spmEmail)
    await assert.rejects(api(base+`/checklist-items/${target.id}/submit`,{method:"POST",json:{}}),/fresh corrected/)
    const phaseFile=await api(base+"/phase-files",{method:"POST",body:(()=>{const f=new FormData();f.set("file",new File(["%PDF-1.4\nCorrected inspection"],"corrected.pdf",{type:"application/pdf"}));return f})()})
    const corrected=await api(base+`/checklist-items/${target.id}/submit`,{method:"POST",json:{file_id:phaseFile.id}})
    session=await asUser(opmEmail)
    after=(await loadState(session.user)).projects.find(p=>p.id===project.id)
    assert.equal(after.workflow.checklist[project.phase].find(i=>i.id===target.id).status,"submitted")
    assert.equal(after.verifiedProgress.project.earned,before.project.earned-target.weight,"upload alone restores no credit")
    const approval=await api(base+`/evidence/${corrected.id}/review-preview`)
    await api(base+`/evidence/${corrected.id}/approve`,{method:"POST",json:{expected_review_token:approval.review_token}})
    await assert.rejects(api(base+`/evidence/${corrected.id}/approve`,{method:"POST",json:{}}),error=>error.status===409)
    assert.equal((await loadState(session.user)).projects.find(p=>p.id===project.id).verifiedProgress.project.earned,before.project.earned)
    await asUser(spmEmail)
    const protectedRequest=await issue([target.id])
    session=await asUser(opmEmail)
    const saved=(await db.query("select current_stage_id,lifecycle_status from projects where id=$1",[project.id])).rows[0]
    await db.query("update projects set lifecycle_status='archived' where id=$1",[project.id])
    await assert.rejects(review(protectedRequest.id),error=>error.status===422)
    await db.query("update projects set lifecycle_status=$2,current_stage_id=(select project_stage_id from project_phase_team where project_id=$1 and project_stage_id<>$3 limit 1) where id=$1",[project.id,saved.lifecycle_status,saved.current_stage_id])
    await assert.rejects(review(protectedRequest.id),error=>error.status===409)
    await db.query("update projects set current_stage_id=$2 where id=$1",[project.id,saved.current_stage_id])
    await api(`/rework-requests/${protectedRequest.id}/reject`,{method:"POST",json:{resolution_note:"Protection checks complete; leave activity approval intact"}})
    await asUser("patricia.domingo@10builders.com")
    await assert.rejects(api(`/rework-requests/${first.id}/approve`,{method:"POST",json:{resolution_note:"Admin withdrawal"}}),error=>error.status===403)
    await asUser("f.uy@aldenheights-hoa.com")
    assert.ok((await api("/workspace/project-data")).every(p=>!p.overview&&!("verifiedProgress" in p)))
  })

  await t.test("lifecycle gates use verified approvals across every phase and protect archives",async()=>{
    let session=await asUser("patricia.domingo@10builders.com")
    const reference=session.state.projects.find(p=>p.name==="Rosaria Business Park")
    const opmId=reference.opmId,spmId=reference.team[0].accountId
    const spmEmail=session.state.accounts.find(a=>a.id===spmId).email
    const opmEmail=session.state.accounts.find(a=>a.id===opmId).email
    // This intentionally isolated fixture bypasses intake license/capacity validation;
    // lifecycle actions below still run through the real authenticated API.
    const id=randomUUID(),base="/projects/"+id
    await db.query("insert into projects(id,name,project_type_id,client_name,lifecycle_status,suggested_opm_id,current_stage_id) select $1,'Disposable lifecycle verification',project_type_id,'Lifecycle fixture','active',$2,current_stage_id from projects where id=$3",[id,opmId,reference.id])
    const stages=(await db.query("select w.project_stage_id as id,s.code from projects p join project_type_stages w on w.project_type_id=p.project_type_id join project_stages s on s.id=w.project_stage_id where p.id=$1 order by w.sort_order",[id])).rows
    await db.query("update projects set lifecycle_status='active',current_stage_id=$2 where id=$1",[id,stages[0].id])
    await db.query("insert into project_phase_team(project_id,project_stage_id,spm_user_id,is_lead,status) select $1,w.project_stage_id,$2,w.sort_order=1,'confirmed' from projects p join project_type_stages w on w.project_type_id=p.project_type_id where p.id=$1",[id,spmId])
    await db.query("update project_phase_team set status='confirmed' where project_id=$1",[id])
    await db.query("insert into project_phase_checklists(project_id,project_stage_id) select $1,unnest($2::smallint[]) on conflict do nothing",[id,stages.map(s=>s.id)])
    await db.query("insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order,weight) select $1,t.project_stage_id,t.code,t.title,t.required,t.sort_order,t.weight from phase_checklist_templates t where t.project_stage_id=any($2::smallint[]) on conflict do nothing",[id,stages.map(s=>s.id)])
    const items=(await db.query("select id,project_stage_id from project_phase_checklist_items where project_id=$1 order by id",[id])).rows
    const first=items.find(i=>i.project_stage_id===stages[0].id),last=items.find(i=>i.project_stage_id===stages.at(-1).id)
    const evidence=async(item,status,reviewer=opmId)=>db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7) returning id",[id,item.project_stage_id,item.id,status,spmId,reviewer,reviewer?new Date().toISOString():null])
    for(const item of items)await evidence(item,"approved")
    const stage=async()=>(await db.query("select current_stage_id,lifecycle_status from projects where id=$1",[id])).rows[0]
    await evidence(first,"pending",null)
    await asUser(opmEmail)
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),error=>error.status===409)
    await evidence(first,"approved")
    await db.query("update project_phase_checklist_items set required=false where project_id=$1 and project_stage_id=$2",[id,stages[0].id])
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),error=>error.status===422)
    await db.query("update project_phase_checklist_items set required=true where project_id=$1 and project_stage_id=$2",[id,stages[0].id])
    await db.query("update project_phase_team set status='pending' where project_id=$1 and project_stage_id=$2",[id,stages[1].id])
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),/confirm/)
    await asUser(spmEmail)
    const note=await api(base+"/phase-updates",{method:"POST",json:{stage_id:stages[1].id,note:"A note must not move a phase"}})
    await db.query("update project_phase_team set status='confirmed' where project_id=$1",[id])
    await asUser(opmEmail)
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),error=>error.status===409)
    const blockedEvidence = await evidence(first,"pending",null)
    const blockedApproval = await api(base+`/evidence/${blockedEvidence.rows[0].id}/approve`,{method:"POST",json:{}})
    assert.equal(blockedApproval.status,"approved")
    assert.equal(blockedApproval.handoff.advanced,false)
    assert.match(blockedApproval.handoff.reason,/pending/)
    assert.equal((await stage()).current_stage_id,stages[0].id)
    const blockedWorkspace=await loadState({ id: opmId, role: "opm", email: opmEmail })
    assert.match(blockedWorkspace.projects.find(project=>project.id===id).handoffBlocker,/pending/)
    await api(base+"/phase-updates/"+note.id+"/approve",{method:"POST",json:{}})
    assert.equal((await stage()).current_stage_id,stages[0].id)
    const secondPhaseItem = items.find(item => item.project_stage_id === stages[1].id)
    await evidence(secondPhaseItem,"rejected")
    // Workspace refresh itself catches up an already completed phase; no Activate button.
    const [afterHandoff] = await Promise.all([
      loadState({ id: opmId, role: "opm", email: opmEmail }),
      api("/workspace/reconcile-phase-handoffs",{method:"POST",json:{}}),
    ])
    assert.equal(afterHandoff.projects.find(p => p.id === id).phase, stages[1].code)
    assert.equal((await stage()).current_stage_id,stages[1].id)
    assert.equal((await db.query("select count(*)::int AS n from project_progress_history where project_id=$1 and note like 'Automatic handoff:%'",[id])).rows[0].n,1,"concurrent refreshes record one handoff")
    const thirdPhaseItem = items.find(item => item.project_stage_id === stages[2].id)
    await evidence(thirdPhaseItem,"rejected")
    const priorEvidence = (await db.query("select id,status from project_phase_evidence where project_id=$1 and project_stage_id=$2 order by id",[id,stages[1].id])).rows
    const finalApprovalEvidence = await evidence(secondPhaseItem,"pending",null)
    const automatic = await api(base+`/evidence/${finalApprovalEvidence.rows[0].id}/approve`,{method:"POST",json:{}})
    assert.equal(automatic.handoff.advanced,true)
    assert.equal(automatic.handoff.current_stage,stages[2].code)
    assert.equal((await stage()).current_stage_id,stages[2].id)
    await assert.rejects(api(base+`/evidence/${finalApprovalEvidence.rows[0].id}/approve`,{method:"POST",json:{}}),error=>error.status===409)
    assert.equal((await stage()).current_stage_id,stages[2].id,"duplicate approval cannot advance twice")
    const retained = await db.query("select id,status from project_phase_evidence where project_id=$1 and project_stage_id=$2 and id<>$3 order by id",[id,stages[1].id,finalApprovalEvidence.rows[0].id])
    assert.deepEqual(retained.rows,priorEvidence,"handoff preserves every previous evidence version")
    const nextSpm = await asUser(spmEmail)
    assert.equal(nextSpm.state.projects.find(p=>p.id===id).phase,stages[2].code)
    await asUser(opmEmail)
    await evidence(thirdPhaseItem,"approved")
    await db.query("update projects set current_stage_id=$2 where id=$1",[id,stages.at(-1).id])
    const resolveNote=async()=>{
      await asUser(spmEmail)
      const note=await api(base+"/phase-updates",{method:"POST",json:{note:"Closeout completion check"}})
      await asUser(opmEmail)
      return api(base+"/phase-updates/"+note.id+"/approve",{method:"POST",json:{}})
    }
    await db.query("update project_phase_checklist_items set required=false where id=$1",[first.id])
    await evidence(first,"pending",null)
    await db.query("update project_phase_checklist_items set required=true where id=$1",[first.id])
    await assert.rejects(api("/archive/projects/"+id+"/close",{method:"POST",json:{}}),error=>error.status===422)
    assert.equal((await resolveNote()).project_archived,false,"Closeout cannot compensate for withdrawn earlier credit")
    await evidence(first,"approved")
    await db.query("update project_phase_team set status='pending' where project_id=$1 and project_stage_id=$2",[id,stages[0].id])
    assert.equal((await resolveNote()).project_archived,false,"all phase assignments remain required")
    await db.query("update project_phase_team set status='confirmed' where project_id=$1",[id])
    await db.query("update project_phase_checklist_items set required=false where project_id=$1 and project_stage_id=$2",[id,stages[0].id])
    assert.equal((await resolveNote()).project_archived,false,"missing required phase scope blocks closure")
    await db.query("update project_phase_checklist_items set required=true where project_id=$1 and project_stage_id=$2",[id,stages[0].id])
    const pending=await evidence(last,"pending",null)
    assert.equal((await resolveNote()).project_archived,false)
    const preview=await api(base+"/evidence/"+pending.rows[0].id+"/review-preview")
    const result=await api(base+"/evidence/"+pending.rows[0].id+"/approve",{method:"POST",json:{expected_review_token:preview.review_token}})
    assert.equal(result.project_archived,true)
    assert.equal((await stage()).lifecycle_status,"archived")
    await assert.rejects(api(base+"/advance-phase",{method:"POST",json:{}}),/Archived|active/i)
    assert.equal((await stage()).lifecycle_status,"archived")
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
      assert.deepEqual(p.verifiedProgress.phases.map(phase=>phase.name),projectPhaseNames(p),"verified breakdown uses the project-type phase order");
      assert.equal(p.verifiedProgress.project.percentage,null,"newly added unconfigured phases cannot be counted as complete");
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

  await t.test("the API refuses requests without a session", async () => {
    setToken("")
    await assert.rejects(api("/projects"), /token/i)
  })
})
