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
  const details = {client_name:"Ana Reyes",email:`ana-${crypto.randomUUID()}@example.com`,phone:"09123456789",name:"Maple Grove Residence",
    address:"Quezon City",project_type:"Residential",lot_area:240,floor_area_sqm:180,floor_count:2,consultation:30}
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
  const candidatesPath = `${root}/opm-candidates?project_type=Residential`
  const candidates = await call(candidatesPath,{token:admin})
  assert.ok(candidates.length)
  const draft = await call(`${root}/draft`, { token:admin, json:{details:{client_record:"new",client_type:"company",company_name:"Demo Development",primary_contact:"Maria Santos"}} })
  assert.equal(draft.status,"draft")
  assert.equal(draft.opm_id,null)
  assert.equal(draft.details.intake_draft,"yes")
  await call(`${root}/${draft.id}/match`,{token:admin,json:{},status:409})
  await call(`${root}/${draft.id}/recommendation`,{token:admin,status:409})
  const savedDraft = await call(`${root}/draft`,{token:admin,json:{id:draft.id,details:{...draft.details,name:"Saved partial project"}}})
  assert.equal(savedDraft.details.name,"Saved partial project")
  const company = await call(root,{token:admin,json:{...details,draft_id:draft.id,client_record:"new",client_type:"company",company_name:"Demo Development",client_name:"",primary_contact:"Maria Santos",designation:"Coordinator"}})
  assert.equal(company.id,draft.id)
  assert.equal(company.details.client_name,"Demo Development")
  assert.equal(company.details.primary_contact,"Maria Santos")
  assert.equal(company.details.intake_draft,undefined)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM project_inquiries WHERE id=$1",[draft.id])).rows[0].count,1)
  await call(root,{token:admin,json:{...details,draft_id:draft.id},status:409})
  const companyMatches = await call(`${root}/clients?q=Demo%20Development`,{token:admin})
  assert.equal(companyMatches[0].client_type,"company")
  assert.equal(companyMatches[0].primary_contact,"Maria Santos")
  const reused = await call(root,{token:admin,json:{...details,...companyMatches[0],client_record:"existing",existing_client_id:companyMatches[0].id,existing_client_source:"inquiry",existing_client_verified:"yes",client_name:"Forged identity"}})
  assert.equal(reused.details.client_name,"Demo Development")
  assert.equal(reused.details.client_type,"company")
  const existingEmail = `returning-${crypto.randomUUID()}@example.com`
  const existingAccount = (await db.query(`INSERT INTO users(full_name,email,phone,password_hash,role_id,status)
    SELECT 'Returning Client',$1,'09123456789','not-a-login-password',id,'active' FROM roles WHERE code='client' RETURNING id`,[existingEmail])).rows[0]
  const accountMatches = await call(`${root}/clients?q=${encodeURIComponent(existingEmail)}`,{token:admin})
  assert.equal(accountMatches[0].source,"account")
  const accountInquiry = await call(root,{token:admin,json:{...details,client_record:"existing",client_type:"individual",existing_client_source:"account",existing_client_id:existingAccount.id,existing_client_verified:"yes",email:"forged@example.com",client_name:"Forged"}})
  assert.equal(accountInquiry.details.client_name,"Returning Client")
  assert.equal(accountInquiry.details.email,existingEmail)
  await call(root,{token:admin,status:422,json:{...details,client_record:"new",client_type:"company",company_name:"Missing Contact"}})
  await call(root,{token:admin,status:422,json:{...details,client_record:"existing",client_type:"individual",existing_client_id:companyMatches[0].id,existing_client_source:"inquiry"}})
  await call(root,{token:admin,status:422,json:{...details,phone:"0912345678"}})
  await call(root,{token:admin,status:422,json:{...details,phone:"09123456A89"}})
  const regular = {...details,phone:"+639123456789",land_area:"",classification:"Urgent",immediate_consultation:"no"}
  await call(root,{token:admin,status:409,json:{...regular,expected_opm_id:null}})
  const delayed = await call(root,{token:admin,json:{...regular,expected_opm_id:candidates[0].id}})
  assert.equal(delayed.status,"offered")
  assert.equal(delayed.details.land_area, undefined)
  assert.equal(delayed.details.lot_area, 240)
  assert.equal(delayed.opm_id,candidates[0].id)
  assert.equal(delayed.opm_name,candidates[0].name)
  assert.equal(delayed.details.phone,"+639123456789")
  assert.equal(delayed.details.classification,"Normal")
  assert.equal(delayed.details.consultation,1440)
  assert.equal(delayed.details.land_area,undefined)

  const cancelled = await call(root,{token:admin,json:{...details,project_type:"Mixed-Use",classification:"Priority",immediate_consultation:"yes"}})
  assert.equal(cancelled.status,"offered")
  assert.ok(cancelled.opm_name)
  assert.equal(cancelled.routing_history[0].kind,"offered")
  assert.equal((await db.query("SELECT count(*)::int AS count FROM notifications WHERE title='Consultation request'")).rows[0].count,2)
  const [{email:firstEmail}] = (await db.query("SELECT email FROM users WHERE id=$1",[cancelled.opm_id])).rows
  const firstToken = await login(firstEmail,"staff")
  await call(candidatesPath,{token:firstToken,status:403})
  await call(`${root}/clients?q=Demo`,{token:firstToken,status:403})
  await call(`${root}/draft`,{token:firstToken,json:{details:{}},status:403})
  const offered = (await call(root,{token:firstToken})).find(item=>item.id===cancelled.id)
  assert.equal(offered.details.classification,"Priority")
  assert.equal(offered.routing_history,undefined)
  assert.equal(offered.match,undefined)
  assert.equal(offered.details.opm_match,undefined)
  assert.equal((await decision(cancelled,firstToken,"cancel")).status,"returned")
  const retried = (await call(root,{token:admin})).find(item=>item.id===cancelled.id)
  assert.deepEqual(retried.routing_history.slice(0,2).map(event=>event.kind),["offered","declined"])
  assert.equal(retried.status,"offered")
  assert.notEqual(retried.opm_id,cancelled.opm_id)
  assert.equal(retried.routing_history.at(-1).opm_id,retried.opm_id)
  assert.equal((await call(root,{token:firstToken})).some(item=>item.id===cancelled.id),false)
  // Earlier contact/draft fixtures reserve slots too; close them before the independent lifecycle scenario.
  await db.query("UPDATE project_inquiries SET status='dropped' WHERE status IN ('offered','consulting','approved')")
  const capacityCandidates = await call(candidatesPath,{token:admin})
  const capacityRows = await Promise.all(Array.from({length:capacityCandidates.length * 2 + 1},create))
  await Promise.all(capacityRows.map(item=>call(root+'/'+item.id+'/match',{token:admin,json:{}})))
  const reserved = (await db.query("SELECT opm_id,count(*)::int AS total FROM project_inquiries WHERE status IN ('offered','consulting','approved') AND project_id IS NULL GROUP BY opm_id")).rows
  assert.ok(reserved.every(item=>item.total<=2),'Concurrent routing must not exceed two reservations')
  assert.equal((await call(candidatesPath,{token:admin})).length,0,'Full OPMs must be hidden')
  assert.ok((await call(root,{token:admin})).some(item=>capacityRows.some(r=>r.id===item.id)&&!item.opm_id),'Overflow remains unassigned')
  await db.query("UPDATE project_inquiries SET status='dropped' WHERE status IN ('offered','consulting','approved')")
  assert.ok((await call(candidatesPath,{token:admin})).length,'Released reservations restore capacity')
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
  const correctionPath = root + '/' + row.id + '/client-correction'
  const requestCorrection = {action:'request',field:'client_name',value:'Corrected client name',reason:'Client confirmed spelling.'}
  await call(correctionPath,{token:admin,json:requestCorrection,status:403})
  const requested = await call(correctionPath,{token,json:requestCorrection})
  const correctionId = requested.corrections[0].id
  await call(correctionPath,{token,json:{action:'approve',id:correctionId},status:403})
  await call(correctionPath,{token:admin,json:{action:'approve',id:correctionId}})
  await call(correctionPath,{token:admin,json:{action:'approve',id:correctionId},status:409})
  const correctedRecord = (await call(root,{token})).find(item=>item.id===row.id)
  assert.equal(correctedRecord.details.client_name,'Corrected client name')
  assert.equal(correctedRecord.details.client_corrections[0].before,details.client_name)
  // Restore through a second audited request so downstream fixtures remain unchanged.
  const restore = await call(correctionPath,{token,json:{...requestCorrection,value:details.client_name}})
  await call(correctionPath,{token:admin,json:{action:'approve',id:restore.corrections[1].id}})
  await save('review',0,{start:'2027-01-12',end:'2027-08-15',correction:{client_name:'Unauthorized edit'}},403)
  const planning = `${root}/${row.id}/planning`
  const intake = {...details,floor_area_sqm:200,target_start_date:"2027-01-12",target_end_date:"2027-08-15"}
  await call(planning,{token,status:409,json:intake})
  await save("budget",0,{amount:4500000},409)
  const schedule = {start:intake.target_start_date,end:intake.target_end_date}
  const assessmentInput = {technical:"Several specialized systems",arrangement:"Partially overlapping phases"}
  await save("review",0,{...schedule,end:"2027-02-25",...assessmentInput},422)
  await save("review",0,{...schedule,end:"2027-05-10",...assessmentInput},422)
  await save("review",0,{...schedule,end:"2027-05-11",amount:1,...assessmentInput},422)
  await save("review",0,{...schedule,end:"2027-05-11",amount:4500000.001,...assessmentInput},422)
  const initialReview = (await save("review",0,{...schedule,end:"2027-05-11",...assessmentInput})).workflow.review
  assert.equal(initialReview.technical,assessmentInput.technical)
  assert.equal(initialReview.arrangement,assessmentInput.arrangement)
  assert.equal(initialReview.end,"2027-05-11")
  assert.equal(initialReview.estimate.end,initialReview.end)
  await save("assessment",1,assessmentInput,409)
  await save("budget",1,{amount:4500000.001},422)
  const correction = {...schedule,correction:{floor_area_sqm:999},floorMeasurements:{mode:"individual",areas:[110,90]}}
  await save("review",1,{...correction,floorMeasurements:{mode:"individual",areas:[110]},reason:"Incomplete breakdown"},422)
  await save("review",1,correction,422)
  const review = (await save("review",1,{...correction,reason:"Client confirmed the revised floor area."})).workflow
  assert.equal(review.assessment,undefined)
  assert.deepEqual(review.review_history.at(-1).changes.floor_area_sqm,{before:180,after:200})
  assert.deepEqual(review.review.floorMeasurements,{mode:"individual",areas:[110,90]})
  await save("assessment",1,assessmentInput,409)
  await save("budget",2,{amount:0},422)
  await save("budget",2,{amount:1},422)
  await save("budget",2,{amount:4799999.99},422)
  const updatedBudget = 4800000
  assert.equal((await save("budget",2,{amount:updatedBudget})).workflow.budget,updatedBudget)
  await save("review",2,{...correction,reason:"Attempt another correction after review and budget."},409)
  await save("budget",2,{amount:4500000},409)
  const assessed = (await save("assessment",2,assessmentInput)).workflow
  assert.equal(assessed.assessment.durationDays,215)
  assert.equal(assessed.assessment.size,"Medium")
  assert.equal(assessed.assessment.score,8)
  assert.equal(assessed.assessment.planningDays,131)
  assert.equal(assessed.assessment.suggestedEnd,"2027-05-23")
  assert.equal(assessed.budget_history[0].amount,updatedBudget)
  await save("review",2,{...schedule,reason:"Attempt an edit after assessment."},409)
  await save("budget",2,{amount:4500000},409)
  assert.equal((await save("assessment",2,assessmentInput)).workflow.assessment.id,assessed.assessment.id)
  const adminRecord = (await call(root,{token:admin})).find(item=>item.id===row.id)
  assert.equal(adminRecord.workflow,undefined)
  assert.equal(adminRecord.details.opm_workflow,undefined)
  const planInput = {...intake,estimated_budget:updatedBudget,assessment_id:assessed.assessment.id}
  await call(planning,{token,status:409,json:{...planInput,target_end_date:"2027-04-13"}})
  const preview = await call(planning,{token,json:planInput})
  assert.deepEqual(preview.estimate,{size:"Medium",end:"2027-05-23"})
  const phases = preview.phases
  assert.deepEqual(phases, ["Mobilization", "Design", "Foundation", "Structure", "Envelope", "MEP Rough-In", "Finishes", "Landscape & Site Works", "Closeout"])

  async function upload(name) {
    const id = crypto.randomUUID()
    const form = new FormData()
    form.set("id",id)
    form.set("file",new Blob(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"],{type:"application/pdf"}),name)
    return (await call("/files",{token,form})).id
  }
  const documents = {contract_file_id:await upload("signed.pdf")}
  await call(planning,{token,status:422,json:{...planInput,...documents,phases:phases.slice(0,2)}})
  if (multiEngineer) {
    const savedContract = (await save("contract", 2, documents)).workflow
    assert.deepEqual(savedContract.signed_contract,{id:documents.contract_file_id,name:"signed.pdf"})
    assert.equal(savedContract.assessment.id,assessed.assessment.id)
    await save("contract", 2, documents, 409)
    assert.deepEqual((await save("contract",2,{...documents,request_id:documents.contract_file_id})).workflow.signed_contract,savedContract.signed_contract)
    await call(planning,{token,status:409,json:{...planInput,contract_file_id:await upload("stale.pdf"),phases}})
  }
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
  if (multiEngineer) {
    for (const phase of recommended.team) {
      assert.ok(phase.engineers.length <= recommended.recommended_site_pms)
      const tags = phase.engineers.flatMap(person => person.assigned_disciplines)
      assert.equal(tags.length, new Set(tags).size, "recommended engineers cover distinct scopes")
      phase.engineers = phase.engineers.slice(0,1) // Office PM reduces the proposed lineup.
    }
  }
  const secondPhase = recommended.team[1]
  const tags = secondPhase.engineers?.[0].assigned_disciplines ?? secondPhase.assigned_disciplines
  const firstPhaseIds = recommended.team[0].engineers?.map(e=>e.user_id) ?? [recommended.team[0].user_id]
  const alternate = recommended.candidates[phases[1]].find(person =>
    !firstPhaseIds.includes(person.id) && !secondPhase.engineers?.slice(1).some(e=>e.user_id===person.id)
    && tags.every(tag=>person.qualifiedTags.includes(tag)))
  assert.ok(alternate,"A second qualified Site PM is required for the authorization scenario")
  if (multiEngineer) {
    const support = recommended.candidates[phases[1]].find(person=>person.id!==alternate.id && person.qualifiedTags.length)
    assert.ok(support)
    secondPhase.engineers.push({user_id:support.id,assigned_disciplines:support.qualifiedTags.slice(0,1)})
  }
  secondPhase.user_id = alternate.id
  if (secondPhase.engineers) secondPhase.engineers[0].user_id = alternate.id
  await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,'{"experienceByType":{"Residential":{"months":240}}}')
    ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`,[alternate.id])
  const payload = {...planInput,...documents,inquiry_id:row.id,suggested_opm_id:manager.id,phases,phase_team:recommended.team}
  const phaseDates = {[phases[1]]: {start:"2027-01-20",end:"2027-02-20"}}
  const datedPlan = {...planInput,...documents,phases,phase_dates:phaseDates}
  await call(planning,{token,status:422,json:{...datedPlan,confirm_schedule:true}})
  await call(planning,{token,status:422,json:{...datedPlan,phase_dates:{[phases[1]]:{start:"2027-01-01",end:"2027-02-20"}}}})
  await db.query("UPDATE user_licenses SET license_expiry='2027-02-19' WHERE user_id=$1 AND superseded_at IS NULL",[alternate.id])
  const dated = await call(planning,{token,json:datedPlan})
  assert.deepEqual(dated.staffing.phase_dates,phaseDates)
  assert.ok(dated.licenseUnavailable[phases[1]].some(person=>person.id===alternate.id))
  assert.ok(!dated.candidates[phases[1]].some(person=>person.id===alternate.id))
  await call("/projects/intake",{token,status:422,json:{...payload,phase_dates:phaseDates}})
  await db.query("UPDATE user_licenses SET license_expiry='2027-03-15' WHERE user_id=$1 AND superseded_at IS NULL",[alternate.id])
  const atRisk = await call(planning,{token,json:datedPlan})
  assert.equal(atRisk.candidates[phases[1]].find(person=>person.id===alternate.id).licenseByScope[tags[0]].cutoff,"2027-02-13")
  await call("/projects/intake",{token,status:409,json:{...payload,phase_dates:{}}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_dates:phaseDates,planning_backups:{[phases[1]]:alternate.id}}})
  payload.phase_dates=phaseDates
  const backup = atRisk.candidates[phases[1]].find(person=>person.id!==alternate.id &&
    !firstPhaseIds.includes(person.id) && !secondPhase.engineers?.some(engineer=>engineer.user_id===person.id) &&
    tags.every(tag=>person.licenseByScope[tag]?.cutoff > phaseDates[phases[1]].end))
  if (backup) payload.planning_backups={[phases[1]]:backup.id}
  if (multiEngineer) {
    const crowded=structuredClone(payload)
    crowded.phase_team[1].engineers.push(...crowded.phase_team[1].engineers)
    await call("/projects/intake",{token,status:422,json:crowded})
  }
  await call("/projects/intake",{token,status:409,json:{...payload,assessment_id:undefined}})
  await call("/projects/intake",{token,status:409,json:{...payload,estimated_budget:updatedBudget-1}})
  await call("/projects/intake",{token,status:422,json:{...payload,contract_file_id:undefined}})
  await call("/projects/intake",{token,status:422,json:{...payload,phases:[phases[0]],phase_team:[recommended.team[0]]}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{...recommended.team[0],stage:preview.phases[1]}]}})
  await call("/projects/intake",{token,status:422,json:{...payload,phase_team:[{stage:phases[0],user_id:manager.id}]}})
  // An invalid second document fails after the project and signed contract were written inside the transaction.
  await call("/projects/intake",{token,status:422,json:{...payload,plans_file_id:crypto.randomUUID()}})
  assert.equal((await db.query("SELECT count(*)::int n FROM projects WHERE name=$1",[details.name])).rows[0].n,0)
  assert.equal((await db.query("SELECT project_id FROM stored_files WHERE id=$1",[documents.contract_file_id])).rows[0].project_id,null)
  const response = await call("/projects/intake",{token,json:payload})
  const repeated = await call("/projects/intake",{token,json:payload})
  await call("/projects/intake",{token,status:409,json:{...payload,assessment_id:crypto.randomUUID()}})
  assert.equal(response.project.id,repeated.project.id)
  assert.equal(response.project.lifecycle_status,"spm_review")
  assert.equal(response.client_account_status,"pending_activation")
  assert.equal((await call(root,{token})).find(inquiry=>inquiry.id===row.id).project_status,"spm_review")
  const [stored] = (await db.query("SELECT inquiry_intake,phase_scope,lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows
  assert.equal(stored.inquiry_intake.floor_area_sqm,200)
  assert.deepEqual(stored.inquiry_intake.assessment,assessed.assessment)
  assert.equal(stored.inquiry_intake.target_end_date,intake.target_end_date)
  assert.equal(stored.inquiry_intake.estimated_budget,updatedBudget)
  assert.deepEqual(stored.phase_scope.phases,phases)
  assert.deepEqual(stored.phase_scope.phase_dates,phaseDates)
  if (backup) assert.deepEqual(stored.phase_scope.planning_backups,payload.planning_backups)
  await db.query("UPDATE user_licenses SET license_expiry=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date+30 WHERE user_id=$1 AND superseded_at IS NULL",[alternate.id])
  const stageId = (await db.query("SELECT id FROM project_stages WHERE code=$1",[phases[1]])).rows[0].id
  const overrideProject = await call(`/licenses/override-options?project_id=${response.project.id}&stage_id=${stageId}`,{token:admin})
  assert.equal(overrideProject.available,true)
  assert.equal(overrideProject.requiresAvailabilityConfirmation,true)
  assert.equal(overrideProject.project.coverageEnd,phaseDates[phases[1]].end)
  if (backup) {
    assert.equal(overrideProject.candidates[0]?.id,backup.id)
    assert.equal(overrideProject.candidates[0].planningBackup,true)
    const { today } = (await db.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)::text as today")).rows[0]
    await call("/licenses/overrides",{token:admin,status:422,json:{
      project_id:response.project.id,stage_id:stageId,from_user_id:alternate.id,to_user_id:backup.id,
      reason:"Coverage required at work access cutoff",appointment_signed:true,signed_on:today,
    }})
    const offered = await db.query("SELECT 1 FROM project_phase_team WHERE project_id=$1 AND spm_user_id=$2 AND project_stage_id=$3",[response.project.id,backup.id,stageId])
    assert.equal(offered.rowCount,0)
  }
  await db.query("UPDATE user_licenses SET license_expiry='2027-03-15' WHERE user_id=$1 AND superseded_at IS NULL",[alternate.id])
  assert.equal((await call(`/licenses/override-options?project_id=${response.project.id}&stage_id=${stageId}`,{token:admin})).available,false)
  const projectId = response.project.id
  const contract = response.signed_contract
  assert.equal(contract.code,"owner_contract")
  assert.equal(contract.file_id,documents.contract_file_id)
  assert.equal(contract.original_name,"signed.pdf")
  assert.deepEqual(repeated.signed_contract,contract)
  const registered=(await call(`/projects/${projectId}/documents`,{token})).filter(doc=>doc.code==="owner_contract")
  assert.equal(registered.length,1)
  for (const key of ["file_id","original_name","content_type","byte_size","download_url","uploaded_at","id"]) assert.deepEqual(registered[0][key],contract[key])
  const downloaded=await fetch(new URL(contract.download_url,base),{headers:{Authorization:"Bearer "+token}})
  assert.equal(downloaded.status,200)
  assert.match(await downloaded.text(),/^%PDF-/)
  assert.equal((await call(`/projects/${projectId}/workspace-command`,{token,json:{type:"upload_registered",docIndex:2,doc:{id:contract.file_id}}})).project_id,projectId)
  await call(`/projects/${projectId}/workspace-command`,{token,status:409,json:{type:"upload_registered",docIndex:2,doc:{id:await upload("replacement.pdf")}}})
  await db.query("DELETE FROM project_documents WHERE id=$1",[contract.id])
  const backfill=read("../Thesis-Backend/migrations/034-recover-inquiry-contracts.sql")
  await db.exec(backfill)
  await db.exec(backfill)
  const restored=(await call(`/projects/${projectId}/documents`,{token})).filter(doc=>doc.code==="owner_contract")
  assert.equal(restored.length,1)
  assert.equal(restored[0].file_id,contract.file_id)
  await db.query("UPDATE project_documents SET file_ref=$2 WHERE id=$1",[restored[0].id,"db:"+contract.file_id])
  assert.equal((await call(`/projects/${projectId}/documents`,{token})).find(doc=>doc.code==="owner_contract").download_url,contract.download_url)
  const { clients } = await call(`/projects/${projectId}/client-account`, { token })
  assert.equal(clients.length, 1)
  assert.equal(clients[0].email, details.email)
  assert.equal(clients[0].activation_status, "pending_activation")
  await call("/projects/recommendations/update-phase-team",{token,method:"PUT",json:{project_id:projectId,phase_team:recommended.team}})
  const assignments = (await db.query(`SELECT t.project_stage_id,t.is_lead,u.id,u.email FROM project_phase_team t
    JOIN users u ON u.id=t.spm_user_id WHERE t.project_id=$1 ORDER BY t.is_lead DESC`,[projectId])).rows
  assert.equal(assignments.filter(a=>a.is_lead).length,1)
  const lead = assignments.find(assignment => assignment.is_lead)
  const other = assignments.find(assignment => assignment.project_stage_id === stageId)
  assert.ok(firstPhaseIds.includes(lead.id))
  assert.equal(other.id,alternate.id)
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
  const uploadRegistered = async (docIndex,name) => call(command,{token,json:{type:"upload_registered",docIndex,doc:{id:await upload(name)}}})
  await respond(other,otherToken,"accept",409)
  await respond(other,otherToken,"decline",409)
  await respond(lead,leadToken,"accept")
  await respond(other,otherToken,"accept")
  if (multiEngineer) {
    const pending = (await db.query(`SELECT r.id,u.email FROM project_phase_responsibilities r JOIN users u ON u.id=r.user_id
      WHERE r.project_id=$1 AND r.status='pending'`,[projectId])).rows
    for (const r of pending) await call(`/projects/${projectId}/engineer-responsibilities/${r.id}`,{token:await login(r.email,"staff"),json:{action:"accept"}})
  } else {
    for (const assignment of assignments.filter(item => item !== lead && item !== other))
      await respond(assignment,await login(assignment.email,"staff"),"accept")
  }
  await allocate(leadToken,409)
  for (const index of [0,1,3,4,5]) await uploadRegistered(index,`registered-${index}.pdf`)
  await allocate(otherToken,403)
  await call(command,{token:otherToken,status:403,json:{type:"upload_agreement"}})
  await allocate(leadToken)
  assert.equal((await db.query("SELECT lifecycle_status FROM projects WHERE id=$1",[response.project.id])).rows[0].lifecycle_status,"spm_review")
  const phaseSchedulePath = `/projects/${projectId}/phase-schedule`
  const revision = { phase: phases[1], release: "2027-01-27", reason: "Zone release delayed." }
  await call(phaseSchedulePath,{token,status:404,json:{...revision,action:"preview"}})
  await db.query("UPDATE projects SET lifecycle_status='active' WHERE id=$1",[projectId])
  const impact = await call(phaseSchedulePath,{token,json:{...revision,action:"preview"}})
  assert.equal(impact.dates[phases[1]].start,revision.release)
  const submitted = await call(phaseSchedulePath,{token,json:{...revision,action:"submit"}})
  assert.deepEqual(submitted.phase_dates,phaseDates)
  const approved = await call(phaseSchedulePath,{token,json:{action:"approve",revisionId:submitted.pending_phase_revision.id}})
  assert.deepEqual(approved.phase_schedule_baseline,phaseDates)
  assert.deepEqual(approved.phase_dates,impact.dates)
  assert.equal(approved.phase_schedule_history[0].reason,revision.reason)
  const wrongType = await create()
  const oldWorkflow = (await db.query("SELECT details->'opm_workflow' AS workflow FROM project_inquiries WHERE id=$1",[row.id])).rows[0].workflow
  await db.query("UPDATE project_inquiries SET status='approved',opm_id=$2,details=jsonb_set(details,'{opm_workflow}',$3::jsonb) WHERE id=$1",
    [wrongType.id,manager.id,JSON.stringify(oldWorkflow)])
  const typeCorrection = `${root}/${wrongType.id}/client-correction`
  const typeRequest = {action:"request",field:"project_type",value:"Commercial",reason:"Client confirmed the building use."}
  await call(typeCorrection,{token,json:typeRequest,status:409})
  const replacement = await upload("replacement-contract.pdf")
  await call(`${root}/${wrongType.id}/workflow`,{token,status:409,json:{action:"contract",version:oldWorkflow.review.version,
    contract_file_id:replacement,expected_contract_file_id:oldWorkflow.signed_contract.id}})
  const lockedPlan = {...planInput,floor_area_sqm:details.floor_area_sqm,contract_file_id:replacement,phases}
  await call(`${root}/${wrongType.id}/planning`,{token,status:409,json:lockedPlan})
  const {signed_contract,contract_locked,staffing,...beforeContract} = oldWorkflow
  await db.query("UPDATE project_inquiries SET details=jsonb_set(details,'{opm_workflow}',$2::jsonb) WHERE id=$1",
    [wrongType.id,JSON.stringify(beforeContract)])
  await call(typeCorrection,{token,json:{...typeRequest,value:"Invalid"},status:422})
  const typeSubmitted = await call(typeCorrection,{token,json:typeRequest})
  const typeId = typeSubmitted.corrections[0].id
  await call(typeCorrection,{token,json:{action:"approve",id:typeId},status:403})
  await call(typeCorrection,{token:admin,json:{action:"approve",id:typeId}})
  const correctedType = (await call(root,{token})).find(inquiry=>inquiry.id===wrongType.id)
  assert.equal(correctedType.details.project_type,"Commercial")
  assert.equal(correctedType.details.client_corrections[0].before,"Residential")
  assert.equal(correctedType.workflow.review.version,oldWorkflow.review.version+1)
  assert.equal(correctedType.workflow.review.requires_review,true)
  for (const field of ["assessment","budget","staffing","signed_contract"]) assert.equal(correctedType.workflow[field],undefined)
  const mixedRequest = await call(typeCorrection,{token,json:{...typeRequest,value:"Mixed-Use"}})
  await call(typeCorrection,{token:admin,json:{action:"approve",id:mixedRequest.corrections.at(-1).id}})
  const mixedReview = { start: schedule.start, end: "2028-02-01", amount: 10000000, ...assessmentInput }
  const mixedWorkflow = `${root}/${wrongType.id}/workflow`
  const mixedPlanning = `${root}/${wrongType.id}/planning`
  const version = correctedType.workflow.review.version + 1
  await call(mixedWorkflow,{token,status:422,json:{action:"review",version,...mixedReview}})
  const scope = {version:1,uses:["hotel","residential","office"],features:{podium:true,tower:false,curtainWall:true,landscaping:false}}
  const reviewed = await call(mixedWorkflow,{token,json:{action:"review",version,...mixedReview,mixed_use_scope:scope,reason:"Confirmed Mixed-Use scope."}})
  const mixedAssessment = (await call(mixedWorkflow,{token,json:{action:"assessment",version:reviewed.workflow.review.version,...assessmentInput}})).workflow.assessment
  assert.equal(mixedAssessment.score,12)
  assert.equal(mixedAssessment.complexity,"High")
  const mixedInput = {...details, project_type:"Mixed-Use",target_start_date:mixedReview.start,target_end_date:mixedReview.end,
    estimated_budget:mixedReview.amount,assessment_id:mixedAssessment.id}
  const mixedPreview = await call(mixedPlanning,{token,json:mixedInput})
  assert.deepEqual(mixedPreview.phases,["Mobilization","Design","Foundation","Podium Structure","Structure","Envelope / Curtain Wall",
    "MEP Rough-In","Fire & Life Safety","Office Fit-Out","Hotel Fit-Out","Residential Fit-Out","Site Works","Closeout"])
  assert.equal(mixedPreview.phaseReview.find(phase=>phase.name==="Tower Structure").included,false)
  const mixedContract = await upload("mixed-signed.pdf")
  await call(mixedPlanning,{token,status:422,json:{...mixedInput,contract_file_id:mixedContract,phases:mixedPreview.phases.slice(1)}})
  const mixedStaffing = await call(mixedPlanning,{token,json:{...mixedInput,contract_file_id:mixedContract,phases:mixedPreview.phases}})
  assert.notEqual(mixedStaffing.candidateBlockers["Office Fit-Out"],"phase_disciplines")
})
