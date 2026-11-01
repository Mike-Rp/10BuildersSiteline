import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { spawn } from "node:child_process"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import {
  licenseNumberError,
  isoDateValid,
  qualifyingSpecializations,
} from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { assertEligibleManager } from "../Thesis-Backend/src/common/utilities/license-eligibility.utility.js"
import { validateScopedQualifications } from "../Thesis-Backend/src/services/projects/type-phases.utility.js"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const read = (p) => fs.readFileSync(here(p), "utf8")
const port = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const n = s.address().port
      s.close(() => resolve(n))
    })
  })
test("credential input preserves text and validates real dates", () => {
  assert.equal(licenseNumberError("0000123"), "")
  assert.equal(licenseNumberError("PRC-001"), "")
  for (const v of [123, "", " 123", "123 ", "x".repeat(121), "123\n"])
    assert.ok(licenseNumberError(v))
  assert.equal(isoDateValid("2028-02-29"), true)
  for (const d of ["2027-02-29", "2026-13-01", "no date", null])
    assert.equal(isoDateValid(d), false)
  assert.deepEqual(
    qualifyingSpecializations(
      [
        {
          profession: "Civil Engineer",
          verification_status: "verified",
          verified_by: "admin",
          verified_at: "2026-01-01",
          license_number: "001",
          license_expiry: "2030-01-01",
          upload_status: "uploaded",
          upload_file_ref: "x",
        },
      ],
      ["Electrical", "Structural"],
      "2026-01-01",
    ),
    ["Structural"],
  )
})
test(
  "credential verification, renewal isolation, permissions, and server qualification checks",
  { timeout: 180000 },
  async (t) => {
    const db = new PGlite({ extensions: { citext } })
    let pg, server
    t.after(async () => {
      server?.kill()
      if (pg) await pg.stop()
      await db.close()
    })
    await db.exec(
      "create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;",
    )
    await db.exec(
      read(
        "../supabase/migrations/20261017000002_thesis_backend_schema.sql",
      ).replace(/^create extension if not exists pgcrypto.*$/m, ""),
    )
    for (const file of [
      "001-phase-checklists.sql",
      "002-phase-update-confirmation.sql",
      "003-react-integration.sql",
      "004-verified-activity-progress.sql",
      "009-engineer-license-workflow.sql",
    ])
      await db.exec(read("../Thesis-Backend/migrations/" + file))
    await db.exec(read("../supabase/seed/dummy-data.sql"))
    await db.exec(
      read("../Thesis-Backend/migrations/015-engineer-credentials.sql"),
    )
    await db.exec(
      read("../Thesis-Backend/migrations/015-engineer-credentials.sql"),
    )
    const dbPort = await port(),
      apiPort = await port()
    pg = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
    await pg.start()
    server = spawn(process.execPath, ["src/index.js"], {
      cwd: here("../Thesis-Backend/"),
      env: {
        ...process.env,
        NODE_ENV: "development",
        DB_SERVER: "127.0.0.1",
        DB_PORT: String(dbPort),
        DB_NAME: "postgres",
        DB_USER: "postgres",
        DB_PASSWORD: "x",
        PGSSLMODE: "disable",
        DB_POOL_MAX: "1",
        JWT_SECRET: "isolated-credential-tests-0123456789",
        PORT: String(apiPort),
        HOST: "127.0.0.1",
        ARCHIVE_MAINTENANCE_ENABLED: "false",
      },
      stdio: "ignore",
    })
    const base = "http://127.0.0.1:" + apiPort + "/api/v1"
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(base + "/health")).ok) break
      } catch {}
      if (i > 100) throw Error("Test backend not ready")
      await new Promise((r) => setTimeout(r, 150))
    }
    const tokens = {}
    const ids = {}
    for (const [name, email] of Object.entries({
      admin: "patricia.domingo@10builders.com",
      engineer: "karlo.espiritu@10builders.com",
      other: "rafael.mercado@10builders.com",
    })) {
      ids[name] = (
        await db.query("select id from users where email=$1", [email])
      ).rows[0].id
      const response = await fetch(
        base + (name === "admin" ? "/auth/admin/login" : "/auth/staff/login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "Password@123" }),
        },
      )
      const b = await response.json()
      tokens[name] = b.data?.token || b.token
      assert.ok(tokens[name], JSON.stringify(b))
    }
    const call = async (who, method, path, body) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: "Bearer " + tokens[who],
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(body === undefined
          ? {}
          : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      })
      const b = await response.json()
      return { status: response.status, ...b }
    }
    const future = (
      await db.query(
        "select ((current_timestamp at time zone 'Asia/Manila')::date+400)::text as d",
      )
    ).rows[0].d
    const form = (profession, number = "0000123") => {
      const f = new FormData()
      f.set("profession", profession)
      f.set("license_number", number)
      f.set("license_expiry", future)
      f.set(
        "file",
        new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
        "credential.pdf",
      )
      return f
    }
    // Test-specific upload evidence cleanup only, never enumerate/remove other files.
    const submitted = []
    t.after(() => {
      for (const f of submitted) {
        const abs = here("../Thesis-Backend/" + f)
        if (abs.startsWith(here("../Thesis-Backend/uploads/")))
          fs.rmSync(abs, { force: true })
      }
    })
    const submit = async (profession) => {
      const r = await call(
        "engineer",
        "POST",
        "/licenses/renewals",
        form(profession),
      )
      assert.equal(r.status, 201, JSON.stringify(r))
      const row = (
        await db.query("select * from license_renewal_requests where id=$1", [
          r.data.id,
        ])
      ).rows[0]
      submitted.push(row.file_ref)
      return row
    }
    assert.equal(
      (await call("other", "GET", "/licenses/credentials/" + ids.engineer))
        .status,
      404,
    )
    await assert.rejects(assertEligibleManager(db, ids.engineer, "spm"), {
      status: 422,
    })
    const original = (
      await db.query(
        "select id from user_licenses where user_id=$1 and superseded_at is null",
        [ids.engineer],
      )
    ).rows[0].id
    const civil = await submit("Civil Engineer")
    assert.equal(civil.license_number, "0000123")
    assert.equal(civil.status, "under_review")
    assert.equal(
      (
        await call(
          "engineer",
          "POST",
          "/licenses/renewals/" + civil.id + "/verify",
          { note: "Unauthorized" },
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await call(
          "admin",
          "POST",
          "/licenses/renewals/" + civil.id + "/verify",
          {},
        )
      ).status,
      400,
    )
    const reviewed = await call(
      "admin",
      "POST",
      "/licenses/renewals/" + civil.id + "/verify",
      {
        note: "Matched submitted identity, profession and expiry against official records.",
      },
    )
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed))
    const verified = (
      await db.query(
        "select * from user_licenses where user_id=$1 and profession='Civil Engineer' and superseded_at is null",
        [ids.engineer],
      )
    ).rows[0]
    assert.equal(verified.license_number, "0000123")
    assert.equal(verified.verified_by, ids.admin)
    assert.ok(verified.verified_at)
    assert.equal(
      (
        await db.query("select superseded_at from user_licenses where id=$1", [
          original,
        ])
      ).rows[0].superseded_at,
      null,
      "unknown legacy record retained",
    )
    await assertEligibleManager(db, ids.engineer, "spm")
    assert.equal(
      (
        await call(
          "admin",
          "PUT",
          "/licenses/credentials/" + ids.engineer + "/specializations",
          { specializations: ["Electrical", "Structural"] },
        )
      ).status,
      200,
    )
    const types = (
      await db.query(
        "select distinct project_type_id from project_stage_discipline_links where discipline_id=(select id from disciplines where code='Electrical')",
      )
    ).rows
    for (const row of types) {
      const electrical = (
        await db.query(
          "select s.code as stage from project_stage_discipline_links l join project_stages s on s.id=l.project_stage_id join disciplines d on d.id=l.discipline_id where l.project_type_id=$1 and d.code='Electrical' limit 1",
          [row.project_type_id],
        )
      ).rows[0]
      // A direct Electrical-only check must not see the Civil credential, even when an Electrical specialization is recorded.
      assert.equal(
        (
          await db.query(
            "select 1 from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id where q.user_id=$1 and d.code='Electrical'",
            [ids.engineer],
          )
        ).rowCount,
        0,
      )
    }
    // A direct reassignment request cannot bypass the profession mapping using an Electrical tag.
    const target=(await db.query(`select t.id,t.project_id,t.project_stage_id,t.spm_user_id,p.project_type_id from project_phase_team t join projects p on p.id=t.project_id join project_stages st on st.id=t.project_stage_id where p.lifecycle_status='active' and st.code='Design' limit 1`)).rows[0]
    await db.query("update project_phase_team set status='auto_expired' where id=$1",[target.id])
    await db.query("delete from project_stage_discipline_links where project_type_id=$1 and project_stage_id=$2",[target.project_type_id,target.project_stage_id])
    await db.query("insert into project_stage_discipline_links(project_type_id,project_stage_id,discipline_id) select $1,$2,id from disciplines where code='Electrical'",[target.project_type_id,target.project_stage_id])
    const blocked=await call('admin','POST','/archive/phase-assignments/'+target.id+'/reassign',{new_user_id:ids.engineer,note:'Qualification bypass attempt'})
    assert.equal(blocked.status,422,JSON.stringify(blocked))
    assert.equal((await db.query('select spm_user_id from project_phase_team where id=$1',[target.id])).rows[0].spm_user_id,target.spm_user_id)
    const electrical = await submit("Electrical Engineer")
    assert.equal(
      (
        await call(
          "admin",
          "POST",
          "/licenses/renewals/" + electrical.id + "/verify",
          { note: "Verified second credential separately." },
        )
      ).status,
      200,
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from user_licenses where user_id=$1 and profession is not null and superseded_at is null",
          [ids.engineer],
        )
      ).rows[0].n,
      2,
    )
    const renewal = await submit("Civil Engineer")
    assert.equal(
      (
        await db.query("select superseded_at from user_licenses where id=$1", [
          verified.id,
        ])
      ).rows[0].superseded_at,
      null,
    )
    assert.equal(
      (
        await call(
          "admin",
          "POST",
          "/licenses/renewals/" + renewal.id + "/reject",
          { note: "Please provide a clearer document." },
        )
      ).status,
      200,
    )
    assert.equal(
      (
        await db.query("select superseded_at from user_licenses where id=$1", [
          verified.id,
        ])
      ).rows[0].superseded_at,
      null,
    )
    const renewal2 = await submit("Civil Engineer")
    await db.query(
      "update user_licenses set license_expiry=current_date-1 where id=$1",
      [verified.id],
    )
    const summary = await call(
      "engineer",
      "GET",
      "/licenses/credentials/" + ids.engineer,
    )
    assert.equal(summary.status, 200, JSON.stringify(summary))
    assert.equal(summary.data.accountStatus, "active")
    assert.equal(
      summary.data.eligibleForNewAssignment,
      true,
      "independent electrical credential remains valid",
    )
    assert.equal(
      (
        await db.query(
          "select 1 from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id where q.user_id=$1 and d.code='Structural'",
          [ids.engineer],
        )
      ).rowCount,
      0,
      "pending renewal cannot extend expired civil license",
    )
    assert.equal(
      (
        await call(
          "admin",
          "POST",
          "/licenses/renewals/" + renewal2.id + "/verify",
          { note: "Renewal checked." },
        )
      ).status,
      200,
    )
    const expiredCivil = (
      await db.query("select superseded_at from user_licenses where id=$1", [
        verified.id,
      ])
    ).rows[0]
    assert.ok(expiredCivil.superseded_at)
    const invalid = await call(
      "engineer",
      "POST",
      "/licenses/renewals",
      form("Civil Engineer", "x".repeat(121)),
    )
    assert.equal(invalid.status, 400)
    const list = await call("admin", "GET", "/licenses/renewals")
    assert.equal(list.status, 200, JSON.stringify(list))
    assert.ok(list.data.some((q) => q.reviewed_by_name))
    assert.equal(
      (
        await call(
          "engineer",
          "PUT",
          "/licenses/credentials/" + ids.engineer + "/specializations",
          { specializations: ["Electrical"] },
        )
      ).status,
      403,
    )
  },
)
