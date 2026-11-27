import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { issueOwnedCode } from "../src/services/projects/client-owned-activation.js";

test("client invitations open only after project activation and do not create a login", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY,suggested_opm_id uuid,lifecycle_status text,is_deleted boolean DEFAULT false,inquiry_intake jsonb);`);
  await db.exec(await readFile(new URL("../migrations/044-client-owned-activation.sql", import.meta.url), "utf8"));
  const actor = { id: randomUUID(), role: "opm" }, id = randomUUID();
  await db.query("INSERT INTO users(id) VALUES($1)", [actor.id]);
  await db.query("INSERT INTO projects VALUES($1,$2,'spm_review',false,$3)", [id, actor.id, { email: "contact@example.org", client_name: "Test Client" }]);
  await assert.rejects(db.transaction(tx => issueOwnedCode(tx,id,actor,true)), /assigned Office PM/);
  assert.equal((await db.query("SELECT count(*)::int n FROM client_portal_invitations")).rows[0].n,0);
  await db.query("UPDATE projects SET lifecycle_status='active' WHERE id=$1", [id]);
  const invitation = await db.transaction(tx => issueOwnedCode(tx,id,actor,true));
  assert.match(invitation.code,/^[A-Za-z0-9_-]{24}$/);
  assert.equal((await db.query("SELECT count(*)::int n FROM users")).rows[0].n,1,"only the existing staff account exists");
  assert.equal((await db.query("SELECT count(*)::int n FROM client_portal_invitations")).rows[0].n,1);
});
