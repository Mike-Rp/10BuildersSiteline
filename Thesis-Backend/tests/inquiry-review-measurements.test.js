import { test } from "node:test";
import assert from "node:assert/strict";
import { inquiryDetails } from "../src/services/projects/inquiries.js";
import { normalizeFloorMeasurements } from "../src/domain/inquiry-assessment.js";

const submitted = {
  client_name: "Sample Client", email: "client@example.com", phone: "+639321321321",
  name: "Sample Project", address: "Sample Address", project_type: "Residential",
  lot_area: 234, floor_count: 100, floor_area_sqm: 3, consultation: 30,
};

test("review validates corrected floor count and measurements after reading the older submission", () => {
  const before = inquiryDetails(submitted, { validateAverage: false });
  const corrected = { ...before, floor_count: 10 };
  const areas = normalizeFloorMeasurements({ mode: "same", areaPerFloor: 220 }, corrected.floor_count, corrected.lot_area);
  assert.equal(areas?.total, 2200);
  corrected.floor_area_sqm = areas.total;
  const after = inquiryDetails(corrected);
  assert.equal(after.floor_count, 10);
  assert.equal(after.floor_area_sqm, 2200);
});

test("submitted measurements still require the minimum average floor area", () => {
  assert.throws(() => inquiryDetails(submitted), /at least 2,000|at least 20/);
});
