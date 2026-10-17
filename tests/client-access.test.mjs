import assert from "node:assert/strict"
import test from "node:test"
import { DOC_LABELS, initialState } from "../src/model.ts"
import { applyWorkflow, workflowFor } from "../src/workflows.ts"
import {
  clientProjectViews,
  clientProgressReport,
  resolveClientDocument,
  resolveClientPhoto,
  phaseTimeline,
} from "../src/client-access.ts"
import {
  activeFixture,
  currentProject,
  evidence,
  execute,
} from "./fixtures.mjs"

test("Client projects require active account, matching assigned client, scope and project activation", () => {
  const state = initialState()
  assert.deepEqual(
    clientProjectViews(state, "a9").map((p) => p.id),
    ["p1"],
  )
  assert.deepEqual(clientProjectViews(state, "a2"), [])
  assert.throws(
    () =>
      resolveClientDocument(
        state,
        "a9",
        "p4",
        state.projects.find((p) => p.id === "p4").docs[0].id,
      ),
    /not activated/,
  )
  state.accounts.find((a) => a.id === "a9").scope.push("p2")
  state.projects.find((p) => p.id === "p2").clientId = "different-client"
  assert.deepEqual(
    clientProjectViews(state, "a9").map((p) => p.id),
    ["p1"],
  )
  state.accounts.find((a) => a.id === "a9").status = "suspended"
  assert.deepEqual(clientProjectViews(state, "a9"), [])
  assert.throws(() => clientProgressReport(state, "a9", "p1"), /active Client/)
})
test("only the four source-whitelisted document types may be viewed or downloaded", () => {
  const state = activeFixture()
  const p = currentProject(state)
  assert.deepEqual(
    clientProjectViews(state, "a9")
      .find((p) => p.id === "p4")
      .documents.map((d) => d.label),
    [DOC_LABELS[0], DOC_LABELS[1], DOC_LABELS[3], DOC_LABELS[4]],
  )
  for (const index of [2, 5, 6]) {
    const doc = p.docs.find((d) => d.label === DOC_LABELS[index])
    doc.clientVisible = true
    assert.throws(
      () => resolveClientDocument(state, "a9", p.id, doc.id),
      /internal/,
    )
  }
  const unknown = {
    ...evidence("unknown.png"),
    label: "Private engagement agreement",
    clientVisible: true,
  }
  p.docs.push(unknown)
  assert.throws(
    () => resolveClientDocument(state, "a9", p.id, unknown.id),
    /not authorized/,
  )
  const allowed = p.docs.find((d) => d.label === DOC_LABELS[0])
  assert.equal(
    resolveClientDocument(state, "a9", p.id, allowed.id).id,
    allowed.id,
  )
  allowed.clientVisible = false
  assert.throws(
    () => resolveClientDocument(state, "a9", p.id, allowed.id),
    /not authorized/,
  )
})
test("resource lookup rejects foreign projects and documents even if the caller spoofs labels", () => {
  const state = activeFixture()
  const foreign = state.projects.find((p) => p.id === "p2").docs[0]
  assert.throws(
    () => resolveClientDocument(state, "a9", "p2", foreign.id),
    /not activated and authorized/,
  )
  assert.throws(
    () => resolveClientDocument(state, "a9", "p4", foreign.id),
    /not authorized/,
  )
  assert.throws(
    () =>
      resolveClientDocument(
        state,
        "a2",
        "p4",
        currentProject(state).docs[0].id,
      ),
    /active Client/,
  )
})
test("Client projections and reports omit internal diary, roster, private evidence and pending updates", () => {
  const state = activeFixture()
  const p = currentProject(state)
  workflowFor(p).notes.push({
    id: "private-note",
    authorId: "a4",
    text: "SECRET_DIARY",
    date: "2026-10-14",
  })
  p.history.push({
    date: "2026-10-14",
    text: "SECRET_PENDING",
    phase: "Mobilization",
    progress: 0,
    clientVisible: false,
  })
  p.history.push({
    date: "2026-10-14",
    text: "Approved field visit visible to Client",
    phase: "Mobilization",
    progress: 0,
    clientVisible: true,
  })
  const item = {
    id: "private-check",
    label: "Public checklist label",
    status: "submitted",
    version: 1,
    note: "SECRET_REJECTION",
    escalated: true,
    doc: { ...evidence(), name: "SECRET_EVIDENCE.png" },
  }
  workflowFor(p).checklist.Mobilization = [item]
  const snapshot = clientProjectViews(state, "a9").find((p) => p.id === "p4")
  const serialized = JSON.stringify(snapshot)
  for (const privateValue of [
    "SECRET_DIARY",
    "SECRET_PENDING",
    "SECRET_REJECTION",
    "SECRET_EVIDENCE",
    "private-check",
    "escalated",
    "authorId",
    "pendingRework",
  ])
    assert.ok(!serialized.includes(privateValue))
  assert.equal(snapshot.checklist[0].status, "under_review")
  assert.equal("team" in snapshot, false)
  assert.equal("workflow" in snapshot, false)
  assert.equal("companies" in snapshot, false)
  const report = clientProgressReport(state, "a9", "p4")
  assert.match(report, /Approved field visit visible/)
  assert.ok(!report.includes("SECRET_"))
})
test("only explicitly shared gallery photographs are authorized, never general or QA evidence", () => {
  const state = activeFixture()
  const p = currentProject(state)
  const shared = { ...evidence("shared.png"), clientVisible: true }
  const privatePhoto = evidence("private.png")
  workflowFor(p).photos.push(shared, privatePhoto)
  assert.equal(
    clientProjectViews(state, "a9").find((p) => p.id === "p4").photos.length,
    1,
  )
  assert.equal(resolveClientPhoto(state, "a9", "p4", shared.id).id, shared.id)
  assert.throws(
    () => resolveClientPhoto(state, "a9", "p4", privatePhoto.id),
    /not been shared/,
  )
  const qafile = { ...evidence("inspection.png"), clientVisible: true }
  workflowFor(p).checklist.Mobilization = [
    {
      id: "qa",
      label: "Inspection",
      status: "approved",
      version: 2,
      doc: qafile,
    },
  ]
  assert.throws(
    () => resolveClientPhoto(state, "a9", "p4", qafile.id),
    /not been shared/,
  )
})
test("resource authorization is checked again after scope revocation or suspension", () => {
  const state = activeFixture()
  const doc = currentProject(state).docs[0]
  assert.ok(resolveClientDocument(state, "a9", "p4", doc.id))
  state.accounts.find((a) => a.id === "a9").scope = []
  assert.throws(
    () => resolveClientDocument(state, "a9", "p4", doc.id),
    /not activated and authorized/,
  )
  assert.deepEqual(clientProjectViews(state, "a9"), [])
})
test("Clients cannot invoke project mutation or staff-review actions", () => {
  const state = activeFixture()
  for (const type of [
    "submit_progress",
    "add_note",
    "add_photo",
    "approve_update",
    "approve_checklist",
    "approve_rework",
    "reassign_phase",
    "upload_registered",
  ]) {
    assert.throws(
      () => applyWorkflow(state, "a9", { type, projectId: "p4" }),
      /Office PM or Site PM/,
    )
  }
})
test("read-only phase timelines preserve all seven stages and complete status", () => {
  const timeline = phaseTimeline("Structure")
  assert.equal(timeline.length, 7)
  assert.equal(timeline.filter((p) => p.state === "completed").length, 3)
  assert.equal(timeline.find((p) => p.name === "Structure").state, "current")
  assert.equal(timeline.find((p) => p.name === "Closeout").state, "upcoming")
  assert.ok(
    phaseTimeline("Closeout", true).every((p) => p.state === "completed"),
  )
  const generated = [
    "Mobilization",
    "Design",
    "Foundation",
    "Podium Structure",
    "Tower Structure",
    "Envelope / Curtain Wall",
    "MEP Rough-In",
    "Fire & Life Safety",
    "Retail/Commercial Fit-Out",
    "Residential Fit-Out",
    "Landscape & Site Works",
    "Closeout",
  ]
  assert.equal(
    phaseTimeline("Tower Structure", false, generated).find(
      (item) => item.name === "Tower Structure",
    ).state,
    "current",
  )
  assert.equal(phaseTimeline("Tower Structure", false, generated).length, 12)
})
test("approving a progress note does not publish its retained internal evidence file", () => {
  let state = activeFixture()
  const internalFile = evidence("SECRET_RETAINED_REPORT.png")
  state = execute(state, "a4", {
    type: "submit_progress",
    note: "Approved site coordination summary.",
    evidence: internalFile,
  })
  state = execute(state, "a2", { type: "approve_update", expectedVersion: 1 })
  assert.equal(
    currentProject(state).history.at(-1).evidence.id,
    internalFile.id,
  )
  const client = clientProjectViews(state, "a9").find((p) => p.id === "p4")
  assert.match(JSON.stringify(client), /Approved site coordination summary/)
  assert.ok(!JSON.stringify(client).includes(internalFile.id))
  assert.ok(
    !clientProgressReport(state, "a9", "p4").includes("SECRET_RETAINED"),
  )
  assert.throws(
    () => resolveClientDocument(state, "a9", "p4", internalFile.id),
    /not authorized/,
  )
  assert.throws(
    () => resolveClientPhoto(state, "a9", "p4", internalFile.id),
    /not been shared/,
  )
})
