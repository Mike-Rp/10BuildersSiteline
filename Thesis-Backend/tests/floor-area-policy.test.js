import test from "node:test";
import assert from "node:assert/strict";
import { inquiryDetails, staffingAssessment } from "../src/services/projects/inquiries.js";

const input = {
  client_name: "Sample", email: "client@example.com", phone: "+639321321321",
  name: "Sample", address: "Sample", lot_area: 800, consultation: 30,
};

for (const project_type of ["Residential", "Commercial", "Mixed-Use"]) {
  test(`${project_type} inquiry intake validates the available total`, () => {
    const project = { ...input, project_type, floor_count: 1 };
    assert.throws(() => inquiryDetails({ ...project, floor_area_sqm: 1000 }), /must not exceed/);
    assert.equal(inquiryDetails({ ...project, floor_area_sqm: 800 }).floor_area_sqm, 800);
    assert.equal(inquiryDetails({ ...project, floor_count: 5, floor_area_sqm: 3000 }).floor_area_sqm, 3000);
    for (const floor_area_sqm of [0, -1, "", undefined, "invalid", true])
      assert.throws(() => inquiryDetails({ ...project, floor_area_sqm }), /positive/);
  });

  test(`${project_type} staffing rejects stale assessments with invalid or missing breakdowns`, () => {
    const assessment = { id: "saved" };
    const review = { start: "2027-01-01", end: "2028-01-01" };
    const project = { ...input, project_type, floor_count: 2, floor_area_sqm: 1200 };
    const request = { ...project, assessment_id: "saved", estimated_budget: 1,
      target_start_date: review.start, target_end_date: review.end };
    const row = floorMeasurements => ({
      details: { ...project, opm_workflow: { assessment, budget: 1, review: { ...review, floorMeasurements } } },
    });
    assert.throws(() => staffingAssessment(row(undefined), request), /valid lot and individual floor areas/);
    assert.throws(() => staffingAssessment(row({ mode: "individual", areas: [200, 1000] }), request), /valid lot and individual floor areas/);
    assert.equal(staffingAssessment(row({ mode: "individual", areas: [500, 700] }), request), assessment);
  });
}
