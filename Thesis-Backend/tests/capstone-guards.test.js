// Regression coverage for the capstone test-case fixes that can be checked without a database:
// ADM-ARCH-003 (active project deletion), SHR-NOT-007 (recommendation authentication),
// SHR-NOT-008 (temporary-password gate) and ADM-ALLOC-005 (50% specialty coverage).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { allocatePhaseCoverage, phaseCoverageQuota, MAX_ENGINEERS_PER_PHASE } from "../src/domain/engineer-phase-coverage.js";

const access = await import("../src/common/utilities/access.utility.js");
const projectId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const admin = { id: adminId, role: "admin" }, spm = { id: "33333333-3333-4333-8333-333333333333", role: "spm" };
let state;
const rows = values => ({ rows: values, rowCount: values.length });
function setup(options = {}) {
  state = { project: { id: projectId, lifecycle_status: "active", current_stage: "Structure" }, required: ["A", "B", "C"], queries: [], mutations: [], ...options };
  return state;
}
async function query(sql, args = []) {
  sql = sql.replace(/\s+/g, " ").trim(); state.queries.push({ sql, args });
  if (sql.startsWith("SELECT p.*, s.code AS current_stage")) return rows([state.project]);
  if (sql.startsWith("UPDATE ")) { state.mutations.push(sql); return rows([{}]); }
  if (sql.startsWith("select to_regclass")) return rows([{ ready: true }]);
  if (sql.startsWith("select d.code from project_stage_discipline_links")) return rows(state.required.map(code => ({ code })));
  if (sql.startsWith("select exists(select 1 from information_schema.columns")) return rows([{ ready: false }]);
  if (sql.startsWith("SELECT u.id FROM public.users u")) return rows([{ id: args[0] }]);
  throw new Error("Unexpected query: " + sql);
}
mock.module("../src/common/utilities/query.utility.js", { defaultExport: query, namedExports: { execute: query } });
mock.module("../src/common/utilities/transaction.utility.js", { namedExports: { withTransaction: async fn => fn({ query }) } });
mock.module("../src/common/utilities/access.utility.js", { namedExports: { ...access,
  requireUser: async (req, res, roles) => {
    if (!req.actor) { access.sendError(res, "Missing or invalid token.", 401); return null; }
    if (roles && !roles.includes(req.actor.role)) { access.sendError(res, "You do not have permission to perform this action.", 403); return null; }
    return req.actor;
  },
  hasProjectAccess: async () => true,
} });
const projects = await import("../src/services/projects/controller.js");
const recommend = await import("../src/services/projects/recommend.controller.js");
const responsibilities = await import("../src/services/projects/phase-responsibilities.utility.js");

function response() {
  return { statusCode: 200, body: null, sent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.sent = true; this.body = body ?? null; return this; } };
}
const request = (actor, { params = {}, query = {}, body = {} } = {}) => ({ actor, params, query, body, headers: {} });

test("ADM-ARCH-003: an ordinary deletion request never removes an active or archived project", async () => {
  for (const [lifecycle, code] of [["active", "PROJECT_ACTIVE"], ["archived", "PROJECT_ARCHIVED"]]) {
    setup({ project: { id: projectId, lifecycle_status: lifecycle } });
    const res = response();
    await projects.deleteProject(request(admin, { params: { id: projectId } }), res);
    assert.equal(res.statusCode, 409, lifecycle);
    assert.equal(res.body.error.code, code);
    assert.deepEqual(state.mutations, [], "no project, engineer or subcontractor record changes");
  }
});

test("ADM-ARCH-003: intake-stage projects remain removable by an Administrator only", async () => {
  setup({ project: { id: projectId, lifecycle_status: "sent_to_opm" } });
  let res = response();
  await projects.deleteProject(request(admin, { params: { id: projectId } }), res);
  assert.equal(res.statusCode, 204);
  assert.ok(state.mutations.some(sql => sql.includes("is_deleted = true")));
  setup({ project: { id: projectId, lifecycle_status: "sent_to_opm" } });
  res = response();
  await projects.deleteProject(request(spm, { params: { id: projectId } }), res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(state.mutations, []);
});

test("SHR-NOT-007: every recommendation endpoint refuses signed-out and non-intake sessions without personnel data", async () => {
  const query = { project_type: "Residential", floor_area_sqm: "500", floor_count: "2" };
  for (const handler of [recommend.getRecommendations, recommend.rerunRecommendations, recommend.swapOpm]) {
    setup();
    let res = response();
    await handler(request(undefined, { query }), res);
    assert.equal(res.statusCode, 401, handler.name);
    assert.equal(res.body.data, undefined);
    assert.deepEqual(state.queries, [], "no personnel lookup runs for a signed-out request");
    for (const actor of [spm, { id: adminId, role: "client" }]) {
      res = response();
      await handler(request(actor, { query }), res);
      assert.equal(res.statusCode, 403, `${handler.name} ${actor.role}`);
      assert.equal(res.body.data, undefined);
    }
    assert.deepEqual(state.queries, []);
  }
});

test("SHR-NOT-008: a temporary password only unlocks the session, password-reset and sign-out routes", () => {
  const allowed = [["GET", "/api/v1/auth/me"], ["POST", "/api/v1/auth/reset-password"], ["PATCH", "/api/v1/auth"], ["DELETE", "/api/v1/auth"],
    ["POST", "/api/v1/auth/logout"], ["GET", "/api/v1/auth/session"], ["POST", "/api/v1/auth/activity"], ["PUT", "/api/v1/auth"], ["POST", "/api/v1/auth/admin/change-password"]];
  for (const [method, url] of allowed) assert.equal(access.passwordChangeAllowed({ method, originalUrl: url + "?x=1" }), true, `${method} ${url}`);
  const blocked = [["GET", "/api/v1/workspace"], ["GET", "/api/v1/projects"], ["PATCH", "/api/v1/accounts/" + adminId], ["POST", "/api/v1/workspace/preferences"],
    ["GET", "/api/v1/notifications"], ["POST", "/api/v1/projects/intake"], ["GET", "/api/v1/auth/admin/recovery-codes"], ["DELETE", "/api/v1/projects/" + projectId]];
  for (const [method, url] of blocked) assert.equal(access.passwordChangeAllowed({ method, originalUrl: url }), false, `${method} ${url}`);
});

test("ADM-ALLOC-005: the coverage quota is half of the unique required tags, rounded up, for every phase", () => {
  for (const [count, quota] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]])
    assert.equal(phaseCoverageQuota(Array.from({ length: count }, (_, index) => "tag" + index)), quota, `${count} tags`);
  assert.equal(phaseCoverageQuota(["A", "A", "B", "C"]), 2, "duplicates do not inflate the requirement");
  assert.equal(MAX_ENGINEERS_PER_PHASE, 3);
});

