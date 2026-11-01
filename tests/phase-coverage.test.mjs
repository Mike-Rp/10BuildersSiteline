// Readiness UI: phase coverage is measured against the project type workflow, not the saved rows.
import assert from "node:assert/strict"
import test from "node:test"
import { phaseDefinitions } from "../src/model.ts"
import { teamCoverage, teamCoverageGaps } from "../src/workflows.ts"

const confirmed = (phase) => ({ phase, accountId: "a4", status: "confirmed" })

test("four-of-nine Commercial team is reported as missing five phases", () => {
  const p = { type: "Commercial", team: ["Mobilization", "Design", "Fit-Out / Finishes", "Closeout"].map(confirmed) }
  assert.deepEqual(teamCoverage(p).missing, ["Foundation", "Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety"])
  assert.ok(teamCoverageGaps(p)[0].startsWith("Missing: Foundation"))
})

test("duplicates and extras never conceal a missing phase", () => {
  const names = phaseDefinitions("Commercial").map((d) => d.name)
  const team = [...names.slice(0, 8), "Design", "Landscape & Site Works"].map(confirmed)
  const c = teamCoverage({ type: "Commercial", team })
  assert.deepEqual(c.missing, ["Closeout"])
  assert.deepEqual(c.duplicate, ["Design"])
  assert.deepEqual(c.extra, ["Landscape & Site Works"])
})

test("unassigned and unconfirmed phases are named; a complete team has no gaps", () => {
  const names = phaseDefinitions("Mixed-Use").map((d) => d.name)
  assert.equal(names.length, 12)
  const team = names.map(confirmed)
  assert.deepEqual(teamCoverageGaps({ type: "Mixed-Use", team }), [])
  team[3] = { phase: names[3], accountId: "", status: "pending" }
  team[4] = { phase: names[4], accountId: "a5", status: "pending" }
  const c = teamCoverage({ type: "Mixed-Use", team })
  assert.deepEqual(c.unassigned, ["Podium Structure"])
  assert.deepEqual(c.unconfirmed, ["Tower Structure"])
})
