import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { generateBackupKeyPair } from "../Thesis-Backend/scripts/backup/crypto.js";
import { buildConfig, checkSetup, runBackup } from "../Thesis-Backend/scripts/backup/nightly-backup.js";
import { buildReport, createReportingHooks, createWorkerClient, failureReason } from "../Thesis-Backend/scripts/backup/worker.js";
import { claimBackup, readBackups, requestBackup, validateResult } from "../Thesis-Backend/src/services/backups/store.js";
import { createBackupRouter } from "../Thesis-Backend/src/services/backups/routes.js";

const require = createRequire(new URL("../Thesis-Backend/package.json", import.meta.url));
const express = require("express");
const keys = generateBackupKeyPair("correct horse battery staple", 2048);
const SECRET = "test-worker-secret-0123456789";
const NOW = new Date(2026, 10, 10, 2, 0, 0);
const temp = () => mkdtemp(join(tmpdir(), "siteline-worker-test-"));

// ---------- a real website backup API on a real database ----------
async function website() {
  const db = new PGlite({ extensions: { citext } });
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261017000002_thesis_backend_schema.sql", import.meta.url), "utf8").replace(/^create extension if not exists pgcrypto.*$/m, ""));
  await db.exec(readFileSync(new URL("../Thesis-Backend/migrations/029-backup-monitoring.sql", import.meta.url), "utf8"));
  const app = express();
  app.use(express.json());
  app.use("/api/v1/backups", createBackupRouter({ transaction: (fn) => fn(db), authorize: async () => ({ id: null, full_name: "Test Admin" }), secret: () => SECRET }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  return { db, url: `http://127.0.0.1:${server.address().port}/api/v1`, close: async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await db.close(); } };
}

function fakeRun({ tables = 73, dumpFails } = {}) {
  return async (command, args) => {
    if (command === "FAKE-PG-DUMP") {
      if (dumpFails) return { code: 1, stdout: "", stderr: "pg_dump: error: connection refused" };
      const file = args.find((a) => a.startsWith("--file="));
      if (file) await writeFile(file.slice(7), Buffer.alloc(8192, 3));
      return { code: 0, stdout: "pg_dump 17", stderr: "" };
    }
    return { code: 0, stdout: Array.from({ length: tables }, (_, i) => `${i}; TABLE DATA public t${i}`).join("\n"), stderr: "" };
  };
}
function fakeStorage(count = 3) {
  const items = Array.from({ length: count }, (_, i) => ({ name: `f${i}.pdf`, id: `id${i}`, updated_at: "2026-11-01", metadata: { size: 4, eTag: "v1" } }));
  return {
    listBuckets: async () => ({ data: [{ name: "docs" }], error: null }),
    from: () => ({ list: async () => ({ data: items, error: null }), download: async () => ({ data: new Blob([Buffer.from("data")]), error: null }) }),
  };
}
async function setup(extra = {}) {
  const root = await temp();
  await mkdir(join(root, "config"), { recursive: true });
  await writeFile(join(root, "config", "backup-public.pem"), keys.publicKey);
  const config = buildConfig({ BACKUP_ROOT: root, DB_HOST: "db", DB_USER: "u", DB_PASSWORD: "db-password-123", PG_DUMP_PATH: "FAKE-PG-DUMP", PG_RESTORE_PATH: "FAKE-PG-RESTORE",
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key-123456", BACKUP_WORKER_SECRET: SECRET, ...extra });
  return { root, config };
}
const cycle = async (config, site, mode, options = {}) => {
  const worker = createWorkerClient({ baseUrl: site.url, secret: options.secret ?? SECRET, attempts: 1 });
  const hooks = createReportingHooks(config, { mode, worker: options.worker || worker, countDbFiles: async () => 344 });
  return runBackup(config, { run: fakeRun(options.run), storage: options.storage || fakeStorage(), quietSkip: mode === "poll", ...hooks }, options.now || NOW);
};

// ---------- the client ----------
test("the worker client sends the secret and the right bodies, unwraps the data, and retries only server errors", async () => {
  const calls = [];
  const answers = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); const next = answers.shift(); if (next instanceof Error) throw next; return next; };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const worker = createWorkerClient({ baseUrl: "https://site/api/v1/", secret: "s3cret-value", fetchImpl, attempts: 3, delayMs: 1 });
  answers.push(reply(200, { data: { id: "run-1" } }));
  assert.deepEqual(await worker.claim(true), { id: "run-1" });
  assert.equal(calls[0].url, "https://site/api/v1/backups/worker/claim");
  assert.equal(calls[0].init.headers.Authorization, "Bearer s3cret-value");
  assert.deepEqual(JSON.parse(calls[0].init.body), { scheduled: true });
  answers.push(reply(200, { data: null }));
  assert.equal(await worker.claim(false), null);
  assert.deepEqual(JSON.parse(calls[1].init.body), {}, "a poll never asks for a scheduled run");
  answers.push(reply(503, { message: "down" }), reply(502, {}), reply(200, { data: { id: "run-2" } }));
  assert.deepEqual(await worker.claim(true), { id: "run-2" });
  assert.equal(calls.length, 5, "two server errors were retried");
  answers.push(reply(401, { message: "Missing or invalid backup computer credentials." }));
  await assert.rejects(worker.claim(true), (error) => error.status === 401);
  assert.equal(calls.length, 6, "a rejected secret is not retried");
  answers.push(reply(503, { message: "down" }), reply(503, { message: "down" }), reply(503, { message: "still down" }));
  await assert.rejects(worker.report("x", { status: "success" }), /still down/);
  answers.push(new Error("offline"), new Error("offline"), new Error("offline"));
  await assert.rejects(worker.report("x", {}), /offline/);
  assert.deepEqual(await createWorkerClient({ baseUrl: "https://s", secret: "k", fetchImpl: async () => reply(400, { message: "Choose success or failed." }), attempts: 1 }).probe(), { ok: true, status: 400, message: "Choose success or failed." });
});

// ---------- what gets reported ----------
test("every kind of night is reported as something the website accepts, and a good night carries real totals", async () => {
  const { root, config } = await setup();
  try {
    await mkdir(join(root, "database"), { recursive: true });
    for (const name of ["database-2026-08-05.dump.enc", "database-2026-11-10.dump.enc"]) await writeFile(join(root, "database", name), "x".repeat(50));
    const good = { startedAt: NOW.toISOString(), database: { dumpBytes: 5000 }, files: { objects: 10, failed: ["a: boom", "b: boom"], added: 3, changed: 1, removed: 2 }, errors: [], warnings: [] };
    const report = await buildReport(good, config, { dbFiles: 344, capacityBytes: 500_000_000_000 });
    assert.doesNotThrow(() => validateResult(report), "the website accepts a good report");
    assert.equal(report.status, "success");
    assert.equal(report.databaseBytes, 5000);
    assert.equal(report.filesChanged, 6);
    assert.deepEqual([report.summary.totalFiles, report.summary.protectedFiles], [354, 352], "files that failed to copy are not counted as protected");
    assert.ok(report.summary.storageUsedBytes >= 100);
    assert.equal(report.summary.storageCapacityBytes, 500_000_000_000);
    assert.equal(new Date(report.summary.oldestRestorableAt).getFullYear(), 2026);
    assert.equal(new Date(report.summary.oldestRestorableAt).getMonth(), 7, "the oldest backup still on disk, August");

    const cases = [
      [{ ...good, database: undefined, errors: ["pg_dump failed: connection refused"], files: undefined }, "database"],
      [{ ...good, database: undefined, errors: ["The dump holds only 5 tables, so it was discarded."], files: undefined }, "database"],
      [{ ...good, database: undefined, errors: ["The public key could not be read from x."], files: undefined }, "storage"],
      [{ ...good, files: undefined }, "files"],
      [{ ...good, files: { error: "list failed" } }, "files"],
    ];
    for (const [status, reason] of cases) {
      const failed = await buildReport(status, config);
      assert.deepEqual(failed, { status: "failed", reason });
      assert.doesNotThrow(() => validateResult(failed));
    }
    assert.equal(failureReason({ errors: ["something odd"], database: undefined }), "storage");
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---------- against the website's real routes and a real database ----------
test("a requested backup is claimed, run, reported and shown on the page's data", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    await requestBackup(site.db, { id: null, full_name: "Test Admin" });
    assert.equal((await readBackups(site.db)).openRequest.status, "requested");

    const status = await cycle(config, site, "poll");
    assert.equal(status.status, "ok", JSON.stringify(status));
    const page = await readBackups(site.db);
    assert.equal(page.openRequest, null, "nothing is left open");
    assert.equal(page.runs[0].status, "success");
    assert.equal(page.runs[0].requested_by_name, "Test Admin", "the request that was claimed is the one that finished");
    assert.equal(page.runs[0].files_changed, 3);
    assert.equal(page.runs[0].database_bytes, 8192);
    assert.deepEqual([page.lastGood.summary.protectedFiles, page.lastGood.summary.totalFiles], [347, 347]);
    assert.ok(Date.parse(page.lastGood.summary.oldestRestorableAt) <= Date.now());
    assert.equal(await readFile(join(root, "logs", "claimed-run.json"), "utf8").catch(() => "gone"), "gone", "the claim record is cleared once reported");
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("polling with nothing requested does nothing and leaves no trace, while the nightly run creates its own record", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    const idle = await cycle(config, site, "poll");
    assert.equal(idle.status, "skipped");
    assert.equal((await readBackups(site.db)).runs.length, 0, "no run was created");
    assert.deepEqual(await readdir(join(root, "database")).catch(() => []), [], "no backup was made");
    assert.equal(await readFile(join(root, "logs", "status.json"), "utf8").catch(() => "none"), "none", "a quiet poll writes no status");

    const nightly = await cycle(config, site, "scheduled");
    assert.equal(nightly.status, "ok", JSON.stringify(nightly));
    const page = await readBackups(site.db);
    assert.equal(page.runs.length, 1);
    assert.equal(page.runs[0].status, "success");
    assert.equal(page.runs[0].requested_by_name, null, "a nightly run has no requester");

    // While a run is open on the website, a second nightly or request cannot start another.
    const open = await claimBackup(site.db, true);
    assert.ok(open.id);
    const blocked = await cycle(config, site, "scheduled", { now: new Date(2026, 10, 11, 2) });
    assert.equal(blocked.status, "skipped");
    assert.equal((await readBackups(site.db)).runs.length, 2, "no extra run was created");
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("a failed night is reported with a reason the page can show, and its details stay off the website", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    const status = await cycle(config, site, "scheduled", { run: { dumpFails: true } });
    assert.equal(status.status, "failed");
    const run = (await readBackups(site.db)).runs[0];
    assert.equal(run.status, "failed");
    assert.equal(run.failure_reason, "Could not connect to the database");
    assert.ok(!JSON.stringify(run).includes("connection refused"), "the raw error stays on the backup PC");
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("a wrong secret or an unreachable website never stops the backup itself", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    const wrong = await cycle(config, site, "scheduled", { secret: "not-the-secret" });
    assert.equal(wrong.status, "partial");
    assert.match(wrong.warnings.join(" "), /not reported/);
    assert.ok((await readdir(join(root, "database"))).some((n) => n.endsWith(".dump.enc")), "the database was still backed up");
    assert.equal((await readBackups(site.db)).runs.length, 0);

    const down = createWorkerClient({ baseUrl: "http://127.0.0.1:1/api/v1", secret: SECRET, attempts: 1 });
    const offline = await cycle(config, site, "scheduled", { worker: down, now: new Date(2026, 10, 11, 2) });
    assert.equal(offline.status, "partial");

    const unconfigured = await runBackup({ ...config, apiUrl: undefined, workerSecret: undefined }, { run: fakeRun(), storage: fakeStorage(), ...createReportingHooks(config, { mode: "scheduled", worker: undefined }) }, new Date(2026, 10, 12, 2));
    assert.equal(unconfigured.status, "partial");
    assert.match(unconfigured.warnings.join(" "), /BACKUP_API_URL/);
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("the request check does nothing when the website cannot be reached, so it never starts a backup every few minutes", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    const down = createWorkerClient({ baseUrl: "http://127.0.0.1:1/api/v1", secret: SECRET, attempts: 1 });
    const fake = fakeRun();
    for (let check = 0; check < 3; check++) {
      const hooks = createReportingHooks(config, { mode: "poll", worker: down, countDbFiles: async () => 344 });
      const status = await runBackup(config, { run: fake, storage: fakeStorage(), quietSkip: true, ...hooks }, new Date(2026, 10, 12, 8, 10 + check * 5));
      assert.equal(status.status, "skipped", `check ${check + 1}`);
    }
    assert.deepEqual(await readdir(join(root, "database")).catch(() => []), [], "no backup was made by any check");
    assert.equal(await readFile(join(root, "logs", "status.json"), "utf8").catch(() => "none"), "none", "and no status was written");
    // The nightly run is different: it still backs up when the website is down.
    const hooks = createReportingHooks(config, { mode: "scheduled", worker: down, countDbFiles: async () => 344 });
    const nightly = await runBackup(config, { run: fake, storage: fakeStorage(), ...hooks }, NOW);
    assert.equal(nightly.status, "partial");
    assert.ok((await readdir(join(root, "database"))).some((n) => n.endsWith(".dump.enc")));
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("a result that could not be sent is kept and delivered first at the next run, and a crashed run is reported as interrupted", async () => {
  const site = await website();
  const { root, config } = await setup();
  try {
    const real = createWorkerClient({ baseUrl: site.url, secret: SECRET, attempts: 1 });
    let failing = true;
    const flaky = { claim: real.claim, restoreTest: real.restoreTest, probe: real.probe, report: async (...args) => { if (failing) throw new Error("connection lost"); return real.report(...args); } };
    const first = await cycle(config, site, "scheduled", { worker: flaky });
    assert.equal(first.status, "partial");
    assert.match(first.warnings.join(" "), /sent at the next run/);
    assert.equal((await readBackups(site.db)).runs[0].status, "running", "the website still shows it running");
    const kept = JSON.parse(await readFile(join(root, "logs", "claimed-run.json"), "utf8"));
    assert.equal(kept.payload.status, "success");

    failing = false;
    const next = await cycle(config, site, "scheduled", { worker: flaky, now: new Date(2026, 10, 11, 2) });
    assert.equal(next.status, "ok", JSON.stringify(next));
    const runs = (await readBackups(site.db)).runs;
    assert.deepEqual(runs.map((r) => r.status).sort(), ["success", "success"], "the earlier night was delivered, then a new run was made");

    // A crash: a run was claimed but the PC went down before any result existed.
    const crashed = await claimBackup(site.db, true);
    await writeFile(join(root, "logs", "claimed-run.json"), JSON.stringify({ id: crashed.id }));
    const after = await cycle(config, site, "scheduled", { now: new Date(2026, 10, 12, 2) });
    assert.equal(after.status, "ok", JSON.stringify(after));
    const all = (await readBackups(site.db)).runs;
    assert.equal(all.find((r) => r.id === crashed.id).status, "failed");
    assert.equal(all.find((r) => r.id === crashed.id).failure_reason, "The backup did not finish");
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});

test("weekly restore tests are recorded, and the setup check proves the secret works without touching any run", async () => {
  const site = await website();
  const { root, config } = await setup({ BACKUP_API_URL: undefined });
  try {
    const worker = createWorkerClient({ baseUrl: site.url, secret: SECRET, attempts: 1 });
    await worker.restoreTest(true);
    assert.equal((await readBackups(site.db)).lastTest.passed, true);
    await worker.restoreTest(false);
    assert.equal((await readBackups(site.db)).lastTest.passed, false);
    await assert.rejects(createWorkerClient({ baseUrl: site.url, secret: "nope", attempts: 1 }).restoreTest(true), (e) => e.status === 401);

    const run = fakeRun();
    const good = await checkSetup({ ...config, apiUrl: site.url }, { run, storage: fakeStorage(), worker });
    assert.match(good.lines.join("\n"), /OK .*website accepted the backup secret/);
    const bad = await checkSetup({ ...config, apiUrl: site.url }, { run, storage: fakeStorage(), worker: createWorkerClient({ baseUrl: site.url, secret: "nope", attempts: 1 }) });
    assert.equal(bad.ok, false);
    assert.match(bad.lines.join("\n"), /FAIL .*rejected the backup secret/);
    const none = await checkSetup(config, { run, storage: fakeStorage() });
    assert.match(none.lines.join("\n"), /WARN .*will NOT appear on the website/);
    assert.equal((await readBackups(site.db)).runs.length, 0, "a setup check never claims or creates a run");
  } finally { await site.close(); await rm(root, { recursive: true, force: true }); }
});
