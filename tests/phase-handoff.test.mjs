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
