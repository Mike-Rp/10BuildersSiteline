import assert from "node:assert/strict"
import test from "node:test"
import { PHASES } from "../src/model.ts"
import {
  checklistFor,
  completionReady,
  processWorkflowTimers,
  REVIEW_MS,
  workflowFor,
} from "../src/workflows.ts"
import {
  activeFixture,
  currentProject,
  evidence,
  execute,
  NOW,
} from "./fixtures.mjs"

function approvePhase(state) {
  const p = currentProject(state)
  const phase = p.phase
  const owner = p.team.find((t) => t.phase === phase).accountId
  for (const item of checklistFor(p)) {
    state = execute(state, owner, {
      type: "submit_checklist",
      phase,
      itemId: item.id,
      expectedVersion: item.version,
      doc: evidence(),
    })
    state = execute(state, "a2", {
      type: "approve_checklist",
      phase,
      itemId: item.id,
      expectedVersion: item.version + 1,
    })
  }
  return state
}
function readyForCloseout() {
  let state = activeFixture()
  for (const phase of PHASES.slice(0, -1)) {
    assert.equal(currentProject(state).phase, phase)
    state = approvePhase(state)
  }
  return state
}
test("all phases require owner evidence and human QA/QC sign-off before read-only completion", () => {
  let state = activeFixture()
  for (const phase of PHASES) {
    assert.equal(currentProject(state).phase, phase)
    assert.equal(currentProject(state).status, "active")
    state = approvePhase(state)
  }
  const p = currentProject(state)
  assert.equal(p.status, "completed")
  assert.equal(p.progress, 100)
  assert.ok(workflowFor(p).completedAt)
  assert.ok(
    PHASES.every((phase) =>
      checklistFor(p, phase).every((i) => i.status === "approved"),
    ),
  )
  assert.equal(
    state.events.filter(
      (e) => e.projectId === "p4" && e.title === "Project completed",
    ).length,
    1,
  )
  assert.equal(p.history.at(-1).clientVisible, true)
})
test("Closeout waits for a pending progress review even after every checklist item is approved", () => {
  let state = readyForCloseout()
  state = execute(state, "a5", {
    type: "submit_progress",
    note: "Final field report for review.",
  })
  state = approvePhase(state)
  assert.equal(currentProject(state).progress, 100)
  assert.equal(currentProject(state).status, "active")
  assert.equal(completionReady(currentProject(state)), false)
  state = execute(state, "a2", { type: "approve_update", expectedVersion: 1 })
  assert.equal(currentProject(state).status, "completed")
})
test("Closeout never auto-approves QA/QC evidence or unresolved rework", () => {
  let state = readyForCloseout()
  const first = checklistFor(currentProject(state))[0]
  state = execute(state, "a5", {
    type: "submit_checklist",
    phase: "Closeout",
    itemId: first.id,
    expectedVersion: 0,
    doc: evidence(),
  })
  state = execute(state, "a5", {
    type: "submit_progress",
    issues: ["Failed inspection"],
    note: "Final inspection requires review.",
  })
  state = processWorkflowTimers(state, NOW + REVIEW_MS + 1)
  assert.equal(currentProject(state).status, "active")
  assert.equal(checklistFor(currentProject(state))[0].status, "submitted")
  assert.ok(workflowFor(currentProject(state)).pendingRework)
})
test("completed project records reject staff mutations and remain viewable", () => {
  let state = readyForCloseout()
  state = approvePhase(state)
  for (const [actor, type] of [
    ["a5", "submit_progress"],
    ["a5", "add_note"],
    ["a2", "request_update"],
    ["a2", "approve_rework"],
    ["a2", "reassign_phase"],
  ]) {
    assert.throws(() => execute(state, actor, { type }), /read-only/)
  }
  const viewed = execute(state, "a2", {
    type: "view_document",
    doc: currentProject(state).docs[0],
  })
  assert.equal(currentProject(viewed).status, "completed")
})
test("unconfirmed next owner blocks handoff until actual acceptance", () => {
  let state = activeFixture()
  currentProject(state).team.find((t) => t.phase === "Design").status =
    "pending"
  state = approvePhase(state)
  assert.equal(currentProject(state).phase, "Mobilization")
  state = execute(state, "a5", { type: "accept_assignment" })
  assert.equal(currentProject(state).phase, "Design")
})
test("new projects cannot complete with missing earlier tracked-phase approvals", () => {
  const state = readyForCloseout()
  const p = currentProject(state)
  workflowFor(p).checklist.Closeout = checklistFor(p).map((item) => ({
    ...item,
    status: "approved",
  }))
  workflowFor(p).checklist.Mobilization[0].status = "missing"
  assert.equal(completionReady(p), false)
})
test("legacy baseline and approval labels cannot compensate for missing scope",()=>{
  const state=readyForCloseout(),p=currentProject(state),work=workflowFor(p)
  work.checklist.Closeout=checklistFor(p).map(item=>({...item,status:"approved",reviewedAt:"2026-10-14",reviewedBy:"a2",doc:evidence()}))
  assert.equal(completionReady(p),true)
  work.progressStart=6;work.progressBase=100;p.progress=100
  const original=structuredClone(work.checklist.Mobilization)
  delete work.checklist.Mobilization
  assert.equal(completionReady(p),false)
  work.checklist.Mobilization=structuredClone(original)
  work.checklist.Mobilization[0].reviewedBy=undefined
  assert.equal(completionReady(p),false)
  work.checklist.Mobilization=original
  work.checklist.Mobilization[0].weight=0
  assert.equal(completionReady(p),false)
})

