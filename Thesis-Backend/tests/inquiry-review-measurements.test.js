import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { defaultMixedUseScope } from "../src/domain/mixed-use-scope.js";

let row;
const query = async (sql, args) => {
  if (sql.startsWith("SELECT")) return { rows: [row] };
  if (sql.startsWith("UPDATE project_inquiries SET details=")) {
    row = { ...row, details: JSON.parse(args[1]) };
    return { rows: [row] };
  }
  throw new Error(`Unexpected query: ${sql}`);
};
const access = await import("../src/common/utilities/access.utility.js");
mock.module("../src/common/utilities/access.utility.js", {
  namedExports: { ...access, requireUser: async () => ({ id: "opm", role: "opm" }) },
});
mock.module("../src/common/utilities/query.utility.js", { defaultExport: query, namedExports: { execute: query } });
mock.module("../src/common/utilities/transaction.utility.js", { namedExports: { withTransaction: fn => fn({ query }) } });
const { inquiryDetails, mountInquiries } = await import("../src/services/projects/inquiries.js");
const routes = new Map();
const register = (path, handler) => routes.set(path, handler);
mountInquiries({ post: register, get: (path, handler) => register(`GET ${path}`, handler), delete() {} });

async function request(path, body, expectedStatus) {
  const response = {
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; },
  };
  await routes.get(path)({ params: { id: row.id }, body }, response);
  assert.equal(response.code, expectedStatus, response.payload?.message);
  return response.payload.data;
}
import { normalizeFloorMeasurements } from "../src/domain/inquiry-assessment.js";

const submitted = {
  client_name: "Sample Client", email: "client@example.com", phone: "+639321321321",
  name: "Sample Project", address: "Sample Address", project_type: "Residential",
  lot_area: 234, floor_count: 100, floor_area_sqm: 30000, consultation: 30,
};

test("review validates corrected floor count and measurements after reading the older submission", () => {
  const before = inquiryDetails(submitted, { validateDimensions: false });
  const corrected = { ...before, floor_count: 10 };
  const areas = normalizeFloorMeasurements({ mode: "same", areaPerFloor: 220 }, corrected.floor_count, corrected.lot_area);
  assert.equal(areas?.total, 2200);
  corrected.floor_area_sqm = areas.total;
  const after = inquiryDetails(corrected);
  assert.equal(after.floor_count, 10);
  assert.equal(after.floor_area_sqm, 2200);
});

test("submitted measurements still reject totals that cannot fit within the lot across all floors", () => {
  assert.throws(() => inquiryDetails(submitted), /must not exceed/);
});

for (const project_type of ["Residential", "Commercial", "Mixed-Use"]) {
  test(`${project_type} workflow blocks invalid reviews and stale assessment and planning requests`, async () => {
    row = {
      id: "11111111-1111-4111-8111-111111111111", status: "approved",
      details: { ...submitted, project_type, lot_area: 800, floor_count: 2, floor_area_sqm: 1200 },
    };
    const workflow = "/inquiries/:id/workflow";
    const year = new Date().getUTCFullYear() + 1;
    const settings = { technical: "Standard construction", arrangement: "Sequential phases" };
    const review = {
      ...settings, action: "review", version: 0, start: `${year}-02-01`, end: `${year + 8}-02-01`,
      amount: 100_000_000, mixed_use_scope: defaultMixedUseScope(),
    };
    await request(workflow, review, 422);
    for (const area of [1000, 0, -1, "", undefined, "invalid"]) {
      await request(workflow, { ...review, floorMeasurements: { mode: "individual", areas: [200, area] } }, 422);
    }
    const result = await request(workflow, {
      ...review, floorMeasurements: { mode: "individual", areas: [500, 700] },
    }, 200);
    assert.equal(result.details.floor_area_sqm, 1200);
    const assessment = { ...settings, action: "assessment", version: 1 };
    const saved = await request(workflow, assessment, 200);
    row.details.lot_area = 600;
    const [stale] = await request("GET /inquiries", undefined, 200);
    assert.equal(stale.workflow.assessment, undefined);
    assert.equal(stale.workflow.review.estimate.end, null);
    await request(workflow, assessment, 422);
    await request("/inquiries/:id/planning", { assessment_id: saved.workflow.assessment.id }, 422);
  });
}
