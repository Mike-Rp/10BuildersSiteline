// Nightly backup, run by Windows Task Scheduler on the backup PC.
//
//   node nightly-backup.js                      run a backup
//   node nightly-backup.js --check              test the setup without making a backup
//   node nightly-backup.js --config <file>      use another settings file
//
// What it does: dumps the database with pg_dump, checks the dump, encrypts it with the PUBLIC key, copies new or
// changed Storage files (also encrypted), removes backups older than the retention period, and records the result.
// Old backups are removed only after a successful database backup, so a failing night never shrinks the history.
// It only READS from Supabase.
import { spawn } from "node:child_process";
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicKey } from "node:crypto";
import { encryptFile, keyFingerprint } from "./crypto.js";
import { dateStamp, expiredDatabaseBackups, expiredRemovedFolders, validRetentionDays } from "./retention.js";
import { syncStorage } from "./storage-sync.js";
import { createReportingHooks, createWorkerClient, reportingConfigured } from "./worker.js";

export const DEFAULT_CONFIG_PATH = "C:\\siteline-backups\\config\\backup.env";
const LOCK_STALE_MS = 6 * 60 * 60 * 1000;

export function parseEnvFile(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    values[line.slice(0, eq).trim()] = value;
  }
  return values;
}

export function buildConfig(values) {
  const root = values.BACKUP_ROOT || "C:\\siteline-backups";
  const pgDump = values.PG_DUMP_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe";
  return {
    root,
    host: values.DB_HOST, port: values.DB_PORT || "5432", user: values.DB_USER, name: values.DB_NAME || "postgres",
    password: values.DB_PASSWORD,
    pgDump, pgRestore: values.PG_RESTORE_PATH || join(dirname(pgDump), "pg_restore.exe"),
    publicKeyPath: values.PUBLIC_KEY_PATH || join(root, "config", "backup-public.pem"),
    retentionDays: Number(values.RETENTION_DAYS || 100),
    minTables: Number(values.MIN_EXPECTED_TABLES || 60),
    supabaseUrl: values.SUPABASE_URL, serviceKey: values.SUPABASE_SERVICE_ROLE_KEY,
    apiUrl: values.BACKUP_API_URL, workerSecret: values.BACKUP_WORKER_SECRET,
  };
}

/** Problems that stop a backup from running. The storage settings are optional and reported separately. */
export function configProblems(config) {
  const problems = [];
  if (!config.host) problems.push("DB_HOST is missing.");
  if (!config.user) problems.push("DB_USER is missing.");
  if (!config.password) problems.push("DB_PASSWORD is missing.");
  if (String(config.port) === "6543") problems.push("DB_PORT is 6543. Use 5432: pg_dump cannot use the transaction pooler.");
  if (!validRetentionDays(config.retentionDays)) problems.push("RETENTION_DAYS must be a whole number from 7 to 3650.");
  return problems;
}

export function storageConfigured(config) {
  return Boolean(config.supabaseUrl && config.serviceKey);
}

function redactor(config) {
  const secrets = [config.password, config.serviceKey, config.workerSecret].filter((s) => s && s.length >= 6);
  return (text) => secrets.reduce((out, secret) => out.split(secret).join("***"), String(text));
}

/** Runs a program and collects its output. The database password is passed by environment, never on the command line. */
export function runProgram(command, args, { env = {}, timeoutMs = 90 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill(); stderr += "\nTimed out."; }, timeoutMs);
    child.stdout.on("data", (d) => { if (stdout.length < 2_000_000) stdout += d; });
    child.stderr.on("data", (d) => { if (stderr.length < 20_000) stderr += d; });
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + error.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function dumpArgs(config, file, extra = []) {
  return ["--host=" + config.host, "--port=" + config.port, "--username=" + config.user, "--dbname=" + config.name,
    "--schema=public", "--format=custom", "--no-owner", "--no-privileges",
    "--exclude-table-data=public.users_token", ...extra, "--file=" + file];
}

async function createStorageClient(config) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

