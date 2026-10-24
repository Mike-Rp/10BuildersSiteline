import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Runs the real handler and the real 010 migration against an in-memory Postgres (PGlite, a root dev dependency).
let PGlite, citext;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ citext } = await import("@electric-sql/pglite/contrib/citext"));
} catch { /* the backend folder is being tested on its own */ }
const available = Boolean(PGlite);

const access = await import("../src/common/utilities/access.utility.js");
const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const spm = { id: "22222222-2222-4222-8222-222222222222", role: "spm" };
let db;
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
const { importWorkers } = await import("../src/services/subcontractors/import.controller.js");

const response = () => ({
  statusCode: 200, body: null,
  status(n) { this.statusCode = n; return this; },
  json(body) { this.body = body; return this; },
});
let atlas, brook;
const call = async (workers, { id = atlas, actor = admin } = {}) => {
  const res = response();
  await importWorkers({ params: { id }, body: { workers }, actor }, res);
  return res;
};
const worker = (first, last, extra = {}) => ({ id_number: "", first_name: first, middle_name: "", last_name: last, suffix: "", ...extra });
const all = async (company = atlas) =>
  (await db.query("select id_number, first_name, middle_name, last_name, suffix, full_name from subcontractor_workers where subcontractor_id=$1 order by id_number", [company])).rows;

async function freshDatabase() {
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
    insert into public.users(id, full_name) values ('${admin.id}', 'Admin');
    insert into public.subcontractors(company_name) values ('Atlas'), ('Brook');`);
  await db.exec(fs.readFileSync(new URL("../migrations/010-id-numbers.sql", import.meta.url), "utf8"));
  const companies = (await db.query("select id, company_name from subcontractors order by company_code")).rows;
  [atlas, brook] = companies.map((c) => c.id);
}
after(async () => { await db?.close(); });

test("new workers get the next ID for their company, and companies count separately", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  const first = await call([worker("Juan", "Santos", { middle_name: "Reyes", suffix: "jr" }), worker("Maria", "Cruz")]);
  assert.equal(first.statusCode, 201);
  assert.deepEqual(first.body.data.created.map((w) => w.id_number), ["02000-0001", "02000-0002"]);
  assert.equal(first.body.data.created[0].suffix, "Jr.");
  const other = await call([worker("Pedro", "Abad")], { id: brook });
  assert.equal(other.body.data.created[0].id_number, "02100-0001");
  const rows = await all();
  assert.equal(rows[0].full_name, "Juan Reyes Santos Jr.");
  assert.equal((await db.query("select count(*)::int n from worker_id_numbers")).rows[0].n, 3);
});

test("a typed ID on a new worker is rejected, and the company's workers are unchanged", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  await call([worker("Juan", "Santos")]);
  const res = await call([worker("Ana", "Lim", { id_number: "02000-0500" })]);
  assert.equal(res.statusCode, 422);
  assert.match(res.body.message, /Row 2: 02000-0500 is not one of this company's workers/);
  assert.equal((await all()).length, 1);
});

test("another company's ID is rejected with the same message as an unknown one", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  const made = await call([worker("Pedro", "Abad")], { id: brook });
  const theirs = made.body.data.created[0].id_number;
  const res = await call([worker("Pedro", "Abad", { id_number: theirs })]);
  const unknown = await call([worker("Pedro", "Abad", { id_number: "09999-0001" })]);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error.rows[0].message.replace(theirs, "X"), unknown.body.error.rows[0].message.replace("09999-0001", "X"));
  assert.equal((await all()).length, 0);
  assert.equal((await all(brook)).length, 1);
});

test("existing workers are updated by ID, and unchanged rows are counted without being rewritten", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  await call([worker("Juan", "Santos"), worker("Maria", "Cruz")]);
  const res = await call([
    worker("Juan", "Santos", { id_number: "02000-0001" }),
    worker("Maria", "Cruz-Lim", { id_number: "02000-0002" }),
    worker("Leo", "Tan"),
  ]);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.updated, 1);
  assert.equal(res.body.data.unchanged, 1);
  assert.deepEqual(res.body.data.created.map((w) => w.id_number), ["02000-0003"]);
  const rows = await all();
  assert.equal(rows[1].last_name, "Cruz-Lim");
  assert.equal(rows[1].full_name, "Maria Cruz-Lim");
  assert.equal(rows.length, 3);
});

test("any bad row rejects the whole file with row numbers, and nothing is saved", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  const res = await call([
    worker("Juan", "Santos", { row: 2 }),
    worker("", "Cruz", { row: 3 }),
    worker("Ana", "Lim", { row: 4, suffix: "Esq." }),
    worker("Leo", "Tan", { row: 5, id_number: "2000-45" }),
    worker("Mia", "Uy", { row: 6, id_number: "02000-0001" }),
    worker("Zed", "Po", { row: 7, id_number: "02000-0001" }),
  ]);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body.error.rows.map((e) => e.row), [3, 4, 5, 7]);
  assert.match(res.body.error.rows[0].message, /first_name is blank/);
  assert.match(res.body.error.rows[3].message, /already used on row 6/);
  assert.equal((await all()).length, 0);
});

test("a failure part-way through rolls the whole import back", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  await call([worker("Juan", "Santos")]);
  await db.exec(`create or replace function public.fail_on_boom() returns trigger language plpgsql as $$
    begin if new.last_name = 'Boom' then raise exception 'simulated failure'; end if; return new; end $$;
    create trigger boom before insert on public.subcontractor_workers for each row execute function public.fail_on_boom();`);
  const res = await call([worker("Ana", "Lim"), worker("Bad", "Boom")]);
  assert.equal(res.statusCode, 500);
  assert.equal((await all()).length, 1);
  // The counter did not advance for the rolled-back rows, so the next worker gets the next free number.
  await db.exec("drop trigger boom on public.subcontractor_workers");
  const next = await call([worker("Ana", "Lim")]);
  assert.equal(next.body.data.created[0].id_number, "02000-0002");
});

test("suffix in last name is split out, and only an Admin can import", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  const res = await call([worker("Juan", "Santos, III")]);
  assert.equal(res.body.data.created[0].last_name, "Santos");
  assert.equal(res.body.data.created[0].suffix, "III");
  const denied = await call([worker("Ana", "Lim")], { actor: spm });
  assert.equal(denied.statusCode, 403);
  assert.equal((await all()).length, 1);
});

test("bad requests are refused before touching the database", { skip: !available && "PGlite not installed" }, async () => {
  await freshDatabase();
  assert.equal((await call([])).statusCode, 400);
  assert.equal((await call("nope")).statusCode, 400);
  assert.equal((await call([worker("A", "B")], { id: "not-a-uuid" })).statusCode, 400);
  assert.equal((await call([worker("A", "B")], { id: "33333333-3333-4333-8333-333333333333" })).statusCode, 404);
  const tooMany = await call(Array.from({ length: 5001 }, (_, i) => worker("W" + i, "X")));
  assert.equal(tooMany.statusCode, 400);
  assert.equal((await all()).length, 0);
});
