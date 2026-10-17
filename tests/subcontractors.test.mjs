import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "../src/model.ts"
import {
  activationChecks,
  activeSubcontractors,
  applyWorkflow,
  consentComplete,
  subcontractorRecommendation,
  subcontractorRecommendations,
  workflowFor,
} from "../src/workflows.ts"

const NOW = Date.parse("2026-10-14T08:00:00Z")
const project = (state) => state.projects.find((p) => p.id === "p4")
const doc = (name) => ({
  id: crypto.randomUUID(),
  label: name,
  name: `${name}.png`,
  uploaded: true,
  owner: "Demo",
  size: 100,
  mime: "image/png",
  date: "2026-10-14",
  clientVisible: false,
})
const run = (state, command, actor = "a4") =>
  applyWorkflow(state, actor, { projectId: "p4", ...command }, NOW)
function teamReady(prepare = () => {}) {
  let state = initialState()
  prepare(state)
  state = run(state, { type: "accept_opm" }, "a2")
  for (let i = 0; i < 6; i++)
    state = run(
      state,
      { type: "upload_registered", docIndex: i, doc: doc(`required-${i}`) },
      "a2",
    )
  state = run(state, { type: "accept_assignment" })
  return run(state, { type: "accept_assignment" }, "a5")
}
function acceptedTeam() {
  let state = teamReady()
  const companyId = activeSubcontractors(project(state))[0].companyId
  state = run(state, { type: "contact_company", companyId })
  return run(state, { type: "respond_company", companyId, accepted: true })
}
test("recommendations use company commitments and available manpower only", () => {
  const state = initialState()
  const p = project(state)
  const meridian = subcontractorRecommendation(
    state,
    p,
    state.companies.find((c) => c.id === "c1"),
  )
  assert.equal(meridian.otherProjects, 1)
  assert.equal(meridian.availableManpower, 3)
  assert.equal("score" in meridian, false)
  assert.equal("coverage" in meridian, false)
  assert.ok(state.companies.every((company) => !("trade" in company)))
})
test("manpower document changes do not affect project-level recommendation ranking", () => {
  const state = initialState()
  const company = state.companies.find((c) => c.id === "c1")
  const before = subcontractorRecommendation(state, project(state), company)
  company.manpowerDocuments.push(doc("manpower-list"))
  const after = subcontractorRecommendation(state, project(state), company)
  assert.equal(after.availableManpower, before.availableManpower)
  assert.equal(after.otherProjects, before.otherProjects)
  assert.equal(after.committed, before.committed)
})
test("overlapping company commitments demote candidates and prevent automatic selection", () => {
  const state = teamReady((s) => {
    s.companies.find((c) => c.id === "c2").committedUntil = "2026-12-01"
    s.companies.find((c) => c.id === "c3").committedUntil = "2026-12-01"
  })
  const ranking = subcontractorRecommendations(state, project(state))
  assert.equal(ranking[0].company.id, "c1")
  assert.equal(activeSubcontractors(project(state))[0].companyId, "c1")
  assert.ok(
    ranking.find((candidate) => candidate.company.id === "c1")
      .availableManpower > 0,
  )
  assert.equal(
    ranking.find((candidate) => candidate.company.id === "c2").committed,
    true,
  )
  assert.equal(
    ranking.find((candidate) => candidate.company.id === "c3").committed,
    true,
  )
})
test("contact records a local attempt without recording a response, and a real decision is mandatory", () => {
  let state = teamReady()
  const companyId = activeSubcontractors(project(state))[0].companyId
  state = run(state, { type: "contact_company", companyId })
  const selection = activeSubcontractors(project(state))[0]
  assert.equal(selection.status, "contacted")
  assert.ok(selection.contactAt)
  assert.equal(selection.responseAt, undefined)
  assert.equal(consentComplete(state, project(state)), false)
  assert.match(state.events[0].detail, /no email/)
  assert.throws(
    () => run(state, { type: "respond_company", companyId }),
    /manually choose/i,
  )
})
test("accepted partners reject archiving and atomic replacement in the action layer", () => {
  const state = acceptedTeam()
  const companyId = activeSubcontractors(project(state))[0].companyId
  assert.ok(
    state.companies
      .find((company) => company.id === companyId)
      .activeProjectIds.includes("p4"),
  )
  const snapshot = JSON.stringify(state)
  assert.throws(
    () =>
      run(state, {
        type: "replace_company",
        companyId,
        replacementCompanyId: "c1",
      }),
    /Accepted subcontractors cannot be swapped/,
  )
  assert.throws(
    () => run(state, { type: "archive_company", companyId }),
    /cannot be archived/,
  )
  assert.throws(
    () => run(state, { type: "respond_company", companyId, accepted: false }),
    /locked/,
  )
  assert.equal(JSON.stringify(state), snapshot)
})
test("declined companies can be replaced, but the replacement needs fresh contact and acceptance", () => {
  let state = teamReady()
  const previous = activeSubcontractors(project(state))[0].companyId
  state = run(state, { type: "contact_company", companyId: previous })
  state = run(state, {
    type: "respond_company",
    companyId: previous,
    accepted: false,
  })
  assert.equal(activeSubcontractors(project(state)).length, 0)
  assert.equal(consentComplete(state, project(state)), false)
  state = run(state, {
    type: "replace_company",
    companyId: previous,
    replacementCompanyId: "c1",
  })
  const next = activeSubcontractors(project(state))[0]
  assert.equal(next.companyId, "c1")
  assert.equal(next.status, "selected")
  assert.equal(next.contactAt, undefined)
  assert.equal(next.responseAt, undefined)
  assert.equal(
    workflowFor(project(state)).selections.find((s) => s.companyId === previous)
      .status,
    "declined",
  )
  assert.equal(
    workflowFor(project(state)).selections.find((s) => s.companyId === previous)
      .replacedBy,
    "c1",
  )
  assert.throws(
    () =>
      run(state, { type: "respond_company", companyId: "c1", accepted: true }),
    /contact attempt/,
  )
  assert.throws(
    () => run(state, { type: "upload_agreement", doc: doc("agreement") }),
    /must be approved and accepted/,
  )
  state = run(state, { type: "contact_company", companyId: "c1" })
  state = run(state, {
    type: "respond_company",
    companyId: "c1",
    accepted: true,
  })
  assert.equal(consentComplete(state, project(state)), true)
})
test("replacing an unaccepted company is not falsely recorded as a subcontractor decline", () => {
  let state = teamReady()
  const previous = activeSubcontractors(project(state))[0].companyId
  state = run(state, {
    type: "replace_company",
    companyId: previous,
    replacementCompanyId: "c1",
  })
  const original = workflowFor(project(state)).selections.find(
    (s) => s.companyId === previous,
  )
  assert.equal(original.status, "replaced")
  assert.equal(original.responseAt, undefined)
  assert.equal(activeSubcontractors(project(state)).length, 1)
  assert.throws(
    () => run(state, { type: "contact_company", companyId: previous }),
    /Select a replacement/,
  )
})
test("archiving a proposed company retains its company record and project selection history", () => {
  const state = teamReady()
  const companyId = activeSubcontractors(project(state))[0].companyId
  const companyBefore = state.companies.find((c) => c.id === companyId)
  const archived = run(state, { type: "archive_company", companyId })
  const companyAfter = archived.companies.find((c) => c.id === companyId)
  const selection = workflowFor(project(archived)).selections.find(
    (s) => s.companyId === companyId,
  )

  assert.equal(activeSubcontractors(project(archived)).length, 0)
  assert.equal(selection.status, "archived")
  assert.ok(selection.archivedAt)
  assert.equal(selection.archivedBy, "a4")
  assert.equal(companyAfter.manpowerCount, companyBefore.manpowerCount)
  assert.deepEqual(
    companyAfter.manpowerDocuments,
    companyBefore.manpowerDocuments,
  )
  assert.deepEqual(companyAfter.documents, companyBefore.documents)
  assert.match(archived.events[0].title, /archived/)
})
test("replacement rejects non-Lead users, pending companies, duplicates and stale team versions", () => {
  const state = teamReady()
  const previous = activeSubcontractors(project(state))[0].companyId
  const replace = {
    type: "replace_company",
    companyId: previous,
    replacementCompanyId: "c1",
  }
  assert.throws(() => run(state, replace, "a5"), /Lead Site PM/)
  assert.throws(
    () => run(state, { ...replace, replacementCompanyId: "c4" }),
    /approved directory/,
  )
  assert.throws(
    () => run(state, { ...replace, replacementCompanyId: previous }),
    /different/,
  )
  assert.throws(
    () => run(state, { ...replace, expectedVersion: -1 }),
    /team changed/,
  )
  const withDuplicate = run(state, { type: "select_company", companyId: "c1" })
  assert.throws(() => run(withDuplicate, replace), /already on the team/)
})
test("agreement does not partially activate a project when any final check fails", () => {
  const ready = acceptedTeam()
  assert.equal(
    activationChecks(ready, project(ready)).find(
      (check) => check.id === "agreement",
    ).passed,
    false,
  )
  for (const corrupt of [
    (state) => {
      project(state).docs[0].uploaded = false
    },
    (state) => {
      project(state).opmAccepted = false
    },
    (state) => {
      project(state).team[1].status = "pending"
    },
    (state) => {
      state.accounts.find((a) => a.id === project(state).clientId).status =
        "suspended"
    },
    (state) => {
      state.companies.find(
        (c) => c.id === activeSubcontractors(project(state))[0].companyId,
      ).status = "rejected"
    },
  ]) {
    const blocked = structuredClone(ready)
    corrupt(blocked)
    const snapshot = JSON.stringify(blocked)
    assert.throws(() =>
      run(blocked, { type: "upload_agreement", doc: doc("signed") }),
    )
    assert.equal(JSON.stringify(blocked), snapshot)
    assert.equal(project(blocked).status, "pending")
  }
  const state = run(ready, { type: "upload_agreement", doc: doc("signed") })
  assert.equal(project(state).status, "active")
  assert.ok(
    activationChecks(state, project(state)).every((check) => check.passed),
  )
  assert.ok(
    state.accounts
      .find((a) => a.id === project(state).clientId)
      .scope.includes("p4"),
  )
})
