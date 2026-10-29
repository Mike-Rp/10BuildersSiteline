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

test("Admin-confirmed engineer replacement and company license access policy", { skip: !available && "Thesis-Backend folder not found", timeout: 600000 }, async (t) => {
  const uploadFiles = dir => fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? uploadFiles(dir + '/' + entry.name) : [dir + '/' + entry.name]) : []
  const existingUploads = new Set(uploadFiles(backend + 'uploads'))
  const db = new PGlite({ extensions: { citext } })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  for (const migration of ["001-phase-checklists.sql", "002-phase-update-confirmation.sql", "003-react-integration.sql", "004-verified-activity-progress.sql"])
    await db.exec(read("../Thesis-Backend/migrations/" + migration))
  await db.exec(read("../Thesis-Backend/migrations/004-verified-activity-progress.sql")) // safe to run again
  await db.exec(read("../Thesis-Backend/migrations/009-engineer-license-workflow.sql"))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  await db.exec(read("../Thesis-Backend/migrations/008-monthly-report-history.sql"))
  await db.exec(read("../Thesis-Backend/migrations/009-engineer-license-workflow.sql")) // backfills the seeded holders
  await db.exec("update user_licenses set license_expiry=current_date+400 where superseded_at is null")
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
    for (const file of uploadFiles(backend + "uploads")) if (!existingUploads.has(file)) fs.rmSync(file, {force:true})
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
    const r = await fetch(base + (who === "admin" ? "/auth/admin/login" : who === "client" ? "/auth/login" : "/auth/staff/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL[who], password: "Password@123" }) })
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
  const renewalForm = (expiryOffset = 400, who = "rafael") => {
    const f = new FormData()
    f.append("user_id", idOf(who))
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
  const designStage = await stage("Design")
  const mobilization = await stage("Mobilization")
  const scopeBefore = {}
  const evidenceByKarlo = []
  for (const who of ["admin", "renz", "lea", "karlo", "rafael", "mikaela", "diego", "bea", "client"]) scopeBefore[who] = await projectIds(who)

  const options = () => call('admin','GET',`/licenses/override-options?project_id=${brook.id}&stage_id=${mobilization}`)
  const holder = async () => (await q('select spm_user_id,is_lead,status from project_phase_team where project_id=$1 and project_stage_id=$2',[brook.id,mobilization]))[0]
  const approval = () => ({project_id:brook.id,stage_id:mobilization,from_user_id:idOf('diego'),to_user_id:idOf('karlo'),reason:'Company license policy replacement',appointment_signed:true,signed_on:today()})
  await q("update workspace_settings set rules=rules || '{\"cap\":100}'::jsonb where singleton")
  const required = await q('select discipline_id from project_stage_discipline_links where project_stage_id=$1 and project_type_id=$2',[mobilization,brook.project_type_id])
  for (const {discipline_id} of required) await q('insert into user_discipline_scopes(user_id,discipline_id) values($1,$2) on conflict do nothing',[idOf('karlo'),discipline_id])

  await t.test('33-day preparation threshold exposes contact details and profile assignments', async () => {
    await setExpiry('diego',34)
    assert.equal((await options()).data.available,false)
    await setExpiry('diego',33)
    const data=(await options()).data
    assert.equal(data.available,true)
    const candidate=data.candidates.find(c=>c.id===idOf('karlo'))
    assert.ok(candidate)
    assert.equal(candidate.email,EMAIL.karlo)
    assert.ok('phone' in candidate)
    const overview=(await call('admin','GET','/licenses/overview')).data.find(i=>i.id===idOf('diego'))
    assert.equal(overview.needsCover,true)
    assert.ok(overview.assignments.some(a=>a.projectId===brook.id))
  })

  await t.test('33-day notices reach Admin and outgoing engineer once, including pending renewals', async () => {
    await sweepLicenses(db)
    const first=await notices(idOf('admin'),'Prepare engineer replacement')
    assert.ok(first.some(n=>n.detail.includes('Diego')))
    assert.ok((await notices(idOf('diego'),'License replacement preparation notice')).length)
    await sweepLicenses(db)
    assert.equal((await notices(idOf('admin'),'Prepare engineer replacement')).length,first.length)
  })

  await t.test('only Admin can confirm a signed appointment; no switch occurs without confirmation', async () => {
    const before=await holder()
    for (const who of ['karlo','renz','client']) assert.equal((await call(who,'POST','/licenses/overrides',approval())).status,403)
    for (const patch of [{appointment_signed:false},{signed_on:addDays(today(),1)},{signed_on:'2026-02-30'}]) {
      const result=await call('admin','POST','/licenses/overrides',{...approval(),...patch})
      assert.equal(result.status,422,result.text)
    }
    assert.deepEqual(await holder(),before)
  })

  await t.test('new assignee must have valid license, matching disciplines and capacity', async () => {
    await setExpiry('karlo',30)
    assert.equal((await call('admin','POST','/licenses/overrides',approval())).status,422)
    await setExpiry('karlo',400)
    const saved=await q('select discipline_id from user_discipline_scopes where user_id=$1',[idOf('karlo')])
    await q('delete from user_discipline_scopes where user_id=$1',[idOf('karlo')])
    assert.equal((await call('admin','POST','/licenses/overrides',approval())).status,422)
    for(const row of saved) await q('insert into user_discipline_scopes(user_id,discipline_id) values($1,$2)',[idOf('karlo'),row.discipline_id])
  })

  await t.test('Admin approval immediately transfers a signed appointment before day 30, preserving history and lead', async () => {
    const beforeEvidence = await q('select * from project_phase_evidence where project_id=$1 order by id',[brook.id])
    const beforeUpdates = await q('select * from project_phase_updates where project_id=$1 order by id',[brook.id])
    const result=await call('admin','POST','/licenses/overrides',approval())
    assert.equal(result.status,201,result.text)
    assert.deepEqual(await q('select * from project_phase_evidence where project_id=$1 order by id',[brook.id]),beforeEvidence)
    assert.deepEqual(await q('select * from project_phase_updates where project_id=$1 order by id',[brook.id]),beforeUpdates)
    assert.deepEqual(await holder(),{spm_user_id:idOf('karlo'),is_lead:true,status:'confirmed'})
    assert.equal(result.data.status,'accepted')
    assert.deepEqual((await call('karlo','GET','/licenses/requests')).data,[])
    assert.equal((await call('karlo','POST',`/licenses/requests/${result.data.id}/accept`,{})).status,409)
    const record=(await q('select requested_by,response_note from license_overrides where id=$1',[result.data.id]))[0]
    assert.equal(record.requested_by,idOf('admin'))
    assert.equal(JSON.parse(record.response_note).signedOn,today())
    const history=(await call('admin','GET',`/licenses/history?project_id=${brook.id}`)).data.filter(h=>h.stage_id===mobilization)
    assert.ok(history.some(h=>h.user_id===idOf('diego') && h.ended_at))
    assert.ok(history.some(h=>h.user_id===idOf('karlo') && h.kind==='took_over' && !h.ended_at))
    assert.equal((await call('admin','POST','/licenses/overrides',approval())).status,409,'stale holder cannot be replaced twice')
  })

  await t.test('day 30 through day 24 allows viewing only, blocking every project mutation', async () => {
    for(const days of [30,24]) {
      await setExpiry('rafael',days)
      assert.equal((await call('rafael','GET','/workspace')).status,200)
      const self=await call('rafael','GET','/licenses/me')
      assert.equal(self.data.access.mode,'view_only')
      assert.equal(self.data.access.viewingDaysLeft,days-23)
      for(const [path,body] of [[`/progress/projects/${brook.id}/notes`,{note_text:'blocked'}],[`/projects/${brook.id}/workspace-command`,{type:'add_photo'}],[`/confirmations/projects/${brook.id}/phase-team/${designStage}/decline`,{}]]) {
        const result=await call('rafael','POST',path,body)
        assert.equal(result.code,'LICENSE_VIEW_ONLY',result.text)
      }
    }
  })

  await t.test('day 23 disables existing sessions and fresh sign-in with clear Admin instructions', async () => {
    await setExpiry('rafael',23)
    const r=await call('rafael','GET','/workspace')
    assert.equal(r.code,'LICENSE_ACCESS_DISABLED',r.text)
    assert.match(r.message,/Contact.*Administrator/)
    const fresh=await fetch(base+'/auth/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL.rafael,password:'Password@123',replace_session:true})})
    assert.equal(fresh.status,403)
    assert.equal((await fresh.json()).error.code,'LICENSE_ACCESS_DISABLED')
    assert.equal((await q('select status from users where id=$1',[idOf('rafael')]))[0].status,'active','restriction does not delete or suspend HR account')
  })

  await t.test('renewal under review does not lift restriction; only verified renewal restores access', async () => {
    const submitted=await call('admin','POST','/licenses/renewals',undefined,renewalForm(400,'rafael'))
    assert.equal(submitted.status,201,submitted.text)
    assert.equal((await call('rafael','GET','/workspace')).code,'LICENSE_ACCESS_DISABLED')
    const verified=await call('admin','POST',`/licenses/renewals/${submitted.data.id}/verify`,{})
    assert.equal(verified.status,200,verified.text)
    assert.equal((await call('rafael','GET','/workspace')).status,200)
    assert.equal((await call('rafael','GET','/licenses/me')).data.access.mode,'normal')
  })

  await t.test('late renewal never takes transferred projects back from the replacement', async () => {
    const submitted=await call('admin','POST','/licenses/renewals',undefined,renewalForm(400,'diego'))
    assert.equal(submitted.status,201,submitted.text)
    assert.equal((await call('admin','POST',`/licenses/renewals/${submitted.data.id}/verify`,{})).status,200)
    assert.equal((await holder()).spm_user_id,idOf('karlo'))
  })

  await t.test('Office PM replacements use the same Admin confirmation flow', async () => {
    const original=(await q('select suggested_opm_id from projects where id=$1',[brook.id]))[0].suggested_opm_id
    await q('update user_licenses set license_expiry=$2 where user_id=$1 and superseded_at is null',[original,addDays(today(),33)])
    const o=await call('admin','GET',`/licenses/override-options?project_id=${brook.id}`)
    assert.equal(o.status,200,o.text)
    const candidate=o.data.candidates[0]
    assert.ok(candidate)
    const result=await call('admin','POST','/licenses/overrides',{project_id:brook.id,from_user_id:original,to_user_id:candidate.id,reason:'Office PM replacement',appointment_signed:true,signed_on:today()})
    assert.equal(result.status,201,result.text)
    assert.equal((await q('select suggested_opm_id from projects where id=$1',[brook.id]))[0].suggested_opm_id,candidate.id)
  })

  await t.test('clients cannot read private replacement records or license details', async () => {
    for(const path of ['/licenses/overview',`/licenses/override-options?project_id=${brook.id}`,`/licenses/history?project_id=${brook.id}`]) assert.equal((await call('client','GET',path)).status,403)
    const data=await call('client','GET','/workspace/project-data')
    assert.doesNotMatch(data.text,/Company license policy replacement|appointmentSigned/)
  })
})
