import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"
import {
  activationChecks,
  applyWorkflow,
  projectSubcontractor,
  subcontractorRecommendations,
  workflowFor,
} from "../src/workflows.ts"
import {
  NOW,
  activeFixture,
  currentProject,
  evidence,
  execute,
  suggestedCompanyId,
} from "./fixtures.mjs"

const IN_PROGRESS = /already has a subcontractor in progress/
const LOCKED = /already accepted this project/
const DECLINED = /declined this project and cannot be contacted again/

function teamReady() {
  let state = execute(initialState(), "a2", { type: "accept_opm" })
  for (let i = 0; i < 6; i++)
    state = execute(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: evidence(`required-${i}.png`),
    })
  state = execute(state, "a4", { type: "accept_assignment" })
  return execute(state, "a5", { type: "accept_assignment" })
}
const contact = (state, companyId, actor = "a4") =>
  execute(state, actor, { type: "contact_company", companyId })
const respond = (state, companyId, accepted, actor = "a4") =>
  execute(state, actor, { type: "respond_company", companyId, accepted })
// Any two distinct approved companies.
const approved = (state) =>
  subcontractorRecommendations(state, currentProject(state)).map(
    (r) => r.company.id,
  )

test("the system only suggests: no company is pre-selected, and contact selects and logs in one step", () => {
  let state = teamReady()
  assert.equal(workflowFor(currentProject(state)).selections.length, 0)
  const [first] = approved(state)
  state = contact(state, first)
  const rows = workflowFor(currentProject(state)).selections
  assert.equal(rows.length, 1)
  assert.equal(rows[0].companyId, first)
  assert.equal(rows[0].status, "contacted")
  assert.equal(rows[0].contactLog.length, 1)
  assert.equal(projectSubcontractor(currentProject(state)).companyId, first)
})

test("contacting the same company again logs another attempt without a second selection", () => {
  let state = teamReady()
  const [first] = approved(state)
  state = contact(state, first)
  state = execute(
    state,
    "a4",
    { type: "contact_company", companyId: first },
    NOW + 60_000,
  )
  const rows = workflowFor(currentProject(state)).selections
  assert.equal(rows.length, 1)
  assert.equal(rows[0].contactLog.length, 2)
})

test("contacting a second company while one awaits a reply is rejected", () => {
  let state = teamReady()
  const [first, second] = approved(state)
  state = contact(state, first)
  const snapshot = JSON.stringify(state)
  assert.throws(() => contact(state, second), IN_PROGRESS)
  assert.throws(
    () => execute(state, "a4", { type: "select_company", companyId: second }),
    IN_PROGRESS,
  )
  assert.throws(
    () =>
      execute(state, "a4", {
        type: "replace_company",
        companyId: first,
        replacementCompanyId: second,
      }),
    IN_PROGRESS,
  )
  assert.equal(JSON.stringify(state), snapshot)
})

test("after a decline another company can be contacted, but the declined one never again", () => {
  let state = teamReady()
  const [first, second] = approved(state)
  state = respond(contact(state, first), first, false)
  const declined = workflowFor(currentProject(state)).selections.find(
    (s) => s.companyId === first,
  )
  assert.equal(declined.status, "declined")
  assert.ok(declined.responseAt)
  assert.equal(projectSubcontractor(currentProject(state)), undefined)
  assert.throws(() => contact(state, first), DECLINED)
  assert.throws(
    () => execute(state, "a4", { type: "select_company", companyId: first }),
    DECLINED,
  )
  state = contact(state, second)
  const rows = workflowFor(currentProject(state)).selections
  assert.deepEqual(
    rows.map((s) => [s.companyId, s.status]),
    [
      [first, "declined"],
      [second, "contacted"],
    ],
  )
  // The declined record is kept as history.
  assert.ok(rows.find((s) => s.companyId === first))
})

