// End to end: the expired engineer license workflow through the real backend (Express) and an in-process Postgres
// loaded with the demo data. Every write stays in this throwaway test database.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { getToken, login, setApiBase, setToken } from "../src/api/client.ts"
import { loadState } from "../src/api/load.ts"
import { clientProjectViews } from "../src/client-access.ts"
import { sweepLicenses } from "../Thesis-Backend/src/services/licenses/sweep.js"
import { markPhaseCompleted } from "../Thesis-Backend/src/services/licenses/history.js"
import { addDays, localDay } from "../Thesis-Backend/src/common/utilities/license-status.utility.js"

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const backend = here("../Thesis-Backend/")
const available = fs.existsSync(backend + "src/index.js")
const read = (p) => fs.readFileSync(here(p), "utf8")

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

const EMAIL = {
  admin: "patricia.domingo@10builders.com",
  renz: "renz.villaverde@10builders.com",
  lea: "lea.fernandez@10builders.com",
  karlo: "karlo.espiritu@10builders.com",
  rafael: "rafael.mercado@10builders.com",
  mikaela: "mikaela.bautista@10builders.com",
  diego: "diego.salvador@10builders.com",
  bea: "bea.concepcion@10builders.com",
  client: "f.uy@aldenheights-hoa.com",
}
const PDF = () => new Blob(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"], { type: "application/pdf" })

test("expired engineer license workflow", { skip: !available && "Thesis-Backend folder not found", timeout: 600000 }, async (t) => {
  const db = new PGlite({ extensions: { citext } })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  await db.exec(read("../Thesis-Backend/migrations/003-react-integration.sql"))
  await db.exec(read("../Thesis-Backend/migrations/004-engineer-license-workflow.sql"))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  await db.exec(read("../Thesis-Backend/migrations/004-engineer-license-workflow.sql")) // backfills the seeded holders
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
      JWT_SECRET: "license-workflow-test-secret-0123456789",
      PORT: String(apiPort), HOST: "127.0.0.1", ARCHIVE_MAINTENANCE_ENABLED: "false",
    },
    stdio: "ignore",
  })
  t.after(async () => {
    server.kill()
    await pg.stop()
    await db.close()
    fs.rmSync(backend + "uploads", { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${apiPort}/api/v1`
  setApiBase(base)
  await until(async () => (await fetch(base + "/health")).ok)

  // ---- helpers ----
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const ids = {}
  for (const row of await q("select id, email from users")) ids[row.email] = row.id
  const idOf = (who) => ids[EMAIL[who]]
  const tokens = {}
  for (const who of Object.keys(EMAIL)) {
    const r = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL[who], password: "Password@123" }) })
    const b = await r.json()
    tokens[who] = b.data?.token || b.token
    assert.ok(tokens[who], "signed in " + who)
  }
  const call = async (who, method, path, body, form) => {
    const headers = { Authorization: "Bearer " + tokens[who] }
    const init = { method, headers }
    if (form) init.body = form
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      init.body = JSON.stringify(body)
    }
    const r = await fetch(base + path, init)
    let b
    try {
      b = await r.json()
    } catch {
      b = {}
    }
    return { status: r.status, body: b, data: b.data, message: b.message, code: b.error?.code, text: JSON.stringify(b) }
  }
  const paused = (r, label) => {
    assert.equal(r.status, 403, `${label}: ${r.text}`)
    assert.equal(r.code, "LICENSE_PAUSED", label)
    assert.equal(r.message, "Paused until your license renewal is verified", label)
  }
  const notPaused = (r, label) => assert.notEqual(r.code, "LICENSE_PAUSED", `${label}: ${r.text}`)
  const today = () => localDay()
  const setExpiry = (who, offset) => q("update user_licenses set license_expiry=$2 where user_id=$1 and superseded_at is null", [idOf(who), addDays(today(), offset)])
  const renewalForm = (expiryOffset = 400) => {
    const f = new FormData()
    f.append("license_number", "PRC-RENEWED-1")
    f.append("license_expiry", addDays(today(), expiryOffset))
    f.append("file", PDF(), "renewal.pdf")
    return f
  }
  const project = async (name) => (await q("select id, project_type_id from projects where name=$1", [name]))[0]
  const stage = async (code) => (await q("select id from project_stages where code=$1", [code]))[0].id
  const projectIds = async (who) => (await call(who, "GET", "/workspace/project-data")).data.map((p) => p.list.id).sort()
  const notices = (userId, title) => q(
    `select a.title, a.detail from activity_log a join notification_recipients n on n.activity_log_id=a.id
      where n.recipient_user_id=$1 and a.title like $2 order by a.id`, [userId, title])

  const brook = await project("Brookfield Warehouse Ext.")
  const rosaria = await project("Rosaria Business Park")
  const designStage = await stage("Design")
  const mobilization = await stage("Mobilization")
  const scopeBefore = {}
  const evidenceByKarlo = []
  for (const who of ["admin", "renz", "lea", "karlo", "rafael", "mikaela", "diego", "bea", "client"]) scopeBefore[who] = await projectIds(who)

  await t.test("the seeded engineers cover every license state", async () => {
    const overview = (await call("admin", "GET", "/licenses/overview")).data
    const by = (who) => overview.find((i) => i.id === idOf(who))
    assert.equal(by("renz").status, "valid")
    assert.equal(by("karlo").status, "valid")
    assert.equal(by("bea").status, "expiring_soon")
    assert.equal(by("rafael").status, "expired")
    assert.equal(by("rafael").graceDaysLeft, 18)
    assert.equal(by("rafael").graceEnded, false)
    assert.equal(by("mikaela").status, "renewal_under_review")
    assert.equal(by("mikaela").restricted, true)
    assert.equal(by("diego").graceEnded, true)
    assert.equal(by("lea").graceEnded, true)
    assert.equal(by("diego").needsCover, true)
    assert.equal(by("lea").needsCover, true)
    assert.equal(by("rafael").needsCover, false, "still inside the grace period")
    assert.equal(by("diego").assignments.some((a) => a.isLead && a.stage === "Mobilization"), true)
    // Status comes from the dates: nothing about it can be typed in.
    const mine = (await call("rafael", "GET", "/licenses/me")).data
    assert.deepEqual([mine.status, mine.restricted, mine.graceDaysLeft, mine.graceDays], ["expired", true, 18, 30])
  })

  await t.test("an expired Site PM can view and renew, but every signing and submitting command is rejected", async () => {
    const P = brook.id
    const attempts = [
      ["submit a phase update", "POST", `/progress/projects/${P}/phase-updates`, { note: "x" }],
      ["submit a progress update", "POST", `/progress/projects/${P}/progress-updates`, { note: "x" }],
      ["submit a checklist item", "POST", `/progress/projects/${P}/checklist-items/1/submit`, {}],
      ["upload checklist evidence", "POST", `/progress/projects/${P}/checklist-items/1/evidence`, undefined, () => { const f = new FormData(); f.append("file", PDF(), "e.pdf"); return f }],
      ["upload a phase file", "POST", `/progress/projects/${P}/phase-files`, undefined, () => { const f = new FormData(); f.append("file", PDF(), "e.pdf"); return f }],
      ["report an issue", "POST", `/progress/projects/${P}/issues`, { reason: "x" }],
      ["request rework", "POST", `/progress/projects/${P}/rework-requests`, { reason: "x" }],
      ["accept a phase assignment", "POST", `/confirmations/projects/${P}/phase-team/${designStage}/accept`, {}],
      ...["contact_company", "respond_company", "archive_company", "request_company", "archive_company_request", "acknowledge_client_subcon",
        "report_client_subcon_issue", "upload_agreement", "activate_project"].map((type) => [`Lead command ${type}`, "POST", `/projects/${P}/workspace-command`, { type }]),
    ]
    for (const [label, method, path, body, form] of attempts) paused(await call("rafael", method, path, body, form?.()), label)

    // What stays open: reading, history, notes, photos, declining, and uploading the renewal itself.
    assert.equal((await call("rafael", "GET", "/workspace")).status, 200)
    assert.equal((await call("rafael", "GET", "/workspace/project-data")).status, 200)
    assert.equal((await call("rafael", "GET", `/progress/projects/${P}/history`)).status, 200)
    assert.equal((await call("rafael", "GET", "/licenses/me")).status, 200)
    notPaused(await call("rafael", "POST", `/progress/projects/${P}/notes`, { note_text: "A note" }), "add note")
    notPaused(await call("rafael", "POST", `/projects/${P}/workspace-command`, { type: "add_photo" }), "add photo")
    notPaused(await call("rafael", "POST", `/confirmations/projects/${P}/phase-team/${designStage}/decline`, {}), "decline")
    // The engineer is not removed: still assigned and still active.
    const stillThere = await q("select status from project_phase_team where project_id=$1 and spm_user_id=$2", [P, idOf("rafael")])
    assert.ok(stillThere.length > 0 && stillThere.every((r) => r.status === "confirmed"))
    assert.equal((await q("select status from users where id=$1", [idOf("rafael")]))[0].status, "active")
  })

  await t.test("renewal: under review keeps the pause, a rejection needs a reason, verification lifts it", async () => {
    const P = brook.id
    const submit = async () => call("rafael", "POST", "/licenses/renewals", undefined, renewalForm())
    const up = await submit()
    assert.equal(up.status, 201, up.text)
    assert.equal((await submit()).status, 409, "only one renewal under review at a time")
    let me = (await call("rafael", "GET", "/licenses/me")).data
    assert.deepEqual([me.status, me.restricted], ["renewal_under_review", true])
    paused(await call("rafael", "POST", `/progress/projects/${P}/issues`, { reason: "x" }), "under review is still paused")
    // The document is private to the engineer and Administrators.
    assert.equal((await call("karlo", "GET", `/licenses/renewals/${up.data.id}/file`)).status, 404)
    assert.equal((await call("client", "GET", `/licenses/renewals/${up.data.id}/file`)).status, 404)
    assert.equal((await call("rafael", "GET", `/licenses/renewals/${up.data.id}/file`)).status, 200)
    assert.equal((await call("admin", "GET", `/licenses/renewals/${up.data.id}/file`)).status, 200)
    assert.equal((await call("karlo", "GET", "/licenses/renewals")).status, 403, "the review queue is for Administrators")
    // Rejection: reason required, engineer sees it, stays restricted, may upload again.
    assert.equal((await call("admin", "POST", `/licenses/renewals/${up.data.id}/reject`, {})).status, 400)
    assert.equal((await call("admin", "POST", `/licenses/renewals/${up.data.id}/reject`, { note: "   " })).status, 400)
    assert.equal((await call("admin", "POST", `/licenses/renewals/${up.data.id}/reject`, { note: "Photo is unreadable" })).status, 200)
    me = (await call("rafael", "GET", "/licenses/me")).data
    assert.equal(me.renewal.status, "rejected")
    assert.equal(me.renewal.reviewNote, "Photo is unreadable")
    assert.equal(me.restricted, true)
    paused(await call("rafael", "POST", `/progress/projects/${P}/issues`, { reason: "x" }), "rejected is still paused")
    const second = await submit()
    assert.equal(second.status, 201)
    // Verification records who verified and when, lifts the pause at once, and nothing is removed.
    const verified = await call("admin", "POST", `/licenses/renewals/${second.data.id}/verify`, {})
    assert.equal(verified.status, 200, verified.text)
    assert.equal((await call("admin", "POST", `/licenses/renewals/${second.data.id}/verify`, {})).status, 409, "cannot be verified twice")
    const row = (await q("select status, reviewed_by, reviewed_at, resulting_license_id from license_renewal_requests where id=$1", [second.data.id]))[0]
    assert.equal(row.status, "verified")
    assert.equal(row.reviewed_by, idOf("admin"))
    assert.ok(row.reviewed_at && row.resulting_license_id)
    me = (await call("rafael", "GET", "/licenses/me")).data
    assert.deepEqual([me.status, me.restricted], ["valid", false])
    notPaused(await call("rafael", "POST", `/progress/projects/${P}/issues`, { reason: "x" }), "lifted")
    assert.equal((await q("select count(*)::int n from user_licenses where user_id=$1", [idOf("rafael")]))[0].n >= 2, true, "the old license stays as history")
  })

  await t.test("an expired Office PM cannot sign, approve or accept, but can view", async () => {
    const R = rosaria.id
    const attempts = [
      ["approve a phase update", "POST", `/progress/projects/${R}/phase-updates/1/approve`, {}],
      ["reject a phase update", "POST", `/progress/projects/${R}/phase-updates/1/reject`, { resolution_note: "no" }],
      ["approve evidence", "POST", `/progress/projects/${R}/evidence/1/approve`, {}],
      ["reject evidence", "POST", `/progress/projects/${R}/evidence/1/reject`, { review_note: "no" }],
      ["approve rework", "POST", "/progress/rework-requests/00000000-0000-4000-8000-000000000001/approve", {}],
      ["reject rework", "POST", "/progress/rework-requests/00000000-0000-4000-8000-000000000001/reject", {}],
      ["advance the phase", "POST", `/progress/projects/${R}/advance-phase`, {}],
      ["accept an assignment", "POST", "/confirmations/1/accept", {}],
      ["upload the registered documents", "POST", `/projects/${R}/workspace-command`, { type: "upload_registered", docIndex: 0 }],
    ]
    for (const [label, method, path, body] of attempts) paused(await call("lea", method, path, body), label)
    assert.equal((await call("lea", "GET", "/workspace")).status, 200)
    assert.equal((await call("lea", "GET", "/workspace/project-data")).status, 200)
    assert.equal((await call("lea", "GET", "/licenses/me")).status, 200)
    notPaused(await call("lea", "POST", "/confirmations/1/decline", {}), "decline")
    assert.equal((await q("select suggested_opm_id from projects where id=$1", [R]))[0].suggested_opm_id, idOf("lea"), "not removed from the project")
  })

  await t.test("approvals made before expiry stay valid and still count in verified progress", async () => {
    const P = brook.id
    const overview = async (who) => (await call(who, "GET", `/progress/projects/${P}/phase-overview`)).data
    const items = (await overview("karlo")).checklist.items.filter((i) => i.status === "missing")
    assert.ok(items.length >= 2, "the current phase has at least two items waiting for evidence")
    const evidence = async (item) => {
      const f = new FormData()
      f.append("file", PDF(), "evidence.pdf")
      f.append("submission_note", "Evidence")
      return call("karlo", "POST", `/progress/projects/${P}/checklist-items/${item.id}/evidence`, undefined, f)
    }
    evidenceByKarlo.push(items[0].id, items[1].id)
    const first = await evidence(items[0])
    assert.equal(first.status, 201, first.text)
    const approved = await call("renz", "POST", `/progress/projects/${P}/evidence/${first.data.evidence_id ?? first.data.id}/approve`, {})
    assert.equal(approved.status, 200, approved.text)
    const second = await evidence(items[1])
    assert.equal(second.status, 201, second.text)
    const before = await overview("renz")
    const pctBefore = (await q("select current_pct from projects where id=$1", [P]))[0].current_pct
    assert.ok(before.checklist.approved_count >= 1)

    // Both engineers' licenses expire now. Nothing already done is withdrawn or recalculated.
    await setExpiry("karlo", -3)
    await setExpiry("renz", -3)
    const after = await overview("renz")
    assert.equal(after.checklist.approved_count, before.checklist.approved_count)
    assert.equal(after.checklist.pct, before.checklist.pct)
    assert.equal((await q("select current_pct from projects where id=$1", [P]))[0].current_pct, pctBefore)
    const approvedItem = after.checklist.items.find((i) => i.id === items[0].id)
    assert.equal(approvedItem.status, "approved")
    assert.equal(approvedItem.submitted_by_name, "Karlo M. Espiritu", "Evidence submitted by <name>")
    assert.equal(after.checklist.items.find((i) => i.id === items[1].id).status, "pending")
    // But nothing new can be approved by the expired Office PM, or submitted by the expired Site PM.
    paused(await call("renz", "POST", `/progress/projects/${P}/evidence/${second.data.evidence_id ?? second.data.id}/approve`, {}), "new approval")
    paused(await call("karlo", "POST", `/progress/projects/${P}/issues`, { reason: "x" }), "new submission")
    await setExpiry("karlo", 515)
    await setExpiry("renz", 420)
  })

  await t.test("the override opens only after the grace period, and a request alone moves nothing", async () => {
    await setExpiry("diego", -5)
    const options = await call("admin", "GET", `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)
    assert.equal(options.data.available, false)
    assert.deepEqual(options.data.candidates, [])
    assert.equal(options.data.current.reason, null)
    const early = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("karlo"), reason: "x" })
    assert.equal(early.status, 409)
    assert.match(early.message, /grace period/)
    // Valid license: no override at all.
    const valid = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: designStage, to_user_id: idOf("bea"), reason: "x" })
    assert.equal(valid.status, 409)
    await setExpiry("diego", -40)
    assert.equal((await call("admin", "GET", `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)).data.available, true)
  })

  await t.test("suggestions exclude invalid candidates, flag licenses ending before the project, and rank the best first", async () => {
    const required = (await q("select discipline_id from project_stage_discipline_links where project_stage_id=$1 and project_type_id=$2", [mobilization, brook.project_type_id])).map((r) => r.discipline_id)
    assert.ok(required.length > 0)
    for (const who of ["bea", "karlo"]) for (const d of required) await q("insert into user_discipline_scopes(user_id, discipline_id) values($1,$2) on conflict do nothing", [idOf(who), d])
    await q("update projects set target_end_date=$2 where id=$1", [brook.id, addDays(today(), 120)])
    await setExpiry("bea", 20)
    const fetchOptions = async () => (await call("admin", "GET", `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)).data
    const options = await fetchOptions()
    const names = options.candidates.map((c) => c.id)
    for (const who of ["diego", "mikaela", "lea", "renz", "admin", "client"]) assert.ok(!names.includes(idOf(who)), `${who} is not a candidate`)
    assert.ok(names.includes(idOf("karlo")) && names.includes(idOf("bea")))
    const bea = options.candidates.find((c) => c.id === idOf("bea"))
    const karlo = options.candidates.find((c) => c.id === idOf("karlo"))
    assert.equal(bea.expiresBeforeProjectEnd, true, "Bea's license ends in 20 days, the project in 120")
    assert.equal(karlo.expiresBeforeProjectEnd, false)
    assert.equal(options.candidates[0].best, true)
    assert.equal(options.candidates.filter((c) => c.best).length, 1)
    const sorted = [...options.candidates].sort((a, b) => b.matchPercent - a.matchPercent || a.workload - b.workload || a.name.localeCompare(b.name))
    assert.deepEqual(options.candidates.map((c) => c.id), sorted.map((c) => c.id), "ranked by match, then workload")
    // A hold, or no matching discipline, removes a candidate.
    await q("insert into workspace_account_metadata(user_id, metadata) values($1, '{\"assignmentHold\":true}') on conflict(user_id) do update set metadata = workspace_account_metadata.metadata || '{\"assignmentHold\":true}'", [idOf("karlo")])
    assert.ok(!(await fetchOptions()).candidates.some((c) => c.id === idOf("karlo")), "held engineers are not listed")
    await q("update workspace_account_metadata set metadata = metadata - 'assignmentHold' where user_id=$1", [idOf("karlo")])
    const saved = await q("select discipline_id from user_discipline_scopes where user_id=$1", [idOf("karlo")])
    await q("delete from user_discipline_scopes where user_id=$1 and discipline_id = any($2::int[])", [idOf("karlo"), required])
    assert.ok(!(await fetchOptions()).candidates.some((c) => c.id === idOf("karlo")), "no matching discipline, not listed")
    for (const r of saved) await q("insert into user_discipline_scopes(user_id, discipline_id) values($1,$2) on conflict do nothing", [idOf("karlo"), r.discipline_id])
    // An invalid choice is refused even if someone tries it directly.
    const expiredChoice = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("mikaela"), reason: "x" })
    assert.equal(expiredChoice.status, 422)
    const noReason = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("karlo"), reason: " " })
    assert.equal(noReason.status, 400)
  })

  const REASON_1 = "INTERNAL-REASON-ONE license not renewed"
  const REASON_2 = "INTERNAL-REASON-TWO second choice"
  const REASON_3 = "INTERNAL-REASON-THREE office pm lapsed"

  await t.test("a replacement can decline (the Admin is alerted), then another accepts and the Lead designation moves with the phase", async () => {
    const first = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("bea"), reason: REASON_1 })
    assert.equal(first.status, 201, first.text)
    const holder = () => q("select spm_user_id, is_lead, status from project_phase_team where project_id=$1 and project_stage_id=$2", [brook.id, mobilization])
    assert.deepEqual((await holder())[0], { spm_user_id: idOf("diego"), is_lead: true, status: "confirmed" }, "nothing moves until the replacement accepts")
    assert.equal((await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("karlo"), reason: "again" })).status, 409, "one open request per phase")
    // The request shows the project, phase, verified progress and the neutral reason only.
    const requests = (await call("bea", "GET", "/licenses/requests")).data
    assert.equal(requests.length, 1)
    assert.equal(requests[0].title, "Reassigned phase")
    assert.equal(requests[0].reason, "Previous engineer unavailable")
    assert.equal(requests[0].projectName, "Brookfield Warehouse Ext.")
    assert.equal(requests[0].stage, "Mobilization")
    assert.ok("approved" in requests[0].summary && "pct" in requests[0].summary)
    assert.doesNotMatch(JSON.stringify(requests), /licen|expired|grace|INTERNAL-REASON/i)
    // Decline: the Admin is alerted and the phase is untouched.
    assert.equal((await call("bea", "POST", `/licenses/requests/${requests[0].id}/decline`, { note: "Too busy" })).status, 200)
    assert.deepEqual((await holder())[0], { spm_user_id: idOf("diego"), is_lead: true, status: "confirmed" })
    assert.ok((await notices(idOf("admin"), "Reassignment declined")).length >= 1)
    assert.equal((await call("bea", "GET", "/licenses/requests")).data.length, 0)
    // The Admin picks again.
    const second = await call("admin", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("karlo"), reason: REASON_2 })
    assert.equal(second.status, 201)
    const mine = (await call("karlo", "GET", "/licenses/requests")).data[0]
    assert.equal((await call("karlo", "POST", `/licenses/requests/${mine.id}/accept`, {})).status, 200)
    assert.deepEqual((await holder())[0], { spm_user_id: idOf("karlo"), is_lead: true, status: "confirmed" }, "the Lead Site PM designation moved with the phase")
    assert.equal((await q("select count(*)::int n from project_phase_team where project_id=$1 and is_lead", [brook.id]))[0].n, 1)
    // The original engineer is told, neutrally, and stays on record.
    const told = await notices(idOf("diego"), "Mobilization reassigned")
    assert.equal(told.length, 1)
    assert.equal(told[0].detail, "Your past work and approvals stay on record.")
    const history = await q("select user_id, kind, ended_at is not null as closed from engineer_assignment_history where project_id=$1 and project_stage_id=$2 order by id", [brook.id, mobilization])
    assert.deepEqual(history.map((h) => [h.user_id, h.kind, h.closed]), [[idOf("diego"), "original", true], [idOf("karlo"), "took_over", false]])
    assert.equal((await q("select count(*)::int n from license_overrides where project_id=$1 and status in ('declined','accepted')", [brook.id]))[0].n, 2, "every request stays recorded")
    // Previous requests, with their reasons, are visible to Administrators only.
    const previous = (await call("admin", "GET", `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)).data.previous
    assert.ok(previous.some((p) => p.reason === REASON_1) && previous.some((p) => p.reason === REASON_2))
  })

  await t.test("on accept pending work stays where it is, approved work stays credited to its submitter, and both engineers are credited", async () => {
    // Design (the current phase) holds Karlo's approved and pending evidence from the earlier step.
    const P = brook.id
    const before = (await call("admin", "GET", `/progress/projects/${P}/phase-overview`)).data.checklist
    const approvedIds = before.items.filter((i) => i.status === "approved").map((i) => i.id)
    const pendingIds = before.items.filter((i) => i.status === "pending").map((i) => i.id)
    assert.ok(approvedIds.length >= 1 && pendingIds.length >= 1)
    const created = await call("admin", "POST", "/licenses/overrides", { project_id: P, stage_id: designStage, to_user_id: idOf("bea"), reason: REASON_3 })
    assert.equal(created.status, 201, created.text)
    const mine = (await call("bea", "GET", "/licenses/requests")).data[0]
    assert.ok(mine.summary.pendingEvidence >= 1, "what they will take over is shown")
    assert.equal((await call("bea", "POST", `/licenses/requests/${mine.id}/accept`, {})).status, 200)
    const after = (await call("admin", "GET", `/progress/projects/${P}/phase-overview`)).data.checklist
    assert.equal(after.approved_count, before.approved_count, "verified progress is untouched")
    for (const id of approvedIds) assert.equal(after.items.find((i) => i.id === id).status, "approved")
    for (const id of pendingIds) assert.equal(after.items.find((i) => i.id === id).status, "pending")
    // Credit never moves: each item still names whoever submitted its evidence (Karlo for his two, others as seeded).
    for (const item of before.items) assert.equal(after.items.find((i) => i.id === item.id).submitted_by_name, item.submitted_by_name, `item ${item.id}`)
    for (const id of evidenceByKarlo) assert.equal(after.items.find((i) => i.id === id).submitted_by_name, "Karlo M. Espiritu")
    // The phase completes under the replacement: both engineers are credited correctly.
    // The backend calls this inside the approval's transaction.
    await db.transaction((tx) => markPhaseCompleted(tx, P, designStage))
    const history = (await call("admin", "GET", `/licenses/history?project_id=${P}`)).data.filter((h) => h.stage_id === designStage)
    assert.deepEqual(history.map((h) => [h.name, h.label]), [["Diego A. Salvador", "Contributed"], ["Bea R. Concepcion", "Completed phase"]])
    assert.ok((await notices(idOf("admin"), "Design completed by Bea R. Concepcion")).length === 1, "activity entry: <Phase> completed by <name>")
    assert.ok((await notices(idOf("admin"), "Bea R. Concepcion took over Design")).length === 1, "activity entry: <Name> took over <phase>")
    const diegoRecord = (await call("diego", "GET", `/licenses/work-record/${idOf("diego")}`)).data
    assert.ok(diegoRecord.some((r) => r.stage === "Design" && /^Contributed · /.test(r.label)))
    const beaRecord = (await call("bea", "GET", `/licenses/work-record/${idOf("bea")}`)).data
    assert.ok(beaRecord.some((r) => r.stage === "Design" && /^Completed · took over /.test(r.label)))
    assert.equal((await call("karlo", "GET", `/licenses/work-record/${idOf("bea")}`)).status, 404, "a work record is private to the engineer and Administrators")
  })

  await t.test("a late renewal lifts the pause and the hold, but the reassigned phase stays with the replacement", async () => {
    const up = await call("diego", "POST", "/licenses/renewals", undefined, renewalForm(500))
    assert.equal(up.status, 201)
    assert.equal((await call("admin", "POST", `/licenses/renewals/${up.data.id}/verify`, {})).status, 200)
    const me = (await call("diego", "GET", "/licenses/me")).data
    assert.deepEqual([me.status, me.restricted], ["valid", false])
    notPaused(await call("diego", "POST", `/progress/projects/${brook.id}/issues`, { reason: "x" }), "no longer paused")
    // Available for new assignments again (the same rule that decides who is suggested).
    const eligible = await q(`select u.id from users u where u.id=$1 and ${(await import("../Thesis-Backend/src/common/utilities/license-eligibility.utility.js")).LICENSE_ELIGIBILITY_SQL}`, [idOf("diego")])
    assert.equal(eligible.length, 1)
    // ... but nothing came back automatically.
    const holders = await q("select project_stage_id, spm_user_id from project_phase_team where project_id=$1 and project_stage_id = any($2::int[]) order by project_stage_id", [brook.id, [mobilization, designStage]])
    assert.deepEqual(holders.map((h) => h.spm_user_id), [idOf("karlo"), idOf("bea")])
    // The original engineer cannot act on a phase that is no longer theirs.
    const write = await call("diego", "POST", `/progress/projects/${brook.id}/checklist-items/1/submit`, {})
    assert.ok([403, 404].includes(write.status) && write.code !== "LICENSE_PAUSED", write.text)
  })

  await t.test("the Office PM role can be reassigned the same way, and the original keeps read-only history", async () => {
    await q("update projects set project_type_id=(select id from project_types where code='Mixed-Use') where id=$1", [rosaria.id])
    const options = (await call("admin", "GET", `/licenses/override-options?project_id=${rosaria.id}`)).data
    assert.deepEqual([options.role, options.available], ["opm", true])
    assert.equal(options.candidates[0].id, idOf("renz"))
    assert.equal((await call("admin", "POST", "/licenses/overrides", { project_id: rosaria.id, to_user_id: idOf("renz"), reason: REASON_3 })).status, 201)
    assert.equal((await q("select suggested_opm_id from projects where id=$1", [rosaria.id]))[0].suggested_opm_id, idOf("lea"), "nothing moves yet")
    const mine = (await call("renz", "GET", "/licenses/requests")).data[0]
    assert.equal(mine.title, "Reassigned project")
    assert.equal((await call("renz", "POST", `/licenses/requests/${mine.id}/accept`, {})).status, 200)
    assert.equal((await q("select suggested_opm_id from projects where id=$1", [rosaria.id]))[0].suggested_opm_id, idOf("renz"))
    assert.ok((await projectIds("lea")).includes(rosaria.id), "the original can still view the project")
    // After a late renewal she still cannot approve: the role is no longer hers.
    const up = await call("lea", "POST", "/licenses/renewals", undefined, renewalForm())
    assert.equal((await call("admin", "POST", `/licenses/renewals/${up.data.id}/verify`, {})).status, 200)
    const approve = await call("lea", "POST", `/progress/projects/${rosaria.id}/phase-updates/1/approve`, {})
    assert.ok([403, 404].includes(approve.status) && approve.code !== "LICENSE_PAUSED", approve.text)
    const roles = (await call("admin", "GET", `/licenses/history?project_id=${rosaria.id}`)).data.filter((h) => h.role === "opm")
    assert.deepEqual(roles.map((h) => h.name), ["Lea M. Fernandez", "Renz D. Villaverde"])
  })

  await t.test("reminders go out once per reminder day to the engineer, their superior and the Administrator", async () => {
    const expiry = "2027-06-30"
    await q("update user_licenses set license_expiry=$2 where user_id=$1 and superseded_at is null", [idOf("karlo"), expiry])
    await q("delete from license_reminders_sent where user_id=$1", [idOf("karlo")])
    const adapter = { query: (sql, params) => db.query(sql, params) }
    const reminders = async () => (await notices(idOf("karlo"), "License renewal reminder")).length
    const run = async (offset) => sweepLicenses(adapter, { today: addDays(expiry, offset), now: new Date("2026-01-01T00:00:00Z") })
    const sent = []
    for (const [offset, expectNew] of [[-61, 0], [-60, 1], [-60, 0], [-59, 0], [-45, 0], [-30, 1], [-14, 1], [-10, 0], [-7, 1], [0, 1], [0, 0]]) {
      const before = await reminders()
      await run(offset)
      const delta = (await reminders()) - before
      assert.equal(delta, expectNew, `day ${offset}`)
      sent.push(delta)
    }
    assert.equal(sent.reduce((a, b) => a + b, 0), 5)
    assert.equal((await q("select count(*)::int n from license_reminders_sent where user_id=$1", [idOf("karlo")]))[0].n, 5)
    // Superior (the Office PM of his projects) and the Administrator get one notice per reminder day too.
    const bandNotices = async (who) => (await notices(idOf(who), "Engineer license reminder")).filter((n) => n.detail.startsWith("Karlo")).length
    assert.equal(await bandNotices("admin"), 5)
    assert.ok((await bandNotices("renz")) === 5 || (await bandNotices("lea")) === 5, "the project's Office PM is reminded as well")
    assert.equal((await q("select count(*)::int n from notification_recipients n join users u on u.id=n.recipient_user_id join roles r on r.id=u.role_id where r.code='client'"))[0].n, 0, "clients never get license notices")
    // Grace period: weekly; the end of it alerts the Administrator exactly once; a renewal under review pauses the nagging.
    await run(1)
    await run(3)
    await run(8)
    assert.equal((await q("select count(*)::int n from license_reminders_sent where user_id=$1 and reminder_key like 'grace-w%'", [idOf("karlo")]))[0].n, 2)
    await run(31)
    await run(40)
    assert.equal((await notices(idOf("admin"), "Engineer license expired: assignment needs cover")).filter((n) => n.detail.startsWith("Karlo")).length, 1)
    await q("delete from license_reminders_sent where user_id=$1", [idOf("karlo")])
    await q("insert into license_renewal_requests(user_id, license_number, license_expiry, file_ref, submitted_by) values($1,'X','2028-01-01','x',$1)", [idOf("karlo")])
    const quiet = await run(-7)
    assert.equal(quiet.reminders, 0, "no reminders while a renewal is under review")
    await q("delete from license_renewal_requests where user_id=$1", [idOf("karlo")])
    await q("update user_licenses set license_expiry=$2 where user_id=$1 and superseded_at is null", [idOf("karlo"), addDays(today(), 515)])
  })

  await t.test("privacy: the reason is Administrator-only and the replacement only ever sees \"Previous engineer unavailable\"", async () => {
    const everything = async (who) => {
      const parts = []
      for (const path of ["/licenses/requests", "/workspace/project-data", "/workspace", "/notifications", "/licenses/me", `/licenses/history?project_id=${brook.id}`, `/licenses/history?project_id=${rosaria.id}`, `/licenses/work-record/${idOf(who)}`]) {
        const r = await call(who, "GET", path)
        if (r.status === 200) parts.push(r.text)
      }
      return parts.join("\n")
    }
    for (const who of ["bea", "karlo", "renz", "diego", "lea", "mikaela"]) {
      const text = await everything(who)
      assert.doesNotMatch(text, /INTERNAL-REASON/, `${who} never sees the Administrator's reason`)
    }
    for (const who of ["bea", "karlo", "renz", "diego", "lea"]) assert.equal((await call(who, "GET", `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)).status, 403, `${who} cannot open the override window`)
    assert.equal((await call("karlo", "POST", "/licenses/overrides", { project_id: brook.id, stage_id: mobilization, to_user_id: idOf("bea"), reason: "x" })).status, 403)
    // Renewal files and decisions are private to the engineer and Administrators.
    assert.equal((await call("karlo", "GET", "/licenses/overview")).status, 403)
    assert.equal((await call("karlo", "POST", "/licenses/renewals/1/verify", {})).status, 403)
  })

  await t.test("clients never see license status, reasons or handover history", async () => {
    for (const path of ["/licenses/me", "/licenses/requests", "/licenses/overview", "/licenses/renewals", `/licenses/history?project_id=${brook.id}`,
      `/licenses/work-record/${idOf("diego")}`, `/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`]) {
      const r = await call("client", "GET", path)
      assert.ok([403, 404].includes(r.status), `${path}: ${r.status}`)
    }
    for (const path of ["/workspace/project-data", "/workspace", "/notifications"]) {
      const r = await call("client", "GET", path)
      assert.equal(r.status, 200, path)
      assert.doesNotMatch(r.text, /licen|grace period|expired|INTERNAL-REASON|Previous engineer|took over|reassign|Contributed|renewal/i, `client ${path}`)
    }
    setToken("")
    const user = await login(EMAIL.client, "Password@123")
    tokens.client = getToken() // signing in again replaces the earlier session
    const state = await loadState(user)
    assert.deepEqual(state.license, {}, "no license data is loaded for a client")
    const views = JSON.stringify(clientProjectViews(state))
    assert.doesNotMatch(views, /licen|expiry|grace|reassign|took over|history/i)
    // The client still sees the current engineer for each phase, and nothing about who came before.
    const phase = (await call("client", "GET", "/workspace/project-data")).data.flatMap((p) => p.detail?.phase_team || [])
    for (const row of phase) assert.ok(!("history" in row) && !("reason" in row))
  })

  await t.test("role scoping is unchanged for accounts that never held a reassigned assignment", async () => {
    for (const who of ["admin", "mikaela", "client"]) assert.deepEqual(await projectIds(who), scopeBefore[who], `${who} sees the same projects as before`)
    // Anyone who held something keeps (read-only) access, and the new holders gain exactly what they took over.
    for (const who of ["diego", "lea"]) for (const id of scopeBefore[who]) assert.ok((await projectIds(who)).includes(id), `${who} keeps ${id}`)
    assert.ok((await projectIds("renz")).includes(rosaria.id))
  })
})
