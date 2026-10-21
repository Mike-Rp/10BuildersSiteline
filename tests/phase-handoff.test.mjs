import assert from "node:assert/strict"
import test from "node:test"
import { phaseHandoff } from "../src/phase-handoff.ts"
import { sendApiWorkflow } from "../src/api/actions.ts"
import { setApiBase } from "../src/api/client.ts"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

const actor = { id: "office", role: "opm" }
const project = () => ({ id: "p", phase: "Mobilization", status: "active", opmId: "office", opmAccepted: true,
  progress: 100, history: [{ progress: 100 }],
  team: [{ phase: "Mobilization", sequence: 0 }, { phase: "Design", sequence: 1 }],
  verifiedProgress: { phases: [{ name: "Mobilization", earned: 30, total: 30, percentage: 100, reason: null }] } })

test("handoff uses verified phase totals and ownership, never legacy percentage or history", () => {
  const p = project()
  assert.equal(phaseHandoff(p, actor).next, "Design")
  for (const role of ["admin", "spm", "client"]) assert.equal(phaseHandoff(p, { ...actor, role }).authorized, false)
  assert.equal(phaseHandoff(p, { ...actor, id: "other" }).authorized, false)
  for (const totals of [undefined, { earned: 20, total: 30, percentage: 100 }, { earned: null, total: null, percentage: null }]) {
    p.verifiedProgress = totals ? { phases: [{ name: p.phase, ...totals }] } : undefined
    assert.equal(phaseHandoff(p, actor).complete, false)
  }
  for (const names of [["Mobilization", "Structure"], ["Mobilization", "Podium Structure"]]) {
    const typed = project(); typed.team = names.map((phase, sequence) => ({ phase, sequence }))
    assert.equal(phaseHandoff(typed, actor).next, names[1])
  }
  p.phase = "Design"
  assert.equal(phaseHandoff(p, actor).final, true)
  assert.equal(phaseHandoff(p, actor).next, undefined)
})

test("handoff command calls the dedicated endpoint and preserves local evidence/history", async () => {
  const previous = globalThis.fetch
  const p = project(), before = structuredClone(p), calls = []
  setApiBase("http://127.0.0.1:3000/api/v1")
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ data: { current_stage: "Design" } }), { status: 200 })
  }
  try {
    const result = await sendApiWorkflow({ projects: [p] }, actor, { type: "advance_phase", projectId: p.id })
    assert.equal(result.current_stage, "Design")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "http://127.0.0.1:3000/api/v1/projects/p/advance-phase")
    assert.equal(calls[0].init.method, "POST")
    assert.deepEqual(JSON.parse(calls[0].init.body), {})
    assert.deepEqual(p, before)
    await assert.rejects(sendApiWorkflow({ projects: [p] }, { ...actor, role: "spm" }, { type: "advance_phase", projectId: p.id }), /ownership/)
    assert.equal(calls.length, 1)
  } finally { globalThis.fetch = previous }
})

test("Office PM confirms handoff, prevents duplicate requests, and sees server blockers", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: PhaseHandoff } = await server.ssrLoadModule("/src/PhaseHandoff.tsx")
    const p = project()
    let calls = 0, finish
    const command = () => { calls++; return new Promise(resolve => { finish = resolve }) }
    await act(async () => root.render(React.createElement(PhaseHandoff, { project: p, actor, onCommand: command })))
    const button = text => [...document.querySelectorAll("button")].find(b => b.textContent === text)
    await act(async () => button("Activate Design").click())
    assert.equal(calls, 0)
    await act(async () => { button("Confirm activation of Design").click(); button("Confirm activation of Design")?.click() })
    assert.equal(calls, 1)
    assert.equal(p.phase, "Mobilization")
    await act(async () => finish({ ok: false, error: "The next phase SPM must confirm their assignment." }))
    assert.match(document.querySelector('[role="alert"]').textContent, /SPM must confirm/)
    await act(async () => button("Activate Design").click())
    await act(async () => button("Confirm activation of Design").click())
    await act(async () => {
      p.phase = "Design"
      finish({ ok: true, message: "Design activated." })
      root.render(React.createElement(PhaseHandoff, { project: p, actor, onCommand: command }))
    })
    assert.match(document.querySelector('[role="status"]').textContent, /Design activated/)
    assert.equal(button("Activate Design"), undefined)
  } finally {
    await act(async () => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  }
})
