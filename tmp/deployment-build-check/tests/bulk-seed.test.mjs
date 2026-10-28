import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { createHash } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")
const schema = read("../supabase/migrations/20261017000002_thesis_backend_schema.sql")
  .replace(/^create extension if not exists pgcrypto.*$/m, "")
const seed = read("../supabase/seed/bulk-test-data.sql")
const id = (kind, number) => {
  const hash = createHash("md5").update("siteline-bulk-v1/" + kind + "/" + number).digest("hex")
  return [hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join("-")
}
async function database(t) {
  const db = new PGlite({ extensions: { citext } })
  t.after(() => db.close())
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(schema)
  return db
}
async function scalar(db, sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0]
}
async function counts(db) {
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows
  return (await db.query(tables.map(({tablename}) =>
    `select '${tablename}' as name, count(*)::integer as total from public."${tablename}"`
  ).join(" union all "))).rows
}

test("bulk seed creates a connected, repeatable dataset on the real schema", { timeout: 120000 }, async (t) => {
  const db = await database(t)
  await db.exec(seed)

  await t.test("requested counts and valid manager licenses", async () => {
    assert.deepEqual((await db.query(`
      select r.code,count(*)::integer as total from users u join roles r on r.id=u.role_id
      group by r.code order by r.code
    `)).rows, [
      {code:"admin",total:50},{code:"client",total:25},{code:"opm",total:120},{code:"spm",total:120}
    ])
    assert.equal(await scalar(db, "select count(*)::integer from subcontractors"), 5)
    assert.equal(await scalar(db, "select count(*)::integer from subcontractor_workers"), 5000)
    assert.equal(await scalar(db, "select count(*)::integer from projects"), 50)
    assert.equal(await scalar(db, "select count(*)::integer from user_licenses where license_expiry>current_date and upload_status='uploaded'"), 240)
    assert.equal(await scalar(db, `
      select count(*)::integer from (
        select user_id from user_project_type_specializations group by user_id having count(*)=2
      ) x
    `), 120)
    assert.equal(await scalar(db, `
      select count(*)::integer from projects p
      where p.suggested_opm_id is not null and not exists (
        select 1 from user_project_type_specializations s
        where s.user_id=p.suggested_opm_id and s.project_type_id=p.project_type_id
      )
    `), 0)
  })

  await t.test("companies have 1,000 workers and crew counts match actual assignments", async () => {
    const companies = (await db.query(`
      select count(*)::integer as total,
        count(*) filter(where availability_status='assigned')::integer as assigned,
        count(*) filter(where availability_status='available')::integer as available,
        count(*) filter(where status='inactive')::integer as inactive
      from subcontractor_workers group by subcontractor_id
    `)).rows
    assert.deepEqual(companies, Array.from({length:5},()=>({total:1000,assigned:600,available:380,inactive:20})))
    assert.equal(await scalar(db, `
      select count(*)::integer from project_subcontractor_assignments a
      where a.status='active' and a.worker_count<>(
        select count(*) from subcontractor_workers w where w.subcontractor_id=a.subcontractor_id
        and w.current_project_id=a.project_id and w.availability_status='assigned' and w.status='active'
      )
    `), 0)
    assert.equal(await scalar(db, `
      select count(*)::integer from projects p where p.lifecycle_status='active' and
      (p.crew_assigned<>100 or p.crew_assigned<>(select count(*) from subcontractor_workers w where w.current_project_id=p.id))
    `), 0)
    assert.equal(await scalar(db, `
      select count(*)::integer from subcontractor_workers w left join projects p on p.id=w.current_project_id
      where (w.availability_status='assigned' and (w.status<>'active' or p.lifecycle_status is distinct from 'active'))
         or (w.availability_status is distinct from 'assigned' and w.current_project_id is not null)
    `), 0)
    assert.equal(await scalar(db,"select count(*)::integer from worker_employment_history"),5000)
    assert.equal(await scalar(db, `
      select count(*)::integer from subcontractor_workers w where not exists (
        select 1 from worker_certifications c where c.worker_id=w.id
      )
    `),0)
  })

  await t.test("projects cover lifecycle cases and link managers, clients and phases", async () => {
    assert.deepEqual((await db.query(`
      select lifecycle_status,count(*)::integer as total from projects group by lifecycle_status order by lifecycle_status
    `)).rows, [
      {lifecycle_status:"active",total:30},{lifecycle_status:"archived",total:5},
      {lifecycle_status:"draft",total:5},{lifecycle_status:"sent_to_opm",total:5},
      {lifecycle_status:"spm_review",total:5}
    ])
    assert.equal(await scalar(db,"select count(*)::integer from user_client_project_links"),50)
    assert.equal(await scalar(db, `
      select count(*)::integer from (
        select user_id from user_client_project_links group by user_id having count(*)=2
      ) x
    `),25)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_team"),315)
    assert.equal(await scalar(db,"select count(*)::integer from project_engineers"),135)
    assert.equal(await scalar(db,"select count(*)::integer from assignment_confirmations"),135)
    assert.equal(await scalar(db, `
      select count(*)::integer from project_phase_team t join projects p on p.id=t.project_id
      where not exists (
        select 1 from user_discipline_scopes s join project_stage_discipline_links d
        on d.discipline_id=s.discipline_id where s.user_id=t.spm_user_id
        and d.project_stage_id=t.project_stage_id and d.project_type_id=p.project_type_id
      )
    `),0)
    assert.equal(await scalar(db,"select count(*)::integer from projects where created_by is null"),0)
    assert.equal(await scalar(db,"select count(distinct created_by)::integer from projects"),50)
  })

  await t.test("checklist evidence, approvals, progress and pending review links are coherent", async () => {
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_checklists"),245)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_checklist_items"),910)
    assert.equal(await scalar(db, `
      select count(*)::integer from projects p where p.lifecycle_status in ('active','archived')
      and p.current_pct is distinct from (
        select round(100.0*count(*) filter(where exists (
          select 1 from project_phase_evidence e where e.checklist_item_id=i.id and e.status='approved'
        ))/count(*))::smallint from project_phase_checklist_items i where i.project_id=p.id and i.required
      )
    `),0)
    assert.equal(await scalar(db,"select count(*)::integer from projects where lifecycle_status='archived' and current_pct=100"),5)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_evidence where status='pending'"),5)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_evidence where status='rejected'"),1)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_updates where status='pending'"),5)
    assert.equal(await scalar(db,"select count(*)::integer from pending_progress_updates where status='pending'"),5)
    assert.equal(await scalar(db, `
      select count(*)::integer from project_phase_evidence e
      join project_phase_updates u on u.id=e.phase_update_id and u.project_id=e.project_id
      join project_phase_submission_files f on f.update_id=u.id and f.file_id=e.file_id
      where e.status='pending'
    `),5)
    assert.equal(await scalar(db, `
      select count(*)::integer from project_progress_history h join projects p on p.id=h.project_id
      where h.pct is distinct from p.current_pct
    `),0)
  })

  await t.test("download references contain bytes and notify all linked staff", async () => {
    assert.equal(await scalar(db,"select count(*)::integer from stored_files where byte_size<>octet_length(content)"),0)
    assert.equal(await scalar(db,"select count(*)::integer from project_phase_files where byte_size<>octet_length(content)"),0)
    const refs = await scalar(db, `
      select count(*)::integer from (
        select file_ref from project_documents where status='uploaded'
        union all select file_ref from contracts
        union all select file_ref from project_photos
        union all select upload_file_ref from user_licenses
      ) r left join stored_files f on r.file_ref='db://' || f.id where f.id is null
    `)
    assert.equal(refs,0)
    assert.equal(await scalar(db,"select count(*)::integer from notification_recipients"),180)
    const doc = (await db.query("select content from stored_files where purpose='document' limit 1")).rows[0].content
    assert.ok(Buffer.from(doc).toString().startsWith("%PDF-1.4"))
    assert.equal(await scalar(db,"select count(*)::integer from project_photos"),35)
  })

  await t.test("reimport preserves edits and does not duplicate any table or audit records", async () => {
    await db.query("update users set full_name='Edited test administrator' where id=$1",[id("user/admin",1)])
    await db.query("update projects set name='Edited test project' where id=$1",[id("project",1)])
    const before = await counts(db)
    await db.exec(seed)
    assert.deepEqual(await counts(db),before)
    assert.equal(await scalar(db,"select full_name from users where id=$1",[id("user/admin",1)]),"Edited test administrator")
    assert.equal(await scalar(db,"select name from projects where id=$1",[id("project",1)]),"Edited test project")
  })
})

