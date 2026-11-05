import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Real handlers and the real 010 migration against an in-memory Postgres (PGlite, a root dev dependency).
let PGlite, citext;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ citext } = await import("@electric-sql/pglite/contrib/citext"));
} catch { /* the backend folder is being tested on its own */ }
const skip = !PGlite && "PGlite not installed";

const access = await import("../src/common/utilities/access.utility.js");
const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const spm = { id: "22222222-2222-4222-8222-222222222222", role: "spm" };
let db;
const run = (sql, params) => db.query(sql, params);
mock.module("../src/common/utilities/query.utility.js", { defaultExport: run, namedExports: { execute: run } });
mock.module("../src/common/utilities/transaction.utility.js", {
  namedExports: { withTransaction: (callback) => db.transaction((tx) => callback(tx)) },
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
const { addWorker, updateWorker, getWorkers } = await import("../src/services/subcontractors/controller.js");
const { transferWorker, getWorkerIdNumbers } = await import("../src/services/subcontractors/transfer.controller.js");

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
const add = (body, company = atlas, actor = admin) => send(addWorker, { params: { id: company }, body, actor });
const row = async (id) => (await db.query("select * from subcontractor_workers where id=$1", [id])).rows[0];

async function freshDatabase() {
  db = new PGlite({ extensions: { citext } });
  await db.exec(`
    create extension if not exists citext;
    create role anon; create role authenticated;
    create table public.users (id uuid primary key default gen_random_uuid(), full_name text, email text);
    create table public.subcontractors (id uuid primary key default gen_random_uuid(), company_name text, is_deleted boolean default false);
    create table public.subcontractor_workers (id uuid primary key default gen_random_uuid(),
      subcontractor_id uuid references public.subcontractors(id), full_name text not null, role_title text, phone text,
      status text, discipline_id int, license_number text, license_expiry date, availability_status text, availability_note text,
      current_project_id uuid, current_project_until date,
      created_by uuid, created_at timestamptz default now(), updated_by uuid, updated_at timestamptz);
    create table public.phase_schema_migrations (name text primary key);
    create table public.disciplines (id int primary key, code text);
    insert into public.users(id, full_name) values ('${admin.id}', 'Admin'), ('${spm.id}', 'Site PM');
    insert into public.subcontractors(company_name) values ('Atlas'), ('Brook');`);
  await db.exec(fs.readFileSync(new URL("../migrations/010-id-numbers.sql", import.meta.url), "utf8"));
  [atlas, brook] = (await db.query("select id from subcontractors order by company_code")).rows.map((c) => c.id);
}
after(async () => { await db?.close(); });

test("a worker added with name parts gets an ID and a full name built from the parts", { skip }, async () => {
  await freshDatabase();
  const res = await add({ first_name: "Juan", middle_name: "Reyes", last_name: "Santos", suffix: "jr", role_title: "Foreman", id_number: "02000-0500" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.id_number, "02000-0001"); // a typed ID is ignored
  assert.equal(res.body.data.full_name, "Juan Reyes Santos Jr.");
  assert.equal(res.body.data.suffix, "Jr.");
  const second = await add({ first_name: "Ana", last_name: "Lim, III" });
  assert.equal(second.body.data.last_name, "Lim");
  assert.equal(second.body.data.suffix, "III");
  assert.equal(second.body.data.id_number, "02000-0002");
});

test("name parts are validated, and full_name alone still works for old callers", { skip }, async () => {
  await freshDatabase();
  assert.equal((await add({ first_name: "Juan" })).statusCode, 400);
  assert.equal((await add({ first_name: "Juan", last_name: "Santos", suffix: "Esq." })).statusCode, 400);
  assert.equal((await add({})).statusCode, 400);
  const legacy = await add({ full_name: "Pedro Abad" });
  assert.equal(legacy.statusCode, 201);
  assert.equal(legacy.body.data.first_name, null);
  assert.match(legacy.body.data.id_number, /^02000-0001$/);
  { const r = await add({ first_name: "A", last_name: "B" }, atlas, spm); assert.equal(r.statusCode, 201, JSON.stringify(r.body)); } // Site PMs may still add one
});

test("editing a name keeps full_name and the parts in step; full_name alone is refused for named workers", { skip }, async () => {
  await freshDatabase();
  const made = await add({ first_name: "Maria", middle_name: "Dela", last_name: "Cruz" });
  const id = made.body.data.id;
  const renamed = await send(updateWorker, { params: { id }, body: { last_name: "Cruz-Lim" } });
  assert.equal(renamed.statusCode, 200);
  const stored = await row(id);
  assert.equal(stored.full_name, "Maria Dela Cruz-Lim");
  assert.equal(stored.first_name, "Maria");
  assert.equal(stored.middle_name, "Dela");
  assert.equal(stored.id_number, "02000-0001");
  const blocked = await send(updateWorker, { params: { id }, body: { full_name: "Someone Else" } });
  assert.equal(blocked.statusCode, 400);
  assert.equal((await row(id)).full_name, "Maria Dela Cruz-Lim");
  const legacy = await add({ full_name: "Pedro Abad" });
  assert.equal((await send(updateWorker, { params: { id: legacy.body.data.id }, body: { full_name: "Pedro M. Abad" } })).statusCode, 200);
  assert.equal((await row(legacy.body.data.id)).full_name, "Pedro M. Abad");
});

test("the worker list returns ID numbers and name parts", { skip }, async () => {
  await freshDatabase();
  await add({ first_name: "Juan", last_name: "Santos" });
  const res = await send(getWorkers, { params: { id: atlas } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].id_number, "02000-0001");
  assert.equal(res.body.data[0].first_name, "Juan");
});

test("an Admin transfer archives the old ID, issues a new one, and links them", { skip }, async () => {
  await freshDatabase();
  const made = await add({ first_name: "Juan", last_name: "Santos" });
  const id = made.body.data.id;
  const res = await send(transferWorker, { params: { id }, body: { subcontractor_id: brook } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.previous_id_number, "02000-0001");
  assert.equal(res.body.data.id_number, "02100-0001");
  assert.equal(res.body.data.company_code, "02100");
  const stored = await row(id);
  assert.equal(stored.subcontractor_id, brook);
  assert.equal(stored.id_number, "02100-0001");
  const history = await send(getWorkerIdNumbers, { params: { id } });
  assert.deepEqual(history.body.data.map((h) => [h.id_number, h.status, h.replaced_by]), [
    ["02100-0001", "active", null], ["02000-0001", "archived", "02100-0001"],
  ]);
  // The old number is never reused: the next worker in the old company continues the count.
  const next = await add({ first_name: "Ana", last_name: "Lim" });
  assert.equal(next.body.data.id_number, "02000-0002");
  // And moving back issues a fresh number, not the archived one.
  const back = await send(transferWorker, { params: { id }, body: { subcontractor_id: atlas } });
  assert.equal(back.body.data.id_number, "02000-0003");
});

test("transfers are refused for non-Admins, same company, assigned workers and unknown targets", { skip }, async () => {
  await freshDatabase();
  const id = (await add({ first_name: "Juan", last_name: "Santos" })).body.data.id;
  assert.equal((await send(transferWorker, { params: { id }, body: { subcontractor_id: brook }, actor: spm })).statusCode, 403);
  assert.equal((await send(transferWorker, { params: { id }, body: { subcontractor_id: atlas } })).statusCode, 422);
  assert.equal((await send(transferWorker, { params: { id }, body: { subcontractor_id: "33333333-3333-4333-8333-333333333333" } })).statusCode, 404);
  assert.equal((await send(transferWorker, { params: { id }, body: { subcontractor_id: "nope" } })).statusCode, 400);
  assert.equal((await send(transferWorker, { params: { id: "33333333-3333-4333-8333-333333333333" }, body: { subcontractor_id: brook } })).statusCode, 404);
  await db.query("update subcontractor_workers set availability_status='assigned' where id=$1", [id]);
  const busy = await send(transferWorker, { params: { id }, body: { subcontractor_id: brook } });
  assert.equal(busy.statusCode, 409);
  assert.equal((await row(id)).id_number, "02000-0001");
});

test("the ID cannot be changed by editing the worker, only by a transfer", { skip }, async () => {
  await freshDatabase();
  const id = (await add({ first_name: "Juan", last_name: "Santos" })).body.data.id;
  await assert.rejects(db.query("update subcontractor_workers set id_number='02000-0999' where id=$1", [id]), /transfer_worker/);
  await assert.rejects(db.query("update subcontractor_workers set subcontractor_id=$2 where id=$1", [id, brook]), /transfer_worker/);
});
