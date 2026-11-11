// End-to-end regression coverage for the capstone test-case fixes against the real API and an
// isolated database: SHR-NOT-007, ADM-ARCH-003, SHR-NOT-008, ADM-INT-011 / WF-INT-002 and SPM-DASH-004.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { installCredentialFixture } from "./helpers/credential-fixture.mjs"
import { api, getToken, login, setApiBase, setToken } from "../src/api/client.ts"
import { loadState } from "../src/api/load.ts"
import { saveApiProject, sendApiWorkflow, uploadFile } from "../src/api/actions.ts"

const here = p => fileURLToPath(new URL(p, import.meta.url))
const read = p => fs.readFileSync(here(p), "utf8")
const port = () => new Promise(resolve => { const server = net.createServer().listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)) }) })
const ADMIN = "patricia.domingo@10builders.com", RENZ = "renz.villaverde@10builders.com", LEA = "lea.fernandez@10builders.com", KARLO = "karlo.espiritu@10builders.com"

test("capstone fixes: authentication, deletion eligibility, temporary passwords, OPM resubmission and acceptance order", { timeout: 180000 }, async t => {
  const db = new PGlite({ extensions: { citext } })
  let socket, child
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const exit = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exit }
    if (socket) await socket.stop()
    await db.close()
  })
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  for (const file of ["001-phase-checklists.sql", "002-phase-update-confirmation.sql", "003-react-integration.sql", "004-verified-activity-progress.sql",
    "009-engineer-license-workflow.sql", "008-monthly-report-history.sql", "010-photo-release.sql", "013-trade-subcontractor-allocation.sql"])
    await db.exec(read("../Thesis-Backend/migrations/" + file))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  await db.exec("update user_licenses set license_expiry=current_date+400 where superseded_at is null")
  await installCredentialFixture(db)
  const dbPort = await port(), apiPort = await port()
  socket = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" }); await socket.start()
  child = spawn(process.execPath, ["src/index.js"], { cwd: here("../Thesis-Backend/"), windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env,
    NODE_ENV: "development", DB_SERVER: "127.0.0.1", DB_PORT: String(dbPort), DB_NAME: "postgres", DB_USER: "postgres", DB_PASSWORD: "x", DB_POOL_MAX: "1", PGSSLMODE: "disable",
    JWT_SECRET: "capstone-fixes-test-only-secret-0123456789", PORT: String(apiPort), HOST: "127.0.0.1", ARCHIVE_MAINTENANCE_ENABLED: "false" } })
  child.stderr.on("data", chunk => process.stderr.write(chunk))
  const base = `http://127.0.0.1:${apiPort}/api/v1`
  setApiBase(base)
  const deadline = Date.now() + 30000
  for (;;) {
    try { if ((await fetch(base + "/health")).ok) break } catch {}
    if (child.exitCode !== null) throw new Error("Test backend exited before readiness.")
    if (Date.now() > deadline) throw new Error("API did not start")
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const raw = async (path, { token, method = "GET", json } = {}) => {
    const headers = { ...(token ? { Authorization: "Bearer " + token } : {}), ...(json !== undefined ? { "Content-Type": "application/json" } : {}) }
    const response = await fetch(base + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined })
    let body; try { body = await response.json() } catch { body = undefined }
    return { status: response.status, body }
  }
  const portalFor = async email => { const role = (await db.query("select r.code from users u join roles r on r.id=u.role_id where lower(u.email::text)=lower($1)", [email])).rows[0].code; return role === "admin" ? "admin" : role === "client" ? "client" : "staff" }
  const as = async email => {
    setToken("")
    const user = await login(email, "Password@123", true, await portalFor(email))
    const state = await loadState(user)
    return { user, token: getToken(), state, actor: state.accounts.find(a => a.id === user.id) }
  }

  await t.test("SHR-NOT-007: personnel recommendations need a signed-in intake role", async () => {
    const paths = ["/projects/recommendations?project_type=Residential&floor_area_sqm=500&floor_count=2",
      "/projects/recommendations/rerun?project_type=Residential&floor_area_sqm=500&floor_count=2", "/projects/recommendations/swap-opm?project_type=Residential"]
    for (const path of paths) {
      const anonymous = await raw(path)
      assert.equal(anonymous.status, 401, path)
      assert.equal(anonymous.body?.data, undefined)
      assert.doesNotMatch(JSON.stringify(anonymous.body), /full_name|phase_team/)
    }
    const spm = await as(KARLO)
    const forbidden = await raw(paths[0], { token: spm.token })
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.body?.data, undefined)
    const admin = await as(ADMIN)
    const allowed = await raw(paths[0], { token: admin.token })
    assert.equal(allowed.status, 200)
    assert.ok(Array.isArray(allowed.body.data.phase_team) && "opm" in allowed.body.data, "the Administrator still receives the recommendation")
  })

  await t.test("ADM-ARCH-003: an active project survives an ordinary deletion request unchanged", async () => {
    const admin = await as(ADMIN)
    const active = (await db.query("select id from projects where lifecycle_status='active' and not coalesce(is_deleted,false) order by name limit 1")).rows[0]
    assert.ok(active, "seed has an active project")
    const snapshot = async () => ({
      project: (await db.query("select lifecycle_status,coalesce(is_deleted,false) as is_deleted,deleted_at,crew_assigned from projects where id=$1", [active.id])).rows[0],
      engineers: (await db.query("select count(*)::int as n from project_engineers where project_id=$1 and unassigned_at is null", [active.id])).rows[0].n,
      assignments: (await db.query("select count(*)::int as n from project_subcontractor_assignments where project_id=$1 and status='active'", [active.id])).rows[0].n,
      workers: (await db.query("select count(*)::int as n from subcontractor_workers where current_project_id=$1", [active.id])).rows[0].n,
    })
    const before = await snapshot()
    const refused = await raw("/projects/" + active.id, { method: "DELETE", token: admin.token })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.error.code, "PROJECT_ACTIVE")
    assert.deepEqual(await snapshot(), before, "records and assignments are untouched")
    const archived = (await db.query("select id from projects where lifecycle_status='archived' and not coalesce(is_deleted,false) limit 1")).rows[0]
    if (archived) assert.equal((await raw("/projects/" + archived.id, { method: "DELETE", token: admin.token })).body?.error?.code, "PROJECT_ARCHIVED")
    const opm = await as(RENZ)
    assert.equal((await raw("/projects/" + active.id, { method: "DELETE", token: opm.token })).status, 403, "only Administrators reach the eligibility check")
    assert.deepEqual(await snapshot(), before)
  })

  await t.test("SHR-NOT-008: a temporary password blocks protected operations until it is replaced", async () => {
    const target = (await db.query("select id,password_hash from users where email=$1", [KARLO])).rows[0]
    await db.query("update users set temp_password_issued=true where id=$1", [target.id])
    try {
      setToken("")
      const user = await login(KARLO, "Password@123", true, "staff")
      assert.equal(user.temp_password_issued, true, "login reports the flag")
      const token = getToken()
      const me = await raw("/auth/me", { token })
      assert.equal(me.status, 200)
      assert.equal(me.body.data.temp_password_issued, true)
      for (const [path, init] of [["/workspace", {}], ["/projects", {}], ["/notifications", {}], ["/workspace/preferences", { method: "POST", json: {} }], ["/auth/admin/recovery-codes", {}]]) {
        const blocked = await raw(path, { token, ...init })
        assert.equal(blocked.status, 403, path)
        assert.equal(blocked.body.error.code, "PASSWORD_CHANGE_REQUIRED", path)
        assert.equal(blocked.body.data, undefined)
      }
      assert.equal((await raw("/auth/session", { token })).status, 200, "the session check stays available")
      assert.equal((await raw("/auth/reset-password", { token, method: "POST", json: { password: "short" } })).status, 400, "a rejected reset keeps the restriction")
      assert.equal((await raw("/workspace", { token })).body.error.code, "PASSWORD_CHANGE_REQUIRED")
      assert.equal((await raw("/auth/reset-password", { token, method: "POST", json: { password: "Replacement@123" } })).status, 200)
      assert.equal((await raw("/auth/me", { token })).body.data.temp_password_issued, false, "the flag clears only after a successful change")
      assert.equal((await raw("/workspace", { token })).status, 200)
      assert.equal((await raw("/auth", { token, method: "DELETE" })).status, 200)
    } finally {
      await db.query("update users set password_hash=$2,temp_password_issued=false where id=$1", [target.id, target.password_hash])
    }
  })

  let projectId, lea, renz, accounts
  await t.test("ADM-INT-011 / WF-INT-002: a resubmitted intake supersedes the former OPM confirmation and the replacement can accept", async () => {
    let s = await as(ADMIN)
    accounts = s.state.accounts
    renz = accounts.find(a => a.email === RENZ); lea = accounts.find(a => a.email === LEA)
    const template = s.state.projects.find(p => p.name.startsWith("Alden Heights"))
    assert.ok(template && renz && lea)
    // Office PMs hold at most two project types: qualify the replacement for this intake's type in place of Commercial.
    await db.query("delete from user_project_type_specializations where user_id=$1 and project_type_id=(select id from project_types where code='Commercial')", [lea.id])
    await db.query(`insert into user_project_type_specializations(user_id,project_type_id) select $1,id from project_types where code=$2
      and not exists(select 1 from user_project_type_specializations s where s.user_id=$1 and s.project_type_id=project_types.id)`, [lea.id, template.type])
    const client = accounts.find(a => a.role === "client" && ["active", "invited"].includes(a.status))
    const project = { ...template, id: randomUUID(), name: "Resubmission walkthrough", clientId: client.id, opmId: renz.id, area: "100", floors: "1", start: "2027-01-15", end: "2027-10-15",
      docs: [], clientSubcon: "", clientSubconEmail: "", clientSubconCompany: undefined, team: template.team.map(row => ({ ...row, status: "pending" })) }
    const qualified = async (phase, exclude) => (await db.query(`select q.user_id from engineer_qualified_scopes q join users u on u.id=q.user_id join roles r on r.id=u.role_id
      join project_stage_discipline_links l on l.discipline_id=q.discipline_id join project_stages ps on ps.id=l.project_stage_id join project_types pt on pt.id=l.project_type_id
      where ps.code=$1 and pt.code=$2 and u.status='active' and r.code='spm' and q.user_id<>all($3::uuid[])
      and not exists(select 1 from license_renewal_requests renewal where renewal.user_id=u.id and renewal.status='under_review') order by q.user_id limit 1`, [phase, project.type, exclude])).rows[0]?.user_id
    for (const [index, row] of project.team.entries()) {
      const pick = (index === 1 ? await qualified(row.phase, [project.team[0].accountId]) : undefined) ?? await qualified(row.phase, [])
      assert.ok(pick, "Qualified SPM for " + row.phase)
      row.accountId = pick
    }
    assert.ok(project.team.some(row => row.accountId !== project.team[0].accountId), "the team has a Site PM besides the lead")
    projectId = await saveApiProject(project, false)
    const confirmations = async () => (await db.query("select id,target_user_id,status,reassigned_from_id from assignment_confirmations where project_id=$1 and role_context='opm' order by id", [projectId])).rows
    const lifecycle = async () => (await db.query("select lifecycle_status,suggested_opm_id from projects where id=$1", [projectId])).rows[0]
    const oversight = async userId => (await db.query("select unassigned_at from project_engineers where project_id=$1 and user_id=$2 and project_role_label='Office PM (oversight)' order by assigned_at desc limit 1", [projectId, userId])).rows[0]
    const accept = async (session, confirmationId) => raw("/confirmations/" + confirmationId + "/accept", { method: "POST", token: session.token, json: {} })
    let rows = await confirmations()
    assert.equal(rows.length, 1); assert.equal(rows[0].target_user_id, renz.id); assert.equal(rows[0].status, "pending")

    // The first Office PM requests changes.
    s = await as(RENZ)
    await sendApiWorkflow(s.state, s.actor, { type: "request_changes", projectId, note: "Floor count is wrong." })
    rows = await confirmations(); assert.equal(rows[0].status, "declined")

    // Correction with a replacement Office PM: the declined decision stays, a fresh pending confirmation targets the replacement.
    s = await as(ADMIN)
    await saveApiProject({ ...project, opmId: lea.id, floors: "2" }, true)
    rows = await confirmations()
    assert.equal(rows.length, 2)
    assert.equal(rows[0].status, "declined", "historical decisions are preserved")
    assert.deepEqual([rows[1].target_user_id, rows[1].status], [lea.id, "pending"])
    assert.deepEqual(await lifecycle(), { lifecycle_status: "sent_to_opm", suggested_opm_id: lea.id })
    assert.equal((await db.query("select floor_count from projects where id=$1", [projectId])).rows[0].floor_count, 2, "the correction itself is applied")
    s = await as(RENZ)
    assert.equal((await accept(s, rows[0].id)).status, 409, "the former OPM cannot accept")
    assert.ok(!(await raw("/confirmations", { token: s.token })).body.data.some(c => c.project_id === projectId), "the former OPM has no pending confirmation")
    const lead = accounts.find(a => a.id === project.team[0].accountId)
    s = await as(lead.email)
    const detail = await api("/projects/" + projectId)
    const leadRow = detail.phase_team.find(row => row.spm_user_id === lead.id)
    assert.equal((await raw(`/confirmations/projects/${projectId}/phase-team/${leadRow.stage_id}/accept`, { method: "POST", token: s.token, json: {} })).status, 422, "Site PMs wait for OPM acceptance")

    // Swapping the Office PM while the confirmation is still pending supersedes it in the same transaction.
    s = await as(ADMIN)
    await saveApiProject({ ...project, opmId: renz.id, floors: "2" }, true)
    rows = await confirmations()
    assert.equal(rows.length, 3)
    assert.equal(rows[1].status, "reassigned", "the pending confirmation is invalidated")
    assert.deepEqual([rows[2].target_user_id, rows[2].status, String(rows[2].reassigned_from_id)], [renz.id, "pending", String(rows[1].id)])
    s = await as(LEA)
    assert.equal((await accept(s, rows[1].id)).status, 409, "a superseded pending confirmation cannot be accepted")
    s = await as(RENZ)
    await sendApiWorkflow(s.state, s.actor, { type: "accept_opm", projectId })
    assert.equal((await lifecycle()).lifecycle_status, "spm_review")
    assert.equal((await oversight(renz.id))?.unassigned_at, null)

    // A correction after acceptance restarts the OPM review: acceptance state depending on the old confirmation is reset.
    s = await as(ADMIN)
    await saveApiProject({ ...project, opmId: lea.id, floors: "2", name: "Resubmission walkthrough (corrected)" }, true)
    rows = await confirmations()
    assert.equal(rows.length, 4)
    assert.equal(rows[2].status, "reassigned", "the accepted confirmation is invalidated")
    assert.deepEqual([rows[3].target_user_id, rows[3].status, String(rows[3].reassigned_from_id)], [lea.id, "pending", String(rows[2].id)])
    assert.deepEqual(await lifecycle(), { lifecycle_status: "sent_to_opm", suggested_opm_id: lea.id })
    assert.ok((await oversight(renz.id)).unassigned_at, "the former OPM's oversight assignment ends")
    assert.equal((await db.query("select status from project_phase_team where project_id=$1 and status<>'pending'", [projectId])).rowCount, 0, "team confirmations restart")
    const events = (await db.query("select new_values->>'_archive_event' as event,count(*)::int as n from audit_log where record_id in (select id::text from assignment_confirmations where project_id=$1) or record_id=$1::text group by 1", [projectId])).rows
    assert.equal(events.find(e => e.event === "opm_confirmation_superseded")?.n, 2, "each superseded confirmation is audited")
    assert.equal(events.find(e => e.event === "intake_resubmitted")?.n, 3)
    s = await as(RENZ)
    assert.equal((await accept(s, rows[2].id)).status, 409, "the previous OPM cannot accept after the reset")
    // Workspace updates carry the resubmitted project but cannot restore the old confirmation.
    s = await as(ADMIN)
    await api("/projects/" + projectId + "/workspace", { method: "PUT", json: { ...project, opmId: renz.id, opmAccepted: true, status: "pending" } })
    assert.deepEqual(await lifecycle(), { lifecycle_status: "sent_to_opm", suggested_opm_id: lea.id })
    assert.equal((await confirmations())[2].status, "reassigned")
    s = await as(LEA)
    await sendApiWorkflow(s.state, s.actor, { type: "accept_opm", projectId })
    assert.equal((await lifecycle()).lifecycle_status, "spm_review", "the replacement OPM accepts the resubmitted intake")
    assert.equal((await oversight(lea.id))?.unassigned_at, null)
    s = await as(ADMIN)
    assert.equal((await db.query("select count(*)::int as n from projects where id=$1", [projectId])).rows[0].n, 1, "one project record throughout")
  })

  await t.test("SPM-DASH-004: phase assignments are accepted only after the six documents and the Lead Site PM", async () => {
    let s = await as(ADMIN)
    const detail = await api("/projects/" + projectId)
    const leadRow = detail.phase_team.find(row => row.is_lead)
    const otherRow = detail.phase_team.find(row => row.spm_user_id !== leadRow.spm_user_id)
    assert.ok(leadRow && otherRow)
    const leadEmail = accounts.find(a => a.id === leadRow.spm_user_id).email, otherEmail = accounts.find(a => a.id === otherRow.spm_user_id).email
    const respond = (session, row) => raw(`/confirmations/projects/${projectId}/phase-team/${row.stage_id}/accept`, { method: "POST", token: session.token, json: {} })
    const status = async row => (await db.query("select status from project_phase_team where project_id=$1 and project_stage_id=$2", [projectId, row.stage_id])).rows[0].status
    s = await as(otherEmail)
    let refused = await respond(s, otherRow)
    assert.equal(refused.status, 409); assert.equal(refused.body.error.code, "REGISTERED_DOCUMENTS_REQUIRED")
    assert.match(refused.body.message, /0 of 6/)
    s = await as(leadEmail)
    assert.equal((await respond(s, leadRow)).body.error.code, "REGISTERED_DOCUMENTS_REQUIRED", "the lead also waits for the documents")
    s = await as(LEA)
    for (let index = 0; index < 6; index++) {
      const fileId = randomUUID()
      await uploadFile(fileId, new File(["%PDF-1.4\nRegistered record"], "record.pdf", { type: "application/pdf" }))
      s.state = await loadState(s.user)
      await sendApiWorkflow(s.state, s.actor, { type: "upload_registered", projectId, docIndex: index, doc: { id: fileId, name: "record.pdf", uploaded: true } })
    }
    s = await as(otherEmail)
    refused = await respond(s, otherRow)
    assert.equal(refused.status, 409); assert.equal(refused.body.error.code, "LEAD_ACCEPTANCE_REQUIRED")
    assert.equal(await status(otherRow), "pending", "a refused acceptance changes nothing")
    s = await as(leadEmail)
    assert.equal((await respond(s, leadRow)).status, 200)
    assert.equal(await status(leadRow), "confirmed")
    s = await as(otherEmail)
    assert.equal((await respond(s, otherRow)).status, 200)
    assert.equal(await status(otherRow), "confirmed")
    assert.equal((await respond(s, otherRow)).status, 409, "an assignment is answered once")
  })
})
