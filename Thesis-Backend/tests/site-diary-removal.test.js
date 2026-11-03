import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as access from "../src/common/utilities/access.utility.js";

let db;
mock.module("../src/common/utilities/transaction.utility.js", {
  namedExports: { withTransaction: callback => callback(db) },
});
mock.module("../src/common/utilities/query.utility.js", {
  defaultExport: (sql, params) => db.query(sql, params),
  namedExports: { execute: (sql, params) => db.query(sql, params) },
});
mock.module("../src/common/utilities/access.utility.js", {
  namedExports: {
    ...access,
    requireUser: async (req, res, roles) => {
      if (!req.actor) { access.sendError(res, "Missing token.", 401); return null; }
      if (roles && !roles.includes(req.actor.role)) { access.sendError(res, "Forbidden.", 403); return null; }
      return req.actor;
    },
    hasProjectAccess: async user => user.allowed !== false,
  },
});
mock.module("../src/services/notifications/notification.utility.js", {
  namedExports: { mirrorLegacyNotifications: async () => {} },
});
const { removeProjectNote } = await import("../src/services/progress/controller.js");

const projectId = "11111111-1111-4111-8111-111111111111";
const noteId = "44444444-4444-4444-8444-444444444444";
const opm = { id: "22222222-2222-4222-8222-222222222222", role: "opm" };
const authorId = "33333333-3333-4333-8333-333333333333";

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(actor = opm, reason = "Unrelated to project") {
  return { actor, body: { reason }, params: { id: projectId, noteId } };
}
function database({ project = { suggested_opm_id: opm.id, lifecycle_status: "active" }, note = { id: noteId, author_id: authorId, note_text: "Unrelated note" } } = {}) {
  const calls = [];
  db = { calls, async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: normalized, params });
    if (normalized.startsWith("select set_config")) return { rows: [], rowCount: 0 };
    if (normalized.startsWith("select suggested_opm_id")) return { rows: project ? [project] : [], rowCount: project ? 1 : 0 };
    if (normalized.startsWith("select id,author_id,note_text")) return { rows: note ? [note] : [], rowCount: note ? 1 : 0 };
    if (normalized.startsWith("delete from project_notes")) return { rows: [], rowCount: 1 };
    if (normalized.startsWith("insert into activity_log")) return { rows: [{ id: "9" }], rowCount: 1 };
    if (normalized.startsWith("insert into notification_recipients")) return { rows: [], rowCount: 2 };
    throw new Error("Unexpected diary query: " + normalized);
  } };
  return db;
}

test("assigned OPM removal records an audit notice and notifies the note author", async () => {
  const state = database();
  const res = response();
  await removeProjectNote(request(), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /retained in the audit log/);
  const deletion = state.calls.find(call => call.sql.startsWith("delete from project_notes"));
  assert.deepEqual(deletion.params, [noteId, projectId]);
  const recipients = state.calls.find(call => call.sql.startsWith("insert into notification_recipients"));
  assert.deepEqual(recipients.params[1], [opm.id, authorId]);
  const audit = state.calls.find(call => call.sql.startsWith("insert into activity_log"));
  assert.equal(audit.params[0], "Removal reason: Unrelated to project");
});

test("removal requires a valid reason and only the assigned OPM may remove a note", async () => {
  const state = database();
  const blank = response();
  await removeProjectNote(request(opm, "no"), blank);
  assert.equal(blank.statusCode, 400);
  assert.equal(state.calls.length, 0);

  database({ project: { suggested_opm_id: "55555555-5555-4555-8555-555555555555", lifecycle_status: "active" } });
  const unrelated = response();
  await removeProjectNote(request(), unrelated);
  assert.equal(unrelated.statusCode, 403);
  assert.equal(db.calls.some(call => call.sql.startsWith("delete from project_notes")), false);
});

test("completed project diary records are read-only", async () => {
  database({ project: { suggested_opm_id: opm.id, lifecycle_status: "archived" } });
  const res = response();
  await removeProjectNote(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(db.calls.some(call => call.sql.startsWith("delete from project_notes")), false);
});
