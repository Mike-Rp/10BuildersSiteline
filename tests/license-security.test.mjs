// Security regression tests for the license, certification, intake-upload, refresh,
// health, cron and sign-in routes. Runs the real Thesis-Backend against an in-process
// throwaway Postgres (PGlite); nothing here can reach a hosted database.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { createRequire } from "node:module"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const backend = here("../Thesis-Backend/")
const schema = here("../supabase/migrations/20261017000002_thesis_backend_schema.sql")
const dummy = here("../supabase/seed/dummy-data.sql")
const available = fs.existsSync(backend + "src/index.js")
// jsonwebtoken is a backend dependency, so resolve it from the backend folder.
const jwt = createRequire(backend + "package.json")("jsonwebtoken")

const SECRET = "test-secret-only-for-this-test-0123456789"
const CRON_SECRET = "cron-secret-only-for-this-test-0123456789"
const PASSWORD = "Password@123"
const ADMIN = "patricia.domingo@10builders.com"
const OPM = "lea.fernandez@10builders.com"

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

test("license, certification and intake routes enforce login, roles and safe SQL", { skip: !available && "Thesis-Backend folder not found", timeout: 240000 }, async (t) => {
  const db = new PGlite({ extensions: { citext } })
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(fs.readFileSync(schema, "utf8").replace(/^create extension if not exists pgcrypto.*$/m, ""))
  for (const migration of ["001-phase-checklists.sql", "002-phase-update-confirmation.sql", "003-react-integration.sql", "004-verified-activity-progress.sql", "009-engineer-license-workflow.sql", "010-id-numbers.sql"]) {
    await db.exec(fs.readFileSync(here("../Thesis-Backend/migrations/" + migration), "utf8"))
  }
  await db.exec(fs.readFileSync(dummy, "utf8"))

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
      JWT_SECRET: SECRET, CRON_SECRET,
      PORT: String(apiPort), HOST: "127.0.0.1", ARCHIVE_MAINTENANCE_ENABLED: "false",
    },
    stdio: "ignore",
  })
  t.after(async () => {
    server.kill()
    await pg.stop()
    await db.close()
  })
  const base = `http://127.0.0.1:${apiPort}/api/v1`
  await until(async () => (await fetch(`${base}/health`)).ok)

  let failedSignIns = 0
  const signIn = async (email, password = PASSWORD, replaceSession = true) => {
    const response = await fetch(`${base}/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, replace_session: replaceSession }),
    })
    if ([401, 403].includes(response.status)) failedSignIns++
    return { response, token: (await response.json()).data?.token }
  }
  const form = (fields, file) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.append(key, value)
    if (file) body.append("file", new Blob([file.content ?? "%PDF-1.4 test"]), file.name)
    return body
  }
  const call = (method, path, { token, body, headers } = {}) =>
    fetch(`${base}${path}`, { method, body, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } })

  let admin = (await signIn(ADMIN)).token
  // Signing in (or refreshing) replaces a user's one stored session, so re-sign-in when a test needs the admin again.
  const freshAdmin = async () => (admin = (await signIn(ADMIN)).token)
  const opm = (await signIn(OPM)).token
  assert.ok(admin && opm, "seeded admin and Office PM sign in")
  const license = (await db.query("select id, user_id, license_number, license_expiry::text as license_expiry from user_licenses where superseded_at is null limit 1")).rows[0]
  assert.ok(license, "seed data has a current license")
  const snapshot = async () => (await db.query("select license_number, license_expiry::text as license_expiry, updated_by from user_licenses where id=$1", [license.id])).rows[0]
  const knownUser = license.user_id

  await t.test("a second device must choose before replacing a live session", async () => {
    const before = admin
    const conflict = await signIn(ADMIN, PASSWORD, false)
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.token, undefined)
    assert.equal((await call("GET", "/auth/me", { token: before })).status, 200, "keeping the current device needs no mutation")
    const wrong = await signIn(ADMIN, "wrong-password", false)
    assert.equal(wrong.response.status, 401, "the session conflict is disclosed only after verifying the password")
    const replacement = await signIn(ADMIN, PASSWORD, true)
    assert.equal(replacement.response.status, 200)
    admin = replacement.token
    assert.notEqual(admin, before)
    const old = await call("GET", "/auth/me", { token: before })
    assert.equal(old.status, 401)
    assert.equal((await old.json()).error.code, "SESSION_REPLACED")
    assert.equal((await call("POST", "/auth/logout", { token: before })).status, 401)
    assert.equal((await call("GET", "/auth/me", { token: admin })).status, 200, "the old device cannot sign out the replacement")
  })

  await t.test("expired sessions do not block a fresh login and concurrent logins require a choice", async () => {
    const user = (await db.query("select id from users where email=$1", [ADMIN])).rows[0]
    const expired = jwt.sign({ details: { id: user.id } }, SECRET, { expiresIn: -60 })
    await db.query("update users_token set token=$2 where user_id=$1", [user.id, expired])
    const fresh = await signIn(ADMIN, PASSWORD, false)
    assert.equal(fresh.response.status, 200)
    admin = fresh.token
    await call("POST", "/auth/logout", { token: admin })
    const attempts = await Promise.all([signIn(ADMIN, PASSWORD, false), signIn(ADMIN, PASSWORD, false)])
    assert.deepEqual(attempts.map(result => result.response.status).sort(), [200, 409])
    admin = attempts.find(result => result.token).token
    assert.equal((await call("GET", "/auth/me", { token: admin })).status, 200)
  })

  await t.test("anyone without a login is refused on every license and certification route", async () => {
    const before = await snapshot()
    const routes = [
      ["GET", "/engineer/licenses"], ["GET", `/engineer/licenses/${license.id}`],
      ["POST", "/engineer/licenses/", () => form({ user_id: knownUser, license_number: "X", license_expiry: "2030-01-01" })],
      ["PUT", `/engineer/licenses/${license.id}`, () => form({ license_number: "taken-over" })],
      ["GET", "/engineer/certifications"], ["GET", `/engineer/certifications/${knownUser}`],
      ["POST", "/engineer/certifications/", () => form({ user_id: knownUser })],
      ["GET", "/accounts/licenses"], ["GET", `/accounts/licenses/${license.id}`],
      ["POST", "/accounts/licenses/", () => form({ user_id: knownUser })],
      ["PUT", `/accounts/licenses/${license.id}`, () => form({ license_number: "taken-over" })],
      ["GET", "/accounts/certifications"], ["POST", "/accounts/certifications/", () => form({ user_id: knownUser })],
      ["POST", "/projects/intake/upload-contract", () => form({ project_id: license.id }, { name: "c.pdf" })],
      ["POST", "/projects/intake/upload-subcon-contract", () => form({ project_id: license.id }, { name: "c.pdf" })],
    ]
    for (const [method, path, makeBody] of routes) {
      const response = await call(method, path, { body: makeBody?.() })
      assert.equal(response.status, 401, `${method} ${path} without a token`)
      const forged = await call(method, path, { token: jwt.sign({ forged: true }, SECRET), body: makeBody?.() })
      assert.equal(forged.status, 401, `${method} ${path} with a signed token that has no session`)
    }
    assert.deepEqual(await snapshot(), before, "no refused request changed the license")
  })

  await t.test("a signed-in non-admin is refused with 403", async () => {
    for (const [method, path, body] of [
      ["GET", "/engineer/licenses"],
      ["PUT", `/engineer/licenses/${license.id}`, form({ license_number: "taken-over" })],
      ["POST", "/engineer/certifications/", form({ user_id: knownUser })],
      ["POST", "/projects/intake/upload-contract", form({ project_id: license.id }, { name: "c.pdf" })],
    ]) {
      assert.equal((await call(method, path, { token: opm, body })).status, 403, `${method} ${path} as Office PM`)
    }
  })

  await t.test("injection text in the license number is stored as plain text and cannot reach other columns", async () => {
    const before = await snapshot()
    const payloads = [
      "x', license_expiry = '1999-01-01",
      "'; DROP TABLE user_licenses; --",
      "x', upload_file_ref = 'http://evil.example/steal",
    ]
    for (const payload of payloads) {
      const response = await call("PUT", `/engineer/licenses/${license.id}`, { token: admin, body: form({ license_number: payload }) })
      assert.equal(response.status, 200, `payload accepted as text: ${payload}`)
      const after = await snapshot()
      assert.equal(after.license_number, payload)
      assert.equal(after.license_expiry, before.license_expiry, "expiry was not altered by the text")
    }
    const stored = (await db.query("select upload_file_ref from user_licenses where id=$1", [license.id])).rows[0]
    assert.ok(!String(stored.upload_file_ref ?? "").includes("evil.example"))
    assert.ok((await db.query("select count(*)::int as n from user_licenses")).rows[0].n > 0, "table still exists")
  })

  await t.test("license input is validated", async () => {
    const put = (id, fields) => call("PUT", `/engineer/licenses/${id}`, { token: admin, body: form(fields) })
    assert.equal((await put(license.id, { license_expiry: "2026-13-45" })).status, 400)
    assert.equal((await put(license.id, { license_expiry: "2026-02-30" })).status, 400)
    assert.equal((await put(license.id, { license_expiry: "tomorrow" })).status, 400)
    assert.equal((await put(license.id, { license_number: "N".repeat(121) })).status, 400)
    assert.equal((await put("not-a-uuid", { license_number: "OK" })).status, 400)
    assert.equal((await put("00000000-0000-4000-8000-000000000000", { license_number: "OK" })).status, 404)
    assert.equal((await put(license.id, { license_number: "N".repeat(120), license_expiry: "2031-06-30" })).status, 200)
    assert.equal((await snapshot()).license_expiry, "2031-06-30")
    const created = await call("POST", "/engineer/licenses/", { token: admin, body: form({ user_id: "nope", license_number: "A" }) })
    assert.equal(created.status, 400)
    const ok = await call("POST", "/engineer/licenses/", { token: admin, body: form({ user_id: knownUser, license_number: "PRC-1234", license_expiry: "2032-01-31" }) })
    assert.equal(ok.status, 200)
    assert.equal((await db.query("select count(*)::int as n from user_licenses where user_id=$1 and superseded_at is null", [knownUser])).rows[0].n, 1)
  })

  await t.test("sort order text is never executed", async () => {
    const started = Date.now()
    const response = await call("GET", `/engineer/licenses?sortOrder=${encodeURIComponent("DESC; SELECT pg_sleep(5)")}`, { token: admin })
    assert.equal(response.status, 200)
    assert.ok(Date.now() - started < 4000, "pg_sleep was not executed")
  })

  await t.test("certification input is validated and uploads are limited to documents", async () => {
    const post = (fields, file) => call("POST", "/engineer/certifications/", { token: admin, body: form(fields, file) })
    assert.equal((await post({ user_id: "nope" })).status, 400)
    assert.equal((await post({ user_id: knownUser })).status, 400, "codes are required")
    const exe = await post({ user_id: knownUser, doc_type: "../../escape" }, { name: "evil.exe" })
    assert.equal(exe.status, 400)
    assert.ok(!fs.existsSync(here("../escape")) && !fs.existsSync(backend + "../escape"))
  })

  await t.test("refresh only renews a live, stored session", async () => {
    const live = await call("PUT", "/auth", { token: admin })
    assert.equal(live.status, 200)
    const renewed = (await live.json()).data.token
    assert.ok(renewed && jwt.verify(renewed, SECRET).details.email, "new token carries the account email")

    const user = (await db.query("select id from users where email=$1", [OPM])).rows[0]
    const expired = jwt.sign({ details: { id: user.id } }, SECRET, { expiresIn: -60 })
    await db.query("update users_token set token=$2 where user_id=$1", [user.id, expired])
    assert.equal((await call("PUT", "/auth", { token: expired })).status, 401, "expired JWT cannot be refreshed")
    assert.equal((await call("PUT", "/auth", { token: jwt.sign({ details: { id: user.id } }, SECRET) })).status, 401, "valid JWT with no stored session")

    await db.query("update users set status='suspended' where id=(select id from users where email=$1)", [ADMIN])
    assert.equal((await call("PUT", "/auth", { token: renewed })).status, 401, "suspended accounts cannot refresh")
    await db.query("update users set status='active' where email=$1", [ADMIN])
  })

  await t.test("health reports only up or down, never configuration", async () => {
    const response = await fetch(`${base}/health`)
    assert.deepEqual(await response.json(), { ok: true, database: true })
    const source = fs.readFileSync(backend + "src/app.js", "utf8")
    assert.ok(!/pwFingerprint|DB_PASSWORD|TEMP diagnostics/.test(source))
  })

  await t.test("the cron endpoint refuses calls without the secret", async () => {
    await freshAdmin()
    for (const headers of [{}, { Authorization: "Bearer wrong" }, { Authorization: CRON_SECRET }, { Authorization: "Bearer " }]) {
      for (const method of ["GET", "POST"]) {
        assert.equal((await call(method, "/cron/license-sweep", { headers })).status, 401, `${method} ${JSON.stringify(headers)}`)
      }
    }
    assert.equal((await call("GET", "/cron/license-sweep", { token: admin })).status, 401, "a user session is not the cron secret")
    assert.equal((await db.query("select count(*)::int as n from activity_log where anchor_reference like 'license:%'")).rows[0].n, 0)
  })

  await t.test("the cron endpoint sweeps licenses once per reminder", async () => {
    assert.ok((await db.query("select 1 from activity_types where code='notice'")).rowCount, "seed has the notice activity type")
    const spm = (await db.query("select u.id from users u join roles r on r.id=u.role_id where r.code='spm' and u.status='active' and not u.is_deleted limit 1")).rows[0]
    await db.query("update user_licenses set superseded_at=now() where user_id=$1 and superseded_at is null", [spm.id])
    await db.query(`insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref)
      values($1,'PRC-SWEEP',current_date + 5,'uploaded','uploads/license/x.pdf')`, [spm.id])
    const run = () => call("GET", "/cron/license-sweep", { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

    const first = await run()
    assert.equal(first.status, 200)
    const firstResult = (await first.json()).data
    assert.ok(firstResult.reminders >= 1)
    const entry = (await db.query("select id, title from activity_log where anchor_reference like $1", [`license:${spm.id}:expiring_soon:%`])).rows
    assert.equal(entry.length, 1)
    const recipients = (await db.query("select recipient_user_id from notification_recipients where activity_log_id=$1", [entry[0].id])).rows.map((row) => row.recipient_user_id)
    const adminId = (await db.query("select id from users where email=$1", [ADMIN])).rows[0].id
    assert.ok(recipients.includes(spm.id) && recipients.includes(adminId))

    const second = (await (await run()).json()).data
    assert.equal(second.reminders, 0, "no duplicate reminders")
    assert.equal(second.skipped, firstResult.reminders + firstResult.skipped)
  })

  const json = { "Content-Type": "application/json" }
  const notices = async (token) => (await (await call("GET", "/notifications", { token })).json()).data

  await t.test("licenses are swept automatically when notifications load, with no cron call", async () => {
    await freshAdmin()
    const person = (await db.query(`select u.id, u.full_name from users u join roles r on r.id=u.role_id
      where r.code in ('opm','spm') and u.status='active' and not u.is_deleted order by u.full_name limit 1`)).rows[0]
    await db.query("delete from activity_log where anchor_reference like $1", [`license:${person.id}:%`])
    await db.query("update user_licenses set superseded_at=now() where user_id=$1 and superseded_at is null", [person.id])
    await db.query("insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref) values($1,'PRC-LAZY',current_date + 3,'uploaded','uploads/license/x.pdf')", [person.id])
    const list = await notices(admin)
    assert.ok(list.some((n) => n.title === "PRC license expiring soon" && n.detail.includes(person.full_name)), "admin sees the reminder without the cron")
  })

  await t.test("a new account whose license expires in 2 days notifies that Site PM and the admins", async () => {
    await freshAdmin()
    const discipline = (await db.query("select code from disciplines order by code limit 1")).rows[0].code
    const created = await call("POST", "/accounts", { token: admin, headers: json, body: JSON.stringify({
      first_name: "Newly", middle_name: "Created", last_name: "SPM", phone: "", role: "spm", scope: { disciplines: [discipline] }, password: "Temp@12345678" }) })
    assert.ok([200, 201].includes(created.status), `account created (${created.status})`)
    const createdData = (await created.json()).data
    const id = createdData.id
    // The sign-in email is generated from the new staff ID, not typed.
    const email = createdData.email
    assert.match(email, /^n\.spm\.\d{5,}@10builders\.com$/)
    assert.equal((await db.query("select status from users where id=$1", [id])).rows[0].status, "invited")

    const expiry = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    const saved = await call("PUT", `/accounts/${id}/workspace`, { token: admin, headers: json, body: JSON.stringify({
      docs: [], license: "PRC-NEW-1", expiry }) })
    assert.equal(saved.status, 200)

    const forAdmin = await notices(admin)
    assert.ok(forAdmin.some((n) => n.title === "PRC license expiring soon" && n.detail.includes("Newly Created SPM") && n.detail.includes(expiry)))
    const spm = await signIn(email, "Temp@12345678")
    assert.ok(spm.token, "the invited account can sign in")
    const forSpm = await notices(spm.token)
    assert.ok(forSpm.some((n) => n.title === "PRC license expiring soon" && n.detail.includes(expiry)), "the Site PM sees their own reminder")

    await call("PUT", `/accounts/${id}/workspace`, { token: admin, headers: json, body: JSON.stringify({ docs: [], license: "PRC-NEW-1", expiry }) })
    const again = (await db.query("select count(*)::int as n from activity_log where anchor_reference like $1", [`license:${id}:expiring_soon:%`])).rows[0].n
    assert.equal(again, 1, "saving the same license again does not repeat the reminder")
  })

  await t.test("repeated failed sign-ins are rate limited", async () => {
    let last
    const remaining = 10 - failedSignIns
    for (let i = 0; i < remaining; i++) last = (await signIn("nobody@10builders.com", "wrong-password")).response.status
    assert.equal(last, 401)
    const blocked = await signIn("nobody@10builders.com", "wrong-password")
    assert.equal(blocked.response.status, 429)
    assert.ok(Number(blocked.response.headers.get("retry-after")) > 0)
  })
})

test("document folder names cannot leave the uploads directory", async () => {
  const { safeDocType } = await import("../Thesis-Backend/src/common/utilities/upload.utility.js")
  assert.equal(safeDocType("License Doc"), "license_doc")
  assert.equal(safeDocType("license"), "license")
  for (const hostile of ["../../etc", "..\\..\\x", "a/b", "/abs", "x".repeat(41), "", undefined, null, ["license"], { a: 1 }]) {
    assert.equal(safeDocType(hostile), "unknown", `hostile value ${JSON.stringify(hostile)}`)
  }
})
