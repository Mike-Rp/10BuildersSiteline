import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { installCredentialFixture } from "./helpers/credential-fixture.mjs"
import { COMPANY_TRADES } from "../Thesis-Backend/src/domain/company-trades.js"

const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
const freePort = () => new Promise(resolve => {
  const server = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})

for (const multiEngineer of [false,true]) test(`Admin inquiry becomes an OPM-owned project with ${multiEngineer ? "multi-engineer" : "coordinator"} Site PM offers`, {timeout:120000}, async t => {
  const db = new PGlite({extensions:{citext}})
  let server, socket
  t.after(async () => {
    server?.kill()
    await socket?.stop()
    await db.close()
  })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  for (const file of ["001-phase-checklists", "002-phase-update-confirmation", "003-react-integration", "004-verified-activity-progress", "009-engineer-license-workflow"]) {
    await db.exec(read(`../Thesis-Backend/migrations/${file}.sql`))
  }
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  for (const file of ["004-project-type-workflows", "008-monthly-report-history", "009-engineer-license-workflow", "011-independent-notifications", "014-mixed-use-project-scope", "031-project-inquiries"]) {
    await db.exec(read(`../Thesis-Backend/migrations/${file}.sql`))
  }
  await db.exec("update user_licenses set license_expiry=current_date+400 where superseded_at is null")
  await db.exec("delete from license_renewal_requests where file_ref like 'seed/licenses/renewal-%'")
  await installCredentialFixture(db)
  if (multiEngineer) for (const file of ["013-trade-subcontractor-allocation","018-phase-foreman-allocation","019-engineer-phase-commitments","020-engineer-phase-responsibilities"])
    await db.exec(read(`../Thesis-Backend/migrations/${file}.sql`))
  await db.exec("UPDATE project_engineers SET unassigned_at=now() WHERE unassigned_at IS NULL; UPDATE projects SET lifecycle_status='archived'")
  const [dbPort,apiPort] = await Promise.all([freePort(),freePort()])
  socket = new PGLiteSocketServer({db,port:dbPort,host:"127.0.0.1"})
  await socket.start()
  const base = `http://127.0.0.1:${apiPort}/api/v1`
  let output = ""
  server = spawn(process.execPath, ["src/index.js"], {
    cwd:fileURLToPath(new URL("../Thesis-Backend",import.meta.url)),
    env:{...process.env,NODE_ENV:"development",DB_SERVER:"127.0.0.1",DB_PORT:String(dbPort),
      DB_NAME:"postgres",DB_USER:"postgres",DB_PASSWORD:"x",DB_POOL_MAX:"1",PGSSLMODE:"disable",
      JWT_SECRET:"project-inquiries-test-secret-0123456789",PORT:String(apiPort),HOST:"127.0.0.1",ARCHIVE_MAINTENANCE_ENABLED:"false",
      },
  })
  server.stdout.on("data",data => { output += data })
  server.stderr.on("data",data => { output += data })
  for (let attempt=0;;attempt++) {
    if (await fetch(base+"/health").then(r=>r.status === 200 || r.status === 503,()=>false)) break
    if (attempt===100 || server.exitCode !== null) assert.fail("Backend failed to start. "+output)
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  async function call(path, {token, json, form, status=200, method}={}) {
    const response = await fetch(base+path,{
      method:method ?? (json || form ? "POST" : "GET"),
      headers:{...(token ? {Authorization:"Bearer "+token}:{}),...(json ? {"Content-Type":"application/json"}:{})},
      body:form || (json && JSON.stringify(json)),
    })
    const body = await response.json()
    assert.equal(response.status,status,JSON.stringify(body)+" "+output)
    return body.data
  }
  const tokens = new Map()
  async function login(email, role) {
    if (!tokens.has(email)) tokens.set(email,(await call(`/auth/${role}/login`,{json:{email,password:"Password@123"}})).token)
    return tokens.get(email)
  }
  const admin = await login("patricia.domingo@10builders.com","admin")
  const root = "/projects/inquiries"
  const details = {client_name:"Ana Reyes",email:"ana@gmail.com",phone:"09123456789",name:"Maple Grove Residence",
    address:"Quezon City",project_type:"Residential",land_area:500,lot_area:240,floor_area_sqm:180,floor_count:2,consultation:30}
  const create = () => call(root,{token:admin,json:details})
  const decision = (row,token,action,other={}) => call(`${root}/${row.id}/decision`,{token,json:{action,...other}})
  async function offer(row) {
    const manager = await call(`${root}/${row.id}/recommendation`,{token:admin})
    assert.ok(manager?.id,"Expected a qualified Office PM")
    const [{email}] = (await db.query("SELECT email FROM users WHERE id=$1",[manager.id])).rows
    const token = await login(email,"staff")
    await decision(row,admin,"send",{opm_id:manager.id})
    return {manager,token}
  }
  const delayed = await call(root,{token:admin,json:{...details,land_area:"",classification:"Normal",immediate_consultation:"no"}})
  assert.equal(delayed.status,"draft")
  assert.equal(delayed.opm_id,null)
  assert.equal(delayed.details.land_area,undefined)

  const cancelled = await call(root,{token:admin,json:{...details,project_type:"Mixed-Use",classification:"Priority",immediate_consultation:"yes"}})
  assert.equal(cancelled.status,"offered")
  assert.ok(cancelled.opm_name)
  assert.equal(cancelled.routing_history[0].kind,"offered")
  assert.equal((await db.query("SELECT count(*)::int AS count FROM notifications WHERE title='Consultation request'")).rows[0].count,1)
  const [{email:firstEmail}] = (await db.query("SELECT email FROM users WHERE id=$1",[cancelled.opm_id])).rows
  const firstToken = await login(firstEmail,"staff")
  const offered = (await call(root,{token:firstToken})).find(item=>item.id===cancelled.id)
  assert.equal(offered.details.classification,"Priority")
  assert.equal(offered.routing_history,undefined)
  assert.equal(offered.match.project_type,"Mixed-Use")
  assert.equal((await decision(cancelled,firstToken,"cancel")).status,"returned")
  const retried = (await call(root,{token:admin})).find(item=>item.id===cancelled.id)
  assert.deepEqual(retried.routing_history.slice(0,2).map(event=>event.kind),["offered","declined"])
  assert.equal(retried.status,"offered")
  assert.notEqual(retried.opm_id,cancelled.opm_id)
  assert.equal(retried.routing_history.at(-1).opm_id,retried.opm_id)
  assert.equal((await call(root,{token:firstToken})).some(item=>item.id===cancelled.id),false)
  const withdrawn = await create()
  const second = await offer(withdrawn)
  assert.equal((await decision(withdrawn,second.token,"confirm")).status,"consulting")
  assert.equal((await decision(withdrawn,second.token,"withdraw",{reason:"Client cancelled the build."})).status,"withdrawn")
  assert.equal((await decision(withdrawn,admin,"drop")).reason,"Client cancelled the build.")

  assert.equal((await db.query("SELECT count(*)::int AS count FROM notifications WHERE title='Client withdrew' AND message LIKE '%Client cancelled the build.%'")).rows[0].count,1)

  const row = await create()
  const { manager,token } = await offer(row)
  await decision(row,token,"confirm")
  const consulting = (await call(root,{token})).find(inquiry=>inquiry.id===row.id)
  assert.equal(consulting.status,"consulting")
  assert.deepEqual(consulting.details,details)
  const workflowPath = `${root}/${row.id}/workflow`
  const save = (action,version,input={},status=200) => call(workflowPath,{token,status,json:{action,version,...input}})
  await save("review",0,{},409)
  const revised = await decision(row,token,"revise",{decision_date:"2025-06-04",decision_note:"Confirm the floor area."})
  assert.equal(revised.workflow.revisions[0].note,"Confirm the floor area.")
  assert.equal(revised.status,"consulting")
  await decision(row,token,"approve")
  const planning = `${root}/${row.id}/planning`
  const intake = {...details,floor_area_sqm:200,target_start_date:"2027-01-12",target_end_date:"2027-04-12"}
  await call(planning,{token,status:409,json:intake})
  await save("budget",0,{amount:4500000},409)
  const schedule = {start:intake.target_start_date,end:intake.target_end_date}
  const assessmentInput = {technical:"Several specialized systems",arrangement:"Partially overlapping phases"}
  await save("review",0,schedule)
  await save("assessment",1,assessmentInput,409)
  await save("budget",1,{amount:4500000.001},422)
  await save("budget",1,{amount:4500000})
  const firstAssessment = (await save("assessment",1,assessmentInput)).workflow.assessment
  const correction = {...schedule,correction:{floor_area_sqm:200}}
  await save("review",1,correction,422)
  const review = (await save("review",1,{...correction,reason:"Client confirmed the revised floor area."})).workflow
  assert.equal(review.assessment,undefined)
  assert.deepEqual(review.review_history.at(-1).changes.floor_area_sqm,{before:180,after:200})
  await save("assessment",1,assessmentInput,409)
  await call(planning,{token,status:409,json:{...intake,estimated_budget:4500000,assessment_id:firstAssessment.id}})
  const beforeBudgetChange = (await save("assessment",2,assessmentInput)).workflow.assessment
  const updatedBudget = 4600000
  assert.equal((await save("budget",2,{amount:updatedBudget})).workflow.assessment,undefined)
  await call(planning,{token,status:409,json:{...intake,estimated_budget:updatedBudget,assessment_id:beforeBudgetChange.id}})
  const assessed = (await save("assessment",2,assessmentInput)).workflow
  assert.notEqual(assessed.assessment.id,beforeBudgetChange.id)
  assert.equal(assessed.assessment.durationDays,90)
  assert.equal(assessed.assessment.size,"Medium")
  assert.equal(assessed.assessment.score,8)
  assert.equal(assessed.assessment.planningDays,215)
  assert.equal(assessed.assessment.suggestedEnd,"2027-08-15")
  assert.equal(assessed.budget_history[0].amount,4500000)
  assert.equal((await save("assessment",2,assessmentInput)).workflow.assessment.id,assessed.assessment.id)
  const adminRecord = (await call(root,{token:admin})).find(item=>item.id===row.id)
  assert.equal(adminRecord.workflow,undefined)
  assert.equal(adminRecord.details.opm_workflow,undefined)
  const planInput = {...intake,estimated_budget:updatedBudget,assessment_id:assessed.assessment.id}
  await call(planning,{token,status:409,json:{...planInput,target_end_date:"2027-04-13"}})
  const preview = await call(planning,{token,json:planInput})
  assert.deepEqual(preview.estimate,{size:"Medium",end:"2027-08-15"})
  const phases = preview.phases.slice(0,2)

  async function upload(name) {
    const id = crypto.randomUUID()
    const form = new FormData()
    form.set("id",id)
    form.set("file",new Blob(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"],{type:"application/pdf"}),name)
    return (await call("/files",{token,form})).id
  }
  const documents = {contract_file_id:await upload("signed.pdf")}
  const recommended = await call(planning,{token,json:{...planInput,...documents,phases}})
  const resumed = await call(planning,{token,json:planInput})
  assert.deepEqual(resumed.staffing,{assessment_id:assessed.assessment.id,phases,contract_file_id:documents.contract_file_id})
  assert.deepEqual(recommended.team.map(item=>item.stage),phases)
  assert.ok(recommended.team[0].user_id)
  const eligibleIds = recommended.candidates[phases[0]].map(person => person.id)
  await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata)
    SELECT id, '{"assignmentHold":true}'::jsonb FROM users WHERE id=ANY($1::uuid[])
    ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`, [eligibleIds])
  const blocked = await call(planning,{token,json:{...planInput,...documents,phases}})
  assert.deepEqual(blocked.candidates[phases[0]], [])
  assert.equal(blocked.candidateBlockers[phases[0]], "qualifications")
  await db.query("UPDATE workspace_account_metadata SET metadata=metadata-'assignmentHold' WHERE user_id=ANY($1::uuid[])", [eligibleIds])
  const rechecked = await call(planning,{token,json:{...planInput,...documents,phases}})
  assert.deepEqual(rechecked.candidates[phases[0]].map(person => person.id), eligibleIds)
  assert.equal(rechecked.candidateBlockers[phases[0]], undefined)
  // Use two independently qualified coordinators so that Lead permissions are exercised by both accounts.
  const secondPhase = recommended.team[1]
  const tags = secondPhase.engineers?.[0].assigned_disciplines ?? secondPhase.assigned_disciplines
  const firstPhaseIds = recommended.team[0].engineers?.map(e=>e.user_id) ?? [recommended.team[0].user_id]
  const alternate = recommended.candidates[phases[1]].find(person =>
    !firstPhaseIds.includes(person.id) && !secondPhase.engineers?.slice(1).some(e=>e.user_id===person.id)
    && tags.every(tag=>person.qualifiedTags.includes(tag)))
  assert.ok(alternate,"A second qualified Site PM is required for the authorization scenario")
  secondPhase.user_id = alternate.id
  if (secondPhase.engineers) secondPhase.engineers[0].user_id = alternate.id
  await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,'{"experienceByType":{"Residential":{"months":240}}}')
    ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`,[alternate.id])
  const payload = {...planInput,...documents,inquiry_id:row.id,suggested_opm_id:manager.id,phases,phase_team:recommended.team}
  await call("/projects/intake",{token,status:409,json:{...payload,assessment_id:undefined}})
  await call("/projects/intake",{token,status:409,json:{...payload,estimated_budget:updatedBudget-1}})
  await call("/projects/intake",{token,status:422,json:{...payload,contract_file_id:undefined}})
  await call("/projects/intake",{token,status:409,json:{...payload,phases:[phases[0]],phase_team:[recommended.team[0]]}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{...recommended.team[0],stage:preview.phases[1]}]}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{stage:phases[0],user_id:manager.id}]}})
  // An invalid second document fails after the project and signed contract were written inside the transaction.
  await call("/projects/intake",{token,status:422,json:{...payload,plans_file_id:crypto.randomUUID()}})
  assert.equal((await db.query("SELECT count(*)::int n FROM projects WHERE name=$1",[details.name])).rows[0].n,0)
  assert.equal((await db.query("SELECT project_id FROM stored_files WHERE id=$1",[documents.contract_file_id])).rows[0].project_id,null)
  const response = await call("/projects/intake",{token,json:payload})
  const repeated = await call("/projects/intake",{token,json:payload})
  await call("/projects/intake",{token,status:409,json:{...payload,assessment_id:firstAssessment.id}})
  assert.equal(response.project.id,repeated.project.id)
  assert.equal(response.project.lifecycle_status,"spm_review")
  assert.equal((await call(root,{token})).find(inquiry=>inquiry.id===row.id).project_status,"spm_review")
  const [stored] = (await db.query("SELECT inquiry_intake,phase_scope,lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows
  assert.equal(stored.inquiry_intake.floor_area_sqm,200)
  assert.deepEqual(stored.inquiry_intake.assessment,assessed.assessment)
  assert.equal(stored.inquiry_intake.target_end_date,intake.target_end_date)
  assert.equal(stored.inquiry_intake.estimated_budget,updatedBudget)
  assert.deepEqual(stored.phase_scope.phases,phases)
  const projectId = response.project.id
  await call("/projects/recommendations/update-phase-team",{token,method:"PUT",json:{project_id:projectId,phase_team:recommended.team}})
  const assignments = (await db.query(`SELECT t.project_stage_id,t.is_lead,u.id,u.email FROM project_phase_team t
    JOIN users u ON u.id=t.spm_user_id WHERE t.project_id=$1 ORDER BY t.is_lead DESC`,[projectId])).rows
  assert.deepEqual(assignments.map(a=>a.is_lead),[true,false])
  const [lead,other] = assignments
  assert.equal(lead.id,alternate.id)
  const leadToken = await login(lead.email,"staff")
  const otherToken = await login(other.email,"staff")
  const offerRecipients = new Set(recommended.team.flatMap(p=>p.engineers?.map(e=>e.user_id) ?? [p.user_id]))
  const notices = (await db.query("SELECT recipient_user_id FROM notifications WHERE title='Site PM assignment offer' AND related_project_id=$1",[projectId])).rows
  assert.deepEqual(notices.map(n=>n.recipient_user_id).sort(),[...offerRecipients].sort())
  async function respond(assignment,staffToken,action,status=200) {
    const stageId = assignment.project_stage_id
    const note = "Test assignment response"
    if (multiEngineer) {
      const [r] = (await db.query("SELECT id FROM project_phase_responsibilities WHERE project_id=$1 AND project_stage_id=$2 AND is_coordinator",[projectId,stageId])).rows
      return call(`/projects/${projectId}/engineer-responsibilities/${r.id}`,{token:staffToken,status,json:{action,note}})
    }
    return call(`/confirmations/projects/${projectId}/phase-team/${stageId}/${action}`,{token:staffToken,status,json:{note}})
  }
  const command = `/projects/${projectId}/workspace-command`
  const [{id:companyId}] = (await db.query("SELECT id FROM subcontractors WHERE directory_status='approved' AND NOT coalesce(is_deleted,false) LIMIT 1")).rows
  let allocationPath = command
  let allocation = {type:"contact_company",companyId}
  if (multiEngineer) {
    const metadata = {foremen:[{name:"Test foreman",phone:"09123456789"}],capabilityReview:{
      disciplines:COMPANY_TRADES,reviewedAt:new Date().toISOString(),unavailable:false}}
    await db.query(`INSERT INTO workspace_company_metadata(subcontractor_id,metadata) VALUES($1,$2)
      ON CONFLICT(subcontractor_id) DO UPDATE SET metadata=workspace_company_metadata.metadata||excluded.metadata`,[companyId,metadata])
    allocationPath = `/projects/${projectId}/phase-allocation`
    const ctx = await call(allocationPath,{token:leadToken})
    const foremanId = ctx.companies.find(c=>c.id===companyId).foremen[0].id
    allocation = {action:"submit",note:"Confirmed project coverage.",revision:ctx.revision,
      assignments:ctx.phases.map(p=>({phase:p.name,companyId,foremanId}))}
  }
  const allocate = (staffToken,status=200) => call(allocationPath,{token:staffToken,status,json:allocation})
  await respond(lead,leadToken,"accept",409)
  const uploadRegistered = async (docIndex,name) => call(command,{token,json:{type:"upload_registered",docIndex,doc:{id:await upload(name)}}})
  await uploadRegistered(3,"registered-plans.pdf")
  await respond(other,otherToken,"accept",409)
  await respond(other,otherToken,"decline",409)
  await respond(lead,leadToken,"accept")
  await allocate(leadToken,409)
  for (const index of [0,1,4,5]) await uploadRegistered(index,`registered-${index}.pdf`)
  await allocate(leadToken,409)
  await respond(other,otherToken,"accept")
  if (multiEngineer) {
    const pending = (await db.query(`SELECT r.id,u.email FROM project_phase_responsibilities r JOIN users u ON u.id=r.user_id
      WHERE r.project_id=$1 AND r.status='pending'`,[projectId])).rows
    for (const r of pending) await call(`/projects/${projectId}/engineer-responsibilities/${r.id}`,{token:await login(r.email,"staff"),json:{action:"accept"}})
  }
  await allocate(otherToken,403)
  await call(command,{token:otherToken,status:403,json:{type:"upload_agreement"}})
  await allocate(leadToken)
  assert.equal((await db.query("SELECT lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows[0].lifecycle_status,"spm_review")
})
