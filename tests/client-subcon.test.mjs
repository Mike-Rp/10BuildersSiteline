import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "../src/model.ts"
import { activationChecks, resolveClientSubconIssue } from "../src/workflows.ts"
import { currentProject, evidence, execute, NOW } from "./fixtures.mjs"

function ready() {
  const base = initialState()
  const p = base.projects.find((x) => x.id === "p4")
  p.clientSubcon = "Aurora Facade Works"
  p.clientSubconEmail = "ops@aurora.example"
  p.docs = p.docs.filter((d) => d.label !== "Client & Subcontractor Agreement")
  p.docs.push({
    ...evidence("agreement.pdf"),
    label: "Client & Subcontractor Agreement",
    owner: "Administrator",
  })
  let state = execute(base, "a2", { type: "accept_opm" })
  for (let i = 0; i < 6; i++)
    state = execute(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: evidence(`r-${i}.png`),
    })
  state = execute(state, "a4", { type: "accept_assignment" })
  return execute(state, "a5", { type: "accept_assignment" })
}
const sub = (s) => currentProject(s).clientSubconReview

test("only the Lead acknowledges, once, and records name and time", () => {
  const state = ready()
  assert.throws(
    () => execute(state, "a5", { type: "acknowledge_client_subcon" }),
    /Lead Site PM/,
  )
  const done = execute(state, "a4", { type: "acknowledge_client_subcon" })

  assert.ok(sub(done).acknowledgedBy)
  assert.equal(sub(done).acknowledgedAt, new Date(NOW).toISOString())
  assert.throws(
    () => execute(done, "a4", { type: "acknowledge_client_subcon" }),
    /already acknowledged/,
  )
  assert.equal(currentProject(done).clientSubcon, "Aurora Facade Works")
  assert.equal("clientSubconTrade" in currentProject(done), false)
})

test("acknowledgment is review only and unlocks the agreement step", () => {
  const state = ready()
  assert.equal(
    activationChecks(state, currentProject(state)).find(
      (c) => c.id === "subcontractors",
    ).passed,
    false,
  )
  const done = execute(state, "a4", { type: "acknowledge_client_subcon" })
  assert.equal(
    activationChecks(done, currentProject(done)).find(
      (c) => c.id === "subcontractors",
    ).passed,
    true,
  )
  assert.equal(
    activationChecks(done, currentProject(done)).filter((c) => c.passed).length,
    5,
  )
  assert.throws(
    () =>
      execute(done, "a4", {
        type: "upload_agreement",
        doc: evidence("signed.png"),
      }),
    /No second agreement upload/,
  )
  assert.throws(
    () => execute(state, "a4", { type: "activate_project" }),
    /prerequisites are incomplete/,
  )
  assert.throws(
    () => execute(done, "a5", { type: "activate_project" }),
    /Lead Site PM/,
  )
  const active = execute(done, "a4", { type: "activate_project" })
  const p = currentProject(active)
  assert.equal(p.status, "active")
  assert.equal(p.phase, "Mobilization")
  assert.equal(p.progress, 0)
  assert.equal(p.workflow.activation.byId, "a4")
  assert.equal(p.workflow.activation.at, new Date(NOW).toISOString())
  assert.throws(
    () => execute(active, "a4", { type: "activate_project" }),
    /already activated/,
  )
})

test("reported issue notifies Admin, holds acknowledgment until resolved", () => {
  const state = ready()
  assert.throws(
    () =>
      execute(state, "a4", { type: "report_client_subcon_issue", note: "bad" }),
    /at least 10 characters/,
  )
  const held = execute(state, "a4", {
    type: "report_client_subcon_issue",
    note: "Company email does not match the agreement.",
  })
  const admins = held.accounts
    .filter((a) => a.role === "admin")
    .map((a) => a.id)
  const notice = held.events[0]
  assert.match(notice.title, /issue reported/)
  assert.ok(admins.every((id) => notice.recipientIds.includes(id)))
  assert.throws(
    () => execute(held, "a4", { type: "acknowledge_client_subcon" }),
    /on hold/,
  )
  assert.throws(
    () =>
      resolveClientSubconIssue(
        held,
        "a4",
        "p4",
        sub(held).issues[0].id,
        "Corrected the email.",
      ),
    /Administrator/,
  )
  const fixed = resolveClientSubconIssue(
    held,
    admins[0],
    "p4",
    sub(held).issues[0].id,
    "Corrected the email on file.",
  )
  const done = execute(fixed, "a4", { type: "acknowledge_client_subcon" })
  assert.ok(sub(done).acknowledgedAt)
})

test("allocation commands are blocked for client-provided subcontractors", () => {
  const state = ready()
  for (const type of ["select_company", "contact_company", "archive_company"])
    assert.throws(
      () => execute(state, "a4", { type, companyId: "c1" }),
      /client-provided subcontractor/,
    )
})
