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
import { loadState } from "../src/api/load.ts"
import { saveApiProject, sendApiWorkflow, uploadFile } from "../src/api/actions.ts"
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
      if (child && child.exitCode===null && child.signalCode===null) {
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
      stdio: ["ignore","ignore","pipe"],
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
    child.stderr.on('data',chunk=>process.stderr.write(chunk));
    setApiBase(`http://127.0.0.1:${apiPort}/api/v1`)
    const deadline = Date.now() + 30000
    while (true) {
      try {
        if ((await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok) break
      } catch {}
      if(child.exitCode!==null)throw new Error('Test backend exited before readiness.');
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
    await t.test("walkthrough: new intake → OPM documents → SPM confirmations → manual foreman allocation", async () => {
      await db.exec(read('../Thesis-Backend/migrations/019-engineer-phase-commitments.sql'))
      // Earlier scenarios exercised legacy commitments. Start this connected intake
      // with released engineer fixtures; all subsequent reservations use migration 019.
      await db.exec("update project_phase_team set status='declined'")
      const session = async (email, portal = "staff") => {
        setToken("")
        const user = await login(email, "Password@123", true, portal)
        const state = await loadState(user)
        return { user, state, actor: state.accounts.find(a => a.id === user.id) }
      }
      let s = await session("patricia.domingo@10builders.com", "admin")
      const template = s.state.projects.find(p => p.id === source.id)
      assert.ok(template)
      const client = s.state.accounts.find(a => a.role === "client" && ["active", "invited"].includes(a.status))
      assert.ok(client)
      const project = { ...template, id: randomUUID(), name: "Intake to foreman walkthrough", clientId: client.id,
        area: "100", floors: "1", start: "2027-01-15", end: "2027-10-15", docs: [],
        clientSubcon: "", clientSubconEmail: "", clientSubconCompany: undefined,
        team: template.team.map(row => ({ ...row, status: "pending" })) }
      for (const row of project.team) {
        const eligible = await db.query(`select q.user_id from engineer_qualified_scopes q join users u on u.id=q.user_id join roles r on r.id=u.role_id
          join project_stage_discipline_links l on l.discipline_id=q.discipline_id
          join project_stages ps on ps.id=l.project_stage_id join project_types pt on pt.id=l.project_type_id
          where ps.code=$1 and pt.code=$2 and u.status='active' and r.code='spm'
          and not exists(select 1 from license_renewal_requests renewal where renewal.user_id=u.id and renewal.status='under_review')
          order by (q.user_id=$3) desc,q.user_id limit 1`, [row.phase, project.type, row.accountId])
        assert.ok(eligible.rowCount, `Qualified SPM for ${row.phase}`)
        row.accountId = eligible.rows[0].user_id
      }
      const simultaneous=await Promise.allSettled([
        saveApiProject(project,false),
        saveApiProject({...project,id:randomUUID(),name:'Concurrent engineer commitment'},false),
      ])
      assert.equal(simultaneous.filter(result=>result.status==='fulfilled').length,1,'only one conflicting intake may reserve the engineers')
      assert.match(simultaneous.find(result=>result.status==='rejected').reason.message,/committed|two unfinished/)
      const id = simultaneous.find(result=>result.status==='fulfilled').value
      assert.ok((await db.query('select assigned_disciplines from project_phase_team where project_id=$1',[id])).rows.every(row=>row.assigned_disciplines?.length),'new intake reserves explicit specialization snapshots')
      await assert.rejects(saveApiProject({...project,id:randomUUID(),name:'Duplicate engineer commitment'},false),/committed|two unfinished/,'manual intake cannot bypass the same phase-and-tag reservation')
      const recommended=await api(`/projects/recommendations?project_type=${encodeURIComponent(project.type)}&floor_area_sqm=100&floor_count=1`)
      const reserved=(await db.query('select s.code,t.spm_user_id,t.assigned_disciplines from project_phase_team t join project_stages s on s.id=t.project_stage_id where t.project_id=$1',[id])).rows
      for(const row of recommended.phase_team) assert.ok(!reserved.some(old=>old.code===row.stage&&old.spm_user_id===row.user_id&&row.assigned_disciplines?.some(tag=>old.assigned_disciplines.includes(tag))),'recommendation API excludes identical reserved phase and tag')
      assert.equal((await api(`/projects/${id}`)).lifecycle_status, "sent_to_opm")
      const accounts = s.state.accounts
      s = await session(accounts.find(a => a.id === project.opmId).email)
      await sendApiWorkflow(s.state, s.actor, { type: "accept_opm", projectId: id })
      for (let index = 0; index < 6; index++) {
        const fileId = randomUUID()
        await uploadFile(fileId, new File(["%PDF-1.4\nWalkthrough supporting record"], "registered.pdf", { type: "application/pdf" }))
        s.state = await loadState(s.user)
        await sendApiWorkflow(s.state, s.actor, { type: "upload_registered", projectId: id, docIndex: index,
          doc: { id: fileId, name: "registered.pdf", uploaded: true } })
      }
      for (const accountId of new Set(project.team.map(row => row.accountId))) {
        s = await session(accounts.find(a => a.id === accountId).email)
        assert.ok(s.state.projects.some(p => p.id === id), `SPM workspace must include pending intake: ${JSON.stringify({email:s.user.email,role:s.user.role,projects:s.state.projects.map(p=>p.name),renewalOnly:s.state.renewalOnly})}`)
        await sendApiWorkflow(s.state, s.actor, { type: "accept_assignment", projectId: id })
      }
      s = await session(accounts.find(a => a.id === project.team[0].accountId).email)
      assert.equal((await api(`/projects/${id}`)).lifecycle_status, "spm_review")
      // Free only disposable fixture commitments so this walkthrough starts with an available company.
      await db.query("update project_subcontractor_selections set status='archived' where subcontractor_id=$1", [companies[0]])
      await db.query("update project_subcontractor_assignments set status='released' where subcontractor_id=$1", [companies[0]])
      const context = await get(id)
      const assignments = proposal(context, companies[0])
      const request = await post(id, "submit", { revision: context.revision, assignments })
      assert.equal(request.status, "approved", "initial single company needs no additional-company approval")
      await contactAccept(id, request, companies[0])
      await post(id, "confirm", { requestId: Number(request.id) })
      const confirmed = await get(id)
      assert.equal(confirmed.assignments.length, context.phases.length)
      assert.equal(new Set(confirmed.assignments.map(row => row.phase)).size, context.phases.length)
      assert.equal(new Set(confirmed.assignments.map(row => row.foremanId)).size, 2)
      assert.equal((await api(`/projects/${id}`)).lifecycle_status, "spm_review", "allocation cannot bypass the signed agreement")
      const fileId = randomUUID()
      await uploadFile(fileId, new File(["%PDF-1.4\nSigned subcontractor agreement"], "agreement.pdf", { type: "application/pdf" }))
      s.state = await loadState(s.user)
      await sendApiWorkflow(s.state, s.actor, { type: "upload_agreement", projectId: id,
        allocationRevision: confirmed.revision, doc: { id: fileId, name: "agreement.pdf", uploaded: true } })
      assert.equal((await api(`/projects/${id}`)).lifecycle_status, "active")
      assert.equal((await db.query("select count(*)::int as n from project_subcontractor_assignments where project_id=$1 and status='active'", [id])).rows[0].n, 1)
    })
    await t.test('multiple engineers cover each phase and remain committed until all personal responsibilities finish',async()=>{
      await db.exec(read('../Thesis-Backend/migrations/004-project-type-workflows.sql'))
      await db.exec(read('../Thesis-Backend/migrations/020-engineer-phase-responsibilities.sql'))
      await db.exec(read('../Thesis-Backend/migrations/020-engineer-phase-responsibilities.sql'))
      assert.equal((await db.query('select count(*)::int n from project_phase_responsibilities')).rows[0].n,0,'migration does not invent legacy responsibilities')
      await db.exec("update project_phase_team set status='declined';update user_licenses set license_expiry=current_date+400 where superseded_at is null;delete from license_renewal_requests where status='under_review';delete from engineer_specializations where user_id in(select u.id from users u join roles r on r.id=u.role_id where r.code='spm')")
      const personA=(await db.query("select id from users where email='karlo.espiritu@10builders.com'")).rows[0].id
      const personB=(await db.query("select id from users where email='rafael.mercado@10builders.com'")).rows[0].id
      await admin()
      const adminId=(await api('/workspace')).accountDetails
      const reviewer=Object.values(adminId).find(a=>a.role==='admin').id
      for(const [person,tags] of [[personA,['Civil','Structural','Geotechnical']],[personB,['Mechanical','Electrical','Sanitary']]])for(const tag of tags)await db.query('insert into engineer_specializations(user_id,specialization,recorded_by) values($1,$2,$3)',[person,tag,reviewer])
      for(const profession of ['Mechanical Engineer','Electrical Engineer','Sanitary Engineer'])await db.query(`insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,created_by,profession,verification_status,verified_by,verified_at)
        select $1,'TEST-CREDENTIAL',current_date+400,'uploaded','seed/licenses/test-proof.pdf',$2,$3,'verified',$2,now() where not exists(select 1 from user_licenses where user_id=$1 and profession=$3 and superseded_at is null)`,[personB,reviewer,profession])
      const as=async(email,portal='staff')=>{setToken('');const user=await login(email,'Password@123',true,portal);const state=await loadState(user);return {user,state,actor:state.accounts.find(a=>a.id===user.id)}}
      let session=await as('patricia.domingo@10builders.com','admin')
      const template=session.state.projects.find(p=>p.id===source.id),accounts=session.state.accounts
      const suggested=await api(`/projects/recommendations?project_type=${encodeURIComponent(template.type)}&floor_area_sqm=100&floor_count=1`)
      const phaseRequirements=(await db.query(`select s.code as phase,array_agg(d.code order by d.code) as tags from project_stage_discipline_links l join project_types pt on pt.id=l.project_type_id join project_stages s on s.id=l.project_stage_id join disciplines d on d.id=l.discipline_id where pt.code=$1 group by s.code`,[template.type])).rows
      assert.ok(suggested.phase_team.every(row=>row.coverage_complete),JSON.stringify(suggested.phase_team))
      assert.ok(suggested.phase_team.some(row=>row.engineers.length>=2),'five-area Design needs complementary engineers')
      const client=accounts.find(a=>a.role==='client'&&['active','invited'].includes(a.status))
      const project={...template,id:randomUUID(),name:'Multi-engineer walkthrough',clientId:client.id,area:'100',floors:'1',start:'2027-01-15',end:'2027-10-15',docs:[],clientSubcon:'',clientSubconEmail:'',clientSubconCompany:undefined,
        team:suggested.phase_team.map(row=>({phase:row.stage,accountId:row.user_id,status:'pending',requiredDisciplines:phaseRequirements.find(p=>p.phase===row.stage).tags,
          assignedDisciplines:row.engineers[0].assigned_disciplines,engineers:row.engineers.map(e=>({accountId:e.user_id,assignedDisciplines:e.assigned_disciplines,status:'pending'}))}))}
      const incomplete=structuredClone(project);incomplete.id=randomUUID();const design=incomplete.team.find(row=>row.phase==='Design');design.engineers=design.engineers.slice(0,1);design.engineers[0].assignedDisciplines=design.engineers[0].assignedDisciplines.slice(0,1)
      await assert.rejects(saveApiProject(incomplete,false),/Uncovered|cover every|minimum/,'a partial phase cannot be submitted')
      const id=await saveApiProject(project,false)
      let data=await api(`/projects/${id}/engineer-responsibilities`)
      assert.ok(data.rows.every(row=>row.status==='pending'&&row.assigned_disciplines.length<=3))
      const first=data.rows.find(row=>row.user_id===personA&&row.phase==='Mobilization')
      assert.ok(first)
      session=await as('karlo.espiritu@10builders.com')
      data=await api(`/projects/${id}/engineer-responsibilities`)
      assert.equal(data.availabilityLabel,'Reserved — awaiting acceptance')
      await assert.rejects(api(`/projects/${id}/engineer-responsibilities/${first.id}`,{method:'POST',json:{action:'accept'}}),/Wait for OPM/)
      session=await as(accounts.find(a=>a.id===project.opmId).email)
      await sendApiWorkflow(session.state,session.actor,{type:'accept_opm',projectId:id})
      // SPM-DASH-004: direct responsibility requests follow the same sequence as the workspace:
      // six registered documents first, then the Lead Site PM before any other engineer.
      const leadPerson=(await db.query('select spm_user_id from project_phase_team where project_id=$1 and is_lead',[id])).rows[0].spm_user_id
      const otherPerson=[personA,personB].find(person=>person!==leadPerson)
      assert.ok(otherPerson,'the fixture has a supporting engineer besides the lead')
      session=await as(accounts.find(a=>a.id===otherPerson).email)
      const otherRow=(await api(`/projects/${id}/engineer-responsibilities`)).rows.find(row=>row.user_id===otherPerson&&row.status==='pending')
      await assert.rejects(api(`/projects/${id}/engineer-responsibilities/${otherRow.id}`,{method:'POST',json:{action:'accept'}}),e=>e.status===409&&/documents/.test(e.message),'responsibility acceptance waits for the six registered documents')
      session=await as(accounts.find(a=>a.id===project.opmId).email)
      for(let index=0;index<6;index++){
        const fileId=randomUUID();await uploadFile(fileId,new File(['%PDF-1.4\nRegistered record'],'record.pdf',{type:'application/pdf'}));session.state=await loadState(session.user)
        await sendApiWorkflow(session.state,session.actor,{type:'upload_registered',projectId:id,docIndex:index,doc:{id:fileId,name:'record.pdf',uploaded:true}})
      }
      session=await as(accounts.find(a=>a.id===otherPerson).email)
      await assert.rejects(api(`/projects/${id}/engineer-responsibilities/${otherRow.id}`,{method:'POST',json:{action:'accept'}}),e=>e.status===409&&/Lead Site PM/.test(e.message),'the Lead Site PM accepts before other engineers')
      assert.equal((await db.query('select status from project_phase_responsibilities where id=$1',[otherRow.id])).rows[0].status,'pending','a refused acceptance changes nothing')
      for(const person of [leadPerson,otherPerson]){
        session=await as(accounts.find(a=>a.id===person).email)
        assert.ok(session.state.projects.find(p=>p.id===id).team.some(row=>row.engineers?.some(e=>e.accountId===person)),'supporting engineers load their responsibilities')
        await sendApiWorkflow(session.state,session.actor,{type:'accept_assignment',projectId:id})
      }
      session=await as('karlo.espiritu@10builders.com')
      data=await api(`/projects/${id}/engineer-responsibilities`)
      assert.equal(data.availabilityLabel,'Committed to a project');assert.ok(data.rows.every(row=>row.status==='confirmed'))
      await admin();const excluded=await api(`/projects/recommendations?project_type=${encodeURIComponent(template.type)}&floor_area_sqm=100&floor_count=1`)
      assert.ok(excluded.phase_team.every(row=>!row.engineers.some(e=>[personA,personB].includes(e.user_id))),'unfinished work blocks other projects even for a different phase or tag')
      await db.query("update project_subcontractor_selections set status='archived' where subcontractor_id=$1",[companies[0]])
      await db.query("update project_subcontractor_assignments set status='released' where subcontractor_id=$1",[companies[0]])
      await db.query("update workspace_company_metadata set metadata=metadata||$2::jsonb where subcontractor_id=$1",[companies[0],JSON.stringify({foremen:[{name:'Mika Foreman',phone:'09987654321'},{name:'Yak Foreman',phone:'09123456789'}],capabilityReview:{disciplines:COMPANY_TRADES,reviewedAt:new Date().toISOString(),unavailable:false}})])
      session=await as('karlo.espiritu@10builders.com')
      const ctx=await get(id),request=await post(id,'submit',{revision:ctx.revision,assignments:proposal(ctx,companies[0])})
      await contactAccept(id,request,companies[0]);await post(id,'confirm',{requestId:Number(request.id)})
      const revision=(await get(id)).revision,fileId=randomUUID();await uploadFile(fileId,new File(['%PDF-1.4\nSigned agreement'],'agreement.pdf',{type:'application/pdf'}));session.state=await loadState(session.user)
      await sendApiWorkflow(session.state,session.actor,{type:'upload_agreement',projectId:id,allocationRevision:revision,doc:{id:fileId,name:'agreement.pdf',uploaded:true}})
      assert.equal((await api(`/projects/${id}`)).lifecycle_status,'active')
      await admin()
      await assert.rejects(api(`/projects/${id}/advance-phase`,{method:'POST',json:{}}),error=>error.status===409,'unfinished personal responsibilities block phase handoff')
      session=await as('karlo.espiritu@10builders.com')
      const file=new FormData();file.set('file',new File(['%PDF-1.4\nMy completed responsibilities'],'completion.pdf',{type:'application/pdf'}));file.set('stage','Mobilization')
      const proof=await api(`/projects/${id}/phase-files`,{method:'POST',body:file})
      const respond=(action,body={})=>api(`/projects/${id}/engineer-responsibilities/${first.id}`,{method:'POST',json:{action,...body}})
      await assert.rejects(respond('submit_completion',{note:'Checklist still incomplete',fileId:proof.id}),/checklist/)
      const own=(await api('/projects/'+id+'/phase-overview')).checklist.items.filter(item=>item.required)
      const evidence=[]
      for(const item of own) evidence.push(await api('/projects/'+id+'/checklist-items/'+item.id+'/submit',{method:'POST',json:{file_id:proof.id}}))
      await admin()
      for(const item of evidence) {
       const preview=await api('/projects/'+id+'/evidence/'+item.id+'/review-preview')
       await api('/projects/'+id+'/evidence/'+item.id+'/approve',{method:'POST',json:{expected_review_token:preview.review_token}})
      }
      session=await as('karlo.espiritu@10builders.com')
      // The Office PM's approval of the last item completes this engineer's responsibilities automatically.
      session=await as('karlo.espiritu@10builders.com');data=await api(`/projects/${id}/engineer-responsibilities`)
      assert.equal(data.rows.find(r=>String(r.id)===String(first.id)).completion_status,'approved')
      assert.equal(data.availabilityLabel,'Committed to a project','unfinished succeeding phases retain the project commitment')
      // Simulate the remaining independently reviewed approvals in this disposable fixture.
      await db.query("update project_phase_responsibilities set completion_status='approved',reviewed_by=$2,reviewed_at=now() where project_id=$1 and user_id=$3",[id,reviewer,personA])
      data=await api(`/projects/${id}/engineer-responsibilities`)
      assert.equal(data.availabilityLabel,'Available for allocation')
      assert.equal((await api(`/projects/${id}`)).lifecycle_status,'active','the overall project can remain ongoing')
    })
    await t.test('suggested reassignment rechecks eligibility, closes old offers and preserves peer deadlines', async()=>{
      await db.exec(read('../Thesis-Backend/migrations/023-engineer-reassignment-offers.sql'))
      await db.exec(read('../Thesis-Backend/migrations/023-engineer-reassignment-offers.sql'))
      await admin()
      const id=await createProject()
      const reviewer=(await db.query("select u.id from users u join roles r on r.id=u.role_id where r.code='admin' limit 1")).rows[0].id
      const people=(await db.query("select u.id,u.email from users u join roles r on r.id=u.role_id where r.code='spm' and u.status='active' order by u.email limit 4")).rows
      assert.equal(people.length,4)
      const [old,replacement,peer,held]=people
      for(const person of people) {
        await db.query("update project_phase_team set status='declined' where spm_user_id=$1 and project_id<>$2",[person.id,id])
        await db.query("update project_phase_responsibilities set status='released' where user_id=$1 and project_id<>$2 and completion_status<>'approved'",[person.id,id])
        await db.query("insert into engineer_specializations(user_id,specialization,recorded_by) values($1,'Civil',$2) on conflict do nothing",[person.id,reviewer])
        await db.query("insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,created_by,profession,verification_status,verified_by,verified_at) select $1,'REASSIGN-TEST',current_date+400,'uploaded','seed/licenses/test-proof.pdf',$2,'Civil Engineer','verified',$2,now() where not exists(select 1 from user_licenses where user_id=$1 and profession='Civil Engineer' and verification_status='verified' and superseded_at is null)",[person.id,reviewer])
      }
      const stage=(await db.query("select t.project_stage_id,s.code from project_phase_team t join project_stages s on s.id=t.project_stage_id join project_stage_discipline_links l on l.project_stage_id=s.id and l.project_type_id=$2 join disciplines d on d.id=l.discipline_id where t.project_id=$1 and d.code='Civil' limit 1",[id,source.project_type_id])).rows[0]
      await db.query("update project_phase_team set spm_user_id=$3,status='pending',assigned_disciplines=array['Civil'],response_deadline_at=now()-interval '1 hour' where project_id=$1 and project_stage_id=$2",[id,stage.project_stage_id,old.id])
      const target=(await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,is_coordinator,created_by) values($1,$2,$3,array['Civil'],true,$4) returning id",[id,stage.project_stage_id,old.id,reviewer])).rows[0]
      const other=(await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,created_by) values($1,$2,$3,array['Structural'],$4) returning id",[id,stage.project_stage_id,peer.id,reviewer])).rows[0]
      await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,'{\"assignmentHold\":true}') on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata",[held.id])
      const path=`/projects/${id}/reassignment-options?phase=${encodeURIComponent(stage.code)}&userId=${old.id}`
      let options=await api(path)
      assert.equal(options.canReassign,true)
      assert.ok(options.candidates.some(person=>person.id===replacement.id),JSON.stringify(options))
      assert.ok(!options.candidates.some(person=>[old.id,peer.id,held.id].includes(person.id)))
      const request=()=>api(`/projects/${id}/reassign-offer`,{method:'POST',json:{phase:stage.code,userId:old.id,newUserId:replacement.id,version:options.version,note:'No response after the deadline; contact attempt recorded.'}})
      await db.query("update project_phase_team set response_deadline_at=now()+interval '1 day' where project_id=$1 and project_stage_id=$2",[id,stage.project_stage_id])
      await assert.rejects(request(),error=>error.status===409,'stale suggestions are rejected')
      options=await api(path)
      assert.equal(options.canReassign,false)
      await assert.rejects(request(),error=>error.status===409,'pending offers cannot be replaced before the deadline')
      await db.query("update project_phase_team set response_deadline_at=now()-interval '1 hour' where project_id=$1 and project_stage_id=$2",[id,stage.project_stage_id])
      options=await api(path)
      await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,'{\"assignmentHold\":true}') on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata",[replacement.id])
      await assert.rejects(request(),error=>error.status===422,'eligibility is rechecked at confirmation')
      await db.query("update workspace_account_metadata set metadata=metadata||'{\"assignmentHold\":false}' where user_id=$1",[replacement.id])
      await request()
      const saved=(await db.query('select * from project_phase_responsibilities where id=$1',[target.id])).rows[0]
      assert.equal(saved.user_id,replacement.id);assert.equal(saved.status,'pending')
      assert.deepEqual(saved.assigned_disciplines,['Civil'])
      assert.equal(new Date(saved.offer_deadline_at)-new Date(saved.offer_started_at),3*86400000)
      assert.equal((await db.query('select response_deadline_at from project_phase_team where project_id=$1 and project_stage_id=$2',[id,stage.project_stage_id])).rows[0].response_deadline_at,null,'multi-engineer responses use independent windows instead of the legacy shared timer')
      assert.ok(new Date((await db.query('select offer_deadline_at from project_phase_responsibilities where id=$1',[other.id])).rows[0].offer_deadline_at)<new Date(),'peer deadline was not extended')
      assert.ok((await db.query("select id from audit_log where new_values->>'_archive_event'='offer_reassigned' and new_values->>'replacement'=$1",[replacement.id])).rowCount)
      assert.ok((await db.query("select n.recipient_user_id from notification_recipients n join activity_log a on a.id=n.activity_log_id where a.related_project_id=$1 and a.title='Site PM responsibility reassigned' and n.recipient_user_id=$2",[id,replacement.id])).rowCount)
      await assert.rejects(request(),error=>error.status===409,'a repeated request cannot replace a different offer')
      setToken('');await login(old.email,'Password@123',true,'staff')
      await assert.rejects(api(`/projects/${id}/engineer-responsibilities/${target.id}`,{method:'POST',json:{action:'accept'}}),error=>error.status===403,'previous engineer cannot accept the replaced offer')
      await assert.rejects(api(path),error=>error.status===403,'SPMs cannot request management replacement suggestions')
      setToken('');await login(replacement.email,'Password@123',true,'staff')
      await api(`/projects/${id}/engineer-responsibilities/${target.id}`,{method:'POST',json:{action:'accept'}})
      assert.equal((await db.query('select status from project_phase_responsibilities where id=$1',[target.id])).rows[0].status,'confirmed')
      await admin()
      const legacyId=await createProject()
      await db.query("update project_phase_team set status='declined' where project_id=$1",[legacyId])
      await db.query("update project_phase_team set spm_user_id=$3,assigned_disciplines=array['Civil'],response_deadline_at=now()+interval '1 day' where project_id=$1 and project_stage_id=$2",[legacyId,stage.project_stage_id,old.id])
      await db.query("update workspace_account_metadata set metadata=metadata||'{\"assignmentHold\":false}' where user_id=$1",[held.id])
      // The cloned fixture can also assign this person to other phases in the earlier project.
      // Formally release those disposable assignments before expecting cross-project eligibility.
      await db.query("update project_phase_team set status='declined' where spm_user_id=$1 and project_id<>$2",[held.id,legacyId])
      const legacyOptions=await api(`/projects/${legacyId}/reassignment-options?phase=${encodeURIComponent(stage.code)}&userId=${old.id}`)
      assert.equal(legacyOptions.canReassign,true,'a decline allows immediate reassignment before the deadline')
      assert.ok(legacyOptions.candidates.some(person=>person.id===held.id),JSON.stringify(legacyOptions))
      await api(`/projects/${legacyId}/reassign-offer`,{method:'POST',json:{phase:stage.code,userId:old.id,newUserId:held.id,version:legacyOptions.version,note:'Engineer declined the original responsibility.'}})
      const legacySaved=(await db.query('select * from project_phase_team where project_id=$1 and project_stage_id=$2',[legacyId,stage.project_stage_id])).rows[0]
      assert.equal(legacySaved.spm_user_id,held.id);assert.equal(legacySaved.status,'pending');assert.deepEqual(legacySaved.assigned_disciplines,['Civil'])
      assert.ok(new Date(legacySaved.response_deadline_at)>new Date())
    })
  },
)
