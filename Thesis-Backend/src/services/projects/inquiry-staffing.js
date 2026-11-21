import { HttpError } from "../../common/utilities/access.utility.js";
import { matchingInquiryTags, selectInquiryLead } from "../../domain/inquiry-lead.js";
import { experienceForProjectSql } from "../accounts/experience.utility.js";
import { responsibilitiesInstalled } from "./phase-responsibilities.utility.js";
import { savedEngineerScopes } from "./phase-engineer-scopes.utility.js";

export async function scheduleConflicts(db, ids, {start, end}, projectId = null) {
  const rows = await db.query(`
    WITH assignments AS (
      SELECT project_id,user_id FROM project_engineers
      WHERE user_id=ANY($1::uuid[]) AND unassigned_at IS NULL
      UNION ALL
      SELECT project_id,spm_user_id FROM project_phase_team
      WHERE spm_user_id=ANY($1::uuid[]) AND status='pending'
        AND (response_deadline_at IS NULL OR response_deadline_at>now())
    )
    SELECT DISTINCT a.user_id FROM assignments a JOIN projects p ON p.id=a.project_id
    WHERE p.id IS DISTINCT FROM $4::uuid AND NOT coalesce(p.is_deleted,false)
      AND p.lifecycle_status IN ('spm_review','active')
      AND (p.target_start_date IS NULL OR p.target_start_date <= $3::date)
      AND (p.target_end_date IS NULL OR p.target_end_date >= $2::date)`, [ids,start,end,projectId]);
  return new Set(rows.rows.map(row => row.user_id));
}

// Call after phase coverage and eligibility checks, while the assignment users are locked.
export async function prepareInquiryLead(db, team, phases, typeId, type, schedule, projectId = null, requiredScopes) {
  const ids = [...new Set(team.flatMap(phase => [phase.user_id, ...(phase.engineers ?? []).map(e => e.user_id)]))];
  if ((await scheduleConflicts(db, ids, schedule, projectId)).size)
    throw new HttpError(409, "A selected Site PM has a conflicting project schedule. Refresh the allocation.");
  if (team.some(phase => phase.engineers?.length) && !await responsibilitiesInstalled(db))
    throw new HttpError(422, "Assign one Site PM per phase for this staffing configuration.");

  const experience = await db.query(`SELECT u.id, ${experienceForProjectSql("$1")} AS years
    FROM users u WHERE u.id=ANY($2::uuid[])`, [type, ids]);
  const savedScopes = requiredScopes ?? await savedEngineerScopes(db, projectId);
  const qualifications = savedScopes ? await db.query(`
    SELECT q.user_id,array_agg(DISTINCT d.code ORDER BY d.code) AS tags
    FROM engineer_qualified_scopes q JOIN disciplines d ON d.id=q.discipline_id
    WHERE q.user_id=ANY($1::uuid[]) GROUP BY q.user_id`, [ids]) : await db.query(`
    SELECT s.code AS stage,q.user_id,array_agg(DISTINCT d.code ORDER BY d.code) AS tags
    FROM engineer_qualified_scopes q
    JOIN project_stage_discipline_links l ON l.discipline_id=q.discipline_id AND l.project_type_id=$1
    JOIN disciplines d ON d.id=q.discipline_id JOIN project_stages s ON s.id=l.project_stage_id
    WHERE q.user_id=ANY($2::uuid[]) AND s.code=ANY($3::text[]) GROUP BY s.code,q.user_id`, [typeId,ids,phases]);
  const scopes = new Map(qualifications.rows.map(row => [savedScopes ? row.user_id : `${row.stage}:${row.user_id}`, row.tags]));
  const eligible = (stage, id) => savedScopes
    ? (scopes.get(id) ?? []).filter(tag => savedScopes[stage]?.includes(tag))
    : scopes.get(`${stage}:${id}`) ?? [];
  for (const phase of team) {
    if (phase.engineers?.length) continue; // Multi-engineer scopes have already passed preparePhaseResponsibilities.
    const tags = eligible(phase.stage, phase.user_id);
    phase.assigned_disciplines ??= tags.slice(0, 1);
    if (!matchingInquiryTags(phase.assigned_disciplines, tags).length)
      throw new HttpError(422, `Assign verified qualification tags for ${phase.stage}.`);
  }
  const years = new Map(experience.rows.map(row => [row.id, Number(row.years)]));
  const lead = selectInquiryLead(phases, team, years, eligible);
  if (!lead) throw new HttpError(422, "Assign a qualified Site PM to the first included phase before submitting staffing.");
  const phase = team.find(row => row.stage === lead.stage);
  if (phase.user_id !== lead.id) {
    const engineer = phase.engineers.find(person => person.user_id === lead.id);
    phase.engineers = [engineer, ...phase.engineers.filter(person => person !== engineer)];
    phase.user_id = engineer.user_id;
    phase.assigned_disciplines = engineer.assigned_disciplines;
  }
  return lead;
}
