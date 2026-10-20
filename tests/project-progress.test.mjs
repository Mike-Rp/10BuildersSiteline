import assert from "node:assert/strict"
import test from "node:test"
import { calendarDay, overallChecklistProgress, plannedCompletion, progressGap } from "../src/project-progress.ts"

test("planned completion uses strict calendar dates and clamps at project boundaries", () => {
  assert.equal(plannedCompletion("2026-01-01", "2026-01-11", "2025-12-31"), 0)
  assert.equal(plannedCompletion("2026-01-01", "2026-01-11", "2026-01-01"), 0)
  assert.equal(plannedCompletion("2026-01-01", "2026-01-11", "2026-01-06"), 50)
  assert.equal(plannedCompletion("2026-01-01", "2026-01-11", "2026-01-11"), 100)
  assert.equal(plannedCompletion("2026-01-01", "2026-01-11", "2027-01-01"), 100)
  for (const [start, end, date] of [["", "2026-01-11", "2026-01-05"], ["2026-02-30", "2026-03-10", "2026-03-01"],
    ["2026-01-11", "2026-01-01", "2026-01-05"], ["2026-01-01", "2026-01-01", "2026-01-05"],
    ["2026-01-01", undefined, "2026-01-05"], ["2026-01-01", "2026-02-01", "invalid"]]) {
    assert.equal(plannedCompletion(start, end, date), null)
  }
  assert.notEqual(calendarDay("2028-02-29"), null)
  assert.equal(calendarDay("2027-02-29"), null)
})

test("date-based baseline is independent of timezone and daylight-saving transitions", () => {
  const original = process.env.TZ
  try {
    for (const timezone of ["Asia/Taipei", "America/New_York", "Pacific/Honolulu", "UTC"]) {
      process.env.TZ = timezone
      assert.equal(plannedCompletion("2026-03-07", "2026-03-11", "2026-03-09"), 50)
      assert.equal(plannedCompletion("2026-10-31", "2026-11-04", "2026-11-02"), 50)
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})

const phases = ["Mobilization", "Foundation", "Structure"]
const counts = [
  { id: "1", name: phases[0], configured: true, required: 5, approved: 5 },
  { id: "2", name: phases[1], configured: true, required: 15, approved: 15 },
  { id: "3", name: phases[2], configured: true, required: 80, approved: 20 },
]
test("overall completion weights activities across all phases and retains completed-phase credit", () => {
  const result = overallChecklistProgress(phases, counts)
  assert.equal(result.approved, 40)
  assert.equal(result.required, 100)
  assert.equal(result.percentage, 40) // Not an average of the phase percentages.
  assert.deepEqual(result.rows.map(p => p.percentage), [100, 100, 25])
  assert.deepEqual(result.rows.map(p => p.name), phases)
  assert.equal(overallChecklistProgress(phases, counts.map(p => p.name === "Structure" ? {...p, approved: 0} : p)).percentage, 20)
})

test("missing, duplicate, unconfigured, or invalid phase scope cannot yield overall totals", () => {
  for (const source of [undefined, [], counts.slice(0, 2), [...counts, counts[0]],
    counts.map(p => p.id === "3" ? {...p, configured: false} : p),
    counts.map(p => p.id === "3" ? {...p, required: 0} : p),
    counts.map(p => p.id === "3" ? {...p, approved: 81} : p),
    counts.map(p => p.id === "3" ? {...p, approved: 1.5} : p),
    counts.map(p => p.id === "3" ? {...p, id: "2"} : p)]) {
    const result = overallChecklistProgress(phases, source)
    assert.equal(result.percentage, null)
    assert.equal(result.required, null)
    assert.equal(result.approved, null)
  }
  assert.equal(overallChecklistProgress([], counts).percentage, null)
  assert.equal(overallChecklistProgress([...phases, phases[0]], counts).percentage, null)
  assert.equal(overallChecklistProgress(phases, counts.slice(0, 2)).rows[2].percentage, null)
})

test("gap labels use percentage points and require both valid measures", () => {
  assert.equal(progressGap(40, 50), "10 percentage points below date-based baseline.")
  assert.equal(progressGap(60, 50), "10 percentage points above date-based baseline.")
  assert.equal(progressGap(50, 50), "Matches date-based baseline.")
  assert.equal(progressGap(null, 50), null)
  assert.equal(progressGap(40, null), null)
})
