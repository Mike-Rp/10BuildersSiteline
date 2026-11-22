// The backup PC's side of the website's backup protocol (see docs/BACKUPS.md).
//
//   claim   asks the website for a run to do. A request made by an Admin is claimed first; at 2:00 AM a nightly run is
//           created if there is none. The website allows only one open run at a time.
//   report  sends the result: sizes and file counts only. Never paths, file names, keys or contents.
//
// The claimed run id and any unsent result are kept in logs/claimed-run.json, so a crash or a lost connection is
// reconciled on the next invocation instead of leaving the website showing a backup that never finishes.
import { readdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";

const KNOWN_REASONS = ["database", "files", "storage", "interrupted"];
export const reportingConfigured = (config) => Boolean(config.apiUrl && config.workerSecret);

/** Client for the website's /backups/worker endpoints. Network errors and 5xx answers are retried; 4xx answers are not. */
export function createWorkerClient({ baseUrl, secret, fetchImpl = fetch, attempts = 3, delayMs = 2000, timeoutMs = 30_000 }) {
  const root = baseUrl.replace(/\/+$/, "");
  async function call(path, body) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetchImpl(`${root}/backups/worker${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(timeoutMs),
        });
        let json = {};
        try { json = await response.json(); } catch { /* an empty or non-JSON body */ }
        if (response.ok) return json.data ?? null;
        const message = json.message || `HTTP ${response.status}`;
        if (response.status < 500) { const error = new Error(message); error.status = response.status; error.final = true; throw error; }
        lastError = new Error(message);
      } catch (error) {
        if (error.final) throw error;
        lastError = error;
      }
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
    throw lastError;
  }
  return {
    claim: (scheduled) => call("/claim", scheduled ? { scheduled: true } : {}),
    report: (id, payload) => call(`/runs/${id}/result`, payload),
    restoreTest: (passed) => call("/restore-tests", { passed }),
    // A deliberately invalid result for an id that cannot exist: a valid secret answers 400 without touching any data.
    probe: () => call("/runs/00000000-0000-4000-8000-000000000000/result", {}).then(() => ({ ok: true }), (error) => ({ ok: error.status === 400, status: error.status, message: error.message })),
  };
}

async function directorySize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** Number of uploaded files whose bytes live inside the database (these are protected by the database dump). */
export async function countDatabaseFiles(config) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ host: config.host, port: Number(config.port), user: config.user, password: config.password,
    database: config.name, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30_000 });
  await client.connect();
  try {
    const { rows } = await client.query(`select (select count(*) from stored_files where content is not null)
      + (select count(*) from project_phase_files where content is not null) as n`);
    return Number(rows[0].n);
  } finally { await client.end(); }
}

function oldestBackupDate(names) {
  const dates = names.map((n) => /^database-(\d{4})-(\d{2})-(\d{2})\.dump\.enc$/.exec(n)).filter(Boolean)
    .map((m) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).sort((a, b) => a - b);
  return dates[0];
}

/** Why a night failed, as one of the reason codes the website accepts. */
export function failureReason(status) {
  const text = [...status.errors, ...(status.files?.error ? [status.files.error] : [])].join(" ");
  if (/pg_dump failed|pg_restore|only \d+ tables|discarded|DB_|settings/i.test(text)) return "database";
  if (status.database && (status.files?.error || !status.files)) return "files";
  return "storage";
}

/**
 * The result the website expects. A night counts as a success once the database backup is saved. Files that could not
 * be reached (Storage not set up or unavailable) are reported as a failure, because they cannot be called protected.
 */
export async function buildReport(status, config, extras = {}) {
  if (!status.database) return { status: "failed", reason: failureReason(status) };
  if (!status.files || status.files.error) return { status: "failed", reason: "files" };
  const dbFiles = extras.dbFiles ?? 0;
  const copied = status.files.objects - status.files.failed.length;
  const databaseDir = join(config.root, "database");
  const oldest = oldestBackupDate(await readdir(databaseDir).catch(() => []));
  let capacity = extras.capacityBytes;
  if (!capacity) { try { const fs = await statfs(config.root); capacity = Number(fs.blocks) * Number(fs.bsize); } catch { capacity = 1; } }
  return {
    status: "success",
    databaseBytes: status.database.dumpBytes,
    filesChanged: status.files.added + status.files.changed + status.files.removed,
    summary: {
      protectedFiles: dbFiles + copied,
      totalFiles: dbFiles + status.files.objects,
      storageUsedBytes: extras.usedBytes ?? (await directorySize(databaseDir)) + (await directorySize(join(config.root, "files"))),
      storageCapacityBytes: Math.max(1, capacity),
      oldestRestorableAt: (oldest || new Date(status.startedAt)).toISOString(),
    },
  };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return undefined; }
}

/**
 * Hooks for runBackup. `beforeRun` finishes anything left over, then claims a run (returning false means there is
 * nothing to do). `afterRun` sends the result. If the website cannot be reached the backup still happens, and an unsent
 * result is kept and retried first thing next time.
 */
export function createReportingHooks(config, { mode, worker, countDbFiles = countDatabaseFiles }) {
  const claimedPath = join(config.root, "logs", "claimed-run.json");
  let claimed, claimProblem;
  return {
    async beforeRun() {
      if (!worker) return true;
      const left = await readJson(claimedPath);
      if (left?.id) {
        try {
          await worker.report(left.id, left.payload || { status: "failed", reason: "interrupted" });
          await rm(claimedPath, { force: true });
        } catch (error) {
          if (error.status && error.status < 500 && error.status !== 401) await rm(claimedPath, { force: true });
        }
      }
      try {
        claimed = await worker.claim(mode !== "poll");
      } catch (error) {
        claimProblem = error.message;
        // The nightly run still backs up when the website cannot be reached: the backup matters more than the report.
        // The request check must NOT: it exists only to answer an Admin's request, and it runs every few minutes, so
        // backing up on every failed check would start a full backup every five minutes while the website is down.
        return mode !== "poll";
      }
      if (!claimed) return false;
      await writeFile(claimedPath, JSON.stringify({ id: claimed.id, claimedAt: new Date().toISOString() }));
      return true;
    },
    async afterRun(status) {
      if (!worker) { status.warnings.push("This run was not reported to the website: BACKUP_API_URL and BACKUP_WORKER_SECRET are not set."); return; }
      if (claimProblem) { status.warnings.push(`This run was not reported: the website could not be reached to claim it (${claimProblem}).`); return; }
      if (!claimed) return;
      let extras = {};
      if (status.database && status.files && !status.files.error) {
        try { extras.dbFiles = await countDbFiles(config); }
        catch (error) { status.warnings.push("The number of files held inside the database could not be counted, so the file totals on the website may be too low."); }
      }
      const payload = await buildReport(status, config, extras);
      await writeFile(claimedPath, JSON.stringify({ id: claimed.id, payload })); // keep it until the website confirms
      try {
        await worker.report(claimed.id, payload);
        await rm(claimedPath, { force: true });
      } catch (error) {
        status.warnings.push(`The result could not be sent to the website (${error.message}). It will be sent at the next run.`);
      }
    },
  };
}

export { KNOWN_REASONS };
