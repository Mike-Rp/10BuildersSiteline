import { test } from "node:test";
import assert from "node:assert/strict";
import { DEDICATED_MIGRATIONS, RUNNER_MIGRATIONS, migrationPlan } from "../scripts/migration-plan.js";

test("general migration plan is explicit, ordered, and keeps recovery/data-review scripts separate", () => {
  const files = [...RUNNER_MIGRATIONS, ...Object.keys(DEDICATED_MIGRATIONS)];
  const plan = migrationPlan(files, ["015-engineer-credentials.sql"]);
  const runner = plan.filter(step => step.action === "runner").map(step => step.name);

  assert.deepEqual(runner, RUNNER_MIGRATIONS);
  assert.equal(runner.includes("004-verified-activity-progress.sql"), false);
  assert.equal(runner.includes("007-standard-phase-scope-revision.sql"), false);
  assert.equal(plan.find(step => step.name === "017-project-photo-review.sql")?.action, "runner");
  assert.equal(plan.find(step => step.name === "011-independent-notifications.sql")?.action, "dedicated");
});

test("migration plan excludes applied files and rejects migrations absent from the reviewed manifest", () => {
  const files = [...RUNNER_MIGRATIONS, ...Object.keys(DEDICATED_MIGRATIONS)];
  const plan = migrationPlan(files, ["015-engineer-credentials.sql", "001-phase-checklists.sql", "002-phase-update-confirmation.sql"]);
  assert.equal(plan.some(step => step.name === "001-phase-checklists.sql"), false);
  assert.throws(() => migrationPlan([...files, "018-new-change.sql"], []), /manifest needs review/);
});

test("migration plan recognizes historical ledger names from the original Supabase schema", () => {
  const files = [...RUNNER_MIGRATIONS, ...Object.keys(DEDICATED_MIGRATIONS)];
  const plan = migrationPlan(files, ["015-engineer-credentials.sql", "003-integration-foundation.sql", "004-project-type-workflows"]);
  assert.equal(plan.some(step => step.name === "003-react-integration.sql"), false);
  assert.equal(plan.some(step => step.name === "004-project-type-workflows.sql"), false);
});

test("migration plan enforces schema prerequisites before later migrations", () => {
  assert.throws(() => migrationPlan(
    RUNNER_MIGRATIONS.filter(name => name !== "010-photo-release.sql"),
    ["001-phase-checklists.sql", "002-phase-update-confirmation.sql", "003-react-integration.sql", "004-project-type-workflows.sql"],
  ), /017 requires 010-photo-release/);
});
