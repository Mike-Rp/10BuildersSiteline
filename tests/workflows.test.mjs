import assert from "node:assert/strict"
import test from "node:test"
import { DOC_LABELS, initialState } from "../src/model.ts"
import {
  applyWorkflow,
  assignmentBlock,
  businessDeadline,
  checklistFor,
  consentComplete,
  processWorkflowTimers,
  registeredComplete,
  REVIEW_MS,
  subcontractorRecommendations,
  workflowFor,
} from "../src/workflows.ts"

const NOW = Date.parse("2026-10-14T08:00:00Z")
const project = (state) => state.projects.find((p) => p.id === "p4")
const doc = (name = "evidence.png") => ({
  id: crypto.randomUUID(),
  label: "Selected file",
  name,
  size: 512,
  mime: "image/png",
  uploaded: true,
  owner: "Demo",
  date: "2026-10-14",
  clientVisible: false,
})
const run = (state, actor, command, time = NOW) =>
  applyWorkflow(state, actor, { projectId: "p4", ...command }, time)
// The company the system ranks first (no conflicting commitment, has manpower).
const suggested = (state) =>
  subcontractorRecommendations(state, project(state)).find(
    (candidate) => !candidate.committed && candidate.availableManpower > 0,
  ).company.id
function documentsReady() {
  let state = run(initialState(), "a2", { type: "accept_opm" })
  for (let i = 0; i < 6; i++)
    state = run(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: doc(`required-${i}.png`),
    })
  return state
}
function teamReady() {
  let state = documentsReady()
  state = run(state, "a4", { type: "accept_assignment" })
  return run(state, "a5", { type: "accept_assignment" })
}
function activeProject() {
  let state = teamReady()
  const companyId = suggested(state)
  state = run(state, "a4", { type: "contact_company", companyId })
  state = run(state, "a4", {
    type: "respond_company",
    companyId,
    accepted: true,
  })
  return run(state, "a4", {
    type: "upload_agreement",
    doc: doc("signed-agreement.png"),
  })
}
test("Renz acceptance unlocks exactly the six required document types", () => {
  let state = initialState()
  assert.throws(
    () =>
      run(state, "a2", { type: "upload_registered", docIndex: 0, doc: doc() }),
    /Accept/,
  )
  state = run(state, "a2", { type: "accept_opm" })
  assert.equal(project(state).opmAccepted, true)
  assert.throws(
    () =>
      run(state, "a2", { type: "upload_registered", docIndex: 6, doc: doc() }),
    /six registered/,
  )
  state = run(state, "a2", {
    type: "upload_registered",
    docIndex: 0,
    doc: doc(),
  })
  assert.equal(
    project(state).docs.find((d) => d.label === DOC_LABELS[0]).uploaded,
    true,
  )
  assert.throws(
    () =>
      run(state, "a2", { type: "upload_registered", docIndex: 0, doc: doc() }),
    /already uploaded/,
  )
})
test("strict acceptance order is enforced by mutation rules, not only disabled buttons", () => {
  let state = run(initialState(), "a2", { type: "accept_opm" })
  assert.throws(
    () => run(state, "a4", { type: "accept_assignment" }),
    /documents/,
  )
  state = documentsReady()
  assert.equal(registeredComplete(project(state)), true)
  assert.throws(
    () => run(state, "a5", { type: "accept_assignment" }),
    /Lead Site PM/,
  )
  assert.throws(
    () => run(state, "a4", { type: "select_company", companyId: "c1" }),
    /every Site PM/,
  )
  state = run(state, "a4", { type: "accept_assignment" })
  assert.ok(assignmentBlock(project(state), "a5") === "")
  assert.throws(
    () => run(state, "a4", { type: "select_company", companyId: "c1" }),
    /every Site PM/,
  )
  state = run(state, "a5", { type: "accept_assignment" })
  assert.ok(project(state).team.every((row) => row.status === "confirmed"))
  assert.equal(workflowFor(project(state)).deadline, undefined)
})
test("Lead Site PM authority follows the project Mobilization assignment", () => {
  let state = documentsReady()
  project(state).team.find((row) => row.phase === "Mobilization").accountId =
    "a5"
  project(state).team.find((row) => row.phase === "Design").accountId = "a4"
  state = run(state, "a5", { type: "accept_assignment" })
  state = run(state, "a4", { type: "accept_assignment" })
  assert.ok(project(state).team.every((row) => row.status === "confirmed"))
  assert.doesNotThrow(() =>
    run(state, "a5", { type: "select_company", companyId: "c1" }),
  )
  assert.throws(
    () => run(state, "a4", { type: "select_company", companyId: "c1" }),
    /Lead Site PM/,
  )
})
test("role, project ownership and Lead-only rights cannot be bypassed", () => {
  const state = teamReady()
  assert.throws(
    () => run(state, "a1", { type: "accept_opm" }),
    /Office PM or Site PM/,
  )
  assert.throws(
    () => run(state, "a3", { type: "approve_update" }),
    /outside your assigned scope/,
  )
  assert.throws(
    () => run(state, "a5", { type: "contact_company", companyId: "c1" }),
    /Lead Site PM/,
  )
  assert.throws(
    () =>
      run(state, "a2", {
        type: "reassign_phase",
        phase: "Mobilization",
        accountId: "a6",
      }),
    /locked/,
  )
})
test("contact is a local attempt only; manually accepted companies are immutable", () => {
  let state = teamReady()
  const companyId = suggested(state)
  state = run(state, "a4", { type: "select_company", companyId })
  assert.throws(
    () =>
      run(state, "a4", { type: "respond_company", companyId, accepted: true }),
    /contact attempt/,
  )
  state = run(state, "a4", { type: "contact_company", companyId })
  assert.equal(workflowFor(project(state)).selections[0].status, "contacted")
  assert.match(state.events[0].detail, /no email/)
  state = run(state, "a4", {
    type: "respond_company",
    companyId,
    accepted: true,
  })
  assert.equal(consentComplete(state, project(state)), true)
  assert.throws(
    () => run(state, "a4", { type: "archive_company", companyId }),
    /cannot be archived/,
  )
  assert.throws(
    () =>
      run(state, "a4", { type: "respond_company", companyId, accepted: false }),
    /locked/,
  )
})
test("agreement activation requires consent, a valid file and an eligible client", () => {
  let state = teamReady()
  assert.throws(
    () => run(state, "a4", { type: "upload_agreement", doc: doc() }),
    /accepted before/,
  )
  const companyId = suggested(state)
  state = run(state, "a4", { type: "contact_company", companyId })
  state = run(state, "a4", {
    type: "respond_company",
    companyId,
    accepted: true,
  })
  assert.throws(
    () =>
      run(state, "a4", {
        type: "upload_agreement",
        doc: { ...doc(), name: "bad.exe" },
      }),
    /Documents must/,
  )
  const blocked = structuredClone(state)
  blocked.accounts.find((a) => a.id === "a9").status = "suspended"
  assert.throws(
    () => run(blocked, "a4", { type: "upload_agreement", doc: doc() }),
    /client record/,
  )
  state.accounts.find((a) => a.id === "a9").status = "pending-setup"
  state.accounts.find((a) => a.id === "a9").scope = []
  state = run(state, "a4", { type: "upload_agreement", doc: doc() })
  assert.equal(project(state).status, "active")
  assert.equal(project(state).phase, "Mobilization")
  assert.equal(state.accounts.find((a) => a.id === "a9").status, "active")
  assert.ok(state.accounts.find((a) => a.id === "a9").scope.includes("p4"))
})
test("QA/QC requires current owner evidence and human approval before phase handoff", () => {
  let state = activeProject()
  assert.throws(
    () => run(state, "a5", { type: "submit_progress", note: "Not my phase" }),
    /confirmed owner/,
  )
  const items = checklistFor(project(state))
  for (const item of items) {
    state = run(state, "a4", {
      type: "submit_checklist",
      phase: "Mobilization",
      itemId: item.id,
      expectedVersion: 0,
      doc: doc(),
    })
    assert.equal(project(state).progress, 0)
  }
  for (const item of items) {
    state = run(state, "a2", {
      type: "approve_checklist",
      phase: "Mobilization",
      itemId: item.id,
      expectedVersion: 1,
    })
  }
  assert.equal(project(state).phase, "Design")
  assert.equal(workflowFor(project(state)).handoff.toId, "a5")
  assert.ok(project(state).progress > 0)
  assert.throws(
    () => run(state, "a4", { type: "submit_progress" }),
    /confirmed owner/,
  )
  state = run(state, "a5", {
    type: "submit_progress",
    note: "Design is underway.",
  })
  assert.ok(workflowFor(project(state)).pendingUpdate)
})
test("rejected QA evidence becomes missing, can be resubmitted, and rejects stale reviews", () => {
  let state = activeProject()
  const item = checklistFor(project(state))[0]
  state = run(state, "a4", {
    type: "submit_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 0,
    doc: doc(),
  })
  assert.throws(
    () =>
      run(state, "a2", {
        type: "approve_checklist",
        phase: "Mobilization",
        itemId: item.id,
        expectedVersion: 0,
      }),
    /changed/,
  )
  state = run(state, "a2", {
    type: "reject_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 1,
  })
  assert.equal(checklistFor(project(state))[0].status, "missing")
  state = run(state, "a4", {
    type: "submit_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 2,
    doc: doc(),
  })
  assert.equal(checklistFor(project(state))[0].status, "submitted")
})
test("informational updates auto-approve after three days; material changes remain pending", () => {
  let state = activeProject()
  state = run(state, "a4", {
    type: "submit_progress",
    note: "Informational site visit.",
  })
  const before = project(state).progress
  state = processWorkflowTimers(state, NOW + REVIEW_MS + 1)
  assert.equal(workflowFor(project(state)).pendingUpdate, undefined)
  assert.equal(project(state).progress, before)
  state = run(state, "a4", {
    type: "submit_progress",
    note: "Imported material change.",
  })
  workflowFor(project(state)).pendingUpdate.requestedProgress = 20
  state = processWorkflowTimers(state, NOW + REVIEW_MS + 1)
  assert.equal(workflowFor(project(state)).pendingUpdate.escalated, true)
  assert.equal(project(state).progress, before)
})
test("QA/QC and rework never auto-approve; Other requires explanation", () => {
  let state = activeProject()
  assert.throws(
    () =>
      run(state, "a4", {
        type: "submit_progress",
        issues: ["Other"],
        note: "",
      }),
    /Explain/,
  )
  const item = checklistFor(project(state))[0]
  state = run(state, "a4", {
    type: "submit_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 0,
    doc: doc(),
  })
  state = run(state, "a4", {
    type: "submit_progress",
    issues: ["Safety incident"],
    note: "Inspection needed.",
  })
  state = processWorkflowTimers(state, NOW + REVIEW_MS + 1)
  assert.ok(workflowFor(project(state)).pendingRework)
  assert.equal(checklistFor(project(state))[0].status, "submitted")
  assert.equal(checklistFor(project(state))[0].escalated, true)
})
test("lead deadlines exclude weekends and hard expiry returns intake for reassignment", () => {
  assert.equal(
    businessDeadline("2026-10-16T08:00:00Z", 1),
    "2026-10-19T08:00:00.000Z",
  )
  let state = documentsReady()
  const hard = Date.parse(workflowFor(project(state)).deadline.hard)
  state = processWorkflowTimers(state, hard + 1)
  assert.equal(project(state).opmAccepted, false)
  assert.equal(registeredComplete(project(state)), false)
  assert.equal(project(state).team[0].status, "declined")
  assert.ok(workflowFor(project(state)).documentArchive.length === 6)
  assert.ok(
    workflowFor(project(state)).responses.some((r) => r.status === "expired"),
  )
})
test("Office PM changes request starts cooldown and retains source exclusions", () => {
  const state = run(initialState(), "a2", {
    type: "request_changes",
    note: "Staffing needs revision.",
  })
  assert.equal(project(state).status, "changes_requested")
  assert.ok(project(state).excludedOpms.includes("a2"))
  assert.equal(
    state.accounts.find((a) => a.id === "a2").cooldown,
    NOW + 86400000,
  )
  assert.equal(workflowFor(project(state)).changesHistory[0].opmId, "a2")
})
test("document reads use canonical stored records and cannot spoof Site PM visibility", () => {
  const state = activeProject()
  const internal = project(state).docs.find((d) => d.label === DOC_LABELS[5])
  assert.throws(
    () =>
      run(state, "a5", {
        type: "view_document",
        doc: { ...internal, label: "Fake public photo" },
      }),
    /not accessible/,
  )
  const agreement = project(state).docs.find((d) => d.label === DOC_LABELS[6])
  const viewed = run(state, "a5", { type: "view_document", doc: agreement })
  assert.equal(viewed.events[0].type, "view")
  assert.match(viewed.events[0].title, /watermarked/)
})
test("company suggestions retain manpower documents, require approval, and do not mutate command inputs", () => {
  const state = teamReady()
  const company = {
    id: "new-company",
    name: "Field Request Co",
    contact: "Field Foreman",
    phone: "09170000000",
    email: "",
    status: "pending",
    submittedBy: "",
    projectId: "p4",
    availability: "available",
    manpowerCount: 14,
    activeProjectIds: [],
    manpowerDocuments: [
      {
        ...doc("manpower-list.xlsx"),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
    documents: [],
    note: "",
    version: 1,
  }
  const requested = run(state, "a4", { type: "request_company", company })
  assert.equal(company.activeProjectIds.length, 0)
  const stored = requested.companies.find((c) => c.id === company.id)
  assert.equal(stored.status, "pending")
  assert.equal(stored.submittedById, "a4")
  assert.equal(stored.manpowerCount, 14)
  assert.equal(stored.manpowerDocuments[0].name, "manpower-list.xlsx")
  assert.throws(
    () =>
      run(state, "a5", {
        type: "request_company",
        company: { ...company, id: "non-lead-suggestion" },
      }),
    /Lead Site PM/,
  )
  assert.throws(
    () =>
      run(requested, "a4", { type: "contact_company", companyId: company.id }),
    /approved subcontractor/,
  )
  const archived = run(requested, "a4", {
    type: "archive_company_request",
    companyId: company.id,
  })
  const retained = archived.companies.find((c) => c.id === company.id)
  const selection = workflowFor(project(archived)).selections.find(
    (item) => item.companyId === company.id,
  )
  assert.equal(retained.status, "archived")
  assert.equal(retained.manpowerCount, 14)
  assert.equal(retained.manpowerDocuments[0].name, "manpower-list.xlsx")
  assert.ok(retained.archivedAt)
  assert.equal(selection.status, "archived")
  assert.equal(selection.archivedBy, "a4")
})
test("rework approval uses the source stage floor without changing phase or bypassing Office PM review", () => {
  let state = run(initialState(), "a6", {
    type: "submit_progress",
    projectId: "p1",
    issues: ["Other"],
    note: "Structural inspection needs corrective work.",
  })
  assert.throws(
    () =>
      run(state, "a6", {
        type: "approve_rework",
        projectId: "p1",
        expectedVersion: 1,
      }),
    /assigned Office PM/,
  )
  state = processWorkflowTimers(state, NOW + REVIEW_MS + 1)
  assert.ok(
    workflowFor(state.projects.find((p) => p.id === "p1")).pendingRework,
  )
  state = run(state, "a2", {
    type: "approve_rework",
    projectId: "p1",
    expectedVersion: 1,
  })
  const site = state.projects.find((p) => p.id === "p1")
  assert.equal(site.progress, 50)
  assert.equal(site.phase, "Structure")
  assert.equal(workflowFor(site).pendingRework, undefined)
})
