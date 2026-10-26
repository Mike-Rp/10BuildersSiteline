import process from "node:process";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import express from "express";
import jwt from "jsonwebtoken";
import { migrateNotifications } from "../scripts/migrate-notifications.js";
import { assertLocalDatabase } from "../scripts/migrate-verified-progress.js";

let activeDb;
let inDryRun = false;
const query = (sql, args) => activeDb.query(sql, args);
mock.module("../src/common/utilities/query.utility.js", { defaultExport: query, namedExports: { execute: query } });
// All requests run inside the migration dry-run transaction; no request may commit it.
mock.module("../src/common/utilities/transaction.utility.js", { namedExports: { withTransaction: async fn => {
  if (!inDryRun) {
    await activeDb.query("BEGIN");
    try { return await fn(activeDb); } finally { await activeDb.query("ROLLBACK"); }
  }
  await activeDb.query("SAVEPOINT notification_request");
  try { const result = await fn(activeDb); await activeDb.query("RELEASE SAVEPOINT notification_request"); return result; }
  catch (error) { await activeDb.query("ROLLBACK TO SAVEPOINT notification_request"); await activeDb.query("RELEASE SAVEPOINT notification_request"); throw error; }
} } });
const { default: router } = await import("../src/services/notifications/routes.js");
const utility = await import("../src/services/notifications/notification.utility.js");
const { notify } = await import("../src/common/utilities/notify.utility.js");
const renewal = await import("../src/services/licenses/renewal.controller.js");
const read = file => readFile(new URL(file, import.meta.url), "utf8");

