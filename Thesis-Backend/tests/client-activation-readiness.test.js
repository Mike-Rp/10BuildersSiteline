import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProjectClientReady } from "../src/services/projects/client-activation-readiness.js";

const account = { id: "client", status: "active", role: "client", is_deleted: false };
const database = (links, invitation, installed = true) => ({ async query(sql) {
  if (sql.includes("FROM user_client_project_links")) return { rows: links };
  if (sql.includes("to_regclass")) return { rows: [{ ready: installed }] };
  if (sql.includes("FROM client_portal_invitations")) return { rows: invitation ? [invitation] : [] };
  throw new Error("Unexpected query");
} });
test("activation distinguishes missing, unavailable and ambiguous client links", async () => {
  await assert.rejects(assertProjectClientReady(database([]), "project"), { errorCode: "CLIENT_PROJECT_ACCOUNT_MISSING" });
  await assert.rejects(assertProjectClientReady(database([{ ...account, status: "suspended" }]), "project"), { errorCode: "CLIENT_PROJECT_ACCOUNT_UNAVAILABLE" });
  await assert.rejects(assertProjectClientReady(database([account, { ...account, id: "other" }]), "project"), { errorCode: "CLIENT_PROJECT_LINK_AMBIGUOUS" });
});
test("legacy invited accounts remain supported without invitation migration", async () => {
  const pending = { ...account, status: "invited" };
  assert.equal(await assertProjectClientReady(database([pending], undefined, false), "project"), pending);
  assert.equal(await assertProjectClientReady(database([account]), "project"), account);
});
test("unredeemed invitations never bypass client verification", async () => {
  await assert.rejects(assertProjectClientReady(database([], { redeemed_at: null }), "project"), { errorCode: "CLIENT_PROJECT_INVITATION_PENDING" });
  await assert.rejects(assertProjectClientReady(database([account], { redeemed_at: null }), "project"), { errorCode: "CLIENT_PROJECT_INVITATION_PENDING" });
  await assert.rejects(assertProjectClientReady(database([account], { redeemed_at: "2026-11-27", redeemed_by: "someone-else" }), "project"), { errorCode: "CLIENT_PROJECT_ACCOUNT_UNVERIFIED" });
  assert.equal(await assertProjectClientReady(database([account], { redeemed_at: "2026-11-27", redeemed_by: account.id }), "project"), account);
});
