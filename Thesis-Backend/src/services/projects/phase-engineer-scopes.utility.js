import { inquiryEngineerScopes } from "../../domain/inquiry-engineer-scopes.js";
import { HttpError } from "../../common/utilities/access.utility.js";

export async function configuredInquiryScopes(db, type, phases) {
  const { rows } = await db.query("select to_regclass('public.inquiry_engineer_specialties') is not null as ready");
  if (!rows[0].ready) return undefined;
  const scopes = inquiryEngineerScopes(type, phases);
  if (Object.keys(scopes).length !== phases.length)
    throw new HttpError(422, "A selected phase has no configured engineer specializations.");
  return scopes;
}

export async function savedEngineerScopes(db, projectId) {
  if (!projectId) return undefined;
  const { rows } = await db.query(
    "select to_jsonb(p)->'phase_scope'->'engineerScopes' as scopes from projects p where p.id=$1",
    [projectId],
  );
  return rows[0]?.scopes ?? undefined;
}

// Call sites provide SQL aliases/expressions, never user input.
export function projectEngineerScopesSql(project, stageId, stageCode) {
  return `coalesce(
    (select array(select jsonb_array_elements_text(to_jsonb(${project})->'phase_scope'->'engineerScopes'->(${stageCode})))
      where jsonb_typeof(to_jsonb(${project})->'phase_scope'->'engineerScopes'->(${stageCode})) = 'array'),
    array(select d.code::text from project_stage_discipline_links l join disciplines d on d.id=l.discipline_id
      where l.project_type_id=${project}.project_type_id and l.project_stage_id=${stageId} order by d.code)
  )`;
}