test("independent notifications: local dry run, recipient-only HTTP API, preferences and task resolution", { timeout: 90000 }, async t => {
  const db = new PGlite({ extensions: { citext } });
  activeDb = db;
  t.after(() => db.close());
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;");
  await db.exec((await read("../../supabase/migrations/20261017000002_thesis_backend_schema.sql")).replace(/^create extension if not exists pgcrypto.*$/m, ""));
  await db.exec(await read("../migrations/003-react-integration.sql"));
  await db.exec(await read("../migrations/009-engineer-license-workflow.sql"));
  await db.exec(await read("../../supabase/seed/dummy-data.sql"));
  const people = (await db.query(`SELECT u.id,r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.status='active' ORDER BY u.id`)).rows;
  const admin = people.find(p => p.role === "admin"), spm = people.find(p => p.role === "spm"), client = people.find(p => p.role === "client");
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "notification-local-test-only-0123456789012345";
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const tokens = {};
  for (const person of [admin, spm, client]) {
    tokens[person.id] = jwt.sign({ details: { id: person.id } }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await db.query("INSERT INTO users_token(user_id,token) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token", [person.id, tokens[person.id]]);
  }
  // Explicitly exercise inconsistent old values without losing their original provenance.
  const legacyId = (await db.query("INSERT INTO activity_log(activity_type_id,title,detail) SELECT id,'Original notice','Original message' FROM activity_types WHERE code='notice' RETURNING id")).rows[0].id;
  await db.query("INSERT INTO notification_recipients(activity_log_id,recipient_user_id,is_read,read_at) VALUES($1,$2,true,NULL),($1,$3,false,'2026-10-01T00:00:00Z')", [legacyId, admin.id, spm.id]);
  const app = express(); app.use(express.json()); app.use("/api/v1/notifications/v2", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/notifications/v2`;
  const request = async (person, path = "", method = "GET", body) => {
    const response = await fetch(base + path, { method, headers: { ...(person ? { Authorization: "Bearer " + tokens[person.id] } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text() };
  };
  const snapshot = async table => (await db.query(`SELECT * FROM ${table} ORDER BY ${table === "notification_recipients" ? "activity_log_id,recipient_user_id" : "id"}`)).rows;
  const before = { logs: await snapshot("activity_log"), audit: await snapshot("audit_log"), links: await snapshot("notification_recipients") };
  assert.equal((await request(admin)).status, 503, "No hidden activity-log fallback before the approved migration");
  for (const host of [undefined, "", "db.example.com", "localhost.example.com"]) assert.throws(() => assertLocalDatabase(host), /localhost/);

  const result = await migrateNotifications(db, { validate: async () => {
    inDryRun = true;
    await t.test("every legacy recipient keeps its own text and original read provenance", async () => {
      const rows = (await db.query("SELECT * FROM notifications WHERE activity_log_id=$1 ORDER BY recipient_user_id", [legacyId])).rows;
      assert.equal(rows.length, 2);
      const a = rows.find(n => n.recipient_user_id === admin.id), s = rows.find(n => n.recipient_user_id === spm.id);
      assert.equal(a.title, "Original notice"); assert.equal(a.message, "Original message");
      assert.ok(a.read_at); assert.equal(a.legacy_snapshot.read_at, null); assert.equal(a.legacy_snapshot.is_read, true);
      assert.equal(s.read_at, null); assert.equal(s.legacy_snapshot.is_read, false); assert.ok(s.legacy_snapshot.read_at);
      assert.equal((await snapshot("audit_log")).length, before.audit.length);
    });
    const direct = await utility.createNotification(db, { recipientId: spm.id, title: "Please review", message: "Task instructions", priority: "urgent", link: "/assignments", subjectType: "approval", subjectId: "test-1" });
    await t.test("standalone messages need no log, and HTTP identity cannot be overridden even by Admin", async () => {
      assert.equal(direct.activity_log_id, null);
      assert.equal((await request(null)).status, 401);
      for (const person of [admin, client]) {
        assert.equal((await request(person, `/${direct.id}/read`, "PATCH", { read: true, recipient_user_id: spm.id })).status, 404);
        assert.equal((await request(person, `/${direct.id}/dismiss`, "POST")).status, 404);
        const list = await request(person, "?recipient_user_id=" + spm.id);
        assert.equal(list.status, 200); assert.ok(list.body.data.notifications.every(n => n.recipient_user_id === person.id));
      }
      assert.equal((await request(spm, "?limit=0")).status, 400);
      assert.equal((await request(spm, `/${direct.id}/read`, "PATCH", { read: "true" })).status, 400);
      assert.equal((await request(spm, `/${direct.id}/resolve`, "POST")).status, 404);
    });
    await t.test("read/unread, wording, dismissal and resolution leave log and audit rows untouched", async () => {
      const logs = await snapshot("activity_log"), audits = await snapshot("audit_log");
      const initial = (await request(spm)).body.data;
      assert.equal((await request(spm, `/${direct.id}/read`, "PATCH", { read: true })).status, 200);
      let saved = (await db.query("SELECT * FROM notifications WHERE id=$1", [direct.id])).rows[0];
      assert.ok(saved.read_at); assert.equal(saved.resolved_at, null);
      assert.equal((await request(spm)).body.data.unread_count, initial.unread_count - 1);
      await request(spm, `/${direct.id}/read`, "PATCH", { read: false });
      assert.equal((await request(spm)).body.data.unread_count, initial.unread_count);
      await utility.reviseNotification(db, spm.id, String(direct.id), { title: "Updated instructions", message: "Changed independently", link: "/projects" });
      await request(spm, `/${direct.id}/dismiss`, "POST");
      assert.ok(!(await request(spm)).body.data.notifications.some(n => String(n.id) === String(direct.id)));
      assert.ok((await request(spm, "?archived=true")).body.data.notifications.some(n => String(n.id) === String(direct.id)));
      const resolved = await utility.resolveNotifications(db, { subjectType: "approval", subjectId: "test-1", reason: "Approval completed." });
      assert.equal(resolved.length, 1);
      assert.equal((await utility.resolveNotifications(db, { subjectType: "approval", subjectId: "test-1", reason: "Second call." })).length, 0);
      saved = (await db.query("SELECT * FROM notifications WHERE id=$1", [direct.id])).rows[0];
      assert.ok(saved.resolved_at); assert.equal(saved.resolved_reason, "Approval completed."); assert.equal(saved.read_at, null);
      const legacy = (await db.query("SELECT id FROM notifications WHERE activity_log_id=$1 AND recipient_user_id=$2", [legacyId, spm.id])).rows[0];
      await request(spm, `/${legacy.id}/read`, "PATCH", { read: true });
      assert.equal((await db.query("SELECT is_read FROM notification_recipients WHERE activity_log_id=$1 AND recipient_user_id=$2", [legacyId, spm.id])).rows[0].is_read, true);
      await request(spm, `/${legacy.id}/read`, "PATCH", { read: false });
      await db.query("UPDATE notification_recipients SET is_read=true,read_at=now() WHERE activity_log_id=$1 AND recipient_user_id=$2", [legacyId, spm.id]);
      await utility.mirrorLegacyReads(db, spm.id, [legacyId]);
      assert.ok((await db.query("SELECT read_at FROM notifications WHERE id=$1", [legacy.id])).rows[0].read_at);
      assert.deepEqual(await snapshot("activity_log"), logs); assert.deepEqual(await snapshot("audit_log"), audits);
    });
    await t.test("re-running SQL preserves user changes and does not duplicate migrated rows", async () => {
      await db.query("UPDATE notifications SET message='Independent wording' WHERE activity_log_id=$1 AND recipient_user_id=$2", [legacyId, admin.id]);
      const rows = await snapshot("notifications");
      await db.exec(await read("../migrations/011-independent-notifications.sql"));
      assert.deepEqual(await snapshot("notifications"), rows);
      assert.deepEqual(await snapshot("activity_log"), before.logs);
    });
    await t.test("legacy producers create independent addressed copies and transaction rollback removes both", async () => {
      await db.query("SAVEPOINT producer");
      const id = await notify(db, { title: "New task", recipientIds: [spm.id, spm.id], actorId: admin.id, subjectType: "approval", subjectId: "test-2" });
      const rows = (await db.query("SELECT * FROM notifications WHERE activity_log_id=$1", [id])).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].recipient_user_id, spm.id); assert.equal(rows[0].subject_id, "test-2");
      await db.query("ROLLBACK TO SAVEPOINT producer"); await db.query("RELEASE SAVEPOINT producer");
      assert.equal((await db.query("SELECT id FROM notifications WHERE activity_log_id=$1", [id])).rows.length, 0);
      assert.equal((await db.query("SELECT id FROM activity_log WHERE id=$1", [id])).rows.length, 0);
    });
    await t.test("unsafe links are refused and bare browser roles have no table privileges", async () => {
      for (const link of ["https://example.com", "//example.com", "/\\example.com", "/projects\n"]) {
        await assert.rejects(utility.createNotification(db, { recipientId: spm.id, title: "Unsafe", link }), /inside Siteline/);
      }
      for (const role of ["anon", "authenticated"]) {
        assert.equal((await db.query("SELECT has_table_privilege($1,'public.notifications','SELECT') AS allowed", [role])).rows[0].allowed, false);
      }
    });
    await t.test("real renewal approvals and rejections resolve their task messages in the business transaction", async () => {
      for (const decision of ["verified", "rejected", "failed-resolution"]) {
        await db.query("SAVEPOINT renewal_workflow");
        const saved = await renewal.createRenewalRequest(db, admin, { user_id: spm.id, license_number: "TEST-ONLY", license_expiry: "2100-01-01" }, { path: "uploads/test-only.pdf" });
        const task = (await db.query("SELECT * FROM notifications WHERE subject_type='license_renewal' AND subject_id=$1", [String(saved.id)])).rows;
        assert.ok(task.length > 0); assert.ok(task.every(n => n.resolved_at === null));
        const logs = await snapshot("activity_log"), audits = await snapshot("audit_log");
        if (decision === "failed-resolution") await db.exec(`CREATE FUNCTION test_notification_resolution_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Intentional local test resolution failure'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER test_resolution_failure BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION test_notification_resolution_failure();`);
        const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
        const req = { headers: { authorization: "Bearer " + tokens[admin.id] }, params: { id: String(saved.id) }, body: { note: "Local test review." } };
        await (decision === "rejected" ? renewal.rejectRenewal : renewal.verifyRenewal)(req, res);
        const record = (await db.query("SELECT status FROM license_renewal_requests WHERE id=$1", [saved.id])).rows[0];
        const afterTasks = (await db.query("SELECT resolved_at FROM notifications WHERE subject_type='license_renewal' AND subject_id=$1", [String(saved.id)])).rows;
        if (decision === "failed-resolution") {
          assert.equal(res.statusCode, 500); assert.equal(record.status, "under_review");
          assert.ok(afterTasks.every(n => n.resolved_at === null));
          assert.deepEqual(await snapshot("activity_log"), logs); assert.deepEqual(await snapshot("audit_log"), audits);
        } else {
          assert.equal(res.statusCode, 200); assert.equal(record.status, decision); assert.ok(afterTasks.every(n => n.resolved_at));
        }
        await db.query("ROLLBACK TO SAVEPOINT renewal_workflow"); await db.query("RELEASE SAVEPOINT renewal_workflow");
      }
    });
  } });
  console.log("Notification migration dry run:", JSON.stringify(result));
  assert.equal(result.mode, "dry-run (rolled back)"); assert.equal(result.missing_rows, 0); assert.equal(result.source_read_state_differences, 0);
  assert.equal(result.current_text_differences, 0); assert.equal(result.after.legacy_audit_triggers, 0);
  assert.equal(await utility.notificationsReady(db), false);
  assert.deepEqual(await snapshot("activity_log"), before.logs);
  assert.deepEqual(await snapshot("audit_log"), before.audit);
  assert.deepEqual(await snapshot("notification_recipients"), before.links);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='notification_recipients'::regclass AND tgname='trg_audit_notification_recipients'")).rows[0].n, 1);
});
