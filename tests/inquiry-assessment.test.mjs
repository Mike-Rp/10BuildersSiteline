import assert from "node:assert/strict"
import test from "node:test"
import { assessInquiry, inquiryCostEstimate } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

test("floor count affects duration without adding complexity points", () => {
  const details = { project_type: "Residential", lot_area: 240, floor_area_sqm: 200 }
  const estimates = [1, 4, 10].map(floor_count => assessInquiry(
    { ...details, floor_count }, "2027-01-12", "2027-08-15",
    "Several specialized systems", "Partially overlapping phases",
  ))
  for (const estimate of estimates) {
    assert.equal(estimate.score, 7)
    assert.equal(estimate.complexity, "Low")
    assert.deepEqual(inquiryCostEstimate(details, estimate.complexity), { minimum: 4320000, maximum: 5040000 })
  }
  assert.ok(estimates[0].planningDays < estimates[1].planningDays)
  assert.ok(estimates[1].planningDays < estimates[2].planningDays)
})