test("after an accept, any contact, selection or replacement is rejected", () => {
  let state = teamReady()
  const [first, second] = approved(state)
  state = respond(contact(state, first), first, true)
  const snapshot = JSON.stringify(state)
  assert.throws(() => contact(state, second), LOCKED)
  assert.throws(() => contact(state, first), /locked/)
  assert.throws(
    () => execute(state, "a4", { type: "select_company", companyId: second }),
    LOCKED,
  )
  assert.throws(
    () =>
      execute(state, "a4", {
        type: "replace_company",
        companyId: first,
        replacementCompanyId: second,
      }),
    /Accepted subcontractors cannot be swapped/,
  )
  assert.throws(
    () =>
      execute(state, "a4", {
        type: "replace_company",
        companyId: second,
        replacementCompanyId: first,
      }),
    /./,
  )
  assert.equal(JSON.stringify(state), snapshot)
})

test("only the project's Lead Site PM can contact or record a response", () => {
  let state = teamReady()
  const [first] = approved(state)
  assert.throws(() => contact(state, first, "a5"), /Lead Site PM/)
  state = contact(state, first)
  assert.throws(() => respond(state, first, true, "a5"), /Lead Site PM/)
  assert.throws(() => respond(state, first, true, "a2"), /Lead Site PM|Site PM/)
})

test("a contacted company cannot be archived to dodge recording a response", () => {
  let state = teamReady()
  const [first] = approved(state)
  state = contact(state, first)
  assert.throws(
    () => execute(state, "a4", { type: "archive_company", companyId: first }),
    IN_PROGRESS,
  )
})

test("activation passes with one accepted company plus the signed agreement", () => {
  const state = activeFixture()
  assert.equal(currentProject(state).status, "active")
  assert.ok(
    activationChecks(state, currentProject(state)).every((c) => c.passed),
  )
  const accepted = workflowFor(currentProject(state)).selections.filter(
    (s) => s.status === "accepted",
  )
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].companyId, suggestedCompanyId(initialState()))
})

test("a leftover un-actioned suggestion does not block consent or activation", () => {
  let state = teamReady()
  const [first, second] = approved(state)
  // Legacy/auto-style "selected" row for another company.
  state = execute(state, "a4", { type: "select_company", companyId: second })
  state = respond(contact(state, first), first, true)
  state = applyWorkflow(
    state,
    "a4",
    { projectId: "p4", type: "upload_agreement", doc: evidence("signed.png") },
    NOW,
  )
  assert.equal(currentProject(state).status, "active")
})

test("Office PM and client have no allocation authority: every allocation command is rejected", () => {
  let state = teamReady()
  const [first, second] = approved(state)
  state = contact(state, first)
  const snapshot = JSON.stringify(state)
  for (const actor of ["a2", "a9"]) {
    for (const command of [
      { type: "select_company", companyId: second },
      { type: "contact_company", companyId: second },
      { type: "respond_company", companyId: first, accepted: true },
      { type: "replace_company", companyId: first, replacementCompanyId: second },
      { type: "archive_company", companyId: first },
    ])
      assert.throws(() => execute(state, actor, command), /./, `${actor} ${command.type}`)
  }
  assert.equal(JSON.stringify(state), snapshot)
})

test("the Lead can choose only Admin-verified companies; unverified ones only go through request_company", () => {
  const state = teamReady()
  const pending = state.companies.find((c) => c.status === "pending").id
  assert.ok(pending)
  assert.ok(!approved(state).includes(pending))
  assert.throws(() => contact(state, pending), /approved/)
  assert.throws(
    () => execute(state, "a4", { type: "select_company", companyId: pending }),
    /approved/,
  )
})

test("the Office PM allocation view is read-only: the component renders no actions", async () => {
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(
    new URL("../src/LeadSubcontractorPanel.tsx", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n")
  const start = src.indexOf("export function SubcontractorAllocationReadOnly")
  const end = src.indexOf("export default function LeadSubcontractorPanel")
  assert.ok(start > 0 && end > start)
  const body = src.slice(start, end)
  assert.doesNotMatch(body, /<Button|onClick|onAction|command\(/)
})
