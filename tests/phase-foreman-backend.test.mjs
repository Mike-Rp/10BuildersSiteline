import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { installCredentialFixture } from "./helpers/credential-fixture.mjs"
import { COMPANY_TRADES } from "../Thesis-Backend/src/domain/company-trades.js"
import { api, login, setApiBase, setToken } from "../src/api/client.ts"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const read = (p) => fs.readFileSync(here(p), "utf8")
const port = () =>
  new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const n = s.address().port
      s.close(() => r(n))
    })
  })

test(
  "phase allocation API preserves history, enforces Admin approval, manual foremen and company capacity",
  { timeout: 120000 },
  async (t) => {
    const db = new PGlite({ extensions: { citext } })
    let socket, child
    t.after(async () => {
      if (child) {
        const exit = new Promise((r) => child.once("exit", r))
        child.kill()
        await exit
      }
      if (socket) await socket.stop()
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
      "008-monthly-report-history.sql",
      "010-photo-release.sql",
      "013-trade-subcontractor-allocation.sql",
    ])
      await db.exec(read("../Thesis-Backend/migrations/" + file))
    await db.exec(read("../supabase/seed/dummy-data.sql"))
    await db.exec(
      "update user_licenses set license_expiry=current_date+400 where superseded_at is null",
    )
    await installCredentialFixture(db)
    const migration = read(
      "../Thesis-Backend/migrations/018-phase-foreman-allocation.sql",
    )
    await db.exec(migration)
    await db.exec(migration)
    const userCount = (await db.query("select count(*)::int as n from users"))
      .rows[0].n
    await db.exec("set role anon")
    try {
      await assert.rejects(
        db.query("select * from project_allocation_requests"),
        (e) => e.code === "42501",
      )
    } finally {
      await db.exec("reset role")
    }
    assert.equal(
      (await db.query("select count(*)::int as n from project_phase_foremen"))
        .rows[0].n,
      0,
      "migration never guesses assignments",
    )
    const source = (
      await db.query(
        "select p.*,u.email as lead_email,t.spm_user_id from projects p join project_phase_team t on t.project_id=p.id and t.is_lead join users u on u.id=t.spm_user_id where p.name like 'Alden Heights%' limit 1",
      )
    ).rows[0]
    assert.ok(source)
    const createProject = async () => {
      const id = randomUUID()
      await db.query(
        `insert into projects select (jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Foreman allocation test','lifecycle_status','spm_review','subcontractor_allocation_version',1))).* from projects p where id=$1`,
        [source.id, id],
      )
      await db.query(
        "insert into project_phase_team(project_id,project_stage_id,spm_user_id,is_lead,status) select $2,project_stage_id,spm_user_id,is_lead,'confirmed' from project_phase_team where project_id=$1",
        [source.id, id],
      )
      await db.query(
        "insert into project_documents(project_id,document_type_id,status) select $1,id,'uploaded' from document_types where code=any($2::text[])",
        [
          id,
          [
            "notice_to_proceed",
            "building_permit",
            "owner_contract",
            "registered_plans",
            "environmental_certificate",
            "budget_boq",
          ],
        ],
      )
      return id
    }
    const companies = (
      await db.query(
        "select id from subcontractors where directory_status='approved' order by id limit 3",
      )
    ).rows.map((r) => r.id)
    assert.equal(companies.length, 3)
    await db.query(
      "update project_subcontractor_assignments set status='released' where subcontractor_id=any($1::uuid[])",
      [companies],
    )
    await db.query(
      "update subcontractor_workers set availability_status='available',current_project_id=null where subcontractor_id=any($1::uuid[])",
      [companies],
    )
    await db.query(
      "update project_subcontractor_selections set status='declined' where subcontractor_id=any($1::uuid[])",
      [companies],
    )
    for (const id of companies)
      await db.query(
        "insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2) on conflict(subcontractor_id) do update set metadata=workspace_company_metadata.metadata||excluded.metadata",
        [
          id,
          JSON.stringify({
            foremen: [
              { name: "Mika", phone: "09987654321" },
              { name: "Yak", phone: "09123456789" },
            ],
            capabilityReview: {
              disciplines: COMPANY_TRADES,
              reviewedAt: new Date().toISOString(),
              unavailable: false,
            },
          }),
        ],
      )
    const dbPort = await port(),
      apiPort = await port()
    socket = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
    await socket.start()
    child = spawn(process.execPath, ["src/index.js"], {
      cwd: here("../Thesis-Backend/"),
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DB_SERVER: "127.0.0.1",
        DB_PORT: String(dbPort),
        DB_NAME: "postgres",
        DB_USER: "postgres",
        DB_PASSWORD: "x",
        DB_POOL_MAX: "1",
        PGSSLMODE: "disable",
        JWT_SECRET: "phase-foreman-test-only-secret-0123456789",
        PORT: String(apiPort),
        HOST: "127.0.0.1",
        ARCHIVE_MAINTENANCE_ENABLED: "false",
      },
    })
    setApiBase(`http://127.0.0.1:${apiPort}/api/v1`)
    const deadline = Date.now() + 30000
    while (true) {
      try {
        if ((await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok) break
      } catch {}
      if (Date.now() > deadline) throw Error("API did not start")
      await new Promise((r) => setTimeout(r, 100))
    }
    const admin = async () => {
      setToken("")
      await login(
        "patricia.domingo@10builders.com",
        "Password@123",
        true,
        "admin",
      )
    }
    const lead = async () => {
      setToken("")
      await login(source.lead_email, "Password@123", true, "staff")
    }
    const get = (id) => api(`/projects/${id}/phase-allocation`)
    const post = (id, action, body = {}) =>
      api(`/projects/${id}/phase-allocation`, {
        method: "POST",
        json: {
          action,
          note: "Confirmed exact phase scope and foreman availability.",
          method: "phone",
          ...body,
        },
      })
    const proposal = (ctx, id) =>
      ctx.phases
        .filter((p) => !ctx.completed.includes(p.name))
        .map((p, index) => ({
          phase: p.name,
          companyId: id,
          foremanId: ctx.companies.find((c) => c.id === id).foremen[index % 2]
            .id,
        }))
    const contactAccept = async (id, request, companyId) => {
      await post(id, "contact", { requestId: Number(request.id), companyId })
      await post(id, "accept", {
        requestId: Number(request.id),
        companyId,
        availabilityConfirmed: true,
      })
    }
    const p1 = await createProject()
    await lead()
    let ctx = await get(p1),
      rows = proposal(ctx, companies[0])
    assert.ok(rows.length > 2)
    const originalContacts = ctx.companies.find(
      (c) => c.id === companies[0],
    ).foremen
    await db.query(
      "update workspace_company_metadata set metadata=jsonb_set(metadata,'{foremen}',$2::jsonb) where subcontractor_id=$1",
      [
        companies[0],
        JSON.stringify(
          originalContacts
            .map(({ name, phone }) => ({ name, phone }))
            .reverse(),
        ),
      ],
    )
    const reordered = (await get(p1)).companies.find(
      (c) => c.id === companies[0],
    ).foremen
    assert.deepEqual(
      reordered.map((f) => f.id).sort(),
      originalContacts.map((f) => f.id).sort(),
      "reordering contact cards preserves identities",
    )
    await assert.rejects(
      post(p1, "submit", {
        revision: 0,
        assignments: [...rows.slice(1), rows[1]],
      }),
      (e) => e.status === 400,
      "duplicate phases rejected",
    )
    await assert.rejects(
      post(p1, "submit", {
        revision: 0,
        assignments: rows.map((r, i) =>
          i === 0
            ? {
                ...r,
                foremanId: ctx.companies.find((c) => c.id === companies[1])
                  .foremen[0].id,
              }
            : r,
        ),
      }),
      (e) => e.status === 400,
      "foremen must belong to the company",
    )
    const draft = await post(p1, "draft", {
      revision: 0,
      assignments: rows.map((r) => ({ ...r, foremanId: "" })),
    })
    assert.equal(draft.status, "draft")
    assert.equal(
      (
        await db.query(
          "select 1 from project_subcontractor_selections where project_id=$1 and status='accepted'",
          [p1],
        )
      ).rowCount,
      0,
    )
    const initial = await post(p1, "submit", {
      requestId: Number(draft.id),
      revision: 0,
      assignments: rows,
    })
    assert.equal(
      initial.status,
      "approved",
      "one initial company needs no additional-company approval",
    )
    await assert.rejects(
      post(p1, "confirm", { requestId: Number(initial.id) }),
      (e) => e.status === 409,
    )
    await post(p1, "contact", {
      requestId: Number(initial.id),
      companyId: companies[0],
    })
    await assert.rejects(
      post(p1, "accept", {
        requestId: Number(initial.id),
        companyId: companies[0],
      }),
      (e) => e.status === 409,
      "foreman availability must be confirmed",
    )
    await post(p1, "accept", {
      requestId: Number(initial.id),
      companyId: companies[0],
      availabilityConfirmed: true,
    })
    await post(p1, "confirm", { requestId: Number(initial.id) })
    ctx = await get(p1)
    assert.equal(ctx.assignments.length, rows.length)
    assert.equal(ctx.revision, 1)
    assert.equal(
      (
        await db.query(
          "select count(distinct company_id)::int as n from project_phase_foremen where project_id=$1",
          [p1],
        )
      ).rows[0].n,
      1,
    )
    await assert.rejects(
      api(`/projects/${p1}/workspace-command`, {
        method: "POST",
        json: {
          type: "save_allocation_plan",
          allocationRevision: 1,
          plan: { companyIds: [companies[1]], phaseOwned: true, coverage: [] },
        },
      }),
      (e) => e.status === 409,
      "legacy command cannot bypass approval",
    )
    const changed = rows.map((r, i) =>
      i === 0
        ? {
            ...r,
            companyId: companies[1],
            foremanId: ctx.companies.find((c) => c.id === companies[1])
              .foremen[0].id,
          }
        : r,
    )
    const addition = await post(p1, "submit", {
      revision: 1,
      assignments: changed,
    })
    assert.equal(addition.status, "pending_admin")
    await assert.rejects(
      post(p1, "approve", { requestId: Number(addition.id) }),
      (e) => e.status === 403,
    )
    await assert.rejects(
      post(p1, "contact", {
        requestId: Number(addition.id),
        companyId: companies[1],
      }),
      (e) => e.status === 409,
    )
    assert.deepEqual(
      (await get(p1)).assignments.map((r) => r.companyId),
      rows.map((r) => r.companyId),
      "pending request changes no current assignments",
    )
    await admin()
    assert.ok(
      (await api("/allocation-requests")).some((r) => r.id === addition.id),
    )
    await post(p1, "approve", { requestId: Number(addition.id) })
    await lead()
    for (const id of companies.slice(0, 2))
      await contactAccept(p1, addition, id)
    await post(p1, "cancel", { requestId: Number(addition.id) })
    assert.equal(
      (
        await db.query(
          "select 1 from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2 and status='accepted'",
          [p1, companies[1]],
        )
      ).rowCount,
      0,
      "cancel releases incoming reservations",
    )
    assert.equal(
      (
        await db.query(
          "select 1 from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2 and status='accepted'",
          [p1, companies[0]],
        )
      ).rowCount,
      1,
      "cancel preserves current company commitment",
    )
    const rejected = await post(p1, "submit", {
      revision: 1,
      assignments: changed,
    })
    await admin()
    await post(p1, "reject", {
      requestId: Number(rejected.id),
      note: "Additional support is not required for this scope.",
    })
    await lead()
    await assert.rejects(
      post(p1, "contact", {
        requestId: Number(rejected.id),
        companyId: companies[1],
      }),
      (e) => e.status === 409,
      "Admin rejection cannot be bypassed",
    )
    const declined = await post(p1, "submit", {
      revision: 1,
      assignments: changed,
    })
    await admin()
    await post(p1, "approve", { requestId: Number(declined.id) })
    await lead()
    await post(p1, "contact", {
      requestId: Number(declined.id),
      companyId: companies[1],
    })
    await post(p1, "decline", {
      requestId: Number(declined.id),
      companyId: companies[1],
      note: "Company declined because its crew is unavailable.",
    })
    assert.equal(
      (
        await db.query(
          "select status from project_allocation_requests where id=$1",
          [declined.id],
        )
      ).rows[0].status,
      "declined",
    )
    assert.deepEqual(
      (await get(p1)).assignments.map((r) => r.companyId),
      rows.map((r) => r.companyId),
    )
    const opmEmail = (
      await db.query("select email from users where id=$1", [
        source.suggested_opm_id,
      ])
    ).rows[0].email
    setToken("")
    await login(opmEmail, "Password@123", true, "staff")
    assert.equal((await get(p1)).canEdit, false)
    await assert.rejects(
      post(p1, "submit", { revision: 1, assignments: rows }),
      (e) => e.status === 403,
    )
    await lead()
    const p2 = await createProject(),
      p3 = await createProject()
    const c2 = await get(p2),
      c3 = await get(p3)
    const r2 = await post(p2, "submit", {
        revision: 0,
        assignments: proposal(c2, companies[0]),
      }),
      r3 = await post(p3, "submit", {
        revision: 0,
        assignments: proposal(c3, companies[0]),
      })
    await contactAccept(p2, r2, companies[0])
    await post(p3, "contact", {
      requestId: Number(r3.id),
      companyId: companies[0],
    })
    await assert.rejects(
      post(p3, "accept", {
        requestId: Number(r3.id),
        companyId: companies[0],
        availabilityConfirmed: true,
      }),
      (e) => e.status === 409,
      "acceptance rechecks capacity after a stale suggestion",
    )
    await post(p3, "cancel", { requestId: Number(r3.id) })
    // Monitoring changes must never rewrite a completed phase.
    const stages = (
      await db.query(
        "select s.id,s.code from project_phase_team t join project_stages s on s.id=t.project_stage_id where project_id=$1",
        [p1],
      )
    ).rows
    const second = ctx.phases[1].name
    await db.query(
      "update projects set lifecycle_status='active',current_stage_id=$2 where id=$1",
      [p1, stages.find((s) => s.code === second).id],
    )
    ctx = await get(p1)
    const historical = ctx.assignments.find((r) => r.phase === ctx.completed[0])
    const replacement = await post(p1, "submit", {
      revision: 1,
      assignments: proposal(ctx, companies[2]),
    })
    assert.equal(replacement.status, "pending_admin")
    await admin()
    await post(p1, "approve", { requestId: Number(replacement.id) })
    await lead()
    await contactAccept(p1, replacement, companies[2])
    await post(p1, "confirm", { requestId: Number(replacement.id) })
    ctx = await get(p1)
    assert.deepEqual(
      ctx.assignments.find((r) => r.phase === historical.phase),
      historical,
    )
    assert.ok(
      ctx.assignments
        .filter((r) => !ctx.completed.includes(r.phase))
        .every((r) => r.companyId === companies[2]),
    )
    assert.equal(
      (
        await db.query(
          "select status from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2",
          [p1, companies[0]],
        )
      ).rows[0].status,
      "archived",
    )
    assert.ok(ctx.history.some((e) => e.action === "confirm"))
    // Reintroducing a released historical company still requires Admin approval.
    const readd = await post(p1, "submit", {
      revision: 2,
      assignments: proposal(ctx, companies[0]),
    })
    assert.equal(readd.status, "pending_admin")
    await post(p1, "cancel", { requestId: Number(readd.id) })
    // Approval is scoped to phases: moving more work to an existing partner also needs review.
    ctx=await get(p1)
    const supporting=proposal(ctx,companies[2]).map((r,i)=>i===0?{...r,companyId:companies[1],foremanId:ctx.companies.find(c=>c.id===companies[1]).foremen[0].id}:r)
    const support=await post(p1,'submit',{revision:2,assignments:supporting})
    await admin();await post(p1,'approve',{requestId:Number(support.id)});await lead()
    for(const id of [companies[1],companies[2]])await contactAccept(p1,support,id)
    await post(p1,'confirm',{requestId:Number(support.id)})
    ctx=await get(p1)
    const revisedScope=await post(p1,'submit',{revision:3,assignments:proposal(ctx,companies[2])})
    assert.equal(revisedScope.status,'pending_admin','previous approval cannot be reused for an expanded company scope')
    await post(p1,'cancel',{requestId:Number(revisedScope.id)})
    await assert.rejects(
      api("/subcontractors/registrations", { method: "POST", json: {} }),
      (e) => e.status === 403,
      "SPM cannot register companies",
    )
    await assert.rejects(
      api("/subcontractors", { method: "POST", json: {} }),
      (e) => e.status === 403,
      "legacy directory creation is also Admin-only",
    )
    await assert.rejects(api("/allocation-requests"), (e) => e.status === 403)
    assert.equal(
      (await db.query("select count(*)::int as n from users")).rows[0].n,
      userCount,
      "foremen never receive login accounts",
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from project_phase_foremen where project_id=$1",
          [p1],
        )
      ).rows[0].n,
      rows.length,
    )
  },
)
