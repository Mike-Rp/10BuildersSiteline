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