async function acquireLock(root, now) {
  const lock = join(root, "tmp", "backup.lock");
  await mkdir(dirname(lock), { recursive: true });
  try {
    await writeFile(lock, JSON.stringify({ pid: process.pid, at: now.toISOString() }), { flag: "wx" });
  } catch {
    let stale = now.getTime() - (await stat(lock)).mtimeMs >= LOCK_STALE_MS;
    try {
      const { pid } = JSON.parse(await readFile(lock, "utf8"));
      if (Number.isInteger(pid) && pid !== process.pid && !processAlive(pid)) stale = true; // the run that made it crashed
    } catch { /* unreadable lock: rely on its age */ }
    if (!stale) return undefined;
    await rm(lock, { force: true });
    await writeFile(lock, JSON.stringify({ pid: process.pid, at: now.toISOString() }), { flag: "wx" });
  }
  return async () => { await rm(lock, { force: true }); };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return undefined; }
}

async function listNames(dir) {
  try { return await readdir(dir); } catch { return []; }
}

/**
 * One backup run. `deps` lets tests replace the programs and Supabase. Returns the status record that is also
 * written to logs/status.json and appended to logs/history.jsonl.
 */
export async function runBackup(config, deps = {}, now = new Date()) {
  const run = deps.run || runProgram;
  const redact = redactor(config);
  const today = dateStamp(now);
  const logDir = join(config.root, "logs");
  await mkdir(logDir, { recursive: true });
  const status = { startedAt: now.toISOString(), finishedAt: undefined, date: today, status: "failed", retentionDays: config.retentionDays,
    database: undefined, files: undefined, deleted: { databaseBackups: 0, removedFolders: 0 }, warnings: [], errors: [] };
  const log = async (line) => appendFile(join(logDir, `backup-${today.slice(0, 7)}.log`), `${new Date().toISOString()} ${redact(line)}\n`).catch(() => {});

  const release = await acquireLock(config.root, now);
  if (!release) {
    status.errors.push("Another backup is already running.");
    status.finishedAt = new Date().toISOString();
    await log("Skipped: another backup is already running.");
    return status;
  }
  let proceed = true;
  try { proceed = deps.beforeRun ? (await deps.beforeRun()) !== false : true; }
  catch (error) { status.warnings.push(`Could not contact the website: ${redact(error.message)}`); }
  if (!proceed) {
    await release();
    status.status = "skipped";
    status.finishedAt = new Date().toISOString();
    if (!deps.quietSkip) await log("Skipped: no backup was due or another run is already open on the website.");
    return status;
  }
  const dumpFile = join(config.root, "tmp", `database-${today}.dump`);
  try {
    await log(`Backup started for ${today}.`);
    const problems = configProblems(config);
    if (problems.length) throw new Error(problems.join(" "));
    let publicKeyPem;
    try {
      publicKeyPem = await readFile(config.publicKeyPath, "utf8");
      createPublicKey(publicKeyPem);
    } catch {
      throw new Error(`The public key could not be read from ${config.publicKeyPath}. Run make-keys.js first.`);
    }
    await mkdir(join(config.root, "database"), { recursive: true });
    await rm(dumpFile, { force: true });

    // 1. Dump the database.
    const dumpStart = Date.now();
    const dump = await run(config.pgDump, dumpArgs(config, dumpFile), { env: { PGPASSWORD: config.password } });
    if (dump.code !== 0) throw new Error(`pg_dump failed: ${redact(dump.stderr).trim().split(/\r?\n/).slice(-3).join(" ")}`);

    // 2. Check the dump before keeping it.
    const dumpBytes = (await stat(dumpFile)).size;
    const list = await run(config.pgRestore, ["--list", dumpFile], { timeoutMs: 10 * 60 * 1000 });
    if (list.code !== 0) throw new Error("The dump could not be read back by pg_restore, so it was discarded.");
    const tables = (list.stdout.match(/TABLE DATA/g) || []).length;
    if (tables < config.minTables) throw new Error(`The dump holds only ${tables} tables (at least ${config.minTables} expected), so it was discarded.`);
    const previousBytes = (await readJson(join(logDir, "last-good.json")))?.database?.dumpBytes;
    if (previousBytes && dumpBytes < previousBytes * 0.5)
      status.warnings.push(`Today's dump (${dumpBytes} bytes) is less than half of the last one (${previousBytes} bytes). Check that data was not lost.`);

    // 3. Encrypt it. The plain dump is removed straight away.
    const target = join(config.root, "database", `database-${today}.dump.enc`);
    const partial = target + ".partial";
    const encrypted = await encryptFile(dumpFile, partial, publicKeyPem);
    await rename(partial, target);
    status.database = { file: `database-${today}.dump.enc`, dumpBytes, bytes: encrypted.bytes, sha256: encrypted.sha256, tables,
      seconds: Math.round((Date.now() - dumpStart) / 1000), keyFingerprint: keyFingerprint(publicKeyPem) };
    await log(`Database backup saved: ${status.database.file}, ${encrypted.bytes} bytes, ${tables} tables.`);

    // 4. Storage files.
    if (!storageConfigured(config)) {
      status.warnings.push("Storage files were not copied: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.");
    } else {
      try {
        const storage = deps.storage || (await createStorageClient(config));
        status.files = await syncStorage({ storage, root: config.root, publicKeyPem, today });
        if (status.files.failed.length) status.warnings.push(`${status.files.failed.length} storage file(s) could not be copied: ${redact(status.files.failed.slice(0, 3).join("; "))}`);
        await log(`Storage files: ${status.files.objects} objects, ${status.files.added} new, ${status.files.changed} changed, ${status.files.removed} removed.`);
      } catch (error) {
        status.files = { error: redact(error.message) };
        status.warnings.push(`Storage files could not be copied: ${redact(error.message)}`);
      }
    }

    // 5. Remove expired backups, only now that today's database backup is safe.
    const databaseDir = join(config.root, "database");
    for (const name of expiredDatabaseBackups(await listNames(databaseDir), today, config.retentionDays)) {
      await rm(join(databaseDir, name), { force: true });
      status.deleted.databaseBackups++;
    }
    const removedDir = join(config.root, "files", "removed");
    for (const name of expiredRemovedFolders(await listNames(removedDir), today, config.retentionDays)) {
      await rm(join(removedDir, name), { recursive: true, force: true });
      status.deleted.removedFolders++;
    }
    status.status = status.warnings.length ? "partial" : "ok";
  } catch (error) {
    status.errors.push(redact(error.message));
    await log(`FAILED: ${redact(error.message)}`);
  } finally {
    await rm(dumpFile, { force: true });
    await rm(join(config.root, "database", `database-${today}.dump.enc.partial`), { force: true });
    await release();
  }
  if (deps.afterRun) {
    try { await deps.afterRun(status); }
    catch (error) { status.warnings.push(`Reporting to the website failed: ${redact(error.message)}`); }
    if (status.status === "ok" && status.warnings.length) status.status = "partial";
  }
  status.finishedAt = new Date().toISOString();
  for (const warning of status.warnings) await log(`Warning: ${warning}`);
  await log(`Finished with status ${status.status}.`);
  // status.json is always the latest run. last-good.json only moves forward on a night with a saved database backup,
  // so a failed night keeps the reference used for the size check.
  await writeFile(join(logDir, "status.json"), JSON.stringify(status, null, 2));
  if (status.database) await writeFile(join(logDir, "last-good.json"), JSON.stringify(status, null, 2));
  await appendFile(join(logDir, "history.jsonl"), JSON.stringify(status) + "\n");
  return status;
}

