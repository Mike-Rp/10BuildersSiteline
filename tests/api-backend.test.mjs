// End to end: the Supabase schema + demo data in an in-process Postgres, the real
// Thesis-Backend (Express) in front of it, and the frontend's own login/loader.
// Skipped when the sibling "SITELINE Backend/Thesis-Backend" folder is missing.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { login, setApiBase, setToken, api, downloadApiFile } from "../src/api/client.ts"
import { loadState } from "../src/api/load.ts"

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const backend = here("../../SITELINE Backend/Thesis-Backend/")
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
  const dummySql = fs.readFileSync(dummy, "utf8")
  await db.exec(dummySql)
  await db.exec(dummySql) // the demo data can be loaded again

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
    assert.ok(rosaria.workflow.pendingUpdate)
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
      "Alden Heights Residences — Tower B", "Brookfield Warehouse Ext.", "Cavite Cold Storage Facility", "Sto. Niño Bridge Widening",
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

  await t.test("the API refuses requests without a session", async () => {
    setToken("")
    await assert.rejects(api("/projects"), /token/i)
  })
})