test("bulk seed preserves the existing small demo and never clears its data", { timeout: 120000 }, async (t) => {
  const db = await database(t)
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  const original = await db.query("select id,full_name,email,password_hash from users order by id")
  await db.exec(seed)
  assert.equal(await scalar(db,"select count(*)::integer from users"),326)
  assert.equal(await scalar(db,"select count(*)::integer from projects"),57)
  assert.equal(await scalar(db,"select count(*)::integer from subcontractors"),11)
  assert.equal(await scalar(db,"select count(*)::integer from subcontractor_workers"),5005)
  const preserved = await db.query("select id,full_name,email,password_hash from users where id=any($1::uuid[]) order by id",[original.rows.map(u=>u.id)])
  assert.deepEqual(preserved.rows,original.rows)
  const before=await counts(db)
  await db.exec(seed)
  assert.deepEqual(await counts(db),before)
})

test("a colliding email aborts the entire seed before inserting the graph", { timeout: 120000 }, async (t) => {
  const db = await database(t)
  await db.exec(`
    insert into users (full_name,email,password_hash,role_id,status)
    values ('Existing user','admin001@siteline-test.example','existing-password',1,'active');
  `)
  const before=await counts(db)
  await assert.rejects(db.exec(seed),/belongs to another account/)
  await db.exec("rollback")
  assert.deepEqual(await counts(db),before)
  assert.equal(await scalar(db,"select password_hash from users"),"existing-password")
})

test("seed block commits independently and summaries work after helper tables disappear", { timeout: 120000 }, async (t) => {
  const db = await database(t)
  const boundary = seed.indexOf("-- Verification queries use saved rows")
  assert.ok(boundary > 0)
  await db.exec(seed.slice(0,boundary))
  assert.equal(await scalar(db, "select to_regclass('pg_temp._bulk_users')"), null)
  const summaries = await db.exec(seed.slice(boundary))
  assert.equal(summaries[0].rows.length,4)
  assert.equal(summaries[1].rows.length,5)
  assert.equal(summaries[2].rows.length,50)
  await db.exec(seed.slice(boundary))
})