/** Tests the setup without making a backup. Returns lines to print and whether everything needed is in place. */
export async function checkSetup(config, deps = {}) {
  const run = deps.run || runProgram;
  const lines = [];
  let ok = true;
  const report = (pass, text, required = true) => { lines.push(`${pass ? "OK   " : required ? "FAIL " : "WARN "} ${text}`); if (!pass && required) ok = false; };
  const problems = configProblems(config);
  report(!problems.length, problems.length ? problems.join(" ") : "Settings file is complete.");
  const version = await run(config.pgDump, ["--version"], { timeoutMs: 30_000 });
  report(version.code === 0, version.code === 0 ? `pg_dump found: ${version.stdout.trim()}` : `pg_dump not found at ${config.pgDump}`);
  try { createPublicKey(await readFile(config.publicKeyPath, "utf8")); report(true, `Public key found: ${config.publicKeyPath}`); }
  catch { report(false, `Public key missing or unreadable: ${config.publicKeyPath}. Run make-keys.js.`); }
  const configDir = dirname(config.publicKeyPath);
  let privateKeyHere = false;
  for (const name of (await listNames(configDir)).filter((n) => n.toLowerCase().endsWith(".pem"))) {
    if ((await readFile(join(configDir, name), "utf8").catch(() => "")).includes("PRIVATE KEY")) privateKeyHere = true;
  }
  report(!privateKeyHere, privateKeyHere ? "A private key file is stored in the settings folder. Move it off this PC." : "No private key is stored in the settings folder.", false);
  if (!problems.length && version.code === 0) {
    await mkdir(join(config.root, "tmp"), { recursive: true });
    const probe = join(config.root, "tmp", "check-schema.dump");
    const redact = redactor(config);
    const result = await run(config.pgDump, dumpArgs(config, probe, ["--schema-only"]), { env: { PGPASSWORD: config.password }, timeoutMs: 5 * 60 * 1000 });
    await rm(probe, { force: true });
    report(result.code === 0, result.code === 0 ? "Connected to the database and read its structure." : `Could not read the database: ${redact(result.stderr).trim().split(/\r?\n/).slice(-2).join(" ")}`);
  }
  if (storageConfigured(config)) {
    try {
      const storage = deps.storage || (await createStorageClient(config));
      const { data, error } = await storage.listBuckets();
      report(!error, error ? `Storage check failed: ${redactor(config)(error.message)}` : `Storage reachable: ${(data || []).length} bucket(s).`);
    } catch (error) { report(false, `Storage check failed: ${redactor(config)(error.message)}`); }
  } else {
    report(false, "Storage files will NOT be backed up: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.", false);
  }
  if (reportingConfigured(config)) {
    const worker = deps.worker || createWorkerClient({ baseUrl: config.apiUrl, secret: config.workerSecret, attempts: 1 });
    const probe = await worker.probe();
    report(probe.ok, probe.ok ? "The website accepted the backup secret." : probe.status === 401
      ? "The website rejected the backup secret (401). Make BACKUP_WORKER_SECRET match the backend's value."
      : `Could not use the website's backup API: ${redactor(config)(probe.message || "no answer")}`);
  } else {
    report(false, "Results will NOT appear on the website: BACKUP_API_URL and BACKUP_WORKER_SECRET are not set.", false);
  }
  return { ok, lines };
}

