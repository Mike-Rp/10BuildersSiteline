import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { api, downloadApiFile, login, setApiBase, setToken } from "../src/api/client.ts"
import { loadState } from "../src/api/load.ts"
import { uploadFile } from "../src/api/actions.ts"
import {
  replacementCandidates,
  replaceCompany,
} from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import { allocationCandidates } from "../src/subcontractor-allocation.ts"
import { locationForCity, LOCATION_CITIES } from "../Thesis-Backend/src/domain/philippine-locations.js"

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const cebu = { region: "Central Visayas", province: "Cebu", city: "Cebu City" }
const codedCebu = locationForCity("0730600000")
const manila = { region: "Metro Manila (NCR)", province: "Metro Manila", city: "Manila" }
const port = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const n = server.address().port
      server.close(() => resolve(n))
    })
  })
test(
  "trade allocation persists through the real API with protected scope, manual consent, capacity and activation gates",
  { timeout: 120000 },
  async (t) => {
    const db = new PGlite({ extensions: { citext } })
    let socket, child
    t.after(async () => {
      if (child) {
        const exited = new Promise((resolve) => child.once("exit", resolve))
        child.kill()
        await exited
      }
      if (socket) await socket.stop()
      await db.close()
    })
    await db.exec(
      "create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;",
    )
    await db.exec(
      fs
        .readFileSync(
          here(
            "../supabase/migrations/20261017000002_thesis_backend_schema.sql",
          ),
          "utf8",
        )
        .replace(/^create extension if not exists pgcrypto.*$/m, ""),
    )
    for (const name of [
      "001-phase-checklists.sql",
      "002-phase-update-confirmation.sql",
      "003-react-integration.sql",
      "004-verified-activity-progress.sql",
      "009-engineer-license-workflow.sql",
      "008-monthly-report-history.sql",
      "010-photo-release.sql",
    ])
      await db.exec(
        fs.readFileSync(here("../Thesis-Backend/migrations/" + name), "utf8"),
      )
    await db.exec(
      fs.readFileSync(here("../supabase/seed/dummy-data.sql"), "utf8"),
    )
    await db.exec(
      "update user_licenses set license_expiry=current_date+400 where superseded_at is null",
    )
    const migration = fs.readFileSync(
      here(
        "../Thesis-Backend/migrations/013-trade-subcontractor-allocation.sql",
      ),
      "utf8",
    )
    await db.exec(migration)
    await db.exec(migration)
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from projects where subcontractor_allocation_version<>0",
        )
      ).rows[0].n,
      0,
      "legacy rows must not be enrolled automatically",
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from pg_indexes where indexname='one_current_subcontractor_selection'",
        )
      ).rows[0].n,
      0,
    )
    const source = (
      await db.query(
        "select p.*,u.email as lead_email,t.spm_user_id from projects p join project_phase_team t on t.project_id=p.id and t.is_lead join users u on u.id=t.spm_user_id where p.name like 'Alden Heights%' limit 1",
      )
    ).rows[0]
    assert.ok(source)
    const projectId = randomUUID()
    // A new intake uses the column default; its data is confined to this disposable database.
    await db.query(
      `insert into projects select (jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Trade allocation test intake','lifecycle_status','spm_review','subcontractor_allocation_version',1))).* from projects p where id=$1`,
      [source.id, projectId],
    )
    await db.query(
      "insert into project_phase_team(project_id,project_stage_id,spm_user_id,is_lead,status) select $2,project_stage_id,spm_user_id,is_lead,'confirmed' from project_phase_team where project_id=$1",
      [source.id, projectId],
    )
    await db.query(
      "insert into project_documents(project_id,document_type_id,status) select $1,id,'uploaded' from document_types where code=any($2::text[])",
      [
        projectId,
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
    await db.query(
      "insert into user_client_project_links(user_id,project_id) select user_id,$2 from user_client_project_links where project_id=$1",
      [source.id, projectId],
    )
    // The legacy seed may not link an actual client to this intake.
    if (
      !(
        await db.query(
          "select 1 from user_client_project_links where project_id=$1",
          [projectId],
        )
      ).rows.length
    )
      await db.query(
        "insert into user_client_project_links(user_id,project_id) select u.id,$1 from users u join roles r on r.id=u.role_id where r.code='client' and u.status='active' limit 1",
        [projectId],
      )
    const companyIds = (
      await db.query(
        "select id from subcontractors where directory_status='approved' order by company_name limit 3",
      )
    ).rows.map((c) => c.id)
    assert.equal(companyIds.length, 3)
    // Free only the test partners' legacy reservations so the acceptance scenarios are independent.
    await db.query(
      "update project_subcontractor_assignments set status='released' where subcontractor_id=any($1::uuid[])",
      [companyIds],
    )
    await db.query(
      "update subcontractor_workers set availability_status='available',current_project_id=null where subcontractor_id=any($1::uuid[])",
      [companyIds],
    )
    const dbPort = await port(),
      apiPort = await port()
    socket = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1" })
    await socket.start()
    child = spawn(process.execPath, ["src/index.js"], {
      cwd: here("../Thesis-Backend/"),
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
        JWT_SECRET: "allocation-test-only-secret-0123456789",
        PORT: String(apiPort),
        HOST: "127.0.0.1",
        ARCHIVE_MAINTENANCE_ENABLED: "false",
      },
      stdio: "ignore",
    })
    setApiBase(`http://127.0.0.1:${apiPort}/api/v1`)
    const until = Date.now() + 30000
    while (true) {
      try {
        if ((await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).ok) break
      } catch {}
      if (Date.now() > until) throw new Error("API did not start")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    async function as(email) {
      setToken("")
      return login(email, "Password@123", true)
    }
    let user = await as("patricia.domingo@10builders.com")
    const historicalLocation = { region: "Old recorded region", province: "Old recorded province", city: "Old recorded city" }
    await db.query("insert into workspace_project_metadata(project_id,metadata) values($1,$2) on conflict(project_id) do update set metadata=workspace_project_metadata.metadata||excluded.metadata", [projectId, JSON.stringify({ siteLocation: historicalLocation })])
    await api(`/projects/${projectId}/workspace`, { method: "PUT", json: { siteLocation: historicalLocation, location: "Existing site address", note: "An unrelated record correction", docs: [] } })
    assert.deepEqual((await db.query("select metadata->'siteLocation' as location from workspace_project_metadata where project_id=$1", [projectId])).rows[0].location, historicalLocation)
    await assert.rejects(api(`/projects/${projectId}/workspace`, { method: "PUT", json: { siteLocation: { ...historicalLocation, city: "A different invented city" }, docs: [] } }), /location catalog/)
    const reviewPath = `/subcontractors/${companyIds[0]}/capabilities`
    await assert.rejects(api(reviewPath, { method: "PUT", json: {} }), error => error.status === 403, "Admin cannot edit capability reviews")
    await assert.rejects(
      api(`/projects/${projectId}/workspace-command`, { method: "POST", json: { type: "auto_allocate_company", allocationRevision: 0 } }),
      /Lead Site PM/,
    )
    const opmEmail = (await db.query("select email from users where id=$1", [source.suggested_opm_id])).rows[0].email
    user = await as(opmEmail)
    await assert.rejects(api(reviewPath, { method: "PUT", json: {} }), error => error.status === 403, "Office PM cannot edit capability reviews")
    const initialClient = (await db.query("select u.email from users u join user_client_project_links l on l.user_id=u.id where l.project_id=$1 limit 1", [projectId])).rows[0].email
    user = await as(initialClient)
    await assert.rejects(api(reviewPath, { method: "PUT", json: {} }), error => error.status === 403, "Clients cannot edit capability reviews")
    user = await as(source.lead_email)
    const disciplines = (
      await db.query("select code from disciplines order by code")
    ).rows.map((d) => d.code)
    const suggestedId = randomUUID(), proposedDisciplines = disciplines.slice(0, 3)
    const foremen = [{ name: "Juan Dela Cruz", phone: "09171234567" }, { name: "Maria Santos", phone: "09181234567" }]
    const suggestion = { id: suggestedId, name: "Company with proposed trades", email: "proposedtrades@gmail.com", contact: "Untrusted legacy alias", phone: "09999999999", foremen, operatingLocation: codedCebu, proposedDisciplines, documents: [], manpowerDocuments: [] }
    const invalidLocationId = randomUUID()
    await assert.rejects(api("/subcontractors/registrations", { method: "POST", json: { ...suggestion, id: invalidLocationId, operatingLocation: { ...codedCebu, psgcCode: "1380600000" } } }), /location catalog/)
    assert.equal((await db.query("select 1 from subcontractors where id=$1", [invalidLocationId])).rowCount, 0, "invalid geographic combinations do not create a partial company")
    const invalidForemanId = randomUUID()
    await assert.rejects(api("/subcontractors/registrations", { method: "POST", json: { ...suggestion, id: invalidForemanId, foremen: [foremen[0], { name: "Incomplete backup", phone: "" }] } }), /11-digit mobile/)
    assert.equal((await db.query("select id from subcontractors where id=$1", [invalidForemanId])).rows.length, 0, "invalid contacts must not partially create a company")
    await assert.rejects(api("/subcontractors/registrations", { method: "POST", json: { ...suggestion, proposedDisciplines: ["Invented trade"] } }), /configured discipline catalog/)
    await api("/subcontractors/registrations", { method: "POST", json: suggestion })
    let proposalState = await loadState(user), suggested = proposalState.companies.find(company => company.id === suggestedId)
    assert.deepEqual(suggested.proposedDisciplines, proposedDisciplines)
    assert.deepEqual(suggested.foremen, foremen, "both foremen must survive an API reload")
    assert.deepEqual(suggested.operatingLocation, codedCebu, "selected location code persists without becoming reviewed")
    assert.equal(suggested.contact, foremen[0].name)
    assert.equal(suggested.phone, foremen[0].phone, "the primary foreman is the authoritative company contact")
    assert.equal(suggested.capabilityReview, undefined, "a proposal must not become a verified capability review")
    assert.equal(suggested.status, "pending")
    assert.equal(allocationCandidates(proposalState, proposalState.projects.find(p => p.id === projectId)).find(c => c.id === suggestedId).reviewed, false)
    const proofId = randomUUID()
    await uploadFile(proofId, new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6L8AAAAASUVORK5CYII=", "base64")], "trade-proof.png", { type: "image/png" }))
    const proofPath = `/subcontractors/${suggestedId}/supporting-documents`
    await api(proofPath, { method: "POST", json: { doc: { id: proofId, name: "Untrusted client filename" } } })
    await api(proofPath, { method: "POST", json: { doc: { id: proofId } } })
    proposalState = await loadState(user); suggested = proposalState.companies.find(company => company.id === suggestedId)
    assert.equal(suggested.documents.length, 1, "a retried proof upload does not duplicate company records")
    assert.equal(suggested.documents[0].name, "trade-proof.png", "stored file metadata is authoritative")
    await assert.rejects(api(`/subcontractors/${companyIds[0]}/supporting-documents`, { method: "POST", json: { doc: { id: proofId } } }), /already linked/)
    await api(`/subcontractors/${suggestedId}/capabilities`, { method: "PUT", json: { disciplines: proposedDisciplines, unavailable: false, documentIds: [proofId], note: "Site PM reviewed the company records for these trades." } })
    suggested = (await loadState(user)).companies.find(company => company.id === suggestedId)
    assert.deepEqual(suggested.capabilityReview.disciplines, proposedDisciplines)
    assert.equal(suggested.status, "pending", "capability verification must not approve the company")
    user = await as("patricia.domingo@10builders.com")
    const pendingCompany = (await loadState(user)).companies.find(company => company.id === suggestedId)
    await api(`/subcontractors/${suggestedId}/workspace`, { method: "PUT", json: { ...pendingCompany, foremen: undefined, contact: "Attempted legacy alias change", phone: "09999999999", note: "Company registration reviewed" } })
    const preservedCompany = (await loadState(user)).companies.find(company => company.id === suggestedId)
    assert.deepEqual(preservedCompany.foremen, foremen, "general company updates must preserve both stored foremen")
    assert.equal(preservedCompany.phone, foremen[0].phone)
    await assert.rejects(api(`/subcontractors/${suggestedId}/workspace`, { method: "PUT", json: { ...preservedCompany, foremen: [foremen[0], { name: "Incomplete backup", phone: "" }] } }), /11-digit mobile/)
    await assert.rejects(api("/subcontractors/registrations", { method: "POST", json: { ...suggestion, id: randomUUID() } }), error => error.status === 403)
    await assert.rejects(api(proofPath, { method: "POST", json: { doc: { id: proofId } } }), error => error.status === 403)
    user = await as(opmEmail)
    await assert.rejects(api(proofPath, { method: "POST", json: { doc: { id: proofId } } }), error => error.status === 403)
    user = await as(source.lead_email)
    const supportingFileIds = []
    for (const id of companyIds) {
      user = await as("patricia.domingo@10builders.com")
      const fileId = randomUUID()
      supportingFileIds.push(fileId)
      await uploadFile(
        fileId,
        new File(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6L8AAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          "company-record.png",
          { type: "image/png" },
        ),
      )
      await db.query(
        "insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2) on conflict(subcontractor_id) do update set metadata=excluded.metadata",
        [
          id,
          JSON.stringify({
            documents: [
              { id: fileId, uploaded: true, name: "company-record.png" },
            ],
          }),
        ],
      )
      await db.query("update stored_files set purpose='company' where id=$1", [fileId])
      user = await as(source.lead_email)
      assert.ok(await downloadApiFile(fileId), "Site PM can preview an approved company's supporting record uploaded by Admin")
      await api(`/subcontractors/${id}/capabilities`, {
        method: "PUT",
        json: {
          disciplines,
          operatingLocation: cebu,
          unavailable: false,
          documentIds: [fileId],
          note: "Reviewed the supporting company capability records in this test.",
        },
      })
      const saved = (
        await db.query(
          "select metadata->'capabilityReview' as review from workspace_company_metadata where subcontractor_id=$1",
          [id],
        )
      ).rows[0].review
      assert.equal(saved.reviewedById, user.id)
      assert.notEqual(saved.reviewedAt, "")
    }
    user = await as("patricia.domingo@10builders.com")
    const adminState = await loadState(user), reviewedCompany = adminState.companies.find(c => c.id === companyIds[0])
    await api(`/subcontractors/${companyIds[0]}/workspace`, { method: "PUT", json: { ...reviewedCompany, capabilityReview: { ...reviewedCompany.capabilityReview, note: "Attempted Admin overwrite", disciplines: [] } } })
    assert.equal((await db.query("select metadata->'capabilityReview'->>'note' as note from workspace_company_metadata where subcontractor_id=$1", [companyIds[0]])).rows[0].note, "Reviewed the supporting company capability records in this test.", "Admin's general company update cannot bypass capability permissions")
    user = await as(initialClient)
    assert.equal(await downloadApiFile(supportingFileIds[0]), undefined, "Company capability documents remain unavailable to clients")
    user = await as(opmEmail)
    assert.ok(await downloadApiFile(supportingFileIds[0]), "Office PM can view an approved company record without permission to edit its review")
    user = await as(source.lead_email)
    await assert.rejects(
      api(`/subcontractors/${companyIds[0]}/capabilities`, {
        method: "PUT",
        json: {},
      }),
      /Select verified disciplines/,
    )
    const command = (json) =>
      api(`/projects/${projectId}/workspace-command`, { method: "POST", json })
    await assert.rejects(command({ type: "auto_allocate_company", allocationRevision: 0 }), /No complete eligible team/)
    await assert.rejects(command({ type: "set_allocation_location", allocationRevision: 0, siteLocation: { ...codedCebu, region: "Metro Manila (NCR)" } }), /location catalog/)
    await command({ type: "set_allocation_location", allocationRevision: 0, siteLocation: cebu })
    const outsideId = companyIds[1]
    const localReview = (await db.query("select metadata->'capabilityReview' as review from workspace_company_metadata where subcontractor_id=$1", [outsideId])).rows[0].review
    await api(`/subcontractors/${outsideId}/capabilities`, { method: "PUT", json: { ...localReview, operatingLocation: manila } })
    await command({ type: "auto_allocate_company", allocationRevision: 0 })
    let state = await loadState(user),
      project = state.projects.find((p) => p.id === projectId),
      plan = project.subcontractorAllocation
    assert.deepEqual(project.siteLocation, cebu)
    assert.ok(!plan.companyIds.includes(outsideId), "automatic allocation excludes a reviewed outside-area company")
    await assert.rejects(command({ type: "save_allocation_plan", allocationRevision: 1, plan: replaceCompany(plan, plan.companyIds[0], outsideId) }), /Outside project operating area/)
    await api(`/subcontractors/${outsideId}/capabilities`, { method: "PUT", json: { ...localReview, operatingLocation: cebu } })
    assert.equal(plan.companyIds.length, 2)
    assert.equal(project.subcontractorAllocationVersion, 1)
    assert.equal(
      project.workflow.selections.filter((s) => s.status === "selected").length,
      2,
      "proposed status maps to frontend selected",
    )
    const acceptedId = plan.companyIds[0],
      declinedId = plan.companyIds[1]
    await assert.rejects(
      command({
        type: "respond_company",
        companyId: acceptedId,
        accepted: true,
        allocationRevision: 1,
        note: "No contact yet",
      }),
      /Contact this company first/,
    )
    await command({
      type: "contact_company",
      companyId: acceptedId,
      allocationRevision: 1,
      note: "Contacted representative by phone",
    })
    await assert.rejects(command({ type: "set_allocation_location", allocationRevision: 2, siteLocation: manila }), /locked/)
    const acceptedReview = (await db.query("select metadata->'capabilityReview' as review from workspace_company_metadata where subcontractor_id=$1", [acceptedId])).rows[0].review
    await assert.rejects(api(`/subcontractors/${acceptedId}/capabilities`, { method: "PUT", json: { ...acceptedReview, operatingLocation: manila } }), /still needs this operating area/)
    const concurrent = await Promise.allSettled(
      [1, 2].map(() =>
        command({
          type: "respond_company",
          companyId: acceptedId,
          accepted: true,
          allocationRevision: 2,
          note: "Representative accepted this scope",
        }),
      ),
    )
    assert.equal(
      concurrent.filter((r) => r.status === "fulfilled").length,
      1,
      "concurrent duplicate acceptance is recorded once",
    )
    await command({
      type: "contact_company",
      companyId: declinedId,
      allocationRevision: 3,
      note: "Contacted second company",
    })
    await command({
      type: "respond_company",
      companyId: declinedId,
      accepted: false,
      allocationRevision: 4,
      note: "Company declined because of scheduling",
    })
    state = await loadState(user)
    project = state.projects.find((p) => p.id === projectId)
    plan = project.subcontractorAllocation
    assert.equal(
      project.status,
      "pending",
      "company acceptance alone must not activate",
    )
    assert.equal(
      state.companies.find((c) => c.id === acceptedId).commitmentCount,
      1,
      "accepted intake reserves a slot before activation",
    )
    await assert.rejects(
      command({
        type: "auto_allocate_company",
        companyId: acceptedId,
        allocationRevision: 5,
      }),
      /locked/,
    )
    const alternative = replacementCandidates(
      plan,
      declinedId,
      allocationCandidates(state, project),
    )[0]
    assert.ok(alternative)
    const changed = replaceCompany(plan, declinedId, alternative.id)
    await assert.rejects(
      command({
        type: "save_allocation_plan",
        plan: changed,
        allocationRevision: 2,
      }),
      /allocation changed/,
    )
    await command({
      type: "auto_allocate_company",
      companyId: declinedId,
      allocationRevision: 5,
    })
    state = await loadState(user)
    project = state.projects.find((p) => p.id === projectId)
    assert.deepEqual(
      project.subcontractorAllocation.coverage.filter(
        (r) => r.companyId === acceptedId,
      ),
      plan.coverage.filter((r) => r.companyId === acceptedId),
    )
    assert.equal(
      project.workflow.selections.find((s) => s.companyId === declinedId)
        .status,
      "declined",
    )
    const replacementId = project.subcontractorAllocation.companyIds.find(
      (id) => id !== acceptedId,
    )
    await command({
      type: "contact_company",
      companyId: replacementId,
      allocationRevision: 6,
      note: "Replacement contacted",
    })
    // A second commitment elsewhere is allowed; a third must be refused even if capacity changed after contact.
    const otherProjects = (
      await db.query(
        "select id from projects where id<>$1 and lifecycle_status<>'archived' order by id limit 2",
        [projectId],
      )
    ).rows.map((p) => p.id)
    for (const id of otherProjects)
      await db.query(
        "insert into project_subcontractor_selections(project_id,subcontractor_id,status) values($1,$2,'accepted') on conflict(project_id,subcontractor_id) do update set status='accepted'",
        [id, replacementId],
      )
    await assert.rejects(
      command({
        type: "respond_company",
        companyId: replacementId,
        accepted: true,
        allocationRevision: 7,
        note: "Accepted after a capacity change",
      }),
      /Two project commitments/,
    )
    await db.query(
      "delete from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2",
      [otherProjects[1], replacementId],
    )
    await command({
      type: "respond_company",
      companyId: replacementId,
      accepted: true,
      allocationRevision: 7,
      note: "Capacity confirmed and scope accepted",
    })
    const docId = randomUUID()
    await uploadFile(
      docId,
      new File(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6L8AAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        "all-company-agreements.png",
        { type: "image/png" },
      ),
    )
    await assert.rejects(
      command({
        type: "upload_agreement",
        allocationRevision: 7,
        doc: { id: docId },
      }),
      /allocation changed/,
    )
    await command({
      type: "upload_agreement",
      allocationRevision: 8,
      doc: { id: docId },
    })
    const assignments = (
      await db.query(
        "select subcontractor_id,worker_count from project_subcontractor_assignments where project_id=$1 and status='active'",
        [projectId],
      )
    ).rows
    assert.equal(assignments.length, 2)
    assert.equal(
      assignments.every((a) => a.worker_count === 0),
      true,
    )
    assert.equal(
      (
        await db.query("select lifecycle_status from projects where id=$1", [
          projectId,
        ])
      ).rows[0].lifecycle_status,
      "active",
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from subcontractor_workers where current_project_id=$1",
          [projectId],
        )
      ).rows[0].n,
      0,
      "activation must not allocate individual workers",
    )
    await assert.rejects(
      command({
        type: "release_allocation_company",
        companyId: acceptedId,
        allocationRevision: 8,
        note: "Too early",
      }),
      /future phase scope/,
    )
    await db.query(
      "update projects set current_stage_id=(select id from project_stages where code='Design') where id=$1",
      [projectId],
    )
    await command({
      type: "release_allocation_company",
      companyId: replacementId,
      allocationRevision: 8,
      note: "Mobilization scope is complete; formally released by the Lead.",
    })
    assert.equal(
      (
        await db.query(
          "select status from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2",
          [projectId, replacementId],
        )
      ).rows[0].status,
      "archived",
    )
    state = await loadState(user)
    assert.equal(
      state.companies.find((c) => c.id === replacementId).commitmentCount,
      1,
      "formal release frees this project's slot and keeps the other project's reservation",
    )
    await db.exec(migration)
    assert.equal(
      (
        await db.query(
          "select subcontractor_allocation_version from projects where id=$1",
          [projectId],
        )
      ).rows[0].subcontractor_allocation_version,
      1,
      "rerunning migration must retain new plans",
    )
    const commercialId = randomUUID()
    await db.query(
      `insert into projects select (jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Three-company commercial test','project_type_id',(select id from project_types where code='Commercial'),'lifecycle_status','spm_review','subcontractor_allocation_version',1))).* from projects p where id=$1`,
      [source.id, commercialId],
    )
    await db.query(
      `insert into project_phase_team(project_id,project_stage_id,spm_user_id,is_lead,status)
    select $1,pts.project_stage_id,$2,s.code='Mobilization','confirmed' from project_type_stages pts join project_stages s on s.id=pts.project_stage_id
    where pts.project_type_id=(select id from project_types where code='Commercial')`,
      [commercialId, source.spm_user_id],
    )
    await db.query(
      "insert into project_documents(project_id,document_type_id,status) select $2,document_type_id,'uploaded' from project_documents where project_id=$1 and document_type_id in(select id from document_types where code<>'subcontractor_agreement')",
      [projectId, commercialId],
    )
    await db.query(
      "insert into user_client_project_links(user_id,project_id) select user_id,$2 from user_client_project_links where project_id=$1",
      [projectId, commercialId],
    )
    const commercialCommand = (json) =>
      api(`/projects/${commercialId}/workspace-command`, {
        method: "POST",
        json,
      })
    const preciseSite = { ...cebu, coordinates: { latitude: 10.3157, longitude: 123.8854 } }
    await assert.rejects(commercialCommand({ type: "set_allocation_location", allocationRevision: 0, siteLocation: { ...cebu, coordinates: { latitude: 10 } } }), /longitude/)
    await commercialCommand({ type: "set_allocation_location", allocationRevision: 0, siteLocation: preciseSite })
    const nearbyCompanyId = companyIds[1]
    const nearbyReview = (await db.query("select metadata->'capabilityReview' as review from workspace_company_metadata where subcontractor_id=$1", [nearbyCompanyId])).rows[0].review
    const mandaue = locationForCity(LOCATION_CITIES.find(city => city.name.includes("Mandaue")).code)
    const preciseBase = { ...mandaue, coordinates: { latitude: 10.3158, longitude: 123.8855 } }
    const reviewedCoverage = [{ scope: "city", location: codedCebu }]
    await assert.rejects(api(`/subcontractors/${nearbyCompanyId}/capabilities`, { method: "PUT", json: { ...nearbyReview, operatingLocation: preciseBase, serviceAreas: [{ scope: "province", location: mandaue }] } }), /Independent cities/)
    await api(`/subcontractors/${nearbyCompanyId}/capabilities`, { method: "PUT", json: { ...nearbyReview, operatingLocation: preciseBase, serviceAreas: reviewedCoverage } })
    await commercialCommand({
      type: "auto_allocate_company",
      allocationRevision: 0,
      plan: { companyIds: [], coverage: [] }, // An auto request cannot supply its own ranking/plan.
    })
    state = await loadState(user)
    const commercial = state.projects.find((p) => p.id === commercialId)
    assert.deepEqual(commercial.siteLocation, preciseSite)
    const reloadedCompany = state.companies.find(company => company.id === nearbyCompanyId)
    assert.deepEqual(reloadedCompany.capabilityReview.operatingLocation, preciseBase)
    assert.deepEqual(reloadedCompany.capabilityReview.serviceAreas, reviewedCoverage)
    assert.equal(commercial.subcontractorAllocation.companyIds[0], nearbyCompanyId, "Known distance ranks before area-only fallback, across city boundaries with reviewed coverage")
    const previewCandidates = allocationCandidates(state, commercial)
    assert.equal(previewCandidates.find(company => company.id === nearbyCompanyId).locationIssue, "")
    assert.ok(previewCandidates.find(company => company.id === nearbyCompanyId).proximity.distanceKm < 0.1)
    assert.equal(commercial.subcontractorAllocation.companyIds.length, 3)
    let revision = 1
    for (const id of commercial.subcontractorAllocation.companyIds) {
      await commercialCommand({
        type: "contact_company",
        companyId: id,
        allocationRevision: revision++,
        note: "Commercial scope reviewed with representative",
      })
      await commercialCommand({
        type: "respond_company",
        companyId: id,
        accepted: true,
        allocationRevision: revision++,
        note: "Company accepted commercial scope",
      })
    }
    await assert.rejects(commercialCommand({ type: "set_allocation_location", allocationRevision: revision, siteLocation: { ...preciseSite, coordinates: { latitude: 10.33, longitude: 123.89 } } }), /locked/)
    user = await as("patricia.domingo@10builders.com")
    await assert.rejects(api(`/projects/${commercialId}/workspace`, { method: "PUT", json: { siteLocation: { ...preciseSite, coordinates: { latitude: 10.33, longitude: 123.89 } }, docs: [] } }), /locked/, "Admin cannot bypass the contacted-site lock by moving coordinates within the same city")
    user = await as(source.lead_email)
    await assert.rejects(api(`/subcontractors/${nearbyCompanyId}/capabilities`, { method: "PUT", json: { ...nearbyReview, operatingLocation: preciseBase, serviceAreas: [] } }), /still needs this operating area/)
    const afterContact = (await loadState(user)).projects.find(project => project.id === commercialId)
    assert.deepEqual(afterContact.subcontractorAllocation.companyIds, commercial.subcontractorAllocation.companyIds, "Location checks do not replace contacted or accepted companies")
    const commercialDoc = randomUUID()
    await uploadFile(
      commercialDoc,
      new File(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6L8AAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        "commercial-agreements.png",
        { type: "image/png" },
      ),
    )
    await commercialCommand({
      type: "upload_agreement",
      allocationRevision: revision,
      doc: { id: commercialDoc },
    })
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from project_subcontractor_assignments where project_id=$1 and status='active'",
          [commercialId],
        )
      ).rows[0].n,
      3,
      "activation must assign every accepted company, not just the first",
    )
    const clientEmail = (
      await db.query(
        "select u.email from users u join user_client_project_links l on l.user_id=u.id where l.project_id=$1 limit 1",
        [projectId],
      )
    ).rows[0].email
    user = await as(clientEmail)
    const clientState = await loadState(user)
    assert.equal(
      clientState.projects.find((p) => p.id === projectId)
        .subcontractorAllocation,
      undefined,
      "internal scopes and responses must not leak to clients",
    )
    assert.equal(clientState.companies.length, 0)
  },
)
