import assert from "node:assert/strict"
import test from "node:test"
import { clientExecutiveSummary } from "../src/client-executive-summary.ts"
import { clientProjectViews } from "../src/client-access.ts"
import { initialState } from "./fixtures/demo-state.ts"

const project = () => ({ ...clientProjectViews(initialState(), "a9")[0], name: "Client project", phase: "Foundation", progress: 50, start: "2026-03-01", end: "2026-10-29", history: [], checklist: [], documents: [], photos: [] })

test("executive summary keeps phase progress distinct from completion and flags dates without forecasting delivery", () => {
  const p = project()
  const source = JSON.stringify(p)
  let summary = clientExecutiveSummary(p, "2026-10-27")
  assert.match(summary.narrative, /Foundation phase/)
  assert.match(summary.narrative, /current phase is 50%/)
  assert.equal(summary.schedule.label, "Target in 2 days")
  assert.match(summary.schedule.detail, /not a completion forecast/)
  summary = clientExecutiveSummary(p, "2026-10-29")
  assert.equal(summary.schedule.label, "Target date is today")
  summary = clientExecutiveSummary(p, "2026-10-30")
  assert.equal(summary.schedule.label, "Target date passed")
  assert.match(summary.schedule.detail, /Ask the project team/)
  summary = clientExecutiveSummary(p, "2026-09-01")
  assert.equal(summary.schedule.label, "Target date recorded")
  assert.ok(!JSON.stringify(summary).includes("On Schedule"))
  assert.equal(JSON.stringify(p), source)
})

test("summary handles missing and invalid data and honors the recorded completed lifecycle", () => {
  for (const end of [undefined, "bad-date", "2026-02-30", "2026-02-01"]) {
    const summary = clientExecutiveSummary({ ...project(), end, progress: Number.NaN }, "2026-10-27")
    assert.equal(summary.schedule.label, "Date not confirmed")
    assert.match(summary.narrative, /progress has not been shared/)
    assert.ok(!JSON.stringify(summary).includes("NaN"))
  }
  const completed = clientExecutiveSummary({ ...project(), status: "completed", completedAt: "2026-10-20T10:00:00Z" }, "2026-10-30")
  assert.equal(completed.schedule.label, "Completed")
  assert.match(completed.schedule.detail, /Oct 20, 2026/)
  assert.match(completed.narrative, /recorded as completed/)
  assert.ok(!completed.narrative.includes("100%"))
})

test("summary uses the latest shared record, excludes unavailable attachments, and describes team review without inventing Client decisions", () => {
  const summary = clientExecutiveSummary({ ...project(), history: [
    { id: "new", date: "2026-10-25", phase: "Foundation", progress: 50, text: "Latest shared update" },
    { id: "old", date: "2026-10-20", phase: "Foundation", progress: 40, text: "Older update" },
    { id: "invalid", date: "invalid", phase: "Foundation", progress: 20, text: "Undated update" },
  ], checklist: [{ label: "Client-visible activity", status: "under_review" }], documents: [{ id: "shared", uploaded: true }, { id: "missing", uploaded: false }], photos: [{ id: "photo", uploaded: true }] }, "2026-10-27")
  assert.equal(summary.latest.id, "new")
  assert.equal(summary.latestDate, "Oct 25, 2026")
  assert.equal(summary.documents, 1)
  assert.equal(summary.photos, 1)
  assert.equal(summary.underReview, 1)
  assert.ok(!JSON.stringify(summary).includes("Awaiting your approval"))
})
