import test from "node:test"
import assert from "node:assert/strict"
import { clientPhaseStatus, currentPhaseStatus } from "../src/domain/current-phase-status.ts"

const base = {
  projectStatus: "active",
  targetCompletionDate: "2026-11-30",
  today: "2026-11-05",
  activities: [{ status: "missing" }],
}

test("returns On hold when assigned Site PM actions are paused", () => {
  assert.equal(currentPhaseStatus({ ...base, assignedSitePmActionsPaused: true }), "On hold")
})

test("returns On hold while a reassigned engineer awaits acceptance", () => {
  assert.equal(currentPhaseStatus({ ...base, waitingForReassignedEngineerAcceptance: true }), "On hold")
})

test("returns On hold for an open blocking issue", () => {
  assert.equal(currentPhaseStatus({ ...base, hasOpenBlockingIssue: true }), "On hold")
})

test("returns Rework required for withdrawn approval awaiting corrected evidence", () => {
  assert.equal(currentPhaseStatus({ ...base, activities: [{ status: "rework_required" }] }), "Rework required")
  assert.equal(currentPhaseStatus({ ...base, hasWithdrawnApprovalAwaitingCorrectedEvidence: true }), "Rework required")
  assert.equal(currentPhaseStatus({ ...base, activities: [{ status: "submitted" }], hasWithdrawnApprovalAwaitingCorrectedEvidence: true }), "Rework required")
})

test("returns Delayed when the target completion date is in the past and project is not completed", () => {
  assert.equal(currentPhaseStatus({ ...base, targetCompletionDate: "2026-11-04", today: "2026-11-05" }), "Delayed")
})

test("returns Awaiting review when current phase evidence is submitted", () => {
  assert.equal(currentPhaseStatus({ ...base, activities: [{ status: "submitted" }] }), "Awaiting review")
})

test("returns Ready for handoff when all required activities are approved", () => {
  assert.equal(currentPhaseStatus({ ...base, activities: [{ status: "approved" }, { status: "approved" }] }), "Ready for handoff")
})

test("returns Ongoing when an activity is approved while another remains", () => {
  assert.equal(currentPhaseStatus({ ...base, activities: [{ status: "approved" }, { status: "missing" }] }), "Ongoing")
})

test("returns Not started when no activity has been submitted", () => {
  assert.equal(currentPhaseStatus(base), "Not started")
})

test("completed projects are reported as Completed", () => {
  assert.equal(currentPhaseStatus({ ...base, projectStatus: "completed", activities: [] }), "Completed")
})

test("priority order makes On hold beat Delayed and rework beat Delayed", () => {
  assert.equal(currentPhaseStatus({ ...base, targetCompletionDate: "2026-11-04", today: "2026-11-05", hasOpenBlockingIssue: true }), "On hold")
  assert.equal(currentPhaseStatus({ ...base, targetCompletionDate: "2026-11-04", today: "2026-11-05", activities: [{ status: "rework_required" }] }), "Rework required")
  assert.equal(currentPhaseStatus({ ...base, targetCompletionDate: "2026-11-04", today: "2026-11-05", activities: [{ status: "submitted" }] }), "Delayed")
})

test("client mapping hides staff-only details", () => {
  for (const staffStatus of ["On hold", "Rework required", "Awaiting review"]) {
    assert.equal(clientPhaseStatus(staffStatus), "Ongoing")
  }
  for (const status of ["Ongoing", "Delayed", "Ready for handoff", "Completed", "Not started"]) {
    assert.equal(clientPhaseStatus(status), status)
  }
})