async function main() {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf("--config");
  const configPath = (configIndex >= 0 && args[configIndex + 1]) || process.env.SITELINE_BACKUP_CONFIG || DEFAULT_CONFIG_PATH;
  let values;
  try { values = parseEnvFile(await readFile(configPath, "utf8")); }
  catch { console.error(`Cannot read the settings file: ${configPath}`); process.exit(1); }
  const config = buildConfig(values);
  if (args.includes("--check")) {
    const { ok, lines } = await checkSetup(config);
    console.log(lines.join("\n"));
    console.log(ok ? "\nSetup looks good." : "\nFix the FAIL lines above, then run the check again.");
    finish(ok ? 0 : 1);
    return;
  }
  const useWebsite = reportingConfigured(config) && !args.includes("--no-report");
  const worker = useWebsite ? createWorkerClient({ baseUrl: config.apiUrl, secret: config.workerSecret }) : undefined;

  const testIndex = args.indexOf("--restore-test");
  if (testIndex >= 0) {
    const result = args[testIndex + 1];
    if (!worker || !["pass", "fail"].includes(result)) {
      console.error("Usage: node nightly-backup.js --restore-test pass|fail   (needs BACKUP_API_URL and BACKUP_WORKER_SECRET)");
      finish(1);
      return;
    }
    try {
      const saved = await worker.restoreTest(result === "pass");
      console.log(`Restore test recorded as ${result === "pass" ? "passed" : "failed"}${saved?.tested_at ? " at " + saved.tested_at : ""}.`);
      finish(0);
    } catch (error) {
      console.error(`Could not record the restore test: ${error.message}`);
      finish(1);
    }
    return;
  }

  // --poll runs every few minutes and only acts when an Admin has requested a backup. Anything else is the nightly run.
  const mode = args.includes("--poll") ? "poll" : "scheduled";
  const hooks = createReportingHooks(config, { mode, worker });
  const status = await runBackup(config, { ...hooks, quietSkip: mode === "poll" });
  if (status.status === "skipped") {
    if (mode !== "poll") console.log("Nothing to do: no backup was due, or another run is already open on the website.");
    finish(0);
    return;
  }
  console.log(`Backup ${status.status}.${status.errors.length ? " " + status.errors.join(" ") : ""}${status.warnings.length ? " Warnings: " + status.warnings.join(" ") : ""}`);
  finish(status.status === "ok" ? 0 : status.status === "partial" ? 2 : 1);
}

// Calling process.exit() while network connections are still closing crashes Node on Windows ("Assertion failed:
// UV_HANDLE_CLOSING"), which would replace the real result code. Set the code and let the process end by itself.
// The unref'd timer only forces an exit if something keeps the process alive far too long.
function finish(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 30_000).unref();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
