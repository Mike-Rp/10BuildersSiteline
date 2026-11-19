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
  if (multiEngineer) for (const file of ["019-engineer-phase-commitments","020-engineer-phase-responsibilities"])
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
      INQUIRY_PLANNING_RULES:JSON.stringify({Residential:{Small:{lot_area:300,land_area:600,floor_area_sqm:200,floor_count:2},durationDays:{Small:90}}})},
  })
  server.stdout.on("data",data => { output += data })
  server.stderr.on("data",data => { output += data })
  for (let attempt=0;;attempt++) {
    if (await fetch(base+"/health").then(r=>r.status === 200 || r.status === 503,()=>false)) break
    if (attempt===100 || server.exitCode !== null) assert.fail("Backend failed to start. "+output)
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  async function call(path, {token, json, form, status=200}={}) {
    const response = await fetch(base+path,{
      method:json || form ? "POST" : "GET",
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
  const details = {client_name:"Ana Reyes",email:"ana@example.com",phone:"09123456789",name:"Maple Grove Residence",
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

  const cancelled = await call(root,{token:admin,json:{...details,classification:"Priority",immediate_consultation:"yes"}})
  assert.equal(cancelled.status,"offered")
  assert.ok(cancelled.opm_name)
  assert.equal(cancelled.routing_history[0].kind,"offered")
  assert.equal((await db.query("SELECT count(*)::int AS count FROM notifications WHERE title='Consultation request'")).rows[0].count,1)
  const [{email:firstEmail}] = (await db.query("SELECT email FROM users WHERE id=$1",[cancelled.opm_id])).rows
  const firstToken = await login(firstEmail,"staff")
  const offered = (await call(root,{token:firstToken})).find(item=>item.id===cancelled.id)
  assert.equal(offered.details.classification,"Priority")
  assert.equal(offered.routing_history,undefined)
  assert.equal(offered.match.project_type,"Residential")
  assert.equal((await decision(cancelled,firstToken,"cancel")).status,"returned")
  const retried = (await call(root,{token:admin})).find(item=>item.id===cancelled.id)
  assert.deepEqual(retried.routing_history.slice(0,2).map(event=>event.kind),["offered","declined"])
  if (retried.status === "offered") assert.notEqual(retried.opm_id,cancelled.opm_id)
  else assert.equal(retried.routing_history.at(-1).kind,"no_match")
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
  const assessed = (await save("assessment",2,assessmentInput)).workflow
  assert.equal(assessed.assessment.durationDays,90)
  assert.equal(assessed.assessment.size,"Small")
  assert.equal(assessed.assessment.score,7)
  assert.equal(assessed.budget_history[0].amount,4500000)
  assert.equal((await save("assessment",2,assessmentInput)).workflow.assessment.id,assessed.assessment.id)
  const adminRecord = (await call(root,{token:admin})).find(item=>item.id===row.id)
  assert.equal(adminRecord.workflow,undefined)
  assert.equal(adminRecord.details.opm_workflow,undefined)
  const planInput = {...intake,estimated_budget:4500000,assessment_id:assessed.assessment.id}
  await call(planning,{token,status:409,json:{...planInput,target_end_date:"2027-04-13"}})
  const preview = await call(planning,{token,json:planInput})
  assert.deepEqual(preview.estimate,{size:"Small",end:"2027-04-12"})
  const phases = preview.phases.slice(0,1)

  async function upload(name) {
    const id = crypto.randomUUID()
    const form = new FormData()
    form.set("id",id)
    form.set("file",new Blob(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"],{type:"application/pdf"}),name)
    return (await call("/files",{token,form})).id
  }
  const documents = {estimated_budget:4500000,contract_file_id:await upload("signed.pdf"),plans_file_id:await upload("plans.pdf")}
  const recommended = await call(planning,{token,json:{...planInput,...documents,phases}})
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
  const payload = {...planInput,...documents,inquiry_id:row.id,suggested_opm_id:manager.id,phases,phase_team:recommended.team}
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{...recommended.team[0],stage:preview.phases[1]}]}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{stage:phases[0],user_id:manager.id}]}})
  const response = await call("/projects/intake",{token,json:payload})
  const repeated = await call("/projects/intake",{token,json:payload})
  assert.equal(response.project.id,repeated.project.id)
  assert.equal(response.project.lifecycle_status,"spm_review")
  assert.equal((await call(root,{token})).find(inquiry=>inquiry.id===row.id).project_status,"spm_review")
  const [stored] = (await db.query("SELECT inquiry_intake,phase_scope,lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows
  assert.equal(stored.inquiry_intake.floor_area_sqm,200)
  assert.deepEqual(stored.phase_scope.phases,phases)
  const [lead] = (await db.query(`SELECT t.project_stage_id,u.email FROM project_phase_team t JOIN users u ON u.id=t.spm_user_id WHERE t.project_id=$1 AND t.is_lead`,[response.project.id])).rows
  const spm = await login(lead.email,"staff")
  if (multiEngineer) {
    const [responsibility] = (await db.query("SELECT id FROM project_phase_responsibilities WHERE project_id=$1 AND is_coordinator",[response.project.id])).rows
    await call(`/projects/${response.project.id}/engineer-responsibilities/${responsibility.id}`,{token:spm,json:{action:"accept"}})
  } else {
    await call(`/confirmations/projects/${response.project.id}/phase-team/${lead.project_stage_id}/accept`,{token:spm,json:{}})
  }
  assert.equal((await db.query("SELECT lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows[0].lifecycle_status,"spm_review")
})
