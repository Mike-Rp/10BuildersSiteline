import { HttpError, isUuid } from "../../common/utilities/access.utility.js"
import { projectWorkflowSql } from "../projects/project-workflow.utility.js"
import { locationError, normalizeLocation, normalizeServiceAreas, serviceAreasError } from "../../domain/operating-location.js"
import {
  eligibility,
  compareCandidatePreference,
  validatePlan,
  protectScope,
  recommendTeam,
  replacementCandidates,
  replaceCompany,
  scopeFor,
} from "../../domain/subcontractor-allocation.js"

export const COMMITMENTS_SQL = `select subcontractor_id, project_id from project_subcontractor_assignments where status='active'
 union select subcontractor_id, current_project_id from subcontractor_workers where status='active' and availability_status='assigned' and current_project_id is not null
 union select subcontractor_id, project_id from project_subcontractor_selections where status='accepted'`
export const usesTradeAllocation = (p, meta) =>
  Number(p.subcontractor_allocation_version) === 1 ||
  !!meta?.subcontractorAllocation
const fail = (message) => {
  throw new HttpError(409, message)
}
export async function allocationContext(db, p) {
  const type = (
    await db.query("select code from project_types where id=$1", [
      p.project_type_id,
    ])
  ).rows[0]?.code
  const phases = (
    await db.query(
      `select s.code as name, coalesce(array_agg(d.code::text order by d.code) filter(where d.id is not null),'{}') as disciplines
      from (${projectWorkflowSql}) pts join project_stages s on s.id=pts.project_stage_id
      left join project_stage_discipline_links r on r.project_stage_id=s.id and r.project_type_id=pts.project_type_id
      left join disciplines d on d.id=r.discipline_id where pts.project_id=$1 group by s.id,pts.sort_order order by pts.sort_order`,
      [p.id],
    )
  ).rows
  const companies = (
    await db.query(
      `select c.id,c.company_name as name,c.directory_status as status,m.metadata,
      (select count(*)::int from (${COMMITMENTS_SQL}) x join projects p on p.id=x.project_id
       where x.subcontractor_id=c.id and p.id<>$1 and not coalesce(p.is_deleted,false) and p.lifecycle_status<>'archived') as commitments,
      exists(select 1 from project_subcontractor_selections s where s.project_id=$1 and s.subcontractor_id=c.id and s.status='declined') as declined
      from subcontractors c left join workspace_company_metadata m on m.subcontractor_id=c.id where not coalesce(c.is_deleted,false) order by c.id`,
      [p.id],
    )
  ).rows.map((c) => ({
    ...c,
    disciplines: c.metadata?.capabilityReview?.disciplines || [],
    reviewed: !!c.metadata?.capabilityReview?.reviewedAt,
    unavailable: !!c.metadata?.capabilityReview?.unavailable,
  }))
  const selections = (
    await db.query(
      'select subcontractor_id as "companyId",status from project_subcontractor_selections where project_id=$1',
      [p.id],
    )
  ).rows
  return { type, phases, companies, selections }
}
async function lockCompanies(db, ids) {
  await db.query(
    "select id from subcontractors where id=any($1::uuid[]) order by id for update",
    [[...new Set(ids)].sort()],
  )
}
async function intakeReady(db, p) {
  if (p.lifecycle_status !== "spm_review")
    fail("Allocation can be changed only during Site PM intake review.")
  const required = await db.query(
    `select count(*)::int as n from project_documents d join document_types t on t.id=d.document_type_id
      where d.project_id=$1 and d.status='uploaded' and t.code=any($2::text[])`,
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
  const team = await db.query(
    "select status from project_phase_team where project_id=$1",
    [p.id],
  )
  const missing = await db.query(
    `select 1 from (${projectWorkflowSql}) pts left join project_phase_team t on t.project_id=$1 and t.project_stage_id=pts.project_stage_id
      where pts.project_id=$1 and (t.spm_user_id is null or t.status<>'confirmed') limit 1`,
    [p.id],
  )
  if (
    required.rows[0].n !== 6 ||
    missing.rowCount ||
    !team.rowCount ||
    team.rows.some((t) => t.status !== "confirmed")
  )
    fail(
      "All six registered documents and team confirmations are required before allocation.",
    )
}
function checkRevision(plan, c) {
  if (
    !Number.isInteger(c.allocationRevision) ||
    c.allocationRevision !== (plan?.revision || 0)
  )
    fail("The allocation changed. Refresh the project before continuing.")
}
function audit(meta, user, action, extra = {}) {
  meta.subcontractorAllocationHistory = [
    ...(meta.subcontractorAllocationHistory || []),
    {
      action,
      byId: user.id,
      by: user.full_name,
      at: new Date().toISOString(),
      ...extra,
    },
  ]
}
export async function allocationCommand(db, p, meta, user, c) {
  if (!Object.hasOwn(p, "subcontractor_allocation_version"))
    throw new HttpError(
      503,
      "Trade allocation needs database migration 013. Existing project records remain available.",
    )
  let plan = meta.subcontractorAllocation
  if (
    (c.plan &&
      (!Array.isArray(c.plan.companyIds) ||
        c.plan.companyIds.length > 3 ||
        c.plan.companyIds.some((id) => !isUuid(id)) ||
        !Array.isArray(c.plan.coverage))) ||
    (c.companyId !== undefined && !isUuid(c.companyId))
  )
    throw new HttpError(400, "Invalid allocation plan or company ID.")
  checkRevision(plan, c)
  if (c.type !== "release_allocation_company") await intakeReady(db, p)
  await lockCompanies(
    db,
    [
      ...(plan?.companyIds || []),
      ...(c.plan?.companyIds || []),
      c.companyId,
      c.replacementCompanyId,
    ].filter(Boolean),
  )
  let ctx = await allocationContext(db, p)
  try {
    if (c.type === "set_allocation_location") {
      if (ctx.selections.some(s => ["contacted", "accepted"].includes(s.status))) fail("Project site location is locked after a company is contacted or accepts.")
      if (locationError(c.siteLocation)) throw new HttpError(400, locationError(c.siteLocation))
      if (plan) {
        audit(meta, user, "Uncontacted allocation cleared after location change", { previous: plan })
        await db.query("update project_subcontractor_selections set status='replaced' where project_id=$1 and status='proposed'", [p.id])
        delete meta.subcontractorAllocation
      }
      meta.siteLocation = normalizeLocation(c.siteLocation)
      audit(meta, user, "Project site location recorded", { location: meta.siteLocation })
      return
    }
    if (["save_allocation_plan", "auto_allocate_company"].includes(c.type)) {
      if (
        !plan &&
        ctx.selections.some((s) => ["accepted", "contacted"].includes(s.status))
      )
        fail(
          "Existing contacted or accepted allocations retain their original workflow.",
        )
      let proposed
      if (c.type === "auto_allocate_company" && plan) {
        if (!plan.companyIds.includes(c.companyId))
          fail("Choose a company from this plan.")
        if (
          ctx.selections.some(
            (s) =>
              s.companyId === c.companyId &&
              ["accepted", "contacted"].includes(s.status),
          )
        )
          fail("This company's contacted or accepted scope is locked.")
        const current = ctx.companies.find((v) => v.id === c.companyId)
        const candidates = replacementCandidates(
          plan,
          c.companyId,
          ctx.companies,
        )
        if (
          !eligibility(current) &&
          scopeFor(plan, c.companyId).every((r) =>
            current.disciplines.includes(r.discipline),
          ) &&
          (!candidates[0] || compareCandidatePreference(current, candidates[0]) <= 0)
        )
          return
        if (!candidates.length)
          fail(
            "No eligible company covers this entire scope. The gap remains pending; accepted companies are unchanged.",
          )
        proposed = replaceCompany(plan, c.companyId, candidates[0].id)
      } else
        proposed = c.type === "auto_allocate_company" ? recommendTeam(ctx.type, ctx.phases, ctx.companies) : c.plan
      if (!proposed)
        fail(
          "No complete eligible team is available. Review company capabilities in the Site PM workspace or request another company.",
        )
      // Newly selected companies are rechecked after their rows are locked.
      await lockCompanies(db, proposed.companyIds)
      ctx = await allocationContext(db, p)
      const retained = ctx.companies.map((v) =>
        plan?.companyIds.includes(v.id)
          ? { ...v, declined: false, commitments: 0, unavailable: false }
          : v,
      )
      validatePlan(ctx.type, ctx.phases, proposed, retained)
      if (plan)
        protectScope(
          plan,
          proposed,
          ctx.selections
            .filter((s) => ["contacted", "accepted"].includes(s.status))
            .map((s) => s.companyId),
        )
      audit(meta, user, "Allocation scope saved", {
        previous: plan || null,
        next: proposed,
      })
      for (const id of plan?.companyIds || [])
        if (!proposed.companyIds.includes(id))
          await db.query(
            "update project_subcontractor_selections set status='replaced' where project_id=$1 and subcontractor_id=$2 and status='proposed'",
            [p.id, id],
          )
      plan = {
        version: 1,
        revision: (plan?.revision || 0) + 1,
        companyIds: proposed.companyIds,
        coverage: proposed.coverage,
        requirements: ctx.phases,
      }
      meta.subcontractorAllocation = plan
      for (const id of plan.companyIds)
        await db.query(
          "insert into project_subcontractor_selections(project_id,subcontractor_id,status) values($1,$2,'proposed') on conflict(project_id,subcontractor_id) do update set status='proposed' where project_subcontractor_selections.status in ('replaced','archived')",
          [p.id, id],
        )
      await db.query(
        "update projects set subcontractor_allocation_version=1 where id=$1",
        [p.id],
      )
      return
    }
    if (!plan?.companyIds.includes(c.companyId))
      fail("This company is not in the current allocation plan.")
    const selection = ctx.selections.find((s) => s.companyId === c.companyId)
    if (c.type === "release_allocation_company") {
      if (p.lifecycle_status !== "active" || selection?.status !== "accepted")
        fail("Only an accepted company on an active project can be released.")
      if (!c.note?.trim()) fail("Record the reason for formal release.")
      const current = (
        await db.query("select code from project_stages where id=$1", [
          p.current_stage_id,
        ])
      ).rows[0]?.code
      const sequence = plan.requirements.map((r) => r.name),
        currentIndex = sequence.indexOf(current)
      if (
        currentIndex < 0 ||
        scopeFor(plan, c.companyId).some(
          (r) => sequence.indexOf(r.phase) >= currentIndex,
        )
      )
        fail(
          "This company still has current or future phase scope. Its commitment remains reserved until the last agreed phase is complete.",
        )
      await db.query(
        "update project_subcontractor_selections set status='archived' where project_id=$1 and subcontractor_id=$2",
        [p.id, c.companyId],
      )
      await db.query(
        "update project_subcontractor_assignments set status='released',released_at=now(),updated_by=$3 where project_id=$1 and subcontractor_id=$2 and status='active'",
        [p.id, c.companyId, user.id],
      )
      await db.query(
        "update subcontractor_workers set availability_status='available',current_project_id=null,current_project_until=null where current_project_id=$1 and subcontractor_id=$2",
        [p.id, c.companyId],
      )
      await db.query(
        "update projects set crew_assigned=(select count(*) from subcontractor_workers where current_project_id=$1 and availability_status='assigned') where id=$1",
        [p.id],
      )
    } else {
      const company = ctx.companies.find((v) => v.id === c.companyId)
      if (c.type === "contact_company" || c.accepted === true) {
        const reason = eligibility(company)
        if (reason) fail(reason)
        if (
          !scopeFor(plan, c.companyId).every((r) =>
            company.disciplines.includes(r.discipline),
          )
        )
          fail(
            "The company no longer has verified capabilities for its entire scope.",
          )
      }
      if (c.type === "contact_company") {
        if (selection?.status !== "proposed")
          fail("This company was already contacted or responded.")
        if (!c.note?.trim())
          fail("Record how and when the company was contacted.")
        await db.query(
          "update project_subcontractor_selections set status='contacted',contacted_at=now() where project_id=$1 and subcontractor_id=$2",
          [p.id, c.companyId],
        )
      } else {
        if (
          typeof c.accepted !== "boolean" ||
          selection?.status !== "contacted"
        )
          fail(
            "Contact this company first and record its actual accepted or declined response.",
          )
        if (!c.note?.trim()) fail("Record the company's response details.")
        await db.query(
          "update project_subcontractor_selections set status=$3,responded_at=now() where project_id=$1 and subcontractor_id=$2",
          [p.id, c.companyId, c.accepted ? "accepted" : "declined"],
        )
      }
    }
    audit(meta, user, c.type, {
      companyId: c.companyId,
      accepted: c.accepted,
      note: c.note,
    })
    plan.revision++
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(409, error.message)
  }
}
export async function validateAllocationActivation(db, p, meta, command) {
  const plan = meta.subcontractorAllocation
  checkRevision(plan, command)
  if (!plan) fail("Save a complete trade allocation before activation.")
  await intakeReady(db, p)
  await lockCompanies(db, plan.companyIds)
  const ctx = await allocationContext(db, p)
  try {
    validatePlan(ctx.type, ctx.phases, plan, ctx.companies)
  } catch (error) {
    fail(error.message)
  }
  if (
    plan.companyIds.some(
      (id) =>
        !ctx.selections.some(
          (s) => s.companyId === id && s.status === "accepted",
        ),
    )
  )
    fail("Every company in the allocation must accept before activation.")
  return plan.companyIds
}
export async function saveCapabilityReview(db, user, id, review) {
  if (user.role !== "spm") throw new HttpError(403, "Only Site PMs can edit company capability reviews.")
  if (review?.operatingLocation !== undefined && locationError(review.operatingLocation)) throw new HttpError(400, locationError(review.operatingLocation))
  if (serviceAreasError(review?.serviceAreas)) throw new HttpError(400, serviceAreasError(review.serviceAreas))
  if (
    !review ||
    !Array.isArray(review.disciplines) ||
    typeof review.unavailable !== "boolean" ||
    !review.note?.trim() ||
    !Array.isArray(review.documentIds) ||
    !review.documentIds.length
  )
    throw new HttpError(
      400,
      "Select verified disciplines, supporting records, and enter your capability review note.",
    )
  await lockCompanies(db, [id])
  const metadata =
    (
      await db.query(
        "select metadata from workspace_company_metadata where subcontractor_id=$1",
        [id],
      )
    ).rows[0]?.metadata || {}
  const catalog = (await db.query("select code from disciplines")).rows.map(
    (d) => d.code,
  )
  if (
    new Set(review.disciplines).size !== review.disciplines.length ||
    review.disciplines.some((d) => !catalog.includes(d))
  )
    throw new HttpError(400, "Choose disciplines from the configured catalog.")
  if (
    review.documentIds.some(
      (docId) => !metadata.documents?.some((d) => d.id === docId && d.uploaded),
    )
  )
    throw new HttpError(
      400,
      "Upload supporting company records before verifying capabilities.",
    )
  const scopes = (
    await db.query(
      `select m.metadata->'subcontractorAllocation' as plan,m.metadata->'siteLocation' as location from workspace_project_metadata m join projects p on p.id=m.project_id
      join project_subcontractor_selections s on s.project_id=p.id and s.subcontractor_id=$1 and s.status in ('contacted','accepted')
      where not coalesce(p.is_deleted,false) and p.lifecycle_status<>'archived'`,
      [id],
    )
  ).rows
  const operatingLocation = review.operatingLocation === undefined ? metadata.capabilityReview?.operatingLocation : normalizeLocation(review.operatingLocation)
  const serviceAreas = review.serviceAreas === undefined ? metadata.capabilityReview?.serviceAreas : normalizeServiceAreas(review.serviceAreas)
  if (
    scopes.some((row) =>
      row.plan?.coverage.some(
        (r) => r.companyId === id && !review.disciplines.includes(r.discipline),
      ),
    )
  )
    fail(
      "A contacted or accepted scope still needs one of these capabilities. Resolve the project commitment before removing it.",
    )
  metadata.capabilityReview = {
    ...(operatingLocation ? { operatingLocation } : {}),
    ...(serviceAreas === undefined ? {} : { serviceAreas }),
    disciplines: review.disciplines,
    unavailable: review.unavailable,
    note: review.note.trim(),
    documentIds: review.documentIds,
    reviewedAt: new Date().toISOString(),
    reviewedById: user.id,
    reviewedBy: user.full_name,
  }
  await db.query(
    "insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2) on conflict(subcontractor_id) do update set metadata=excluded.metadata",
    [id, JSON.stringify(metadata)],
  )
  return metadata.capabilityReview
}
