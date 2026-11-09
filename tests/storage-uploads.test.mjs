import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import { STORAGE_BUCKETS, planUpload } from "../Thesis-Backend/src/services/storage/storage-plan.js";
import { createUploadTarget, openObject, pipeObject, readHead, removeObject, setStorageClient, statObject, storageEnabled } from "../Thesis-Backend/src/services/storage/storage.service.js";
import { completeStorageUpload, requestUploadTarget } from "../Thesis-Backend/src/services/storage/stored-file.utility.js";
import { insertFileFromStored } from "../Thesis-Backend/src/services/progress/phase-upload.utility.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const FILE = "44444444-4444-4444-8444-444444444444";
const JPEG = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(60, 2)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(60, 3)]);

// A stand-in for the Supabase client holding objects in memory.
function fakeStorage() {
  const objects = new Map();
  const removed = [];
  const client = {
    storage: {
      from: bucket => ({
        createSignedUploadUrl: async path => ({ data: { signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t`, token: "t", path }, error: null }),
        list: async (folder, { search }) => {
          const entry = objects.get(`${bucket}/${folder}/${search}`);
          return { data: entry ? [{ name: search, metadata: { size: entry.length, mimetype: "x" } }] : [], error: null };
        },
        createSignedUrl: async path => ({ data: { signedUrl: `https://storage.test/object/${bucket}/${path}` }, error: null }),
        remove: async paths => { removed.push(...paths.map(path => `${bucket}/${path}`)); for (const path of paths) objects.delete(`${bucket}/${path}`); return { data: [], error: null }; },
      }),
    },
  };
  return { client, objects, removed };
}

const realFetch = globalThis.fetch;
function serveObjects(objects) {
  globalThis.fetch = async (url, init = {}) => {
    const key = String(url).replace("https://storage.test/object/", "");
    const bytes = objects.get(key);
    if (!bytes) return new Response("missing", { status: 404 });
    const range = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || "");
    const body = range ? bytes.subarray(Number(range[1]), Number(range[2]) + 1) : bytes;
    return new Response(body, { status: range ? 206 : 200, headers: { "content-length": String(body.length) } });
  };
}

async function database() {
  const db = new PGlite();
  await db.exec(`create table stored_files(id uuid primary key,project_id uuid,user_id uuid,purpose text not null,original_name text not null,
      content_type text not null,byte_size integer not null,content bytea,uploaded_by uuid not null,created_at timestamptz default now(),
      storage_bucket text,storage_path text);
    create table project_phase_files(id uuid primary key,project_id uuid not null,project_stage_id smallint not null,original_name text not null,
      content_type text not null,byte_size integer not null,content bytea,uploaded_by uuid not null,storage_bucket text,storage_path text);`);
  return db;
}

test("planUpload fixes bucket and a user-scoped path for each kind", () => {
  const base = { userId: USER, id: FILE, size: 1000 };
  assert.deepEqual(planUpload({ ...base, name: "site.JPG", kind: "photo" }), { bucket: "project-photos", path: `${USER}/${FILE}.jpg`, extension: "jpg", contentType: "image/jpeg" });
  assert.equal(planUpload({ ...base, name: "a.pdf", kind: "evidence" }).bucket, "phase-evidence");
  assert.equal(planUpload({ ...base, name: "a.png", kind: "document" }).bucket, "project-documents");
  assert.equal(planUpload({ ...base, name: "a.pdf", kind: "credential" }).bucket, "account-credentials");
  assert.equal(planUpload({ ...base, name: "scan.pdf", kind: "photo" }).bucket, STORAGE_BUCKETS.document, "the photo bucket only takes images");
  assert.throws(() => planUpload({ ...base, name: "a.pdf", kind: "payroll" }), /Unknown upload type/);
  assert.throws(() => planUpload({ ...base, name: "a.exe", kind: "document" }), /Supported files/);
  assert.throws(() => planUpload({ ...base, name: "a.pdf", kind: "document", size: 0 }), /non-empty/);
  assert.equal(planUpload({ ...base, name: "a.pdf", kind: "document", size: 10 * 1024 * 1024 }).extension, "pdf");
  assert.throws(() => planUpload({ ...base, name: "a.pdf", kind: "document", size: 10 * 1024 * 1024 + 1 }), /10 MB or smaller/);
});

test("storage service talks to the client and streams objects", async () => {
  const { client, objects, removed } = fakeStorage();
  setStorageClient(client);
  try {
    assert.equal(storageEnabled(), true);
    assert.match((await createUploadTarget("phase-evidence", "u/f.jpg")).url, /upload\/phase-evidence\/u\/f\.jpg\?token=t/);
    objects.set("phase-evidence/u/f.jpg", JPEG);
    assert.deepEqual(await statObject("phase-evidence", "u/f.jpg"), { size: JPEG.length, contentType: "x" });
    assert.equal(await statObject("phase-evidence", "u/none.jpg"), null);
    serveObjects(objects);
    assert.deepEqual([...await readHead("phase-evidence", "u/f.jpg", 3)], [255, 216, 255]);
    const opened = await openObject("phase-evidence", "u/f.jpg");
    const chunks = [];
    const sink = new Writable({ write(chunk, _enc, done) { chunks.push(chunk); done(); } });
    sink.set = () => {};
    await pipeObject(sink, opened);
    assert.equal(Buffer.concat(chunks).length, JPEG.length);
    await assert.rejects(openObject("phase-evidence", "u/none.jpg"), /File not found/);
    await removeObject("phase-evidence", "u/f.jpg");
    assert.deepEqual(removed, ["phase-evidence/u/f.jpg"]);
  } finally { globalThis.fetch = realFetch; setStorageClient(undefined); }
});

test("uploads fall back to the database path when storage or the migration is missing", async () => {
  const db = await database();
  try {
    setStorageClient(null);
    assert.deepEqual(await requestUploadTarget(db, { id: USER }, { id: FILE, name: "a.pdf", size: 10, kind: "document" }), { mode: "direct" });
    setStorageClient(fakeStorage().client);
    await db.exec("alter table stored_files drop column storage_bucket");
    assert.deepEqual(await requestUploadTarget(db, { id: USER }, { id: FILE, name: "a.pdf", size: 10, kind: "document" }), { mode: "direct" }, "migration 028 not applied");
    await assert.rejects(completeStorageUpload(db, { id: USER }, { id: FILE, name: "a.pdf", kind: "document" }), /not enabled/);
  } finally { setStorageClient(undefined); await db.close(); }
});

test("direct-to-storage upload is checked, recorded once, and bad files are removed", async () => {
  const db = await database();
  const { client, objects, removed } = fakeStorage();
  setStorageClient(client);
  serveObjects(objects);
  const user = { id: USER };
  const put = (bucket, name, bytes) => objects.set(`${bucket}/${USER}/${name}`, bytes);
  try {
    const target = await requestUploadTarget(db, user, { id: FILE, name: "evidence.jpg", size: JPEG.length, kind: "evidence" });
    assert.equal(target.mode, "storage");
    assert.equal(target.bucket, "phase-evidence");
    assert.equal(target.path, `${USER}/${FILE}.jpg`);
    await assert.rejects(requestUploadTarget(db, user, { id: "not-a-uuid", name: "a.jpg", size: 5, kind: "evidence" }), /UUID/);
    await assert.rejects(requestUploadTarget(db, user, { id: FILE, name: "a.jpg", size: 11 * 1024 * 1024, kind: "evidence" }), /10 MB or smaller/);

    await assert.rejects(completeStorageUpload(db, user, { id: FILE, name: "evidence.jpg", kind: "evidence" }), /not received/);
    put("phase-evidence", `${FILE}.jpg`, JPEG);
    const done = await completeStorageUpload(db, user, { id: FILE, name: "evidence.jpg", kind: "evidence" });
    assert.equal(done.download_url, `/api/v1/files/${FILE}/content`);
    const row = (await db.query("select * from stored_files where id=$1", [FILE])).rows[0];
    assert.equal(row.storage_bucket, "phase-evidence");
    assert.equal(row.storage_path, `${USER}/${FILE}.jpg`);
    assert.equal(row.content, null);
    assert.equal(row.content_type, "image/jpeg");
    assert.equal(row.purpose, "upload");
    assert.equal(Number(row.byte_size), JPEG.length);

    assert.deepEqual(await completeStorageUpload(db, user, { id: FILE, name: "evidence.jpg", kind: "evidence" }), done, "completing twice is harmless");
    await assert.rejects(completeStorageUpload(db, { id: OTHER }, { id: FILE, name: "evidence.jpg", kind: "evidence" }), /already uploaded/);
    await assert.rejects(requestUploadTarget(db, user, { id: FILE, name: "again.jpg", size: 10, kind: "evidence" }), /already uploaded/);

    const fake = "55555555-5555-4555-8555-555555555555";
    objects.set(`account-credentials/${USER}/${fake}.pdf`, Buffer.from("MZ not a pdf at all, just renamed"));
    await assert.rejects(completeStorageUpload(db, user, { id: fake, name: "license.pdf", kind: "credential" }), /./);
    assert.ok(removed.includes(`account-credentials/${USER}/${fake}.pdf`), "a file that is not what it claims is deleted");
    assert.equal((await db.query("select 1 from stored_files where id=$1", [fake])).rowCount, 0);

    const big = "66666666-6666-4666-8666-666666666666";
    objects.set(`project-documents/${USER}/${big}.pdf`, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    await assert.rejects(completeStorageUpload(db, user, { id: big, name: "big.pdf", kind: "document" }), /10 MB or smaller/);
    assert.ok(removed.includes(`project-documents/${USER}/${big}.pdf`));

    const png = "77777777-7777-4777-8777-777777777777";
    objects.set(`project-photos/${USER}/${png}.png`, PNG);
    await completeStorageUpload(db, user, { id: png, name: "site.png", kind: "photo" });
    assert.equal((await db.query("select content_type from stored_files where id=$1", [png])).rows[0].content_type, "image/png");
  } finally { globalThis.fetch = realFetch; setStorageClient(undefined); await db.close(); }
});

test("a phase file is created from an uploaded file id, on the server", async () => {
  const db = await database();
  const project = { id: PROJECT, current_stage_id: 3 };
  try {
    await db.query(`insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,uploaded_by,storage_bucket,storage_path)
      values($1,$2,'upload','evidence.jpg','image/jpeg',4800000,$2,'phase-evidence',$3)`, [FILE, USER, `${USER}/${FILE}.jpg`]);
    const fromStorage = await insertFileFromStored(db, project, FILE, USER);
    const row = (await db.query("select * from project_phase_files where id=$1", [fromStorage.id])).rows[0];
    assert.deepEqual([row.storage_bucket, row.storage_path, row.content, row.project_stage_id], ["phase-evidence", `${USER}/${FILE}.jpg`, null, 3]);
    assert.equal(fromStorage.byte_size, 4800000, "a 4.6 MB file is fine; only the per-file 10 MB limit applies");

    const legacy = "88888888-8888-4888-8888-888888888888";
    await db.query(`insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
      values($1,$2,'upload','old.jpg','image/jpeg',$3,$4,$2)`, [legacy, USER, JPEG.length, JPEG]);
    const copied = await insertFileFromStored(db, project, legacy, USER);
    const copiedRow = (await db.query("select content,storage_path from project_phase_files where id=$1", [copied.id])).rows[0];
    assert.equal(Buffer.compare(Buffer.from(copiedRow.content), JPEG), 0);
    assert.equal(copiedRow.storage_path, null);

    await assert.rejects(insertFileFromStored(db, project, FILE, OTHER), /not found/, "another user's file is not found");
    await assert.rejects(insertFileFromStored(db, project, "nope", USER), /valid file_id/);
    await db.query("update stored_files set project_id=$2 where id=$1", [FILE, "99999999-9999-4999-8999-999999999999"]);
    await assert.rejects(insertFileFromStored(db, project, FILE, USER), /another project/);
    const spoof = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await db.query(`insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
      values($1,$2,'upload','fake.jpg','image/jpeg',10,$3,$2)`, [spoof, USER, Buffer.from("not an image")]);
    await assert.rejects(insertFileFromStored(db, project, spoof, USER), /Supported files|does not match/);
  } finally { await db.close(); }
});
