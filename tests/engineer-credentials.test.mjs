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
  assert.ok(licenseNumberError("PRC-001"))
  for (const v of [1234567, "", "123456", "12345678", "123 456", "１２３４５６７", " 1234567", "1234567 ", "x".repeat(121), "1234567\n"])
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
          license_number: "0000001",
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
    // Account creation and credentials commit atomically, for both engineer roles.
    const uploadEvidence = async (who = "admin") => {
      const id = crypto.randomUUID(), f = new FormData()
      f.set("id", id); f.set("purpose", "document")
      f.set("file", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "credential.pdf")
      const r = await call(who, "POST", "/files", f)
      assert.equal(r.status, 200, JSON.stringify(r))
      return id
    }
    for (const role of ["spm", "opm"]) {
      for (const decision of ["pending", "verified"]) {
        const fileId = await uploadEvidence()
        const body = { request_id: crypto.randomUUID(), full_name: "Registration " + role + decision,
          email: role + decision + "@10builders.com", role, password: "Password@123",
          scope: role === "spm" ? { disciplines: ["Civil", "Structural"] } : { project_types: ["Residential"] },
          initial_credentials: [{ profession: "Civil Engineer", license_number: "0004567", license_expiry: future, file_id: fileId }],
          credential_decision: decision, credential_evidence_reviewed: decision === "verified",
          credential_review_note: decision === "verified" ? "Evidence checked during registration." : "" }
        const result = await call("admin", "POST", "/accounts", body)
        assert.equal(result.status, 201, JSON.stringify(result))
        const accountId = result.data.id
        const summary = await call("admin", "GET", "/licenses/credentials/" + accountId)
        assert.equal(summary.data.submissions[0].submission_kind, "initial")
        assert.equal(summary.data.submissions[0].status, decision === "pending" ? "under_review" : "verified")
        assert.equal(summary.data.eligibleForNewAssignment, false, "invited accounts still require first login")
        assert.equal(summary.data.credentials.length, decision === "pending" ? 0 : 1)
        if (decision === "verified") {
          assert.equal(summary.data.credentials[0].verified_by_name, "Patricia N. Domingo")
          assert.equal(summary.data.credentials[0].verification_note, body.credential_review_note)
          assert.equal(summary.data.credentials[0].license_number, "0004567")
        }
        if (role === "spm") assert.equal(summary.data.specializations.length, 2)
        else assert.equal((await db.query("select count(*)::int as n from user_project_type_specializations where user_id=$1", [accountId])).rows[0].n, 1)
        const retry = await call("admin", "POST", "/accounts", body)
        assert.equal(retry.status, 201, JSON.stringify(retry))
        assert.equal(retry.data.id, accountId)
        assert.equal((await db.query("select count(*)::int as n from license_renewal_requests where user_id=$1", [accountId])).rows[0].n, 1)
        await db.query("update users set status='active' where id=$1", [accountId])
        const activeSummary = await call("admin", "GET", "/licenses/credentials/" + accountId)
        assert.equal(activeSummary.data.eligibleForNewAssignment, decision === "verified")
        if (decision === "pending") await assert.rejects(assertEligibleManager(db, accountId, role), { status: 422 })
        else await assertEligibleManager(db, accountId, role)
        if (decision === "pending") {
          const reviewed = await call("admin", "POST", "/licenses/renewals/" + summary.data.submissions[0].id + "/verify", { note: "Evidence reviewed after registration." })
          assert.equal(reviewed.status, 200, JSON.stringify(reviewed))
          assert.equal((await call("admin", "GET", "/licenses/credentials/" + accountId)).data.eligibleForNewAssignment, true)
        }
        const decisionResult = await call("admin", "POST", "/accounts", { ...body, request_id: crypto.randomUUID(), email: "blocked" + role + decision + "@10builders.com", credential_decision: "verified", credential_evidence_reviewed: false })
        assert.equal(decisionResult.status, 400, JSON.stringify(decisionResult))
        assert.equal((await db.query("select count(*)::int as n from users where email=$1", ["blocked" + role + decision + "@10builders.com"])).rows[0].n, 0)
      }
    }
    const reusableFile = await uploadEvidence()
    const failedMulti = { request_id: crypto.randomUUID(), full_name: "Rollback registration", email: "rollback.registration@10builders.com", role: "spm",
      initial_credentials: [
        { profession: "Civil Engineer", license_number: "0000001", license_expiry: future, file_id: reusableFile },
        { profession: "Electrical Engineer", license_number: "0000002", license_expiry: "2000-01-01", file_id: await uploadEvidence() },
      ], credential_decision: "verified", credential_evidence_reviewed: true, credential_review_note: "Reviewed evidence." }
    assert.equal((await call("admin", "POST", "/accounts", failedMulti)).status, 400)
    assert.equal((await db.query("select count(*)::int as n from users where email=$1", [failedMulti.email])).rows[0].n, 0)
    assert.equal((await db.query("select purpose from stored_files where id=$1", [reusableFile])).rows[0].purpose, "upload", "failed multi-credential creation rolls back earlier file links")
    failedMulti.initial_credentials[1].license_expiry = future
    const successfulMulti = await call("admin", "POST", "/accounts", failedMulti)
    assert.equal(successfulMulti.status, 201, JSON.stringify(successfulMulti))
    assert.equal((await call("admin", "GET", "/licenses/credentials/" + successfulMulti.data.id)).data.credentials.length, 2)
    const foreignFile = await uploadEvidence("engineer")
    const invalidBody = { full_name: "Invalid registration", email: "invalid.registration@10builders.com", role: "spm",
      initial_credentials: [{ profession: "Civil Engineer", license_number: "0000001", license_expiry: future, file_id: foreignFile }], credential_decision: "pending" }
    assert.equal((await call("admin", "POST", "/accounts", invalidBody)).status, 404)
    assert.equal((await call("engineer", "POST", "/accounts", invalidBody)).status, 403)
    assert.equal((await db.query("select count(*)::int as n from users where email=$1", [invalidBody.email])).rows[0].n, 0)
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
      403,
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
    const ownQueue=await call("admin","GET","/licenses/renewals")
    assert.equal(ownQueue.data.find(q=>String(q.id)===String(civil.id)).submission_kind,"renewal")
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
    for (const invalidNumber of ["123456", "12345678", "12A4567", "123 456", "x".repeat(121)]) {
      const invalid = await call("engineer", "POST", "/licenses/renewals", form("Civil Engineer", invalidNumber))
      assert.equal(invalid.status, 400)
      assert.match(invalid.message, /exactly 7 digits/)
    }
    const list = await call("admin", "GET", "/licenses/renewals")
    assert.equal(list.status, 200, JSON.stringify(list))
    assert.ok(list.data.some((q) => q.reviewed_by_name))
    // Administrator uploads save and verify in one transaction, including updates
    // while the engineer has an older submission pending for that profession.
    const pendingCivil = await submit("Civil Engineer")
    const remindersBefore=(await db.query("select count(*)::int as n from activity_log where title='License renewal to review'")).rows[0].n
    const electricalBefore=(await db.query("select id from user_licenses where user_id=$1 and profession='Electrical Engineer' and superseded_at is null",[ids.engineer])).rows[0].id
    const adminForm=form("Civil Engineer","0000456")
    adminForm.set("user_id",ids.engineer)
    const direct=await call("admin","POST","/licenses/renewals",adminForm)
    assert.equal(direct.status,201,JSON.stringify(direct))
    assert.equal(direct.data.status,"verified")
    const directRequest=(await db.query("select * from license_renewal_requests where id=$1",[direct.data.id])).rows[0]
    submitted.push(directRequest.file_ref)
    assert.equal(directRequest.reviewed_by,ids.admin)
    assert.ok(directRequest.reviewed_at)
    const directLicense=(await db.query("select * from user_licenses where id=$1",[directRequest.resulting_license_id])).rows[0]
    assert.equal(directLicense.license_number,"0000456")
    assert.equal(directLicense.verification_status,"verified")
    assert.equal(directLicense.verified_by,ids.admin)
    assert.ok(directLicense.verified_at)
    assert.equal((await db.query("select status from license_renewal_requests where id=$1",[pendingCivil.id])).rows[0].status,"rejected")
    assert.equal((await db.query("select count(*)::int as n from license_renewal_requests where user_id=$1 and profession='Civil Engineer' and status='under_review'",[ids.engineer])).rows[0].n,0)
    assert.equal((await db.query("select count(*)::int as n from activity_log where title='License renewal to review'")).rows[0].n,remindersBefore)
    assert.equal((await db.query("select id from user_licenses where user_id=$1 and profession='Electrical Engineer' and superseded_at is null",[ids.engineer])).rows[0].id,electricalBefore)
    const updateForm=form("Civil Engineer","0000789")
    updateForm.set("user_id",ids.engineer)
    const updated=await call("admin","POST","/licenses/renewals",updateForm)
    assert.equal(updated.status,201,JSON.stringify(updated))
    assert.equal(updated.data.status,"verified")
    submitted.push((await db.query("select file_ref from license_renewal_requests where id=$1",[updated.data.id])).rows[0].file_ref)
    assert.ok((await db.query("select superseded_at from user_licenses where id=$1",[directLicense.id])).rows[0].superseded_at)
    assert.equal((await db.query("select count(*)::int as n from user_licenses where user_id=$1 and profession='Civil Engineer' and superseded_at is null",[ids.engineer])).rows[0].n,1)
    const forgedForm=form("Civil Engineer")
    forgedForm.set("user_id",ids.other)
    forgedForm.set("verification_status","verified")
    forgedForm.set("auto_verify","true")
    const forged=await call("engineer","POST","/licenses/renewals",forgedForm)
    assert.equal(forged.status,201,JSON.stringify(forged))
    const forgedRequest=(await db.query("select * from license_renewal_requests where id=$1",[forged.data.id])).rows[0]
    submitted.push(forgedRequest.file_ref)
    assert.equal(forgedRequest.user_id,ids.engineer)
    assert.equal(forgedRequest.status,"under_review","engineers cannot enable immediate verification")
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
    for (const role of ["spm","opm"]) {
      const account=(await db.query("select id,email from users where email=$1",[role+"verified@10builders.com"])).rows[0]
      await db.query("update users set temp_password_issued=false,status='active' where id=$1",[account.id])
      const signed=await fetch(base+"/auth/staff/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:account.email,password:"Password@123"})})
      const auth=await signed.json();tokens.restricted=auth.data?.token||auth.token;assert.ok(tokens.restricted)
      await db.query("update user_licenses set license_expiry=(current_timestamp at time zone 'Asia/Manila')::date+24 where user_id=$1 and superseded_at is null",[account.id])
      assert.equal((await call("restricted","GET","/licenses/me")).data.renewalOnly,true)
      assert.equal((await call("restricted","GET","/licenses/me")).data.renewalSubmissionAllowed,true)
      await db.query("update user_licenses set license_expiry=(current_timestamp at time zone 'Asia/Manila')::date+23 where user_id=$1 and superseded_at is null",[account.id])
      assert.equal((await call("restricted","GET","/licenses/me")).data.renewalOnly,true)
      for(const endpoint of ["/workspace","/workspace/project-data","/subcontractors","/notifications","/accounts/"+account.id,"/licenses/overview"]){
        const blocked=await call("restricted","GET",endpoint);assert.equal(blocked.status,403,endpoint);assert.equal(blocked.error.code,"LICENSE_RENEWAL_ONLY")
      }
      assert.equal((await call("restricted","POST","/workspace/reconcile-phase-handoffs",{})).status,403)
      const closed=await call("restricted","POST","/licenses/renewals",form("Civil Engineer","0007654"))
      assert.equal(closed.status,403);assert.equal(closed.error.code,"LICENSE_ADMIN_REQUIRED")
      await db.query("update user_licenses set license_expiry=(current_timestamp at time zone 'Asia/Manila')::date+24 where user_id=$1 and superseded_at is null",[account.id])
      const upload=await call("restricted","POST","/licenses/renewals",form("Civil Engineer","0007654"))
      assert.equal(upload.status,201,JSON.stringify(upload))
      await db.query("update user_licenses set license_expiry=(current_timestamp at time zone 'Asia/Manila')::date+23 where user_id=$1 and superseded_at is null",[account.id])
      assert.equal((await call("restricted","GET","/licenses/me")).data.renewalOnly,true)
      const mine=await call("restricted","GET","/licenses/credentials/"+account.id)
      assert.equal(mine.status,200);assert.ok(mine.data.submissions.some(q=>q.status==='under_review'))
      const stored=(await db.query("select file_ref from license_renewal_requests where id=$1",[upload.data.id])).rows[0].file_ref
      assert.match(stored,/^db:/)
      const fileResponse=await fetch(base+"/files/"+stored.slice(3)+"/content",{headers:{Authorization:"Bearer "+tokens.restricted}})
      assert.equal(fileResponse.status,200)
      const verified=await call("admin","POST","/licenses/renewals/"+upload.data.id+"/verify",{note:"Renewal evidence manually checked."})
      assert.equal(verified.status,200,JSON.stringify(verified))
      assert.equal((await call("restricted","GET","/licenses/me")).data.renewalOnly,false)
      assert.equal((await call("restricted","GET","/workspace")).status,200)
    }

    await t.test('credential-specific specializations preserve legacy records and isolate multiple credentials',async()=>{
      const legacy=(await db.query('select id,user_id,license_number,verification_status from user_licenses order by id')).rows
      await db.exec(read('../Thesis-Backend/migrations/026-credential-specializations.sql'))
      await db.exec(read('../Thesis-Backend/migrations/026-credential-specializations.sql'))
      assert.deepEqual((await db.query('select id,user_id,license_number,verification_status from user_licenses order by id')).rows,legacy)
      assert.ok((await db.query('select specializations from user_licenses')).rows.every(c=>c.specializations===null))
      const sets=[['Civil','Structural','Geotechnical'],['Mechanical','Fire Protection','Acoustic'],['Electrical','Acoustic','Facade']]
      const uploadOnly=form('Geodetic Engineer');uploadOnly.set('user_id',ids.other);uploadOnly.set('specializations',JSON.stringify(['Surveying']));uploadOnly.set('verification_status','verified');
      const unreviewed=await call('admin','POST','/licenses/renewals',uploadOnly)
      assert.equal(unreviewed.status,201,JSON.stringify(unreviewed));assert.equal(unreviewed.data.status,'under_review','credential-specific uploads do not infer a verification decision')
      const professions=['Civil Engineer','Mechanical Engineer','Electrical Engineer']
      const create=async(count,decision='pending',custom=sets)=>{
        const credentials=[]
        for(let i=0;i<count;i++)credentials.push({profession:professions[i],license_number:'000012'+i,license_expiry:future,file_id:await uploadEvidence(),specializations:custom[i]})
        const body={full_name:'Credential association QA',email:crypto.randomUUID()+'@example.test',role:'spm',password:'Password@123',scope:{disciplines:custom.slice(0,count).flat()},initial_credentials:credentials,credential_decision:decision,credential_evidence_reviewed:decision==='verified',credential_review_note:decision==='verified'?'Reviewed every credential.':''}
        return {result:await call('admin','POST','/accounts',body),body}
      }
      for(const count of [1,2,3]){
        const {result}=await create(count);assert.equal(result.status,201,JSON.stringify(result))
        const profile=(await call('admin','GET','/licenses/credentials/'+result.data.id)).data
        assert.equal(profile.credentials.length,0,'upload and pending save do not verify licenses')
        assert.equal(profile.submissions.length,count)
        for(const q of profile.submissions)assert.deepEqual(q.specializations,sets[professions.indexOf(q.profession)])
        assert.equal(profile.specializations.length,new Set(sets.slice(0,count).flat()).size)
        assert.equal(profile.eligibleForNewAssignment,false)
        const directory=await call('admin','GET','/accounts?page=1&pageSize=100')
        const row=directory.data.find(a=>a.id===result.data.id)
        assert.equal(row.credential_count,count);assert.equal(row.credential_status,'pending')
        assert.equal(row.scope.length,new Set(sets.slice(0,count).flat()).size)
        if(count===2){
          const [civil,mechanical]=professions.slice(0,2).map(p=>profile.submissions.find(q=>q.profession===p))
          const edit=await call('admin','PUT','/licenses/credentials/'+result.data.id+'/specializations',{submission_id:civil.id,specializations:['Civil','Acoustic']})
          assert.equal(edit.status,200,JSON.stringify(edit))
          assert.deepEqual((await db.query('select specializations from license_renewal_requests where id=$1',[mechanical.id])).rows[0].specializations,sets[1])
          assert.equal((await call('other','PUT','/licenses/credentials/'+result.data.id+'/specializations',{submission_id:civil.id,specializations:[]})).status,403)
          assert.equal((await call('admin','PUT','/licenses/credentials/'+ids.other+'/specializations',{submission_id:civil.id,specializations:[]})).status,404)
          assert.equal((await call('admin','PUT','/licenses/credentials/'+result.data.id+'/specializations',{submission_id:civil.id,specializations:['Civil','Structural','Geotechnical','Mechanical']})).status,400)
          for(const q of profile.submissions)assert.equal((await call('admin','POST','/licenses/renewals/'+q.id+'/verify',{note:'Manual evidence review.'})).status,200)
          const saved=(await call('admin','GET','/licenses/credentials/'+result.data.id)).data
          assert.equal(saved.credentials.length,2)
          assert.deepEqual(saved.credentials.find(c=>c.profession==='Civil Engineer').specializations,['Civil','Acoustic'])
          assert.deepEqual(saved.credentials.find(c=>c.profession==='Mechanical Engineer').specializations,sets[1])
          assert.ok(saved.credentials.every(c=>c.license_number.startsWith('0000')))
          const document=await fetch(base+saved.credentials[0].document_url.replace('/api/v1',''),{headers:{Authorization:'Bearer '+tokens.admin}})
          assert.equal(document.status,200)
          const credential=saved.credentials[0]
          assert.equal((await call('admin','PUT','/licenses/credentials/'+ids.other+'/specializations',{credential_id:credential.id,specializations:[]})).status,404)
          assert.equal((await call('admin','PUT','/licenses/credentials/'+result.data.id+'/specializations',{credential_id:credential.id,specializations:['Acoustic']})).status,200)
          assert.equal((await db.query('select count(*)::int as n from engineer_specializations where user_id=$1',[result.data.id])).rows[0].n,0,'new associations are not flattened into the legacy account list')
        }
      }
      const invalid=await create(1,'pending',[['Civil','Structural','Geotechnical','Mechanical']]);assert.equal(invalid.result.status,400)
      const duplicate=await create(1,'pending',[['Civil','Civil']]);assert.equal(duplicate.result.status,400)
      const mixed=await create(3,'pending',[['Civil'],['Mechanical','Acoustic'],['Electrical','Acoustic','Facade']]);assert.equal(mixed.result.status,201)
      const cross=await create(2,'verified',[['Mechanical'],['Acoustic']]);assert.equal(cross.result.status,201)
      const mixedLegacy=await create(1,'pending',[['Structural']]);assert.equal(mixedLegacy.result.status,201)
      await db.query("insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,profession,verification_status,verified_by,verified_at) values($1,'0000009',$2,'uploaded','legacy-proof','Civil Engineer','verified',$3,now())",[mixedLegacy.result.data.id,future,ids.admin])
      await db.query("insert into engineer_specializations(user_id,specialization,recorded_by) values($1,'Civil',$2)",[mixedLegacy.result.data.id,ids.admin])
      const legacyProfile=(await call('admin','GET','/licenses/credentials/'+mixedLegacy.result.data.id)).data
      assert.ok(legacyProfile.qualifiedRequirements.includes('Civil'))
      assert.ok(!legacyProfile.qualifiedRequirements.includes('Structural'),'pending credential tags cannot gain verification from a legacy license')
      assert.equal((await db.query('select count(*)::int as n from engineer_qualified_scopes where user_id=$1',[cross.result.data.id])).rows[0].n,0,'a specialization cannot borrow verification from a different credential')
      assert.deepEqual(qualifyingSpecializations([{profession:'Civil Engineer',specializations:['Mechanical'],verification_status:'verified',verified_by:'admin',verified_at:'2026-01-01',license_number:'0000001',license_expiry:'2099-01-01',upload_status:'uploaded',upload_file_ref:'proof'},{profession:'Mechanical Engineer',specializations:['Acoustic'],verification_status:'verified',verified_by:'admin',verified_at:'2026-01-01',license_number:'0000002',license_expiry:'2099-01-01',upload_status:'uploaded',upload_file_ref:'proof'}],['Mechanical'],'2026-01-01'),[])
    })

  },
)
