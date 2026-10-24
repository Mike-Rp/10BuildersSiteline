import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Real handlers and the real 010 and 011 migrations against an in-memory Postgres (PGlite, a root dev dependency).
let PGlite, citext;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ citext } = await import("@electric-sql/pglite/contrib/citext"));
} catch { /* the backend folder is being tested on its own */ }
const skip = !PGlite && "PGlite not installed";

const access = await import("../src/common/utilities/access.utility.js");
const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const spm = { id: "22222222-2222-4222-8222-222222222222", role: "spm" };
const otherSpm = { id: "33333333-3333-4333-8333-333333333333", role: "spm" };
const opm = { id: "44444444-4444-4444-8444-444444444444", role: "opm" };
let db;
let notices = [];
mock.module("../src/common/utilities/transaction.utility.js", {
  namedExports: { withTransaction: (callback) => db.transaction((tx) => callback(tx)) },
});
mock.module("../src/common/utilities/notify.utility.js", {
  namedExports: { notify: async (_db, notice) => { notices.push(notice); return 1; }, adminIds: async () => [admin.id] },
});
mock.module("../src/common/utilities/access.utility.js", {
  namedExports: {
    ...access,
    requireUser: async (req, res, allowed) => {
      if (!req.actor) { access.sendError(res, "No token.", 401); return null; }
      if (allowed && !allowed.includes(req.actor.role)) { access.sendError(res, "Forbidden.", 403); return null; }
      return req.actor;
    },
  },
});
const { importWorkers } = await import("../src/services/subcontractors/import.controller.js");
const sub = await import("../src/services/subcontractors/submission.controller.js");

const response = () => ({
  statusCode: 200, body: null,
  status(n) { this.statusCode = n; return this; },
  json(body) { this.body = body; return this; },
});
let atlas, brook;
const send = async (handler, { params = {}, body = {}, actor = admin } = {}) => {
  const res = response();
  await handler({ params, body, query: {}, actor }, res);
  return res;
};
const worker = (first, last, extra = {}) => ({ id_number: "", first_name: first, middle_name: "", last_name: last, suffix: "", ...extra });
const submit = (workers, { company = atlas, actor = spm, file_name = "list.xlsx" } = {}) =>
  send(sub.submitManpower, { params: { id: company }, body: { workers, file_name }, actor });
const approve = (id, actor = admin) => send(sub.approveSubmission, { params: { id }, actor });
const reject = (id, reason, actor = admin) => send(sub.rejectSubmission, { params: { id }, body: { reason }, actor });
const withdraw = (id, actor = spm) => send(sub.withdrawSubmission, { params: { id }, actor });
const workersOf = async (company = atlas) =>
  (await db.query("select id_number, full_name from subcontractor_workers where subcontractor_id=$1 order by id_number", [company])).rows;
const statusOf = async (id) => (await db.query("select status from manpower_submissions where id=$1", [id])).rows[0]?.status;

async function freshDatabase() {
  notices = [];
  db = new PGlite({ extensions: { citext } });
  await db.exec(`
    create extension if not exists citext;
    create role anon; create role authenticated;
    create table public.users (id uuid primary key default gen_random_uuid(), full_name text, email text);
    create table public.subcontractors (id uuid primary key default gen_random_uuid(), company_name text, is_deleted boolean default false);
    create table public.subcontractor_workers (id uuid primary key default gen_random_uuid(),
      subcontractor_id uuid references public.subcontractors(id), full_name text not null, status text, availability_status text,
      created_by uuid, created_at timestamptz default now(), updated_by uuid, updated_at timestamptz);
    create table public.phase_schema_migrations (name text primary key);
    insert into public.users(id, full_name) values ('${admin.id}', 'Admin'), ('${spm.id}', 'Site PM'), ('${otherSpm.id}', 'Other Site PM'), ('${opm.id}', 'Office PM');
    insert into public.subcontractors(company_name) values ('Atlas'), ('Brook');`);
  for (const file of ["010-id-numbers.sql", "011-manpower-submissions.sql"])
    await db.exec(fs.readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  [atlas, brook] = (await db.query("select id from subcontractors order by company_code")).rows.map((c) => c.id);
}
after(async () => { await db?.close(); });

test("a Site PM's list waits for approval: nothing is created and the Admin is told", { skip }, async () => {
  await freshDatabase();
  const res = await submit([worker("Juan", "Santos", { suffix: "jr" }), worker("Maria", "Cruz")]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual([res.body.data.status, res.body.data.new_count, res.body.data.existing_count], ["pending", 2, 0]);
  assert.equal((await workersOf()).length, 0, "no workers until an Admin approves");
  assert.equal((await db.query("select count(*)::int n from worker_id_numbers")).rows[0].n, 0, "no ID numbers used");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, "Manpower list awaiting approval");
  assert.deepEqual(notices[0].recipientIds, [admin.id]);
  assert.match(notices[0].detail, /Atlas: 2 new and 0 existing/);
});

test("approval creates the workers, assigns their ID numbers and tells the Site PM", { skip }, async () => {
  await freshDatabase();
  const made = await submit([worker("Juan", "Santos", { suffix: "jr" }), worker("Maria", "Cruz")]);
  const id = made.body.data.id;
  const res = await approve(id);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.created.map((w) => w.id_number), ["02000-0001", "02000-0002"]);
  assert.deepEqual((await workersOf()).map((w) => w.full_name), ["Juan Santos Jr.", "Maria Cruz"]);
  const stored = (await db.query("select status, decided_by, result from manpower_submissions where id=$1", [id])).rows[0];
  assert.equal(stored.status, "approved");
  assert.equal(stored.decided_by, admin.id);
  assert.equal(stored.result.created[0].id_number, "02000-0001");
  const told = notices.at(-1);
  assert.equal(told.title, "Manpower list approved");
  assert.deepEqual(told.recipientIds, [spm.id]);
  assert.match(told.detail, /2 new, 0 updated, 0 unchanged/);
  // A decided list cannot be decided again, and the next list can be submitted.
  assert.equal((await approve(id)).statusCode, 409);
  assert.equal((await reject(id, "too late")).statusCode, 409);
  assert.equal((await workersOf()).length, 2);
  assert.equal((await submit([worker("Leo", "Tan")])).statusCode, 201);
});

