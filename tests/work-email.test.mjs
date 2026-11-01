import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { suggestWorkEmail } from "../src/model.ts"
import { normalizeEmployeeId, employeeIdFromWorkEmail } from "../Thesis-Backend/src/domain/work-email.js"
import { createAccountRecord } from "../Thesis-Backend/src/services/accounts/manage.controller.js"
import { assertWorkEmailAvailable } from "../Thesis-Backend/src/services/accounts/work-email.utility.js"

test("ID migration is repeatable and preserves existing database defaults and values", async () => {
  const db = new PGlite()
  try {
    const migration=fs.readFileSync(new URL("../Thesis-Backend/migrations/016-user-id-numbers.sql",import.meta.url),"utf8")
    await db.exec("create table users(id int primary key)")
    await db.exec(migration)
    assert.equal((await db.query("insert into users(id) values(1) returning id_number")).rows[0].id_number,"10B-00001")
    await db.exec(migration)
    assert.equal((await db.query("insert into users(id) values(2) returning id_number")).rows[0].id_number,"10B-00002")
    await db.exec("update users set id_number='10B-00042' where id=1; alter table users alter column id_number set default '10B-00999'")
    await db.exec(migration)
    assert.equal((await db.query("select id_number from users where id=1")).rows[0].id_number,"10B-00042")
    assert.equal((await db.query("insert into users(id) values(3) returning id_number")).rows[0].id_number,"10B-00999")
  } finally { await db.close() }
})

test("work emails use the surname and employee ID, independent of first names", () => {
  assert.equal(suggestWorkEmail({ first: "Juan", middle: "Antonio", last: "Cruz" }, "10B-00168"), "cruz.10B00168@10builders.com")
  assert.equal(suggestWorkEmail({ first: "Juan", last: "Cruz" }, "10b00169"), "cruz.10B00169@10builders.com")
  assert.equal(suggestWorkEmail({ first: "Jose", last: "de la Pe\u00f1a" }, "10B00168"), "delapena.10B00168@10builders.com")
  for (const id of ["", "00168", "10B-168", "10B001680", "10B-00a68"]) assert.equal(suggestWorkEmail({ first: "Juan", last: "Cruz" }, id), "")
  assert.equal(suggestWorkEmail({ first: "Juan", last: "" }, "10B00168"), "")
  assert.equal(normalizeEmployeeId(" 10b-00168 "), "10B00168")
  assert.equal(employeeIdFromWorkEmail("CRUZ.10B00168@10BUILDERS.COM"), "10B00168")
  assert.equal(employeeIdFromWorkEmail("cruz.10b00168@other.com"), "")
})

test("creation rejects reused IDs across surnames, including inactive accounts", async () => {
  const db = new PGlite()
  try {
    await db.exec("create table roles(id int,code text); insert into roles values(1,'admin'); create table users(id uuid primary key,full_name text,email text unique,phone text,password_hash text,temp_password_issued boolean,role_id int,status text,created_by uuid,updated_by uuid,date_added timestamptz default now());")
    await db.exec("create sequence staff_id_seq start 169; alter table users add column id_number text default ('10B-'||lpad(nextval('staff_id_seq')::text,5,'0'));")
    const actor = { id: "11111111-1111-4111-8111-111111111111" }
    const create = async (email, employee_id, extra = {}) => {
      await db.exec("begin")
      try {
        const saved = await createAccountRecord(db, actor, { full_name: "Juan Cruz", role: "admin", email, employee_id, password: "Password@123", ...extra })
        await db.exec("commit")
        return saved
      } catch (error) { await db.exec("rollback"); throw error }
    }
    const saved = await create("cruz.10B00168@10builders.com", "10B-00168")
    assert.equal(saved.email, "cruz.10b00168@10builders.com")
    await assert.rejects(create("reyes.10B00168@10builders.com", "10B00168"), error => error.status === 409 && /employee ID/.test(error.message))
    await db.query("update users set status='suspended' where id=$1", [saved.id])
    await assert.rejects(create("santos.10b00168@10builders.com"), error => error.status === 409)
    await assert.rejects(create("cruz.10B00169@10builders.com", "10B00170"), error => error.status === 400)
    await create("cruz.10B00169@10builders.com", "10B00169")
    await create("legacy.name@10builders.com")
    await db.exec("begin")
    await assertWorkEmailAvailable(db, saved.email, saved.id, "10B00168")
    await db.exec("rollback")
    assert.equal((await db.query("select count(*)::int as count from users")).rows[0].count, 3)
    await db.query("update users set status='suspended' where email=$1", ["cruz.10b00169@10builders.com"])
    const generated = await create(undefined, undefined, { auto_work_email: true, last_name: "Cruz" })
    assert.equal(generated.id_number, "10B-00172")
    assert.equal(generated.email, "cruz.10b00172@10builders.com", "the email uses the database ID instead of the highest email number")
    const sameName = await create(undefined, undefined, { auto_work_email: true, last_name: "Cruz" })
    assert.equal(sameName.email, "cruz.10b00173@10builders.com", "identical names receive distinct database IDs")
    const otherName = await create("ignored@example.com", "10B00168", { auto_work_email: true, last_name: "Reyes" })
    assert.equal(otherName.email, "reyes.10b00174@10builders.com", "the database chooses the ID instead of trusting request values")
    await assert.rejects(create(undefined, undefined, { auto_work_email: true, last_name: "" }), error => error.status === 400)
    await db.exec("alter table users alter column id_number drop default")
    const before=(await db.query("select count(*)::int as count from users")).rows[0].count
    await assert.rejects(create(undefined, undefined, { auto_work_email: true, last_name: "Cruz" }), error => error.status === 503)
    assert.equal((await db.query("select count(*)::int as count from users")).rows[0].count,before,"a missing database ID rolls back creation")
    assert.equal((await db.query("select count(*)::int as count from users where email like 'pending.%'")).rows[0].count,0)
  } finally { await db.close() }
})
