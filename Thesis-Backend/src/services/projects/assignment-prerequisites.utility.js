import { HttpError } from "../../common/utilities/access.utility.js";

// The six registered documents the Office PM uploads after accepting an intake.
export const REGISTERED_DOCUMENT_CODES = [
  "notice_to_proceed", "building_permit", "owner_contract",
  "registered_plans", "environmental_certificate", "budget_boq",
];

// Lifecycle states in which a Site PM may respond to an assignment.
export const ACCEPTANCE_LIFECYCLES = ["spm_review", "active"];

export async function registeredDocumentCount(db, projectId) {
  return (await db.query(
    `SELECT count(DISTINCT t.code)::int AS n FROM project_documents d
       JOIN document_types t ON t.id = d.document_type_id
      WHERE d.project_id = $1 AND d.status = 'uploaded' AND t.code = ANY($2::text[])`,
    [projectId, REGISTERED_DOCUMENT_CODES])).rows[0]?.n ?? 0;
}

// The lead assignment is the row flagged is_lead; older intakes fall back to the earliest phase row.
export async function leadAssignment(db, projectId) {
  return (await db.query(
    `SELECT spm_user_id, status, is_lead FROM project_phase_team
      WHERE project_id = $1 ORDER BY is_lead DESC, project_stage_id ASC LIMIT 1`, [projectId])).rows[0] ?? null;
}

/**
 * Server-side gate for accepting a phase assignment or an engineer responsibility.
 * Mirrors the workspace sequence: the assigned Office PM has accepted (the project is in
 * SPM review or active), all six registered documents are uploaded, and the Lead Site PM
 * accepts before any other Site PM. Callers check that the actor owns a pending row.
 */
export async function assertAcceptancePrerequisites(db, project, user) {
  if (!ACCEPTANCE_LIFECYCLES.includes(project.lifecycle_status))
    throw new HttpError(409, "Wait for the assigned Office PM to accept this project before responding.", "OPM_ACCEPTANCE_REQUIRED");
  const uploaded = await registeredDocumentCount(db, project.id);
  if (uploaded < REGISTERED_DOCUMENT_CODES.length)
    throw new HttpError(409, `Waiting for Office PM documents: ${uploaded} of ${REGISTERED_DOCUMENT_CODES.length} uploaded.`, "REGISTERED_DOCUMENTS_REQUIRED");
  const lead = await leadAssignment(db, project.id);
  if (lead && lead.spm_user_id !== user.id && lead.status !== "confirmed")
    throw new HttpError(409, "The Lead Site PM must accept first.", "LEAD_ACCEPTANCE_REQUIRED");
}
