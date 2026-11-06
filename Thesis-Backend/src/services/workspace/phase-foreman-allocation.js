import { HttpError, isUuid } from "../../common/utilities/access.utility.js"
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js"
import {
  allocationContext,
  COMMITMENTS_SQL,
} from "./subcontractor-allocation.utility.js"
import {
  validatePhaseAssignments,
  changedCompanies,
} from "../../domain/phase-foreman-allocation.js"
import { createHash } from "node:crypto"
const fail = (message) => {
  throw new HttpError(409, message)
}
async function log(db, p, user, action, detail = {}, requestId = null) {
  await db.query(
    "insert into project_allocation_events(project_id,request_id,actor_id,action,detail) values($1,$2,$3,$4,$5)",
    [p.id, requestId, user.id, action, JSON.stringify(detail)],
  )
}
async function context(db, p, meta) {
  const ctx = await allocationContext(db, p)
  const contactRows = []
  const contactMetadata = []
  for (const c of ctx.companies) {
    const contacts = (c.metadata?.foremen || []).filter(
      (f) => f?.name && f?.phone,
    )
    c.foremen = []
    for (const f of contacts) {
      const hex = createHash("md5")
        .update(`${c.id}:${f.phone}:${f.name}`)
        .digest("hex")
      const saved = {
        id: isUuid(f.id)
          ? f.id
          : hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
        name: f.name,
        phone: f.phone,
      }
      contactRows.push({
        id: saved.id,
        company_id: c.id,
        full_name: f.name,
        phone: f.phone,
      })
      c.foremen.push(saved)
    }
    if (contacts.some((f) => !isUuid(f.id)))
      contactMetadata.push({
        company_id: c.id,
        prior: c.metadata.foremen,
        next: c.metadata.foremen.map((f) => {
          const saved = c.foremen.find(
            (v) => v.name === f.name && v.phone === f.phone,
          )
          return saved ? { ...f, id: saved.id } : f
        }),
      })
  }
  if (contactRows.length)
    await db.query(
      `insert into company_foreman_contacts(id,company_id,full_name,phone)
    select distinct id,company_id,full_name,phone from jsonb_to_recordset($1::jsonb) as c(id uuid,company_id uuid,full_name text,phone text) on conflict(id) do nothing`,
      [JSON.stringify(contactRows)],
    )
  if (contactRows.length) {
    const foreign = (
      await db.query(
        `select 1 from company_foreman_contacts f join jsonb_to_recordset($1::jsonb) as c(id uuid,company_id uuid) on c.id=f.id where c.company_id<>f.company_id limit 1`,
        [JSON.stringify(contactRows)],
      )
    ).rowCount
    if (foreign)
      fail(
        "A foreman contact identity belongs to a different company. Ask Admin to correct the directory contact.",
      )
    await db.query(
      `update company_foreman_contacts f set full_name=c.full_name,phone=c.phone from jsonb_to_recordset($1::jsonb) as c(id uuid,company_id uuid,full_name text,phone text)
      where f.id=c.id and f.company_id=c.company_id and (f.full_name,f.phone) is distinct from (c.full_name,c.phone)`,
      [JSON.stringify(contactRows)],
    )
  }
  if (contactMetadata.length)
    await db.query(
      `update workspace_company_metadata m set metadata=jsonb_set(m.metadata,'{foremen}',c.next)
    from jsonb_to_recordset($1::jsonb) as c(company_id uuid,prior jsonb,next jsonb) where m.subcontractor_id=c.company_id and m.metadata->'foremen'=c.prior`,
      [JSON.stringify(contactMetadata)],
    )
  let completed = []
  if (p.lifecycle_status === "active") {
    const current = (
      await db.query("select code from project_stages where id=$1", [
        p.current_stage_id,
      ])
    ).rows[0]?.code
    const index = ctx.phases.findIndex((v) => v.name === current)
    if (index < 0)
      fail(
        "The current phase is not configured. Ask Admin to review the project workflow.",
      )
    completed = ctx.phases.slice(0, index).map((v) => v.name)
  } else if (p.lifecycle_status === "archived")
    completed = ctx.phases.map((v) => v.name)
  const assignments = (
    await db.query(
      'select phase,company_id as "companyId",foreman_id as "foremanId",foreman_name as "foremanName",foreman_phone as "foremanPhone" from project_phase_foremen where project_id=$1 order by phase',
      [p.id],
    )
  ).rows
  const otherAssignments = (
    await db.query(
      `select f.foreman_id,count(distinct f.project_id)::int as n from project_phase_foremen f
    join projects p on p.id=f.project_id join project_subcontractor_selections s on s.project_id=f.project_id and s.subcontractor_id=f.company_id and s.status='accepted'
    where f.project_id<>$1 and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false) group by f.foreman_id`,
      [p.id],
    )
  ).rows
  for (const c of ctx.companies)
    for (const f of c.foremen)
      f.otherProjectCount =
        otherAssignments.find((v) => v.foreman_id === f.id)?.n || 0
  const requests = (
    await db.query(
      `select r.*,u.full_name as requested_by_name,v.full_name as reviewed_by_name from project_allocation_requests r
    join users u on u.id=r.requested_by left join users v on v.id=r.reviewed_by where project_id=$1 order by id desc limit 50`,
      [p.id],
    )
  ).rows
  return {
    ...ctx,
    completed,
    remaining: ctx.phases.filter((v) => !completed.includes(v.name)),
    assignments,
    requests,
    revision: meta.subcontractorAllocation?.revision || 0,
  }
}
async function capacity(db, ids, p, extra = []) {
  await db.query(
    "select id from subcontractors where id=any($1::uuid[]) order by id for update",
    [[...new Set([...ids, ...extra])].sort()],
  )
  for (const id of ids) {
    const n = (
      await db.query(
        `select count(*)::int as n from (${COMMITMENTS_SQL}) x join projects p on p.id=x.project_id
      where x.subcontractor_id=$1 and x.project_id<>$2 and not coalesce(p.is_deleted,false) and p.lifecycle_status<>'archived'`,
        [id, p.id],
      )
    ).rows[0].n
    if (n >= 2)
      fail(
        "A selected company already has two project commitments. Choose another company.",
      )
  }
}
async function releaseIncoming(db, p, request, meta) {
  const existing = request.existing_company_ids || []
  const incoming = [
    ...new Set(request.proposal.map((r) => r.companyId)),
  ].filter((id) => !existing.includes(id))
  if (incoming.length)
    await db.query(
      "update project_subcontractor_selections set status='replaced' where project_id=$1 and subcontractor_id=any($2::uuid[]) and status in ('proposed','contacted','accepted')",
      [p.id, incoming],
    )
}
export function registerPhaseAllocationRoutes(
  router,
  { endpoint, project, event },
) {
  router.get(
    "/allocation-requests",
    endpoint(
      ["admin"],
      async (db) =>
        (
          await db.query(`select r.*,p.name as project_name,u.full_name as requested_by_name
    from project_allocation_requests r join projects p on p.id=r.project_id join users u on u.id=r.requested_by
    where not coalesce(p.is_deleted,false) order by (r.status='pending_admin') desc,r.requested_at desc limit 100`)
        ).rows,
    ),
  )
  router.get(
    "/subcontractors/:id/phase-assignments",
    endpoint(["admin", "opm", "spm"], async (db, user, req) => {
      if (!isUuid(req.params.id))
        throw new HttpError(400, "Invalid company ID.")
      return (
        await db.query(
          `select f.*,p.name as project_name,p.lifecycle_status from project_phase_foremen f join projects p on p.id=f.project_id
      where f.company_id=$1 and not coalesce(p.is_deleted,false) and ($2::text='admin' or p.suggested_opm_id=$3 or exists(select 1 from project_phase_team t where t.project_id=p.id and t.spm_user_id=$3))
      order by p.name,f.phase`,
          [req.params.id, user.role, user.id],
        )
      ).rows
    }),
  )
  router.get(
    "/projects/:id/phase-allocation",
    endpoint(["admin", "opm", "spm"], async (db, user, req) => {
      const p = await project(db, user, req.params.id)
      const meta =
        (
          await db.query(
            "select metadata from workspace_project_metadata where project_id=$1",
            [p.id],
          )
        ).rows[0]?.metadata || {}
      const ctx = await context(db, p, meta)
      const lead = (
        await db.query(
          "select spm_user_id from project_phase_team where project_id=$1 and is_lead order by project_stage_id limit 1",
          [p.id],
        )
      ).rows[0]?.spm_user_id
      const history = (
        await db.query(
          `select e.*,u.full_name as actor_name from project_allocation_events e join users u on u.id=e.actor_id where project_id=$1 order by e.id desc limit 100`,
          [p.id],
        )
      ).rows
      return {
        phases: ctx.phases,
        completed: ctx.completed,
        assignments: ctx.assignments,
        legacyCompanies:
          meta.subcontractorAllocation &&
          !meta.subcontractorAllocation.phaseOwned
            ? meta.subcontractorAllocation.companyIds.map((id) => ({
                id,
                name:
                  ctx.companies.find((c) => c.id === id)?.name ||
                  "Company record",
                status:
                  ctx.selections.find((s) => s.companyId === id)?.status ||
                  "recorded",
                phases: [
                  ...new Set(
                    meta.subcontractorAllocation.coverage
                      .filter((r) => r.companyId === id)
                      .map((r) => r.phase),
                  ),
                ],
              }))
            : [],
        requests: ctx.requests,
        revision: ctx.revision,
        history,
        canEdit:
          user.role === "spm" &&
          user.id === lead &&
          ["spm_review", "active"].includes(p.lifecycle_status) &&
          !meta.clientSubcon,
        companies: ctx.companies.map(
          ({
            id,
            name,
            status,
            disciplines,
            reviewed,
            unavailable,
            commitments,
            foremen,
          }) => ({
            id,
            name,
            status,
            disciplines,
            reviewed,
            unavailable,
            commitments,
            foremen,
            contactPhone: foremen[0]?.phone || "",
            declinedForProject:
              ctx.selections.some(
                (s) => s.companyId === id && s.status === "declined",
              ) ||
              ctx.requests.find((r) => r.responses[id]?.status)?.responses[id]
                ?.status === "declined",
          }),
        ),
      }
    }),
  )
  router.post(
    "/projects/:id/phase-allocation",
    endpoint(["admin", "spm"], async (db, user, req) => {
      const p = await project(db, user, req.params.id, true),
        b = req.body
      if (!["spm_review", "active"].includes(p.lifecycle_status))
        fail("This project is not open for allocation changes.")
      const meta =
        (
          await db.query(
            "select metadata from workspace_project_metadata where project_id=$1",
            [p.id],
          )
        ).rows[0]?.metadata || {}
      if (meta.clientSubcon)
        fail(
          "Client-nominated subcontractors retain their existing review workflow.",
        )
      const lead = (
        await db.query(
          "select spm_user_id from project_phase_team where project_id=$1 and is_lead order by project_stage_id limit 1",
          [p.id],
        )
      ).rows[0]?.spm_user_id
      const admin = user.role === "admin"
      if (!["approve", "reject"].includes(b.action)) {
        if (user.role !== "spm" || user.id !== lead)
          throw new HttpError(
            403,
            "Only the assigned Lead Site PM can manage phase allocations.",
          )
        await assertLicenseActive(user, db)
      } else if (!admin)
        throw new HttpError(
          403,
          "Only Admin can approve or reject allocation requests.",
        )
      if (typeof b.note !== "string" || !b.note.trim() || b.note.length > 2000)
        throw new HttpError(
          400,
          "Enter a reason or response note using 2000 characters or fewer.",
        )
      const ctx = await context(db, p, meta)
      if (["draft", "submit"].includes(b.action)) {
        const draft = ctx.requests.find(
          (r) => r.status === "draft" && Number(r.id) === b.requestId,
        )
        if (
          ctx.requests.some(
            (r) =>
              ["draft", "pending_admin", "approved"].includes(r.status) &&
              r !== draft,
          )
        )
          fail("Finish or cancel the open allocation request first.")
        if (b.revision !== ctx.revision)
          fail("The project allocation changed. Reload before continuing.")
        let proposal
        try {
          proposal = validatePhaseAssignments(
            ctx.remaining,
            b.assignments,
            ctx.companies,
            { draft: b.action === "draft" },
          )
        } catch (e) {
          throw new HttpError(400, e.message)
        }
        if (!proposal.length) fail("There are no remaining phases to allocate.")
        const ids = [
          ...new Set(proposal.map((r) => r.companyId).filter(Boolean)),
        ]
        await capacity(db, ids, p)
        try {
          validatePhaseAssignments(
            ctx.remaining,
            proposal,
            (await context(db, p, meta)).companies,
            { draft: b.action === "draft" },
          )
        } catch (e) {
          fail(e.message)
        }
        if (p.lifecycle_status === "spm_review") {
          // Reuse the existing document/team readiness gate without inventing new activation rules.
          const { assertPhaseCoverage } = await import(
            "../projects/phase-coverage.utility.js"
          )
          await assertPhaseCoverage(db, p.id)
          const n = (
            await db.query(
              `select count(*)::int as n from project_documents d join document_types t on t.id=d.document_type_id where d.project_id=$1 and d.status='uploaded' and t.code=any($2::text[])`,
              [
                p.id,
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
          ).rows[0].n
          if (n !== 6)
            fail("Complete all six registered documents before allocation.")
        }
        const activeIds = (
          await db.query(
            "select subcontractor_id as id from project_subcontractor_assignments where project_id=$1 and status='active'",
            [p.id],
          )
        ).rows.map((v) => v.id)
        const oldIds = [
          ...new Set([
            ...activeIds,
            ...ctx.selections
              .filter((s) => ["accepted", "contacted"].includes(s.status))
              .map((s) => s.companyId),
          ]),
        ]
        const scopeChanged=oldIds.length>0&&proposal.some(row=>{
          const previous=ctx.assignments.find(r=>r.phase===row.phase)
          if(previous)return previous.companyId!==row.companyId
          const covered=meta.subcontractorAllocation?.coverage.filter(r=>r.phase===row.phase)||[]
          return covered.length?covered.some(r=>r.companyId!==row.companyId):oldIds.length>1
        })
        const needsApproval = scopeChanged || (
          ids.some((id) => !oldIds.includes(id)) &&
          (oldIds.length > 0 || ids.length > 1))
        const status =
          b.action === "draft"
            ? "draft"
            : needsApproval
              ? "pending_admin"
              : "approved"
        const r = draft
          ? (
              await db.query(
                "update project_allocation_requests set status=$2,proposal=$3,reason=$4 where id=$1 returning *",
                [draft.id, status, JSON.stringify(proposal), b.note.trim()],
              )
            ).rows[0]
          : (
              await db.query(
                "insert into project_allocation_requests(project_id,status,base_revision,proposal,reason,requested_by,existing_company_ids) values($1,$2,$3,$4,$5,$6,$7) returning *",
                [
                  p.id,
                  status,
                  ctx.revision,
                  JSON.stringify(proposal),
                  b.note.trim(),
                  user.id,
                  oldIds,
                ],
              )
            ).rows[0]
        await log(
          db,
          p,
          user,
          "Allocation " + status,
          { proposal, reason: b.note.trim() },
          r.id,
        )
        if (status === "pending_admin")
          await event(
            db,
            user,
            p,
            "Subcontractor allocation approval requested",
            b.note.trim(),
          )
        return r
      }
      if (!Number.isSafeInteger(b.requestId) || b.requestId < 1)
        throw new HttpError(400, "Choose an allocation request.")
      const r = (
        await db.query(
          "select * from project_allocation_requests where id=$1 and project_id=$2 for update",
          [b.requestId, p.id],
        )
      ).rows[0]
      if (!r) throw new HttpError(404, "Allocation request not found.")
      if (b.action === "cancel") {
        if (!["draft", "pending_admin", "approved"].includes(r.status))
          fail("This request is already closed.")
        await releaseIncoming(db, p, r, meta)
        await db.query(
          "update project_allocation_requests set status='cancelled' where id=$1",
          [r.id],
        )
      } else if (["approve", "reject"].includes(b.action)) {
        if (r.status !== "pending_admin")
          fail("Only pending requests can be reviewed.")
        if (r.base_revision !== ctx.revision)
          fail("The allocation changed. Ask the SPM to submit a new request.")
        await db.query(
          "update project_allocation_requests set status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 where id=$1",
          [
            r.id,
            b.action === "approve" ? "approved" : "rejected",
            user.id,
            b.note.trim(),
          ],
        )
        await event(
          db,
          user,
          p,
          "Subcontractor allocation " +
            (b.action === "approve" ? "approved" : "rejected"),
          b.note.trim(),
          [r.requested_by],
        )
      } else if (
        ["contact", "accept", "decline", "confirm"].includes(b.action)
      ) {
        if (r.status !== "approved" || r.base_revision !== ctx.revision)
          fail(
            "Admin approval is required or the allocation has changed. Cancel and resubmit.",
          )
        let proposal = r.proposal
        try {
          if (b.action === "accept" || b.action === "confirm")
            proposal = validatePhaseAssignments(
              ctx.remaining,
              r.proposal,
              ctx.companies,
            )
        } catch (e) {
          fail(e.message)
        }
        const ids = [...new Set(proposal.map((v) => v.companyId))]
        const previous = ctx.assignments.filter(
          (v) => !ctx.completed.includes(v.phase),
        )
        const changed = changedCompanies(previous, proposal).filter((id) =>
          ids.includes(id),
        )
        if (
          meta.subcontractorAllocation &&
          !meta.subcontractorAllocation.phaseOwned
        )
          for (const id of ids) if (!changed.includes(id)) changed.push(id)
        if (b.action !== "confirm") {
          if (!ids.includes(b.companyId) || !changed.includes(b.companyId))
            throw new HttpError(400, "Choose a company with a changed scope.")
          const before = r.responses[b.companyId]?.status
          if (
            b.action === "contact" &&
            !["phone", "message", "meeting", "email"].includes(b.method)
          )
            throw new HttpError(400, "Choose the contact method.")
          if (b.action === "contact" && before && before !== "contacted")
            fail("Contact is already recorded for this scope.")
          if (b.action !== "contact" && before !== "contacted")
            fail("Record contact before the company response.")
          if (b.action === "accept") {
            if (b.availabilityConfirmed !== true)
              fail(
                "Confirm that the company agreed to the scope and availability of all assigned foremen.",
              )
            await capacity(db, ids, p)
            try {
              validatePhaseAssignments(
                ctx.remaining,
                proposal,
                (await context(db, p, meta)).companies,
              )
            } catch (e) {
              fail(e.message)
            }
            await db.query(
              `insert into project_subcontractor_selections(project_id,subcontractor_id,status,contacted_at,responded_at)
            values($1,$2,'accepted',now(),now()) on conflict(project_id,subcontractor_id) do update set status='accepted',responded_at=now()`,
              [p.id, b.companyId],
            )
          }
          r.responses[b.companyId] = {
            ...r.responses[b.companyId],
            method: b.method || r.responses[b.companyId]?.method,
            contactedAt:
              r.responses[b.companyId]?.contactedAt || new Date().toISOString(),
            status:
              b.action === "contact"
                ? "contacted"
                : b.action === "accept"
                  ? "accepted"
                  : "declined",
            note: b.note.trim(),
            by: user.id,
            at: new Date().toISOString(),
            availabilityConfirmed: b.availabilityConfirmed === true,
          }
          await db.query(
            "update project_allocation_requests set responses=$2 where id=$1",
            [r.id, JSON.stringify(r.responses)],
          )
          if (b.action === "decline") {
            await releaseIncoming(db, p, r, meta)
            await db.query(
              "update project_allocation_requests set status='declined' where id=$1",
              [r.id],
            )
          }
        } else {
          if (changed.some((id) => r.responses[id]?.status !== "accepted"))
            fail(
              "Record acceptance and foreman availability for each changed company scope.",
            )
          await capacity(
            db,
            ids,
            p,
            meta.subcontractorAllocation?.companyIds ||
              r.existing_company_ids ||
              [],
          )
          try {
            validatePhaseAssignments(
              ctx.remaining,
              proposal,
              (await context(db, p, meta)).companies,
            )
          } catch (e) {
            fail(e.message)
          }
          const oldPlan = meta.subcontractorAllocation
          const completedCoverage = (oldPlan?.coverage || []).filter((row) =>
            ctx.completed.includes(row.phase),
          )
          const coverage = [
            ...completedCoverage,
            ...ctx.remaining.flatMap((phase) =>
              phase.disciplines.map((discipline) => ({
                phase: phase.name,
                discipline,
                companyId: proposal.find((row) => row.phase === phase.name)
                  .companyId,
              })),
            ),
          ]
          for (const row of proposal) {
            const f = ctx.companies
              .find((c) => c.id === row.companyId)
              .foremen.find((f) => f.id === row.foremanId)
            await db.query(
              `insert into project_phase_foremen(project_id,phase,company_id,foreman_id,foreman_name,foreman_phone,assigned_by)
            values($1,$2,$3,$4,$5,$6,$7) on conflict(project_id,phase) do update set company_id=excluded.company_id,foreman_id=excluded.foreman_id,
            foreman_name=excluded.foreman_name,foreman_phone=excluded.foreman_phone,assigned_by=excluded.assigned_by,assigned_at=now()`,
              [
                p.id,
                row.phase,
                row.companyId,
                row.foremanId,
                f.name,
                f.phone,
                user.id,
              ],
            )
          }
          const previousIds = r.existing_company_ids || []
          for (const id of previousIds.filter((id) => !ids.includes(id))) {
            await db.query(
              "update project_subcontractor_selections set status='archived' where project_id=$1 and subcontractor_id=$2",
              [p.id, id],
            )
            await db.query(
              "update project_subcontractor_assignments set status='released',released_at=now(),updated_by=$3 where project_id=$1 and subcontractor_id=$2 and status='active'",
              [p.id, id, user.id],
            )
            await db.query(
              "update subcontractor_workers set availability_status='available',current_project_id=null,current_project_until=null where current_project_id=$1 and subcontractor_id=$2",
              [p.id, id],
            )
          }
          const snapshots = proposal.map((row) => {
            const f = ctx.companies
              .find((c) => c.id === row.companyId)
              .foremen.find((f) => f.id === row.foremanId)
            return { ...row, foremanName: f.name, foremanPhone: f.phone }
          })
          meta.subcontractorAllocation = {
            version: 1,
            revision: ctx.revision + 1,
            phaseOwned: true,
            completedPhases: ctx.completed,
            companyIds: [...new Set(coverage.map((v) => v.companyId))],
            coverage,
            requirements: ctx.phases,
            phaseAssignments: [
              ...ctx.assignments.filter((v) => ctx.completed.includes(v.phase)),
              ...snapshots,
            ],
          }
          meta.subcontractorAllocationHistory = [
            ...(meta.subcontractorAllocationHistory || []),
            {
              action: "Phase allocation confirmed",
              byId: user.id,
              by: user.full_name,
              at: new Date().toISOString(),
              note: b.note.trim(),
              previous: oldPlan || null,
              next: meta.subcontractorAllocation,
            },
          ]
          await db.query(
            "insert into workspace_project_metadata(project_id,metadata) values($1,$2) on conflict(project_id) do update set metadata=excluded.metadata",
            [p.id, JSON.stringify(meta)],
          )
          await db.query(
            "update projects set subcontractor_allocation_version=1,crew_assigned=(select count(*) from subcontractor_workers where current_project_id=$1 and availability_status='assigned') where id=$1",
            [p.id],
          )
          if (p.lifecycle_status === "active")
            for (const id of ids.filter((id) => !previousIds.includes(id)))
              await db.query(
                `insert into project_subcontractor_assignments(project_id,subcontractor_id,trade_id,worker_count,created_by) select $1,id,trade_id,0,$3 from subcontractors where id=$2`,
                [p.id, id, user.id],
              )
          await db.query(
            "update project_allocation_requests set status='applied' where id=$1",
            [r.id],
          )
        }
      } else throw new HttpError(400, "Unknown allocation action.")
      await log(
        db,
        p,
        user,
        b.action,
        {
          companyId: b.companyId,
          contactMethod:b.action==='contact'?b.method:undefined,
          availabilityConfirmed:b.action==='accept'?b.availabilityConfirmed:undefined,
          note: b.note.trim(),
          previous: ctx.assignments,
          proposal: r.proposal,
        },
        r.id,
      )
      return { ok: true }
    }),
  )
}