test("approving an update changes existing workers by ID and counts unchanged ones", { skip }, async () => {
  await freshDatabase();
  await send(importWorkers, { params: { id: atlas }, body: { workers: [worker("Juan", "Santos"), worker("Maria", "Cruz")] } });
  const made = await submit([
    worker("Juan", "Santos", { id_number: "02000-0001" }),
    worker("Maria", "Cruz-Lim", { id_number: "02000-0002" }),
    worker("Leo", "Tan"),
  ]);
  assert.deepEqual([made.body.data.new_count, made.body.data.existing_count], [1, 2]);
  const res = await approve(made.body.data.id);
  assert.equal(res.body.data.updated, 1);
  assert.equal(res.body.data.unchanged, 1);
  assert.deepEqual(res.body.data.created.map((w) => w.id_number), ["02000-0003"]);
  assert.equal((await workersOf())[1].full_name, "Maria Cruz-Lim");
});

test("a rejected list needs a reason, creates nothing, uses no ID numbers, and the Site PM sees the reason", { skip }, async () => {
  await freshDatabase();
  const id = (await submit([worker("Juan", "Santos")])).body.data.id;
  assert.equal((await reject(id, "  ")).statusCode, 400);
  assert.equal(await statusOf(id), "pending");
  const res = await reject(id, "Names do not match the company's payroll.");
  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(id), "rejected");
  assert.equal((await workersOf()).length, 0);
  assert.match(notices.at(-1).detail, /Names do not match/);
  assert.deepEqual(notices.at(-1).recipientIds, [spm.id]);
  const listed = await send(sub.listSubmissions, { params: { id: atlas }, actor: spm });
  assert.equal(listed.body.data[0].decision_note, "Names do not match the company's payroll.");
  // The rejected list never used an ID number: the next approved list starts at 0001.
  const next = await approve((await submit([worker("Ana", "Lim")])).body.data.id);
  assert.equal(next.body.data.created[0].id_number, "02000-0001");
});

test("only one list per company can wait, and a Site PM can withdraw their own", { skip }, async () => {
  await freshDatabase();
  const first = await submit([worker("Juan", "Santos")]);
  const second = await submit([worker("Ana", "Lim")], { actor: otherSpm });
  assert.equal(second.statusCode, 409);
  assert.match(second.body.message, /already waiting for approval/);
  assert.equal((await submit([worker("Pedro", "Abad")], { company: brook })).statusCode, 201, "another company is independent");
  assert.equal((await withdraw(first.body.data.id, otherSpm)).statusCode, 404, "someone else's list is not theirs to withdraw");
  assert.equal(await statusOf(first.body.data.id), "pending");
  assert.equal((await withdraw(first.body.data.id)).statusCode, 200);
  assert.equal(await statusOf(first.body.data.id), "withdrawn");
  assert.equal((await approve(first.body.data.id)).statusCode, 409, "a withdrawn list cannot be approved");
  assert.equal((await submit([worker("Ana", "Lim")], { actor: otherSpm })).statusCode, 201);
});

