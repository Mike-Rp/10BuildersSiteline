import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePhaseCoverage, phaseCoverageMessage, assertPhaseCoverage } from "../src/services/projects/phase-coverage.utility.js";

const workflow = codes => codes.map((code, i) => ({ project_stage_id: i + 1, code, sort_order: i + 1 }));
const COMMERCIAL = workflow(["Mobilization", "Design", "Foundation", "Structure", "Envelope / Curtain Wall", "MEP Rough-In",
  "Fire & Life Safety", "Fit-Out / Finishes", "Closeout"]);
const MIXED_USE = workflow(["Mobilization", "Design", "Foundation", "Podium Structure", "Tower Structure", "Envelope / Curtain Wall",
  "MEP Rough-In", "Fire & Life Safety", "Retail/Commercial Fit-Out", "Residential Fit-Out", "Landscape & Site Works", "Closeout"]);
const row = (phase, extra = {}) => ({ project_stage_id: phase.project_stage_id, stage_code: phase.code, spm_user_id: "u1",
  status: "confirmed", engineer_valid: true, ...extra });

test("the four-of-nine Commercial team (test1 shape) is blocked and names the five missing phases", () => {
  const rows = COMMERCIAL.filter(p => ["Mobilization", "Design", "Fit-Out / Finishes", "Closeout"].includes(p.code)).map(p => row(p));
  const c = evaluatePhaseCoverage(COMMERCIAL, rows);
  assert.equal(c.ok, false);
  assert.deepEqual(c.missing, ["Foundation", "Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety"]);
  assert.match(phaseCoverageMessage(c), /Missing assignments: Foundation, Structure, Envelope \/ Curtain Wall, MEP Rough-In, Fire & Life Safety/);
});

test("a missing phase stays blocked even when every existing row is confirmed", () => {
  const rows = COMMERCIAL.slice(0, 8).map(p => row(p));
  assert.ok(rows.every(r => r.status === "confirmed"));
  assert.deepEqual(evaluatePhaseCoverage(COMMERCIAL, rows).missing, ["Closeout"]);
});

test("unassigned, ineligible and unconfirmed required phases block activation", () => {
  const rows = COMMERCIAL.map(p => row(p));
  rows[2] = row(COMMERCIAL[2], { spm_user_id: null, engineer_valid: false });
  rows[3] = row(COMMERCIAL[3], { engineer_valid: false });
  rows[4] = row(COMMERCIAL[4], { status: "pending" });
  rows[5] = row(COMMERCIAL[5], { status: "declined" });
  const c = evaluatePhaseCoverage(COMMERCIAL, rows);
  assert.equal(c.ok, false);
  assert.deepEqual(c.unassigned, ["Foundation", "Structure"]);
  assert.deepEqual(c.unconfirmed, ["Envelope / Curtain Wall", "MEP Rough-In"]);
});

test("duplicate or extra rows cannot pad the count to hide a missing phase", () => {
  const rows = [...COMMERCIAL.slice(0, 8).map(p => row(p)), row(COMMERCIAL[1]), { ...row(COMMERCIAL[0]), project_stage_id: 99, stage_code: "Landscape & Site Works" }];
  assert.equal(rows.length, 10);
  const c = evaluatePhaseCoverage(COMMERCIAL, rows);
  assert.equal(c.ok, false);
  assert.deepEqual(c.missing, ["Closeout"]);
  assert.deepEqual(c.duplicate, ["Design"]);
  assert.deepEqual(c.extra, ["Landscape & Site Works"]);
  // Exactly nine rows, one per phase but with one swapped for an extra, is still blocked.
  const swapped = [...COMMERCIAL.slice(0, 8).map(p => row(p)), { ...row(COMMERCIAL[0]), project_stage_id: 99, stage_code: "X" }];
  assert.equal(evaluatePhaseCoverage(COMMERCIAL, swapped).ok, false);
});

test("a complete confirmed team passes", () => {
  assert.equal(evaluatePhaseCoverage(COMMERCIAL, COMMERCIAL.map(p => row(p))).ok, true);
});

test("Mixed-Use uses its own twelve phases, not the Commercial nine", () => {
  const commercialCodes = new Set(COMMERCIAL.map(p => p.code));
  const rows = MIXED_USE.filter(p => commercialCodes.has(p.code)).map(p => row(p));
  const c = evaluatePhaseCoverage(MIXED_USE, rows);
  assert.deepEqual(c.missing, ["Podium Structure", "Tower Structure", "Retail/Commercial Fit-Out", "Residential Fit-Out", "Landscape & Site Works"]);
  assert.equal(evaluatePhaseCoverage(MIXED_USE, MIXED_USE.map(p => row(p))).ok, true);
});

test("an unresolvable workflow fails safely, whatever the saved rows say", async () => {
  const c = evaluatePhaseCoverage([], COMMERCIAL.map(p => row(p)));
  assert.equal(c.ok, false);
  assert.equal(c.unresolved, true);
  await assert.rejects(assertPhaseCoverage(coverageDb([], 0, COMMERCIAL.map(p => row(p))), "p1"), err => err.status === 409 && /could not be resolved/.test(err.message));
});

// Mock database: the resolved workflow, the number of phase names it should hold, and the saved rows.
const coverageDb = (resolved, expected, rows, sqls = []) => ({ async query(sql, params) {
  sqls.push(sql.replace(/\s+/g, " "));
  if(sql.includes('to_regclass'))return {rows:[{ready:false}]};
  assert.deepEqual(params, ["p1"]);
  if (sql.includes("jsonb_array_length")) return { rows: [{ n: expected }] };
  if (sql.includes("FROM project_phase_team t")) return { rows };
  return { rows: resolved };
} });

test("the required list comes from the shared project workflow and assignment rows are locked", async () => {
  const sqls = [];
  await assertPhaseCoverage(coverageDb(COMMERCIAL, 9, COMMERCIAL.map(p => row(p)), sqls), "p1");
  assert.match(sqls[0], /FROM \( SELECT p.id AS project_id.*phase_scope/);
  assert.match(sqls[2], /FROM project_phase_team t .* FOR UPDATE OF t/);
});

test("a validated Mixed-Use scope is enforced as stored, not as the full type catalog", async () => {
  const scoped = MIXED_USE.filter(p => p.code !== "Retail/Commercial Fit-Out");
  await assertPhaseCoverage(coverageDb(scoped, 11, scoped.map(p => row(p))), "p1");
  const short = scoped.filter(p => p.code !== "Tower Structure");
  await assert.rejects(assertPhaseCoverage(coverageDb(scoped, 11, short.map(p => row(p))), "p1"), /Missing assignments: Tower Structure/);
});

test("scope names that do not resolve to a stage fail closed instead of shortening the list", async () => {
  const resolved = MIXED_USE.slice(0, 11);
  await assert.rejects(assertPhaseCoverage(coverageDb(resolved, 12, resolved.map(p => row(p))), "p1"), /could not be resolved/);
});
