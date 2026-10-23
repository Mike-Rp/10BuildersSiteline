// Rejecting an ordinary progress report: the request, the required reason, refresh on success, and failure handling.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { setApiBase, setToken } from "../src/api/client.ts"
import { sendApiWorkflow } from "../src/api/actions.ts"
import { createReportRejecter, isAlreadyResolved, validateRejectReason, REJECT_REASON_REQUIRED } from "../src/reportReject.ts"
import { LICENSE_COMMANDS, applyWorkflow } from "../src/workflows.ts"
import { initialState } from "./fixtures/demo-state.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")

// A recording stand-in for fetch.
function fakeFetch(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace("http://api.test/api/v1", "")
    const call = { method: init.method || "GET", path, body: init.body ? JSON.parse(init.body) : undefined }
    calls.push(call)
    const { status = 200, body = {} } = (await handler(call)) || {}
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }
  return { calls, restore: () => (globalThis.fetch = original) }
}
setApiBase("http://api.test/api/v1")
setToken("test-token")

const actor = { id: "opm-1", role: "opm", name: "Office PM" }
const stateWithPending = () => ({ projects: [{ id: "p1", name: "Rosaria", workflow: { pendingUpdate: { id: 77, version: 3 } } }] })
const command = (note) => ({ type: "reject_update", projectId: "p1", expectedVersion: 3, note })

test("rejecting a report posts the reason to the report's own reject endpoint, and nothing else", async () => {
  const net = fakeFetch(() => ({ body: { data: { id: 77, status: "rejected" } } }))
  try {
    await sendApiWorkflow(stateWithPending(), actor, command("  Photos do not match the stated progress  "))
    assert.equal(net.calls.length, 1, "one request only: no evidence, rework or phase call")
    assert.deepEqual(net.calls[0], {
      method: "POST",
      path: "/projects/p1/phase-updates/77/reject",
      body: { resolution_note: "Photos do not match the stated progress" },
    })
  } finally {
    net.restore()
  }
})

test("a blank reason is refused before any request is made", async () => {
  const net = fakeFetch(() => ({}))
  try {
    for (const note of [undefined, "", "   ", "\n\t"])
      await assert.rejects(sendApiWorkflow(stateWithPending(), actor, command(note)), /reason for rejecting/i)
    assert.equal(net.calls.length, 0)
  } finally {
    net.restore()
  }
  assert.deepEqual(validateRejectReason("   "), { ok: false, error: REJECT_REASON_REQUIRED })
  assert.deepEqual(validateRejectReason("  Needs a clearer photo "), { ok: true, reason: "Needs a clearer photo" })
})

test("a report that is no longer pending cannot be rejected", async () => {
  const net = fakeFetch(() => ({}))
  try {
    await assert.rejects(sendApiWorkflow({ projects: [{ id: "p1", name: "X", workflow: {} }] }, actor, command("Reason")), /No pending phase update/)
    assert.equal(net.calls.length, 0)
  } finally {
    net.restore()
  }
})

test("server errors, including an already-resolved report, come back as readable messages", async () => {
  const net = fakeFetch(() => ({ status: 409, body: { message: "Update is already approved." } }))
  try {
    await assert.rejects(sendApiWorkflow(stateWithPending(), actor, command("Reason")), /already approved/)
  } finally {
    net.restore()
  }
  const forbidden = fakeFetch(() => ({ status: 403, body: { message: "Office PM confirmation is required." } }))
  try {
    await assert.rejects(sendApiWorkflow(stateWithPending(), actor, command("Reason")), /Office PM confirmation is required/)
  } finally {
    forbidden.restore()
  }
  assert.equal(isAlreadyResolved("Update is already approved."), true)
  assert.equal(isAlreadyResolved("This progress submission changed. Refresh the queue."), true)
  assert.equal(isAlreadyResolved("Cannot reach the server."), false)
})