test("ADM-ALLOC-005: recommendations prefer full coverage but accept 2 of 3 and never exceed three engineers", () => {
  const partial = allocatePhaseCoverage(["A", "B", "C"], [{ id: "x", qualifiedTags: ["A", "B"] }]);
  assert.deepEqual(partial.engineers, [{ id: "x", tags: ["A", "B"] }]);
  assert.equal(partial.covered, 2); assert.equal(partial.quota, 2); assert.equal(partial.quotaMet, true); assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ["C"]);
  const single = allocatePhaseCoverage(["A", "B", "C"], [{ id: "x", qualifiedTags: ["A"] }]);
  assert.equal(single.quotaMet, false); assert.equal(single.covered, 1);
  const full = allocatePhaseCoverage(["A", "B", "C"], [{ id: "x", qualifiedTags: ["A", "B"] }, { id: "y", qualifiedTags: ["C"] }]);
  assert.equal(full.complete, true); assert.equal(full.engineers.length, 2);
  const fewest = allocatePhaseCoverage(["A", "B", "C"], [{ id: "x", qualifiedTags: ["A", "B"] }, { id: "y", qualifiedTags: ["A", "B", "C"] }]);
  assert.equal(fewest.complete, true); assert.deepEqual(fewest.engineers.map(e => e.id), ["y"], "one engineer with full coverage beats two");
  const crowded = allocatePhaseCoverage(["A", "B", "C", "D"], ["A", "B", "C", "D"].map(tag => ({ id: tag, qualifiedTags: [tag] })));
  assert.ok(crowded.engineers.length <= MAX_ENGINEERS_PER_PHASE);
  assert.equal(crowded.covered, 3); assert.equal(crowded.quotaMet, true); assert.equal(crowded.complete, false);
  const none = allocatePhaseCoverage(["A", "B"], [{ id: "x", qualifiedTags: ["Z"] }]);
  assert.deepEqual(none.engineers, []); assert.equal(none.quotaMet, false);
});

test("ADM-ALLOC-005: intake and allocation validation accept 2 of 3 specialty tags and keep the other limits", async () => {
  const team = engineers => [{ stage: "Foundation", user_id: engineers[0].user_id, engineers }];
  setup({ required: ["A", "B", "C"] });
  assert.equal(await responsibilities.preparePhaseResponsibilities({ query }, 1, team([{ user_id: "u1", assigned_disciplines: ["A", "B"] }])), true, "2 of 3 passes");
  setup({ required: ["A", "B", "C"] });
  await assert.rejects(responsibilities.preparePhaseResponsibilities({ query }, 1, team([{ user_id: "u1", assigned_disciplines: ["A"] }])),
    e => e.status === 422 && /minimum of 2 of 3/.test(e.message), "1 of 3 is below the quota");
  setup({ required: ["A", "B", "C", "D"] });
  assert.equal(await responsibilities.preparePhaseResponsibilities({ query }, 1, team([{ user_id: "u1", assigned_disciplines: ["A", "B"] }])), true, "2 of 4 passes");
  setup({ required: ["A", "B"] });
  assert.equal(await responsibilities.preparePhaseResponsibilities({ query }, 1, team([{ user_id: "u1", assigned_disciplines: ["A"] }])), true, "1 of 2 passes");
  setup({ required: ["A", "B", "C", "D"] });
  await assert.rejects(responsibilities.preparePhaseResponsibilities({ query }, 1, team(["A", "B", "C", "D"].map((tag, index) => ({ user_id: "u" + index, assigned_disciplines: [tag] })))),
    e => e.status === 422 && /no more than three engineers/.test(e.message), "the three-engineer limit applies to every phase size");
  setup({ required: ["A", "B", "C"] });
  await assert.rejects(responsibilities.preparePhaseResponsibilities({ query }, 1, team([{ user_id: "u1", assigned_disciplines: ["A", "Z"] }])),
    e => e.status === 422 && /qualified owner/.test(e.message), "unknown tags are still refused");
});
