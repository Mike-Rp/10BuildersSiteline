import process from "node:process";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const userId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";
const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "license-file-access-test-secret-0123456789";
const query = async sql => {
  if (sql.startsWith("SELECT u.id, u.full_name, r.code AS role")) return { rows: [{ id: userId, full_name: "SPM Example", role: "spm" }], rowCount: 1 };
  if (sql.startsWith("select metadata->'sessionActivity' as activity")) return { rows: [], rowCount: 0 };
  if (sql.startsWith("select license_expiry::text as expiry")) return { rows: [{ expiry: "2100-01-01" }], rowCount: 1 };
  if (sql.includes("as pending")) return { rows: [{ pending: true }], rowCount: 1 };
  if (sql.startsWith("select 1 from license_renewal_requests where user_id=")) return { rows: [{ id: 1 }], rowCount: 1 };
  throw new Error(`Unexpected query: ${sql}`);
};
mock.module("../src/common/utilities/query.utility.js", { defaultExport: query, namedExports: { execute: query } });
const { getCurrentUser } = await import("../src/common/utilities/access.utility.js");

test("an engineer can open their own pending renewal file while the current license is still valid", async t => {
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const token = jwt.sign({ details: { id: userId } }, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: "license-file-session" });
  const user = await getCurrentUser({
    method: "GET",
    originalUrl: `/api/v1/files/${fileId}/content`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(user.id, userId);
});
