import { HttpError } from "../../common/utilities/access.utility.js";
import { monitoringProject } from "../projects/intake-monitoring.utility.js";
import { allocationContext, intakeReady } from "./subcontractor-allocation.utility.js";
import { eligibility, compareCandidatePreference } from "../../domain/subcontractor-allocation.js";
import { recordArchiveEvent } from "../archive/audit.utility.js";

export async function readProjectCompanyAllocation(db, project, user) {
  const p = await monitoringProject(db, project);
  if (!p || user.role === "client") return undefined;
  const row = (await db.query("SELECT a.*,s.company_name FROM project_company_allocations a LEFT JOIN subcontractors s ON s.id=a.company_id WHERE a.project_id=$1", [p.id])).rows[0];
  if (!row) return undefined;
  const lead = (await db.query("SELECT spm_user_id FROM project_phase_team WHERE project_id=$1 AND is_lead", [p.id])).rows[0]?.spm_user_id;
  let writable = user.role === "spm" && lead === user.id && p.lifecycle_status === "spm_review";
  if(writable)try{await intakeReady(db,p);}catch(error){if(error.status!==409)throw error;writable=false;}
  const history = (await db.query("SELECT id::text,company_name,decision FROM project_company_decisions WHERE project_id=$1 ORDER BY id", [p.id])).rows;
  return { version: 1, revision: row.revision, status: row.status,
    ...(row.company_id ? { company: { id: row.company_id, name: row.company_name } } : {}), history,
    can_record_decision: writable && row.status === "awaiting_decision",
    can_reallocate: writable && ["declined", "no_eligible_company"].includes(row.status),
    can_upload_agreement: writable && row.status === "accepted" };
}

export async function ensureProjectCompanyAllocation(db, project, { reallocate = false, actorId = null } = {}) {
  const p = await monitoringProject(db, project);
  if (!p || p.lifecycle_status !== "spm_review") return;
  // All callers serialize prerequisite and decision changes with the project row.
  await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [p.id]);
  const previous = (await db.query("SELECT * FROM project_company_allocations WHERE project_id=$1 FOR UPDATE", [p.id])).rows[0];
  if (previous && !reallocate) return;
  try { await intakeReady(db, p); } catch (error) { if (!previous && error.status === 409) return; throw error; }
  await db.query("SELECT id FROM subcontractors WHERE NOT coalesce(is_deleted,false) ORDER BY id FOR UPDATE");
  const context = await allocationContext(db, p);
  const required = [...new Set(context.phases.flatMap(phase => phase.disciplines))];
  const candidate = required.length && context.companies.filter(company => !eligibility(company) && required.every(tag => company.disciplines.includes(tag)))
    .sort((a,b) => compareCandidatePreference(a,b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];
  const revision = (previous?.revision || 0) + 1;
  await db.query(`INSERT INTO project_company_allocations(project_id,revision,status,company_id) VALUES($1,$2,$3,$4)
    ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,company_id=excluded.company_id,updated_at=now()`,
    [p.id, revision, candidate ? "awaiting_decision" : "no_eligible_company", candidate?.id || null]);
  if (candidate) await db.query(`INSERT INTO project_subcontractor_selections(project_id,subcontractor_id,status) VALUES($1,$2,'proposed')
    ON CONFLICT(project_id,subcontractor_id) DO UPDATE SET status='proposed'`, [p.id, candidate.id]);
  await recordArchiveEvent(db, actorId, "projects", p.id, "project_company_allocated", { revision, company_id: candidate?.id || null });
}

export async function decideProjectCompany(db, p, user, input) {
  if (!await monitoringProject(db,p)) throw new HttpError(409,"Project-level allocation is not enabled for this project.");
  const lead = (await db.query("SELECT spm_user_id FROM project_phase_team WHERE project_id=$1 AND is_lead", [p.id])).rows[0]?.spm_user_id;
  if (user.role !== "spm" || lead !== user.id) throw new HttpError(403,"Only the assigned Lead Site PM can decide project company allocation.");
  await intakeReady(db,p);
  const row = (await db.query("SELECT * FROM project_company_allocations WHERE project_id=$1 FOR UPDATE", [p.id])).rows[0];
  if (!row || !Number.isInteger(input.expected_revision) || input.expected_revision !== row.revision ||
      (input.company_id !== undefined && input.company_id !== row.company_id)) throw new HttpError(409,"The company allocation changed. Refresh before recording a decision.");
  if (input.action === "reallocate") {
    if (!["declined","no_eligible_company"].includes(row.status)) throw new HttpError(409,"Decline the current offer before reallocation. An accepted company is locked.");
    await ensureProjectCompanyAllocation(db,p,{reallocate:true,actorId:user.id});
  } else {
    if (!["accept","decline"].includes(input.action)) throw new HttpError(400,"Select accept, decline or reallocate.");
    if (row.status !== "awaiting_decision") throw new HttpError(409,"This company decision has already been recorded.");
    if (input.action === "accept") {
      await db.query("SELECT id FROM subcontractors WHERE id=$1 FOR UPDATE",[row.company_id]);
      const context = await allocationContext(db,p), company = context.companies.find(c => c.id === row.company_id);
      if (eligibility(company) || !context.phases.every(phase => phase.disciplines.every(tag => company.disciplines.includes(tag))))
        throw new HttpError(409,"The allocated company is no longer eligible. Refresh its capability or capacity review.");
    }
    const status = input.action === "accept" ? "accepted" : "declined", revision = row.revision+1;
    await db.query("UPDATE project_company_allocations SET status=$2,revision=$3,updated_at=now() WHERE project_id=$1",[p.id,status,revision]);
    await db.query("UPDATE project_subcontractor_selections SET status=$3,responded_at=now() WHERE project_id=$1 AND subcontractor_id=$2",[p.id,row.company_id,status]);
    await db.query(`INSERT INTO project_company_decisions(project_id,revision,company_id,company_name,decision,decided_by)
      SELECT $1,$2,id,company_name,$4,$5 FROM subcontractors WHERE id=$3`,[p.id,revision,row.company_id,status,user.id]);
    await recordArchiveEvent(db,user.id,"projects",p.id,"project_company_decision",{company_id:row.company_id,status,revision});
  }
  return readProjectCompanyAllocation(db,p,user);
}

export async function validateProjectCompanyAgreement(db,p,input) {
  const row = (await db.query("SELECT * FROM project_company_allocations WHERE project_id=$1 FOR UPDATE",[p.id])).rows[0];
  if (row?.status !== "accepted" || (input.company_id && input.company_id !== row.company_id) || (input.companyId && input.companyId !== row.company_id))
    throw new HttpError(409,"Accept the allocated project company before uploading its signed agreement.");
  await db.query('SELECT id FROM subcontractors WHERE id=$1 FOR UPDATE',[row.company_id]);
  const context=await allocationContext(db,p),company=context.companies.find(c=>c.id===row.company_id);
  if(eligibility(company)||!context.phases.every(phase=>phase.disciplines.every(tag=>company.disciplines.includes(tag))))
    throw new HttpError(409,"The accepted company requires an eligibility review before activation.");
  await db.query("UPDATE project_company_allocations SET agreement_file_id=$2,agreement_company_id=company_id WHERE project_id=$1",[p.id,input.doc?.id]);
  return row.company_id;
}
