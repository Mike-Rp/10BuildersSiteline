import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "../src/model.ts"
import { officePmStage } from "../src/workflows.ts"
import { activeFixture, currentProject, evidence, execute } from "./fixtures.mjs"

const stage = (state) => officePmStage(currentProject(state))
const upload = (state, count) => {
  for (let i = 0; i < count; i++)
    state = execute(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: evidence(`required-${i}.png`),
    })
  return state
}

test("only steps the Office PM can act on are marked as action, and the emphasis moves on", () => {
  let state = initialState()
  assert.deepEqual(stage(state), {
    kind: "action",
    reason: "confirm",
    message: "Office PM confirmation required",
  })
  state = execute(state, "a2", { type: "accept_opm" })
  assert.deepEqual(stage(state), {
    kind: "action",
    reason: "documents",
    message: "0/6 required documents uploaded",
  })
  state = upload(state, 3)
  assert.equal(stage(state).message, "3/6 required documents uploaded")
  assert.equal(stage(state).kind, "action")

  let done = execute(initialState(), "a2", { type: "accept_opm" })
  done = upload(done, 6)
  assert.deepEqual(stage(done), {
    kind: "waiting",
    message: "Waiting for Lead Site PM response",
  })
  done = execute(done, "a4", { type: "accept_assignment" })
  assert.deepEqual(stage(done), {
    kind: "waiting",
    message: "Waiting for Site PM responses",
  })
  done = execute(done, "a5", { type: "accept_assignment" })
  assert.deepEqual(stage(done), {
    kind: "waiting",
    message: "Waiting for subcontractor allocation",
  })
})

test("a declined phase needs Office PM reassignment, and finished projects are not actionable", () => {
  let state = execute(initialState(), "a2", { type: "accept_opm" })
  state = upload(state, 6)
  state = execute(state, "a4", { type: "accept_assignment" })
  state = execute(state, "a5", { type: "decline_assignment", phase: "Design" })
  assert.equal(stage(state).kind, "action")
  assert.equal(stage(state).reason, "reassign")

  const active = officePmStage(currentProject(activeFixture()))
  assert.equal(active.kind, "complete")
  const other = initialState().projects.find((p) => p.status === "changes_requested")
  assert.equal(officePmStage(other).kind, "waiting")
})
