import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"
import { buildState } from "../src/api/adapter.ts"
import {
  apiEnabled,
  login,
  setApiBase,
  setToken,
  getToken,
} from "../src/api/client.ts"
import { loadState } from "../src/api/load.ts"
import { recordedProgress } from "../src/progress.ts"

test("a new workspace and an empty backend response contain no demo records", () => {
  const first = emptyState(),
    second = emptyState()
  for (const key of ["accounts", "projects", "companies", "events"]) {
    assert.deepEqual(first[key], [])
    assert.notEqual(first[key], second[key])
  }
  const loaded = buildState({
    me: { id: "db-admin", role: "admin" },
    accounts: [],
    projects: [],
    companies: [],
    events: [],
  })
  for (const key of ["accounts", "projects", "companies", "events"])
    assert.deepEqual(loaded[key], [])
  assert.equal(apiEnabled, true)
})

test("loading an empty database returns only the authenticated database account", async (t) => {
  setApiBase("http://database-test/api/v1")
  setToken("")
  const requested = []
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname
    requested.push(path)
    if (path === "/api/v1/accounts/db-admin")
      return Response.json({
        data: { full_name: "Database Administrator", status: "active" },
      })
    return Response.json({ data: [] })
  })
  const state = await loadState({
    id: "db-admin",
    role: "admin",
    full_name: "Database Administrator",
    email: "admin@database.example",
  })
  assert.deepEqual(
    state.accounts.map((a) => [a.id, a.name]),
    [["db-admin", "Database Administrator"]],
  )
  assert.deepEqual(state.projects, [])
  assert.deepEqual(state.companies, [])
  assert.deepEqual(state.events, [])
  assert.ok(requested.includes("/api/v1/workspace/project-data"))
  assert.ok(requested.includes("/api/v1/accounts"))
})

test("an unavailable backend rejects login and data loading instead of returning fixtures", async (t) => {
  setApiBase("http://database-test/api/v1")
  setToken("")
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline")
  })
  await assert.rejects(login("Admin", "Password"), /Cannot reach the server/)
  await assert.rejects(
    loadState({ id: "db-admin", role: "admin" }),
    /Cannot reach the server/,
  )
  assert.equal(getToken(), "")
})

test("staff can load real project data when automatic handoff reconciliation fails", async (t) => {
  setApiBase("http://database-test/api/v1")
  setToken("")
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith("/reconcile-phase-handoffs")) return Response.json({ message: "Handoff check unavailable" }, { status: 503 })
    if (path.endsWith("/project-data")) {
      const list = { id: "live-site", name: "Active site", project_type: "Residential", lifecycle_status: "active" }
      return Response.json({ data: [{ list, detail: list, documents: [], history: [], photos: [], notes: [], assignments: [], contracts: [] }] })
    }
    if (path.endsWith("/workspace")) return Response.json({ data: {} })
    return Response.json({ data: [] })
  })
  const state = await loadState({ id: "db-admin", role: "admin" })
  assert.deepEqual(state.projects.map(project => project.id), ["live-site"])
})

test("staff phase rosters resolve supporting engineers from scoped responsibility records", async (t) => {
  setApiBase("http://database-test/api/v1")
  setToken("")
  const list = { id: "site", name: "Roster test", project_type: "Residential", lifecycle_status: "active" }
  const assignments = [
    { id: 1, project_id: "site", phase: "Design", user_id: "lead", full_name: "Lead Engineer", status: "confirmed" },
    { id: 2, project_id: "site", phase: "Design", user_id: "peer", full_name: "Supporting Engineer", status: "pending" },
    { id: 3, project_id: "other-site", phase: "Design", user_id: "foreign", full_name: "Other Engineer", status: "pending" },
    { id: 4, project_id: "site", phase: "Design", user_id: "released", full_name: "Former Engineer", status: "released" },
  ]
  t.mock.method(globalThis, "fetch", async url => {
    const path = new URL(url).pathname
    if (path.endsWith("/project-data")) return Response.json({ data: [{ list, detail: { ...list,
      phase_team: [{ stage: "Design", spm_user_id: "lead", spm_name: "Lead Engineer", status: "confirmed" }] },
      documents: [], history: [], photos: [], notes: [], assignments: [], contracts: [] }] })
    if (path.endsWith("/workspace")) return Response.json({ data: { multiEngineerAllocationAvailable: true, engineerResponsibilities: assignments } })
    if (path.endsWith("/licenses/me")) return Response.json({ data: { status: "valid" } })
    return Response.json({ data: [] })
  })
  for (const role of ["admin", "opm", "spm"]) {
    const state = await loadState({ id: "viewer", role })
    const engineers = state.projects[0].team[0].engineers
    assert.deepEqual(engineers.map(engineer => state.accounts.find(account => account.id === engineer.accountId)?.name),
      ["Lead Engineer", "Supporting Engineer"], role)
    assert.equal(state.accounts.some(account => ["foreign", "released"].includes(account.id)), false)
  }
})

test("legacy shortcut credentials go to the server and cannot bypass a rejected login", async (t) => {
  setApiBase("http://database-test/api/v1")
  setToken("")
  let submitted
  t.mock.method(globalThis, "fetch", async (url, init) => {
    submitted = {
      path: new URL(url).pathname,
      method: init.method,
      body: JSON.parse(init.body),
    }
    return Response.json({ message: "Invalid credentials" }, { status: 401 })
  })
  await assert.rejects(login("Admin", "Password"), /Invalid credentials/)
  assert.deepEqual(submitted, {
    path: "/api/v1/auth/login",
    method: "POST",
    body: { email: "Admin", password: "Password" },
  })
  assert.equal(getToken(), "")
})

test("progress charts preserve saved observations, including decreases after rework", () => {
  const history = [
    { date: "2026-10-03", progress: 40 },
    { date: "2026-10-01", progress: 20 },
    { date: "2026-10-02", progress: 60 },
    { date: "invalid", progress: 10 },
    { date: "2026-10-04", progress: 110 },
    { date: "2026-10-05", progress: NaN },
  ]
  const before = structuredClone(history)
  const points = recordedProgress({ history })
  assert.deepEqual(
    points.map((p) => p.progress),
    [20, 60, 40],
  )
  assert.deepEqual(history, before)
  assert.deepEqual(recordedProgress({ history: [] }), [])
  assert.equal(recordedProgress({ history: history.slice(0, 1) }).length, 1)
})
