import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";

const access = await import("../src/common/utilities/access.utility.js");
let database;
mock.module("../src/common/utilities/access.utility.js", { namedExports: {
  ...access,
  requireUser: (req, res, roles) => {
    if (roles.includes(req.actor?.role)) return req.actor;
    access.sendError(res, "Forbidden.", 403);
    return null;
  },
} });
mock.module("../src/common/utilities/transaction.utility.js", {
  namedExports: { withTransaction: activity => database.transaction(activity) },
});
const { activateClient, issueClientActivationCode, provisionInquiryClient, CLIENT_ACTIVATION_PASSWORD_MARKER }
  = await import("../src/services/projects/client-onboarding.js");
const { login } = await import("../src/services/auth/controller.js");
const { selectIntakeClient } = await import("../src/services/projects/intake-client.controller.js");

async function call(action, request) {
  const response = {
    code: 200,
    set() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { return this.json(body); },
  };
  await action(request, response);
  return response;
}

test("inquiry provisioning, collision protection, and one-time client activation", async t => {
  database = new PGlite();
  t.after(() => database.close());
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  await database.exec(`CREATE TABLE roles (id smallint PRIMARY KEY, code text);
    INSERT INTO roles VALUES (5,'client');
    CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text, email text UNIQUE,
      phone text, password_hash text, role_id smallint, status text, temp_password_issued boolean,
      created_by uuid, updated_by uuid, updated_at timestamptz, last_login_at timestamptz, is_deleted boolean DEFAULT false);
    CREATE TABLE projects (id uuid PRIMARY KEY, suggested_opm_id uuid, is_deleted boolean DEFAULT false,
      client_name text DEFAULT 'Client Company', lifecycle_status text DEFAULT 'spm_review', inquiry_intake jsonb,
      updated_by uuid, updated_at timestamptz);
    CREATE TABLE user_client_project_links (user_id uuid, project_id uuid, created_by uuid, updated_by uuid, PRIMARY KEY(user_id,project_id));
    CREATE TABLE users_token (user_id uuid PRIMARY KEY, token text);
    CREATE TABLE workspace_account_metadata (user_id uuid PRIMARY KEY, metadata jsonb);`);

  const actor = { id: randomUUID(), role: "opm" };
  const projectId = randomUUID();
  const otherProject = randomUUID();
  await database.query(`INSERT INTO projects(id,suggested_opm_id,inquiry_intake) VALUES
    ($1,$2,'{"email":"client@example.org"}'),($3,$2,'{"email":"client@example.org"}')`, [projectId, actor.id, otherProject]);
  const details = { email: "  Client@Example.org  ", client_name: "Client contact", phone: "+639123456789" };
  const provision = (id, data) => database.transaction(db => provisionInquiryClient(db, id, data, actor.id));
  assert.equal(await provision(projectId, { ...details, email: "cruz.10B00168@10builders.com" }), "verification_required");
  assert.equal(await provision(projectId, details), "pending_activation");
  assert.equal(await provision(otherProject, details), "verification_required");
  assert.equal((await database.query("SELECT count(*)::int AS n FROM user_client_project_links")).rows[0].n, 1);
  const lookup = async () => (await database.query("SELECT * FROM users")).rows[0];
  assert.equal((await lookup()).email, "client@example.org");
  assert.equal((await lookup()).password_hash, CLIENT_ACTIVATION_PASSWORD_MARKER);

  const request = { actor, params: { id: projectId } };
  const email = "client@example.org";
  const password = "Client-controlled password";
  assert.equal((await call(login, { body: { email, password } })).body.error.code, "CLIENT_ACTIVATION_REQUIRED");
  assert.equal((await call(issueClientActivationCode, { ...request, actor: { id: actor.id, role: "admin" } })).code, 403);
  assert.equal((await call(issueClientActivationCode, { ...request, actor: { id: randomUUID(), role: "opm" } })).code, 409);
  const issued = await call(issueClientActivationCode, request);
  assert.equal(issued.code, 200);
  const first = issued.body.data.code;
  assert.match(first, /^[A-Za-z0-9_-]{24}$/);
  const stored = (await database.query("SELECT metadata FROM workspace_account_metadata")).rows[0].metadata;
  assert.equal(JSON.stringify(stored).includes(first), false);
  const activate = code => call(activateClient, { body: { email, code, password } });

  await database.exec("UPDATE workspace_account_metadata SET metadata=jsonb_set(metadata,'{clientActivation,expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text))");
  assert.equal((await activate(first)).body.error.code, "ACTIVATION_CODE_EXPIRED");
  const { body: { data: { code } } } = await call(issueClientActivationCode, request);
  assert.equal((await activate(first)).body.error.code, "ACTIVATION_CODE_INVALID");
  assert.equal((await activate(code)).body.data.status, "active");
  assert.equal((await activate(code)).body.error.code, "ACTIVATION_CODE_INVALID");
  const account = await lookup();
  assert.equal(account.status, "active");
  assert.equal(account.temp_password_issued, false);
  assert.equal(await bcrypt.compare(password, account.password_hash), true);
  assert.equal((await database.query("SELECT metadata FROM workspace_account_metadata")).rows[0].metadata.clientActivation, undefined);
  const signedIn = await call(login, { body: { email, password } });
  assert.equal(signedIn.code, 200);
  assert.ok(signedIn.body.data.token);

  const link = ownership_verified => call(selectIntakeClient, {
    actor: { id: randomUUID(), role: "admin" }, params: { id: otherProject },
    body: { client_user_id: account.id, ownership_verified },
  });
  assert.equal((await link(false)).code, 409);
  assert.equal((await link(true)).code, 200);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM user_client_project_links WHERE user_id=$1", [account.id])).rows[0].n, 2);
  assert.equal((await database.query("SELECT client_name FROM projects WHERE id=$1", [otherProject])).rows[0].client_name, "Client Company");
});
