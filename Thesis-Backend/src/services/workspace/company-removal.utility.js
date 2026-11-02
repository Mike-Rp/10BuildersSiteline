import { HttpError, isUuid } from "../../common/utilities/access.utility.js";
import { recordArchiveEvent } from "../archive/audit.utility.js";

export async function companyRemovalReadiness(db, user, id) {
  if (user.role !== "admin") throw new HttpError(403, "Only Administrators can remove companies.");
  if (!isUuid(id)) throw new HttpError(400, "Invalid company ID.");
  const company = (await db.query("select * from subcontractors where id=$1 and not coalesce(is_deleted,false) for update", [id])).rows[0];
  if (!company) throw new HttpError(404, "Company not found.");
  const metadata = (await db.query("select metadata from workspace_company_metadata where subcontractor_id=$1", [id])).rows[0]?.metadata || {};
  const { blocked, history } = (await db.query(`select
    (exists(select 1 from project_subcontractor_selections s join projects p on p.id=s.project_id
      where s.subcontractor_id=$1 and s.status in ('contacted','accepted') and p.lifecycle_status<>'archived')
    or exists(select 1 from project_subcontractor_assignments a join projects p on p.id=a.project_id
      where a.subcontractor_id=$1 and a.status='active' and p.lifecycle_status<>'archived')
    or exists(select 1 from subcontractor_workers w join projects p on p.id=w.current_project_id
      where w.subcontractor_id=$1 and w.availability_status='assigned' and p.lifecycle_status<>'archived')
    or exists(select 1 from pending_subcontractor_requests r join projects p on p.id=r.project_id
      where r.subcontractor_id=$1 and r.status='pending' and p.lifecycle_status<>'archived')
    or exists(select 1 from workspace_project_metadata m join projects p on p.id=m.project_id
      where p.lifecycle_status<>'archived' and coalesce(m.metadata->'subcontractorAllocation'->'companyIds','[]'::jsonb) ? $1::text
      and not exists(select 1 from project_subcontractor_selections s where s.project_id=p.id and s.subcontractor_id=$1
        and s.status in ('archived','replaced','declined')))) as blocked,
    (exists(select 1 from project_subcontractor_selections where subcontractor_id=$1)
    or exists(select 1 from project_subcontractor_assignments where subcontractor_id=$1)
    or exists(select 1 from project_subcontractor_matches where subcontractor_id=$1)
    or exists(select 1 from pending_subcontractor_requests where subcontractor_id=$1)
    or exists(select 1 from subcontractor_workers where subcontractor_id=$1 and current_project_id is not null)
    or exists(select 1 from workspace_project_metadata where position($1::text in metadata::text)>0)) as history`, [id])).rows[0];
  const hasHistory = history || !!metadata.projectId;
  const archived = metadata.status === "archived";
  return { company, metadata, mode: blocked ? "blocked" : archived ? "archived" : hasHistory ? "archive" : "delete" };
}

export async function removeCompany(db, user, id, body) {
  const state = await companyRemovalReadiness(db, user, id);
  if (body?.companyName !== state.company.company_name) throw new HttpError(409, "Company name changed. Refresh and confirm the current company.");
  if (state.mode === "blocked") throw new HttpError(409, "Resolve current project commitments or allocation plans before removing this company.");
  if (state.mode === "archived") throw new HttpError(409, "This company is already archived.");
  if (body?.action !== state.mode) throw new HttpError(409, "Removal eligibility changed. Refresh and review the available action.");
  await recordArchiveEvent(db, user.id, "subcontractors", id, state.mode === "delete" ? "unused_company_deleted" : "company_archived", {
    company_name: state.company.company_name,
    // Preserve evidence references for audit; never delete shared stored files here.
    metadata: state.metadata,
  });
  if (state.mode === "delete") {
    await db.query("delete from subcontractors where id=$1", [id]);
  } else {
    // The database accepts pending/approved/declined; the existing directory loader reads the archive metadata.
    await db.query("update subcontractors set directory_status='declined',updated_by=$2,updated_at=now() where id=$1", [id, user.id]);
    await db.query(`insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2)
      on conflict(subcontractor_id) do update set metadata=workspace_company_metadata.metadata||excluded.metadata`,
      [id, JSON.stringify({ status: "archived", archivedAt: new Date().toISOString(), archivedBy: user.id })]);
  }
  return { id, action: state.mode };
}
