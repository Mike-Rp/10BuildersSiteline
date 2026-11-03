import { test } from "node:test";
import assert from "node:assert/strict";
import { protectScope, recommendTeam, validatePlan } from "../src/domain/subcontractor-allocation.js";

const phases = [
  { name: "Foundation", disciplines: ["Civil", "Structural"] },
  { name: "Services", disciplines: ["Electrical", "Plumbing"] },
];
const companies = [
  { id: "civil", name: "Civil Co", status: "approved", reviewed: true, disciplines: ["Civil", "Structural"], commitments: 0 },
  { id: "services", name: "Services Co", status: "approved", reviewed: true, disciplines: ["Electrical", "Plumbing"], commitments: 0 },
  { id: "backup", name: "Backup Co", status: "approved", reviewed: true, disciplines: ["Civil", "Electrical"], commitments: 1 },
];

test("automatic allocation picks at least the project minimum of distinct verified companies and covers every phase trade", () => {
  const plan = recommendTeam("Residential", phases, companies);
  assert.ok(plan);
  assert.ok(plan.companyIds.length >= 2);
  assert.equal(new Set(plan.companyIds).size, plan.companyIds.length);
  assert.equal(plan.coverage.length, 4);
  assert.equal(validatePlan("Residential", phases, plan, companies), true);
});

test("allocation scope for contacted or accepted companies cannot be changed during replacement", () => {
  const plan = recommendTeam("Residential", phases, companies);
  assert.ok(plan);
  const retained = plan.companyIds[0];
  const altered = {
    ...plan,
    coverage: plan.coverage.map(row => row.companyId === retained ? { ...row, companyId: "backup" } : row),
  };
  assert.throws(() => protectScope(plan, altered, [retained]), /scopes are locked/);
});
