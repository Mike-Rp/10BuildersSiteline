import assert from "node:assert/strict"
import test from "node:test"
import { averageFloorAreaError, floorAreaRange, normalizeFloorMeasurements, inquiryAssessmentReady } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

test("Admin can validate the total against the lot and floor count", () => {
  assert.deepEqual(floorAreaRange(800, 5), { maximum: 4000 })
  for (const [total, floors] of [[800, 1], [3000, 5], [1200, 2], [0.01, 2]]) {
    assert.equal(averageFloorAreaError(800, total, floors), "")
  }
  assert.match(averageFloorAreaError(800, 1000, 1), /must not exceed 800/)
  for (const total of [0, -1, "", undefined, "invalid"]) assert.ok(averageFloorAreaError(800, total, 1))
})

for (const project_type of ["Residential", "Commercial", "Mixed-Use"]) {
  test(`${project_type} requires valid measurements even with a saved assessment`, () => {
    const ready = (floorMeasurements, floor_count, floor_area_sqm) => inquiryAssessmentReady(
      { project_type, lot_area: 800, floor_count, floor_area_sqm },
      { assessment: { id: "stale" }, review: { floorMeasurements, mixed_use_scope: {} } },
    )
    const same = areaPerFloor => ({ mode: "same", areaPerFloor })
    const individual = (...areas) => ({ mode: "individual", areas })
    for (const [input, floors, total] of [[same(800), 1, 800], [same(600), 5, 3000], [individual(500, 700), 2, 1200]]) {
      assert.equal(normalizeFloorMeasurements(input, floors, 800).total, total)
      assert.equal(ready(input, floors, total), true)
    }
    for (const value of [1000, 0, -1, "", undefined, "invalid"]) {
      assert.equal(ready(same(value), 1, 800), false)
      assert.equal(ready(individual(100, value), 2, 800), false)
    }
    assert.equal(ready(undefined, 2, 1200), false)
    assert.equal(ready(individual(700), 2, 1200), false)
    assert.equal(ready(individual(500, 700), 2, 1100), false)
  })
}

test("decimal floor totals retain the existing precision", () => {
  assert.equal(normalizeFloorMeasurements({ mode: "individual", areas: [0.1, 0.2] }, 2, 800).total, 0.3)
})
