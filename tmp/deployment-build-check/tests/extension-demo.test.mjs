import assert from "node:assert/strict"
import test from "node:test"
import {
  applyExtensionCommand,
  canSeeProject,
  DEMO_ACCOUNTS,
  initialExtensionState,
  progressLabel,
  reportErrors,
  schedulePerformance,
  extensionWorkspace,
} from "../src/extension-demo.ts"

const actor = (id) => DEMO_ACCOUNTS.find((a) => a.id === id)
const report = (proposed = "2026-11-25") => ({
  reason: "Typhoon rainfall interrupted waterproofing works.",
  activities: "Complete waterproofing, testing and turnover.",
  proposed,
  evidence: [
    { id: "photo", name: "site-photo.jpg", type: "image/jpeg", size: 140000 },
  ],
})
const apply = (s, id, command) =>
  applyExtensionCommand(s, actor(id), command, "2026-10-27T08:00:00Z")

test("approval alone updates the mock deadline, preserves original ETC, progress, phases and report snapshots", () => {
  const seed = initialExtensionState()
  const source = JSON.stringify(seed)
  let s = apply(seed, "a5", {
    type: "submit",
    projectId: "p1",
    report: report(),
  })
  const r = s.requests.at(-1)
  assert.equal(r.status, "Pending OPM Review")
  assert.equal(s.projects[0].approved, "2026-10-26")
  assert.throws(
    () => apply(s, "a2", { type: "approve", requestId: r.id, remarks: "" }),
    /not permitted/,
  )
  assert.throws(
    () => apply(s, "a1", { type: "approve", requestId: r.id, remarks: "" }),
    /not permitted/,
  )
  assert.throws(
    () => apply(s, "a9", { type: "approve", requestId: r.id, remarks: "" }),
    /not permitted/,
  )
  s = apply(s, "a2", {
    type: "endorse",
    requestId: r.id,
    remarks: "Verified site logs.",
  })
  assert.equal(s.projects[0].approved, "2026-10-26")
  s = apply(s, "a9", {
    type: "approve",
    requestId: r.id,
    remarks: "Approved revised schedule.",
  })
  assert.equal(s.projects[0].approved, "2026-11-25")
  assert.equal(s.projects[0].original, "2026-10-26")
  assert.equal(s.projects[0].progress, 85)
  assert.equal(s.projects[0].lifecycle, "Ongoing")
  assert.equal(schedulePerformance(s.projects[0]), "On Schedule")
  assert.equal(s.projects[0].deadlines.length, 1)
  assert.equal(s.requests.at(-1).baseline, "2026-10-26")
  assert.equal(extensionWorkspace(s).projects[0].phase, "Finishes")
  assert.deepEqual(extensionWorkspace(s).projects[0].docs, [])
  assert.equal(JSON.stringify(seed), source, "input state remains immutable")
  assert.throws(
    () => apply(s, "a9", { type: "approve", requestId: r.id, remarks: "" }),
    /not permitted/,
  )
  assert.ok(
    s.notices.some((n) => n.to.includes("a1") && n.text.includes("Approved")),
  )
})

test("draft, validation, return, edit, resubmit and endorsement preserve every report version", () => {
  let s = initialExtensionState()
  const blank = { reason: "", activities: "", proposed: "", evidence: [] }
  assert.equal(Object.keys(reportErrors(blank, s.projects[0])).length, 3)
  for (const date of ["2026-10-26", "2026-10-25", "2026-02-30", "bad-date"])
    assert.ok(reportErrors(report(date), s.projects[0]).proposed)
  s = apply(s, "a5", { type: "save", projectId: "p1", report: blank })
  const draftId = s.requests.at(-1).id
  assert.equal(s.requests.at(-1).status, "Draft")
  assert.throws(
    () =>
      apply(s, "a5", {
        type: "submit",
        projectId: "p1",
        requestId: draftId,
        report: blank,
      }),
    /required/,
  )
  s = apply(s, "a5", {
    type: "submit",
    projectId: "p1",
    requestId: draftId,
    report: report(),
  })
  assert.throws(
    () => apply(s, "a5", { type: "submit", projectId: "p1", report: report() }),
    /already has/,
  )
  assert.throws(
    () => apply(s, "a2", { type: "return", requestId: draftId, remarks: "  " }),
    /written reason/,
  )
  s = apply(s, "a2", {
    type: "return",
    requestId: draftId,
    remarks: "Provide the delivery schedule.",
  })
  assert.equal(s.requests.at(-1).status, "Returned for Revision")
  const revised = {
    ...report(),
    reason: "Revised reason with delivery schedule.",
    evidence: [],
  }
  s = apply(s, "a5", {
    type: "submit",
    projectId: "p1",
    requestId: draftId,
    report: revised,
  })
  const history = s.requests.at(-1).history
  assert.equal(history[1].report.evidence.length, 1)
  assert.equal(history.at(-1).report.evidence.length, 0)
  assert.match(history[2].remarks, /delivery schedule/)
  s = apply(s, "a2", {
    type: "endorse",
    requestId: draftId,
    remarks: "Revised evidence accepted for extension review only.",
  })
  assert.equal(s.requests.at(-1).status, "Pending Client Approval")
  assert.throws(
    () =>
      apply(s, "a9", {
        type: "save",
        projectId: "p1",
        requestId: draftId,
        report: revised,
      }),
    /assigned SPM/,
  )
})