test("only a Site PM can submit and only an Admin can decide", { skip }, async () => {
  await freshDatabase();
  assert.equal((await submit([worker("A", "B")], { actor: opm })).statusCode, 403);
  assert.equal((await submit([worker("A", "B")], { actor: admin })).statusCode, 403);
  const id = (await submit([worker("Juan", "Santos")])).body.data.id;
  assert.equal((await approve(id, spm)).statusCode, 403);
  assert.equal((await reject(id, "no", spm)).statusCode, 403);
  assert.equal((await approve(id, opm)).statusCode, 403);
  assert.equal((await withdraw(id, admin)).statusCode, 403);
  assert.equal(await statusOf(id), "pending");
  assert.equal((await workersOf()).length, 0);
});

test("a bad file is refused with row numbers and nothing is stored", { skip }, async () => {
  await freshDatabase();
  await send(importWorkers, { params: { id: brook }, body: { workers: [worker("Pedro", "Abad")] } });
  const theirs = (await workersOf(brook))[0].id_number;
  const res = await submit([
    worker("Juan", "Santos", { row: 2 }),
    worker("", "Cruz", { row: 3 }),
    worker("Ana", "Lim", { row: 4, id_number: theirs }),
    worker("Leo", "Tan", { row: 5, suffix: "Esq." }),
  ]);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body.error.rows.map((e) => e.row), [3, 5]);
  // Rows that pass the shape check are then checked against this company's workers.
  const wrongCompany = await submit([worker("Ana", "Lim", { row: 2, id_number: theirs })]);
  assert.equal(wrongCompany.statusCode, 422);
  assert.match(wrongCompany.body.error.rows[0].message, /is not one of this company's workers/);
  assert.equal((await db.query("select count(*)::int n from manpower_submissions")).rows[0].n, 0);
  assert.equal(notices.length, 0);
});

test("approval re-checks the list: if a worker left the company meanwhile, nothing is approved", { skip }, async () => {
  await freshDatabase();
  await send(importWorkers, { params: { id: atlas }, body: { workers: [worker("Juan", "Santos")] } });
  const workerId = (await db.query("select id from subcontractor_workers where subcontractor_id=$1", [atlas])).rows[0].id;
  const made = await submit([worker("Juan", "Santos-Reyes", { id_number: "02000-0001" }), worker("Ana", "Lim")]);
  await db.query("select transfer_worker($1, $2, $3)", [workerId, brook, admin.id]);
  const res = await approve(made.body.data.id);
  assert.equal(res.statusCode, 422);
  assert.match(res.body.message, /02000-0001 is not one of this company's workers/);
  assert.equal(await statusOf(made.body.data.id), "pending", "still waiting, so the Admin can reject it");
  assert.equal((await workersOf()).length, 0);
  assert.equal((await reject(made.body.data.id, "A worker moved to another company.")).statusCode, 200);
});

test("the Admin sees the worker rows for review; a Site PM sees only their own list", { skip }, async () => {
  await freshDatabase();
  const id = (await submit([worker("Juan", "Santos", { row: 2 }), worker("Maria", "Cruz", { row: 3 })])).body.data.id;
  const asAdmin = await send(sub.getSubmission, { params: { id }, actor: admin });
  assert.equal(asAdmin.statusCode, 200);
  assert.deepEqual(asAdmin.body.data.payload.map((w) => [w.row, w.first_name, w.last_name]), [[2, "Juan", "Santos"], [3, "Maria", "Cruz"]]);
  assert.equal(asAdmin.body.data.submitted_by_name, "Site PM");
  assert.equal((await send(sub.getSubmission, { params: { id }, actor: spm })).statusCode, 200);
  assert.equal((await send(sub.getSubmission, { params: { id }, actor: otherSpm })).statusCode, 404);
  const listed = await send(sub.listSubmissions, { params: { id: atlas }, actor: opm });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.data[0].payload, undefined, "the list view never carries the worker rows");
  assert.equal(listed.body.data[0].file_name, "list.xlsx");
});

test("bad requests are refused before touching the database", { skip }, async () => {
  await freshDatabase();
  assert.equal((await send(sub.submitManpower, { params: { id: atlas }, body: { workers: [] }, actor: spm })).statusCode, 400);
  assert.equal((await send(sub.submitManpower, { params: { id: "nope" }, body: { workers: [worker("A", "B")] }, actor: spm })).statusCode, 400);
  assert.equal((await submit([worker("A", "B")], { company: "33333333-3333-4333-8333-333333333333" })).statusCode, 404);
  assert.equal((await submit(Array.from({ length: 5001 }, (_, i) => worker("W" + i, "X")))).statusCode, 400);
  assert.equal((await approve("33333333-3333-4333-8333-333333333333")).statusCode, 404);
  assert.equal((await approve("nope")).statusCode, 400);
});
