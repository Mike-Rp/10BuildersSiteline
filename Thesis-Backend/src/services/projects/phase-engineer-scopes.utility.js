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

export async function inquiryScopeConfiguration(db, type, phases, additional = {}) {
  const base = await configuredInquiryScopes(db, type, phases);
  if (!base) {
    if (additional && Object.values(additional).some(tags => tags?.length)) throw new HttpError(409, "Apply the inquiry specialization migration before selecting additional scopes.");
    return { required: base, additional: {}, options: undefined };
  }
  const catalog = (await db.query("SELECT specialty FROM inquiry_engineer_specialties ORDER BY specialty")).rows.map(row => row.specialty);
  if (!additional || typeof additional !== "object" || Array.isArray(additional) || Object.keys(additional).some(phase => !phases.includes(phase)))
    throw new HttpError(422, "Additional scopes must belong to confirmed phases.");
  const options = {}, normalized = {}, required = {};
  for (const phase of phases) {
    options[phase] = catalog.filter(tag => !base[phase].includes(tag));
    const tags = additional[phase] ?? [];
    if (!Array.isArray(tags) || new Set(tags).size !== tags.length || tags.some(tag => !options[phase].includes(tag)))
      throw new HttpError(422, `Choose configured additional engineering scopes for ${phase}.`);
    normalized[phase] = [...tags].sort();
    required[phase] = [...base[phase], ...normalized[phase]];
    if (required[phase].length > 9) throw new HttpError(422, `The scopes for ${phase} exceed the supported three engineers with three specialties each.`);
  }
  return { required, additional: normalized, options };
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