test("general note approval and its timer cannot activate the next phase",()=>{
  let state=activeFixture()
  state=execute(state,"a4",{type:"submit_progress",note:"Awaiting report review"})
  state=approvePhase(state)
  assert.equal(currentProject(state).phase,"Mobilization")
  const timed=processWorkflowTimers(state,NOW+REVIEW_MS+1)
  assert.equal(currentProject(timed).phase,"Mobilization")
  state=execute(state,"a2",{type:"approve_update",expectedVersion:1})
  assert.equal(currentProject(state).phase,"Mobilization")
})

test("site gallery uploads stay internal until the assigned Office PM releases them; diary and general evidence remain private", () => {
  let state = activeFixture()
  state = execute(state, "a4", {
    type: "add_photo",
    doc: evidence("client-site.png"),
  })
  const photo = workflowFor(currentProject(state)).photos[0]
  assert.equal(photo.clientVisible, false)
  assert.throws(() => execute(state, "a4", { type: "release_photo", photoId: photo.id }), /assigned Office PM/)
  state = execute(state, "a2", { type: "release_photo", photoId: photo.id })
  assert.equal(workflowFor(currentProject(state)).photos[0].clientVisible, true)
  assert.throws(() => execute(state, "a2", { type: "release_photo", photoId: photo.id }), /already released/)
  state = execute(state, "a4", {
    type: "add_note",
    note: "Internal coordination note.",
  })
  state = execute(state, "a4", {
    type: "submit_progress",
    note: "Awaiting review.",
    evidence: evidence("internal-evidence.png"),
  })
  assert.equal(
    workflowFor(currentProject(state)).pendingUpdate.evidence.clientVisible,
    false,
  )
  assert.equal(currentProject(state).history.at(-1).clientVisible, false)
})
test("reviewed field and rejected checklist evidence remain accessible in staff history", () => {
  let state = activeFixture()
  const fieldFile = evidence("retained-field.png")
  state = execute(state, "a4", {
    type: "submit_progress",
    note: "Reviewed field record.",
    evidence: fieldFile,
  })
  state = execute(state, "a2", { type: "approve_update", expectedVersion: 1 })
  const history = currentProject(state).history.at(-1)
  assert.equal(history.evidence.id, fieldFile.id)
  assert.equal(history.authorId, "a4")
  state = execute(state, "a4", { type: "view_document", doc: fieldFile })
  const item = checklistFor(currentProject(state))[0]
  const rejected = evidence("rejected-inspection.png")
  state = execute(state, "a4", {
    type: "submit_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 0,
    doc: rejected,
  })
  state = execute(state, "a2", {
    type: "reject_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 1,
  })
  state = execute(state, "a4", {
    type: "submit_checklist",
    phase: "Mobilization",
    itemId: item.id,
    expectedVersion: 2,
    doc: evidence("corrected-inspection.png"),
  })
  assert.ok(
    currentProject(state).history.some(
      (entry) =>
        entry.evidence?.id === rejected.id && entry.clientVisible === false,
    ),
  )
  assert.doesNotThrow(() =>
    execute(state, "a2", { type: "view_document", doc: rejected }),
  )
})
