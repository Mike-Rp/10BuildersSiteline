import test from "node:test"
import assert from "node:assert/strict"
import { teamConfirmed, phaseEngineerSummary, waitingLabel } from "../src/workflows.ts"

const engineer = (accountId, status) => ({ accountId, assignedDisciplines: ["Electrical"], status })

test("a phase with several engineers is ready only when every engineer has confirmed", () => {
  const phase = (engineers) => ({ phase: "MEP Rough-In", accountId: "a", status: "confirmed", engineers })
  const one = { team: [phase([engineer("a", "confirmed"), engineer("b", "pending")])] }
  assert.equal(teamConfirmed(one), false, "the recorded phase owner confirming is not enough")
  const all = { team: [phase([engineer("a", "confirmed"), engineer("b", "confirmed")])] }
  assert.equal(teamConfirmed(all), true)
  assert.equal(teamConfirmed({ team: [{ phase: "Design", accountId: "a", status: "confirmed" }] }), true, "single-engineer phases are unchanged")
})

test("phase summary reports how many engineers are still outstanding", () => {
  const row = { phase: "MEP Rough-In", accountId: "a", status: "confirmed", engineers: [engineer("a", "confirmed"), engineer("b", "pending"), engineer("c", "pending")] }
  const summary = phaseEngineerSummary(row)
  assert.deepEqual([summary.multiple, summary.total, summary.confirmed, summary.waiting, summary.status], [true, 3, 1, 2, "pending"])
  assert.equal(waitingLabel(1), "1 more awaiting confirmation")
  assert.equal(waitingLabel(2), "2 more awaiting confirmation")
  assert.equal(phaseEngineerSummary({ phase: "Design", accountId: "a", status: "pending" }).multiple, false)
})
