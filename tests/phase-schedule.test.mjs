import assert from "node:assert/strict"
import test from "node:test"
import { forecastPhaseDelay, MIN_PHASE_CALENDAR_DAYS, phaseWorkday, suggestPhaseSchedule } from "../Thesis-Backend/src/domain/phase-schedule.js"

const input = {
  phases: ["Mobilization", "Design", "Foundation", "Structure", "Envelope", "Closeout"],
  type: "Residential", start: "2027-01-11", end: "2027-12-31", area: 200,
}

for (const arrangement of ["Sequential phases", "Partially overlapping phases", "Highly concurrent phases"]) {
  test(`allocates the reviewed window and preserves dependencies: ${arrangement}`, () => {
    const schedule = suggestPhaseSchedule({ ...input, arrangement })
    assert.equal(schedule.Mobilization.start, input.start)
    assert.ok(Object.values(schedule).every(range => range.days >= MIN_PHASE_CALENDAR_DAYS))
    assert.ok(Object.values(schedule).every(range => range.end <= input.end))
    assert.equal(schedule.Design.start, phaseWorkday(schedule.Mobilization.end, 1))
    assert.equal(schedule.Foundation.start, phaseWorkday(schedule.Design.end, 1))
    if (arrangement === "Sequential phases") assert.ok(schedule.Envelope.start > schedule.Structure.end)
    else assert.equal(schedule.Envelope.overlapWith, "Structure")
  })
}

test("uses the same reviewed window regardless of floor area or complexity", () => {
  const first = suggestPhaseSchedule({ ...input, arrangement: "Sequential phases" })
  const second = suggestPhaseSchedule({ ...input, area: 2200, complexity: "High", arrangement: "Sequential phases" })
  assert.deepEqual(first, second)
})

test("keeps a delayed phase's calendar duration and moves dependent phases", () => {
  const rules = suggestPhaseSchedule({ ...input, arrangement: "Partially overlapping phases" })
  const dates = Object.fromEntries(Object.entries(rules).map(([phase, { start, end }]) => [phase, { start, end }]))
  const release = phaseWorkday(dates.Envelope.start, 7)
  const forecast = forecastPhaseDelay(dates, "Envelope", release, rules)
  assert.equal(forecast.Structure.start, dates.Structure.start)
  assert.equal(forecast.Envelope.start, release)
  assert.equal(forecast.Envelope.end, phaseWorkday(dates.Envelope.end, 7))
  assert.ok(forecast.Closeout.start > forecast.Envelope.end)
})

test("keeps the 14-day minimum visible when the project window is too short", () => {
  const schedule = suggestPhaseSchedule({ ...input, end: "2027-02-01", arrangement: "Sequential phases" })
  assert.ok(Object.values(schedule).every(range => range.days >= MIN_PHASE_CALENDAR_DAYS))
  assert.ok(schedule.Closeout.end > "2027-02-01")
})