test("OPM and Client rejection require reasons, preserve deadlines and permit new requests", () => {
  for (const by of ["a2", "a9"]) {
    let s = initialExtensionState()
    s = apply(s, "a5", { type: "submit", projectId: "p1", report: report() })
    const id = s.requests.at(-1).id
    if (by === "a9")
      s = apply(s, "a2", { type: "endorse", requestId: id, remarks: "" })
    assert.throws(
      () => apply(s, by, { type: "reject", requestId: id, remarks: " " }),
      /written reason/,
    )
    s = apply(s, by, {
      type: "reject",
      requestId: id,
      remarks: "Evidence does not justify the requested duration.",
    })
    assert.equal(s.requests.at(-1).status, "Rejected")
    assert.equal(s.projects[0].approved, "2026-10-26")
    assert.deepEqual(s.projects[0].deadlines, [])
    s = apply(s, "a5", {
      type: "submit",
      projectId: "p1",
      report: report("2026-11-12"),
    })
    assert.notEqual(s.requests.at(-1).id, id)
  }
})

test("second extension uses the first approved date as its baseline and retains both approvals", () => {
  let s = initialExtensionState()
  assert.equal(schedulePerformance(s.projects[3]), "Delayed")
  s = apply(s, "a5", {
    type: "submit",
    projectId: "p4",
    report: report("2026-11-15"),
  })
  const r = s.requests.at(-1)
  assert.equal(r.baseline, "2026-10-20")
  s = apply(s, "a2", {
    type: "endorse",
    requestId: r.id,
    remarks: "Second extension reviewed.",
  })
  s = apply(s, "a9", { type: "approve", requestId: r.id, remarks: "" })
  assert.equal(s.projects[3].original, "2026-09-30")
  assert.deepEqual(
    s.projects[3].deadlines.map((d) => d.date),
    ["2026-10-20", "2026-11-15"],
  )
})

test("assignments, withdrawn requests, stale dates and notification reads stay isolated", () => {
  let s = initialExtensionState()
  assert.equal(canSeeProject(actor("a6"), s.projects[0]), false)
  assert.equal(canSeeProject(actor("a11"), s.projects[0]), false)
  assert.equal(progressLabel(s.projects[4].progress), "Progress Unavailable")
  assert.throws(
    () => apply(s, "a6", { type: "submit", projectId: "p1", report: report() }),
    /assigned SPM/,
  )
  assert.throws(
    () =>
      apply(s, "a11", {
        type: "approve",
        requestId: "seed-client",
        remarks: "",
      }),
    /not available/,
  )
  s = apply(s, "a5", {
    type: "withdraw",
    requestId: "seed-revision",
    remarks: "Rescoping request.",
  })
  assert.equal(s.requests[0].status, "Withdrawn")
  s = apply(s, "a5", { type: "submit", projectId: "p2", report: report() })
  assert.equal(s.requests.at(-1).status, "Pending OPM Review")
  const stale = structuredClone(s)
  stale.projects[2].approved = "2026-11-01"
  assert.throws(
    () =>
      apply(stale, "a9", {
        type: "approve",
        requestId: "seed-client",
        remarks: "",
      }),
    /deadline or report has changed/,
  )
  const notice = s.notices.find((n) => n.to.includes("a2"))
  s = apply(s, "a11", { type: "read", noticeIds: [notice.id] })
  assert.equal(s.notices.find((n) => n.id === notice.id).readBy.length, 0)
  s = apply(s, "a2", { type: "read", noticeIds: [notice.id] })
  assert.ok(s.notices.find((n) => n.id === notice.id).readBy.includes("a2"))
  assert.equal(
    initialExtensionState().projects[0].approved,
    "2026-10-26",
    "reset restores initial state",
  )
})
