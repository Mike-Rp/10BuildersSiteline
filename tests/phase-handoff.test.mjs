import assert from "node:assert/strict"
import test from "node:test"
import { phaseHandoff } from "../src/phase-handoff.ts"
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

test("handoff displays blockers for staff with no manual Activate control", async () => {
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
    p.handoffBlocker = "The next phase SPM must confirm their assignment."
    for (const role of ["opm", "spm"]) {
      await act(async () => root.render(React.createElement(PhaseHandoff, { project: p, actor: { ...actor, role } })))
      assert.match(document.querySelector('[role="status"]').textContent, /SPM must confirm/)
      assert.ok(![...document.querySelectorAll("button")].some(button => /activate|confirm activation/i.test(button.textContent)))
    }
    p.phase = "Design"
    await act(async () => root.render(React.createElement(PhaseHandoff, { project: p, actor })))
    assert.equal(document.querySelector('[aria-label="Automatic phase handoff"]'), null)
  } finally {
    await act(async () => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  }
})
