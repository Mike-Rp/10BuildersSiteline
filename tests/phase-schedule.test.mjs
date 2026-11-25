import assert from "node:assert/strict"
import test from "node:test"
import { forecastPhaseDelay, suggestPhaseSchedule } from "../Thesis-Backend/src/domain/phase-schedule.js"

const input = {
  phases: ["Mobilization", "Foundation", "Structure", "Envelope", "Closeout"],
  type: "Residential", complexity: "Moderate", start: "2027-01-11", area: 200,
}

test("suggests working dates with the reviewed start and selected arrangement", () => {
  const sequential = suggestPhaseSchedule({ ...input, arrangement: "Sequential phases" })
  const partial = suggestPhaseSchedule({ ...input, arrangement: "Partially overlapping phases" })
  assert.equal(partial.Mobilization.start, input.start)
  assert.equal(partial.Foundation.start, "2027-01-18")
  assert.equal(partial.Structure.end, "2027-03-26")
  assert.equal(partial.Envelope.start, "2027-03-15")
  assert.equal(partial.Envelope.overlapWith, "Structure")
  assert.equal(sequential.Envelope.start, "2027-03-29")
  assert.equal(partial.Envelope.days, sequential.Envelope.days)
})

test("previews a delayed zone release and preserves unrelated overlapping work", () => {
  const rules = suggestPhaseSchedule({ ...input, arrangement: "Partially overlapping phases" })
  const dates = Object.fromEntries(Object.entries(rules).map(([phase, { start, end }]) => [phase, { start, end }]))
  const forecast = forecastPhaseDelay(dates, "Envelope", "2027-03-22", rules)
  assert.deepEqual(forecast.Structure, dates.Structure)
  assert.deepEqual(forecast.Envelope, { start: "2027-03-22", end: "2027-04-09" })
  assert.equal(forecast.Closeout.start, "2027-04-12")
  assert.equal(dates.Envelope.start, "2027-03-15")
})
