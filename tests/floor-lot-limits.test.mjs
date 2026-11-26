import test from "node:test"
import assert from "node:assert/strict"
import { averageFloorAreaError, floorAreaRange, normalizeFloorMeasurements } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

test("average floor area is 50% to 70% larger than the lot", () => {
  assert.deepEqual(floorAreaRange(200, 2), { minimumAverage: 300, maximumAverage: 340, minimum: 600, maximum: 680 })
  for (const total of [600, 640, 680]) assert.equal(averageFloorAreaError(200, total, 2), "")
  for (const total of [200, 400, 599.99, 680.01]) assert.match(averageFloorAreaError(200, total, 2), /150%/)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 300}, 2, 200).total, 600)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 340}, 2, 200).total, 680)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 299.99}, 2, 200), null)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 340.01}, 2, 200), null)
})

test("individual floors use the combined average rather than a separate lot cap", () => {
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [200, 440]}, 2, 200).total, 640)
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [200, 399.99]}, 2, 200), null)
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [200, 480.01]}, 2, 200), null)
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [0, 640]}, 2, 200), null)
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [320, ""]}, 2, 200), null)
  assert.equal(normalizeFloorMeasurements({mode: "individual", areas: [320]}, 2, 200), null)
})

test("decimal boundaries and existing input limits remain consistent", () => {
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 30.15}, 2, 20.1).total, 60.3)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 34.17}, 2, 20.1).total, 68.34)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 20}, 2).total, 40)
  assert.equal(normalizeFloorMeasurements({mode: "same", areaPerFloor: 19.99}, 2), null)
  assert.equal(floorAreaRange(0, 2), null)
  assert.equal(floorAreaRange(200, 201), null)
})
