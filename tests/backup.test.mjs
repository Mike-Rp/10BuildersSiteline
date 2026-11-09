import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptFile, encryptFile, generateBackupKeyPair, keyFingerprint } from "../Thesis-Backend/scripts/backup/crypto.js";
import { dateStamp, expiredDatabaseBackups, expiredRemovedFolders, validRetentionDays } from "../Thesis-Backend/scripts/backup/retention.js";
import { diffManifest, localObjectPath, syncStorage } from "../Thesis-Backend/scripts/backup/storage-sync.js";
import { buildConfig, checkSetup, configProblems, parseEnvFile, runBackup } from "../Thesis-Backend/scripts/backup/nightly-backup.js";

const PASS = "correct horse battery staple";
const keys = generateBackupKeyPair(PASS, 2048);
const other = generateBackupKeyPair(PASS, 2048);
const temp = async () => mkdtemp(join(tmpdir(), "siteline-backup-test-"));
const exists = (p) => stat(p).then(() => true, () => false);

// ---------- encryption ----------
test("a backup file decrypts to exactly the original, for empty, small and multi-megabyte files", async () => {
  const dir = await temp();
  try {
    for (const size of [0, 1, 1000, 5 * 1024 * 1024]) {
      const plain = join(dir, `p${size}`), enc = join(dir, `e${size}`), back = join(dir, `b${size}`);
      const data = randomBytes(size);
      await writeFile(plain, data);
      const result = await encryptFile(plain, enc, keys.publicKey);
      assert.equal(result.bytes, (await stat(enc)).size);
      assert.match(result.sha256, /^[0-9a-f]{64}$/);
      // A window of at least 32 random bytes cannot appear by chance (a single byte easily could).
      if (size >= 32) assert.ok(!(await readFile(enc)).includes(data.subarray(0, 32)), "the plain bytes never appear in the encrypted file");
      await decryptFile(enc, back, keys.privateKey, PASS);
      assert.ok(data.equals(await readFile(back)), `size ${size}`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("every encryption uses a fresh key, and a wrong key, wrong passphrase or any change refuses to decrypt", async () => {
  const dir = await temp();
  try {
    const plain = join(dir, "p"), a = join(dir, "a"), b = join(dir, "b"), out = join(dir, "out");
    await writeFile(plain, "customer data".repeat(500));
    await encryptFile(plain, a, keys.publicKey);
    await encryptFile(plain, b, keys.publicKey);
    assert.ok(!(await readFile(a)).equals(await readFile(b)), "same input, different file each time");
    await assert.rejects(decryptFile(a, out, keys.privateKey, "wrong passphrase value"), /wrong/);
    await assert.rejects(decryptFile(a, out, other.privateKey, PASS), /wrong/);
    const original = await readFile(a);
    // flip a byte in the body, in the wrapped key header, and cut the end off
    for (const [label, change] of [["body", (x) => { x[x.length - 40] ^= 1; return x; }], ["header", (x) => { x[20] ^= 1; return x; }], ["tag", (x) => { x[x.length - 1] ^= 1; return x; }], ["truncated", (x) => x.subarray(0, x.length - 100)]]) {
      const bad = join(dir, `bad-${label}`);
      await writeFile(bad, change(Buffer.from(original)));
      await assert.rejects(decryptFile(bad, out, keys.privateKey, PASS), /damaged|wrong|incomplete/, label);
      assert.equal(await exists(out), false, `${label}: no partial output is left behind`);
    }
    await writeFile(join(dir, "other.txt"), "hello");
    await assert.rejects(decryptFile(join(dir, "other.txt"), out, keys.privateKey, PASS), /not a SITELINE backup/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("key generation demands a long passphrase and fingerprints are stable", () => {
  assert.throws(() => generateBackupKeyPair("short", 2048), /at least 12/);
  assert.match(keys.privateKey, /BEGIN ENCRYPTED PRIVATE KEY/);
  assert.equal(keyFingerprint(keys.publicKey), keyFingerprint(keys.publicKey));
  assert.notEqual(keyFingerprint(keys.publicKey), keyFingerprint(other.publicKey));
  assert.match(keyFingerprint(keys.publicKey), /^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
});

// ---------- retention ----------
test("retention removes only our own dated backups older than the period and keeps the newest", () => {
  const today = "2026-11-10";
  assert.equal(dateStamp(new Date(2026, 10, 10, 2, 0)), today);
  const names = ["database-2026-08-02.dump.enc", "database-2026-08-01.dump.enc", "database-2026-11-10.dump.enc", "database-2026-13-45.dump.enc", "notes.txt", "database-2026-01-01.dump", "database-2025-12-31.dump.enc.partial"];
  assert.deepEqual(expiredDatabaseBackups(names, today, 100), ["database-2026-08-01.dump.enc"], "exactly 100 days back is kept, 101 is not");
  assert.deepEqual(expiredDatabaseBackups(names, today, 7).sort(), ["database-2026-08-01.dump.enc", "database-2026-08-02.dump.enc"]);
  assert.deepEqual(expiredRemovedFolders(["2026-08-01", "2026-08-02", "2026-11-09", "readme", "2026-02-30"], today, 100), ["2026-08-01"]);
  assert.deepEqual(expiredDatabaseBackups([], today, 100), []);
  assert.deepEqual([6, 7, 100, 3650, 3651, 1.5, "100", NaN].map(validRetentionDays), [false, true, true, true, false, false, false, false]);
});

// ---------- storage files ----------
function fakeStorage(files, options = {}) {
  const downloads = [];
  const api = {
    downloads,
    listBuckets: async () => options.listError ? { data: null, error: { message: options.listError } } : { data: [...new Set(Object.keys(files).map((k) => k.split("/")[0]))].map((name) => ({ name })), error: null },
    from: (bucket) => ({
      list: async (prefix) => {
        const base = prefix ? `${bucket}/${prefix}/` : `${bucket}/`;
        const items = new Map();
        for (const [key, file] of Object.entries(files)) {
          if (!key.startsWith(base)) continue;
          const rest = key.slice(base.length), first = rest.split("/")[0];
          if (rest.includes("/")) items.set(first, { name: first, id: null });
          else items.set(first, { name: first, id: "id-" + key, updated_at: file.updated, metadata: { size: file.data.length, eTag: file.etag } });
        }
        return { data: [...items.values()], error: null };
      },
      download: async (path) => {
        downloads.push(`${bucket}/${path}`);
        const file = files[`${bucket}/${path}`];
        if (!file || options.failOn === `${bucket}/${path}`) return { data: null, error: { message: "boom" } };
        return { data: new Blob([options.wrongSize === `${bucket}/${path}` ? Buffer.from("x") : file.data]), error: null };
      },
    }),
  };
  return api;
}
const file = (text, etag = "v1") => ({ data: Buffer.from(text), etag, updated: "2026-11-01T00:00:00Z" });

test("manifest comparison finds added, changed and removed objects", () => {
  const previous = { "b/a": { size: 1, version: "v1" }, "b/gone": { size: 1, version: "v1" }, "b/edit": { size: 1, version: "v1" } };
  const remote = [{ bucket: "b", path: "a", size: 1, version: "v1" }, { bucket: "b", path: "edit", size: 1, version: "v2" }, { bucket: "b", path: "new", size: 2, version: "v1" }];
  const { add, change, remove } = diffManifest(previous, remote);
  assert.deepEqual([add.map((o) => o.path), change.map((o) => o.path), remove], [["new"], ["edit"], ["b/gone"]]);
});

test("object names become safe Windows paths and cannot escape the backup folder", () => {
  assert.equal(localObjectPath("photos", "user/a b.png"), "photos/user/a b.png.enc");
  assert.equal(localObjectPath("photos", 'x:y*z?.png'), "photos/x%3ay%2az%3f.png.enc");
  assert.throws(() => localObjectPath("photos", "../secret"), /Unsafe/);
  assert.throws(() => localObjectPath("photos", "a//b"), /Unsafe/);
  assert.throws(() => localObjectPath("photos", "./a"), /Unsafe/);
});

test("storage files are copied once, encrypted, and replaced or deleted files are kept for the retention period", async () => {
  const root = await temp();
  try {
    const files = { "docs/a.pdf": file("alpha"), "docs/nested/b.pdf": file("bravo"), "photos/p.png": file("pixels") };
    const storage = fakeStorage(files);
    const first = await syncStorage({ storage, root, publicKeyPem: keys.publicKey, today: "2026-11-10" });
    assert.deepEqual([first.buckets, first.objects, first.added, first.changed, first.removed, first.failed], [2, 3, 3, 0, 0, []]);
    const stored = join(root, "files", "current", "docs", "nested", "b.pdf.enc");
    assert.ok(!(await readFile(stored)).includes(Buffer.from("bravo")), "stored encrypted");
    await decryptFile(stored, join(root, "restored"), keys.privateKey, PASS);
    assert.equal(await readFile(join(root, "restored"), "utf8"), "bravo");
    assert.deepEqual(await readdir(join(root, "tmp")), [], "no plain copies are left behind");

    storage.downloads.length = 0;
    const second = await syncStorage({ storage, root, publicKeyPem: keys.publicKey, today: "2026-11-11" });
    assert.deepEqual(storage.downloads, [], "unchanged files are not downloaded again");
    assert.deepEqual([second.added, second.changed, second.removed], [0, 0, 0]);

    files["docs/a.pdf"] = file("alpha v2", "v2");
    delete files["photos/p.png"];
    const third = await syncStorage({ storage, root, publicKeyPem: keys.publicKey, today: "2026-11-12" });
    assert.deepEqual([third.added, third.changed, third.removed], [0, 1, 1]);
    assert.ok(await exists(join(root, "files", "removed", "2026-11-12", "docs", "a.pdf.enc")), "the replaced version is kept");
    assert.ok(await exists(join(root, "files", "removed", "2026-11-12", "photos", "p.png.enc")), "the deleted file is kept");
    assert.equal(await exists(join(root, "files", "current", "photos", "p.png.enc")), false);
    await decryptFile(join(root, "files", "current", "docs", "a.pdf.enc"), join(root, "restored2"), keys.privateKey, PASS);
    assert.equal(await readFile(join(root, "restored2"), "utf8"), "alpha v2");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a file that cannot be downloaded, or arrives with the wrong size, is reported and retried, and the others still copy", async () => {
  const root = await temp();
  try {
    const files = { "b/ok.pdf": file("fine"), "b/bad.pdf": file("broken"), "b/short.pdf": file("short") };
    const storage = fakeStorage(files, { failOn: "b/bad.pdf", wrongSize: "b/short.pdf" });
    const result = await syncStorage({ storage, root, publicKeyPem: keys.publicKey, today: "2026-11-10" });
    assert.equal(result.added, 1);
    assert.equal(result.failed.length, 2);
    assert.match(result.failed.join(" "), /bad\.pdf: boom/);
    assert.match(result.failed.join(" "), /short\.pdf: size/);
    const retry = fakeStorage(files);
    const again = await syncStorage({ storage: retry, root, publicKeyPem: keys.publicKey, today: "2026-11-11" });
    assert.deepEqual(retry.downloads.sort(), ["b/bad.pdf", "b/short.pdf"], "only the failed files are fetched on the next run");
    assert.deepEqual([again.added, again.failed], [2, []]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---------- the nightly run ----------
const PASSWORD = "s3cret-db-password";
async function setup(extra = {}) {
  const root = await temp();
  await mkdir(join(root, "config"), { recursive: true });
  await writeFile(join(root, "config", "backup-public.pem"), keys.publicKey);
  const config = buildConfig({ BACKUP_ROOT: root, DB_HOST: "db.example", DB_USER: "postgres.abc", DB_PASSWORD: PASSWORD, PG_DUMP_PATH: "FAKE-PG-DUMP", PG_RESTORE_PATH: "FAKE-PG-RESTORE",
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key-123456", ...extra });
  return { root, config };
}
function fakeRun({ tables = 73, dumpFails, dumpBytes = 4096, restoreFails } = {}) {
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, env: options.env });
    if (command === "FAKE-PG-DUMP") {
      if (args.includes("--version")) return { code: 0, stdout: "pg_dump (PostgreSQL) 17.11", stderr: "" };
      if (dumpFails) return { code: 1, stdout: "", stderr: `pg_dump: error: password authentication failed for password ${PASSWORD}\nFATAL: no` };
      await writeFile(args.find((a) => a.startsWith("--file=")).slice(7), Buffer.alloc(dumpBytes, 7));
      return { code: 0, stdout: "", stderr: "" };
    }
    if (restoreFails) return { code: 1, stdout: "", stderr: "bad archive" };
    return { code: 0, stdout: Array.from({ length: tables }, (_, i) => `${i}; 0 1 TABLE DATA public t${i} postgres`).join("\n"), stderr: "" };
  };
  return { run, calls };
}
const NOW = new Date(2026, 10, 10, 2, 0, 0);

test("settings files are parsed and problems with them are described", () => {
  assert.deepEqual(parseEnvFile('# comment\r\nDB_HOST=a.b\r\nDB_PASSWORD="p=w d"\r\n\r\nNOEQUALS\r\nRETENTION_DAYS = 100'), { DB_HOST: "a.b", DB_PASSWORD: "p=w d", RETENTION_DAYS: "100" });
  assert.deepEqual(configProblems(buildConfig({ DB_HOST: "h", DB_USER: "u", DB_PASSWORD: "p" })), []);
  const bad = configProblems(buildConfig({ DB_PORT: "6543", RETENTION_DAYS: "3" })).join(" ");
  for (const text of [/DB_HOST/, /DB_USER/, /DB_PASSWORD/, /6543/, /RETENTION_DAYS/]) assert.match(bad, text);
  assert.equal(buildConfig({ PG_DUMP_PATH: "C:\\pg\\bin\\pg_dump.exe" }).pgRestore.toLowerCase().endsWith("pg_restore.exe"), true);
});

test("a good night saves an encrypted database backup, copies files, and records the result without leaking secrets", async () => {
  const { root, config } = await setup();
  try {
    const { run, calls } = fakeRun();
    const storage = fakeStorage({ "docs/a.pdf": file("alpha") });
    const status = await runBackup(config, { run, storage }, NOW);
    assert.equal(status.status, "ok", JSON.stringify(status));
    assert.equal(status.database.file, "database-2026-11-10.dump.enc");
    assert.equal(status.database.tables, 73);
    assert.deepEqual([status.files.added, status.files.failed], [1, []]);
    const encrypted = join(root, "database", "database-2026-11-10.dump.enc");
    assert.equal((await stat(encrypted)).size, status.database.bytes);
    await decryptFile(encrypted, join(root, "restored.dump"), keys.privateKey, PASS);
    assert.ok(Buffer.alloc(4096, 7).equals(await readFile(join(root, "restored.dump"))), "the restored dump matches what pg_dump produced");
    assert.deepEqual(await readdir(join(root, "tmp")), [], "the plain dump and the lock are removed");
    const dumpCall = calls.find((c) => c.args.some((a) => a.startsWith("--file=")));
    assert.equal(dumpCall.env.PGPASSWORD, PASSWORD, "the password reaches pg_dump through its environment");
    assert.ok(!dumpCall.args.join(" ").includes(PASSWORD), "never on the command line");
    assert.ok(dumpCall.args.includes("--exclude-table-data=public.users_token") && dumpCall.args.includes("--port=5432"));
    const logs = join(root, "logs");
    const everything = (await Promise.all((await readdir(logs)).map((f) => readFile(join(logs, f), "utf8")))).join("\n");
    assert.ok(!everything.includes(PASSWORD) && !everything.includes("service-key-123456"), "no secret is written to the logs");
    assert.equal(JSON.parse(await readFile(join(logs, "status.json"), "utf8")).status, "ok");
    assert.equal((await readFile(join(logs, "history.jsonl"), "utf8")).trim().split("\n").length, 1);
    assert.ok(await exists(join(logs, "last-good.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("without storage settings the database is still backed up and the night is marked partial", async () => {
  const { root, config } = await setup({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
  try {
    const status = await runBackup(config, { run: fakeRun().run }, NOW);
    assert.equal(status.status, "partial");
    assert.match(status.warnings.join(" "), /Storage files were not copied/);
    assert.ok(await exists(join(root, "database", "database-2026-11-10.dump.enc")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a storage outage leaves the database backup intact and is reported as partial", async () => {
  const { root, config } = await setup();
  try {
    const status = await runBackup(config, { run: fakeRun().run, storage: fakeStorage({ "a/b": file("x") }, { listError: "service-key-123456 rejected" }) }, NOW);
    assert.equal(status.status, "partial");
    assert.ok(status.database.file);
    assert.ok(!JSON.stringify(status).includes("service-key-123456"), "secrets are redacted from errors");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a failed night keeps every older backup, removes nothing, and never exposes the password", async () => {
  const { root, config } = await setup();
  try {
    await mkdir(join(root, "database"), { recursive: true });
    for (const name of ["database-2020-01-01.dump.enc", "database-2026-11-09.dump.enc"]) await writeFile(join(root, "database", name), "old");
    const status = await runBackup(config, { run: fakeRun({ dumpFails: true }).run, storage: fakeStorage({}) }, NOW);
    assert.equal(status.status, "failed");
    assert.match(status.errors.join(" "), /pg_dump failed/);
    assert.ok(!JSON.stringify(status).includes(PASSWORD));
    assert.deepEqual((await readdir(join(root, "database"))).sort(), ["database-2020-01-01.dump.enc", "database-2026-11-09.dump.enc"], "an expired file is NOT deleted on a failed night");
    assert.equal(await exists(join(root, "tmp", "backup.lock")), false, "the lock is released");
    assert.equal(JSON.parse(await readFile(join(root, "logs", "status.json"), "utf8")).status, "failed");
    assert.equal(await exists(join(root, "logs", "last-good.json")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a dump with too few tables or one that cannot be read back is discarded, not kept as a backup", async () => {
  for (const options of [{ tables: 5 }, { restoreFails: true }]) {
    const { root, config } = await setup();
    try {
      const status = await runBackup(config, { run: fakeRun(options).run, storage: fakeStorage({}) }, NOW);
      assert.equal(status.status, "failed");
      assert.match(status.errors.join(" "), /discarded/);
      assert.deepEqual(await readdir(join(root, "database")), []);
      assert.deepEqual(await readdir(join(root, "tmp")), [], "the plain dump is removed even when it fails the check");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("after a good night only expired backups and expired removed-file folders are deleted", async () => {
  const { root, config } = await setup();
  try {
    await mkdir(join(root, "database"), { recursive: true });
    await mkdir(join(root, "files", "removed", "2026-01-01"), { recursive: true });
    await mkdir(join(root, "files", "removed", "2026-11-01"), { recursive: true });
    for (const name of ["database-2026-01-01.dump.enc", "database-2026-08-02.dump.enc", "readme.txt"]) await writeFile(join(root, "database", name), "x");
    const status = await runBackup(config, { run: fakeRun().run, storage: fakeStorage({}) }, NOW);
    assert.equal(status.status, "ok");
    assert.deepEqual(status.deleted, { databaseBackups: 1, removedFolders: 1 });
    assert.deepEqual((await readdir(join(root, "database"))).sort(), ["database-2026-08-02.dump.enc", "database-2026-11-10.dump.enc", "readme.txt"]);
    assert.deepEqual(await readdir(join(root, "files", "removed")), ["2026-11-01"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a dump that is less than half the size of the last good one is flagged, not silently accepted", async () => {
  const { root, config } = await setup();
  try {
    await runBackup(config, { run: fakeRun({ dumpBytes: 100_000 }).run, storage: fakeStorage({}) }, NOW);
    const next = new Date(2026, 10, 11, 2, 0, 0);
    const status = await runBackup(config, { run: fakeRun({ dumpBytes: 10_000 }).run, storage: fakeStorage({}) }, next);
    assert.equal(status.status, "partial");
    assert.match(status.warnings.join(" "), /less than half/);
    assert.ok(await exists(join(root, "database", "database-2026-11-11.dump.enc")), "still saved so nothing is lost");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("two backups cannot run at once, and a stale lock from a crashed run is cleared", async () => {
  const { root, config } = await setup();
  try {
    await mkdir(join(root, "tmp"), { recursive: true });
    const lock = join(root, "tmp", "backup.lock");
    await writeFile(lock, "{}");
    await utimes(lock, NOW, NOW);
    const fake = fakeRun();
    const blocked = await runBackup(config, { run: fake.run, storage: fakeStorage({}) }, NOW);
    assert.equal(blocked.status, "failed");
    assert.match(blocked.errors.join(" "), /already running/);
    assert.equal(fake.calls.length, 0, "pg_dump was not started");
    assert.ok(await exists(lock), "the other run's lock is left alone");
    const old = new Date(NOW.getTime() - 7 * 60 * 60 * 1000); // seven hours before the run being tested
    await utimes(lock, old, old);
    const status = await runBackup(config, { run: fakeRun().run, storage: fakeStorage({}) }, NOW);
    assert.equal(status.status, "ok");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a missing or damaged public key stops the backup before anything is dumped", async () => {
  const { root, config } = await setup();
  try {
    await writeFile(join(root, "config", "backup-public.pem"), "not a key");
    const fake = fakeRun();
    const status = await runBackup(config, { run: fake.run, storage: fakeStorage({}) }, NOW);
    assert.equal(status.status, "failed");
    assert.match(status.errors.join(" "), /public key/);
    assert.equal(fake.calls.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the setup check reports what is missing without making a backup", async () => {
  const { root, config } = await setup();
  try {
    const good = await checkSetup(config, { run: fakeRun().run, storage: fakeStorage({ "a/b": file("x") }) });
    assert.equal(good.ok, true, good.lines.join("\n"));
    assert.match(good.lines.join("\n"), /Connected to the database/);
    assert.deepEqual(await readdir(join(root, "database")).catch(() => []), [], "a check never creates a backup");
    await writeFile(join(root, "config", "stolen-PRIVATE.pem"), keys.privateKey);
    assert.match((await checkSetup(config, { run: fakeRun().run, storage: fakeStorage({}) })).lines.join("\n"), /WARN .*private key file is stored/);
    await rm(join(root, "config", "stolen-PRIVATE.pem"));
    await rm(join(root, "config", "backup-public.pem"));
    const noKey = await checkSetup(config, { run: fakeRun().run, storage: fakeStorage({}) });
    assert.equal(noKey.ok, false);
    assert.match(noKey.lines.join("\n"), /FAIL .*Public key missing/);
    const noStorage = await checkSetup({ ...config, supabaseUrl: "", serviceKey: "" }, { run: fakeRun().run });
    assert.match(noStorage.lines.join("\n"), /WARN .*Storage files will NOT be backed up/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