test("the dialog's submit handler validates, reports each outcome and sends one request for repeated clicks", async () => {
  const sent = []
  let release
  const slow = createReportRejecter((reason) => {
    sent.push(reason)
    return new Promise((resolve) => (release = () => resolve({ ok: true })))
  })
  assert.deepEqual(await slow("   "), { status: "invalid", message: REJECT_REASON_REQUIRED })
  assert.equal(sent.length, 0)
  const first = slow("Too vague")
  const second = slow("Too vague")
  const third = slow("Too vague")
  assert.strictEqual(first, second)
  assert.strictEqual(second, third)
  release()
  assert.deepEqual(await first, { status: "done" })
  assert.deepEqual(sent, ["Too vague"], "three clicks, one request")

  const failing = createReportRejecter(async () => ({ ok: false, error: "Cannot reach the server." }))
  assert.deepEqual(await failing("Reason"), { status: "error", message: "Cannot reach the server." })
  const stale = createReportRejecter(async () => ({ ok: false, error: "Update is already rejected." }))
  assert.equal((await stale("Reason")).status, "stale")
  const throwing = createReportRejecter(async () => {
    throw new Error("boom")
  })
  assert.deepEqual(await throwing("Reason"), { status: "error", message: "boom" })
  // After a failure the button works again.
  let attempts = 0
  const retry = createReportRejecter(async () => (++attempts === 1 ? { ok: false, error: "Try later" } : { ok: true }))
  assert.equal((await retry("Reason")).status, "error")
  assert.equal((await retry("Reason")).status, "done")
})

test("the review screen reloads the workspace after a successful rejection, and refreshes a stale queue", () => {
  const app = read("../src/App.tsx")
  // The shared command path reloads the workspace after every successful command.
  assert.match(app, /await sendApiWorkflow\(stateRef\.current,actor,command\)\s+await reloadWorkspace\(\)/)
  const screen = read("../src/RoleWorkspace.tsx")
  assert.match(screen, /type: "reject_update"/)
  assert.match(screen, /onStale=\{\(\) => void onReload\(\)\}/, "an already-resolved report refreshes the queue")
  assert.match(screen, /Reject report/)
})

test("rejecting a report keeps report decisions separate from checklist and rework decisions", () => {
  const state = initialState()
  const opm = state.accounts.find((a) => a.role === "opm" && a.status === "active")
  const project = state.projects.find((p) => p.opmId === opm.id && p.status === "active")
  const submitted = structuredClone(state)
  const target = submitted.projects.find((p) => p.id === project.id)
  target.workflow = { ...(target.workflow || { version: 0, responses: [], selections: [], checklist: {}, notes: [], photos: [] }),
    pendingUpdate: { id: "u1", version: 1, authorId: "x", submittedAt: new Date().toISOString(), note: "Slab poured", issues: [], requestedProgress: 70 } }
  const before = JSON.stringify([target.progress, target.phase, target.workflow.checklist])
  assert.throws(() => applyWorkflow(submitted, opm.id, { type: "reject_update", projectId: project.id, expectedVersion: 1, note: "  " }), /reason for rejecting/i)
  assert.throws(() => applyWorkflow(submitted, opm.id, { type: "reject_update", projectId: project.id, expectedVersion: 99, note: "No" }), /changed/i)
  const rejected = applyWorkflow(submitted, opm.id, { type: "reject_update", projectId: project.id, expectedVersion: 1, note: "Not enough detail" })
  const after = rejected.projects.find((p) => p.id === project.id)
  assert.equal(after.workflow.pendingUpdate, undefined, "the report is resolved")
  assert.equal(JSON.stringify([after.progress, after.phase, after.workflow.checklist]), before, "no credit, progress or phase change")
  assert.ok(after.history.some((h) => /Rejected by .*Not enough detail/.test(h.text) && h.clientVisible === false))
  assert.ok(LICENSE_COMMANDS.has("reject_update"), "an Office PM with an expired license is paused here too")
})
