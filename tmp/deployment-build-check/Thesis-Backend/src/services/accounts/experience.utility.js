import { normalizeExperience } from "../../domain/engineer-experience.js";
import { HttpError } from "../../common/utilities/access.utility.js";

export function validateEngineerExperience(value, role) {
  if (value === undefined) return undefined; // Older accounts retain unknown experience.
  if (!["opm", "spm"].includes(role)) throw new HttpError(422, "Work experience applies only to engineer accounts.");
  try { return normalizeExperience(value); } catch (error) { throw new HttpError(400, error.message); }
}
export async function saveEngineerExperience(db, userId, experience) {
  if (experience === undefined) return;
  await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,jsonb_build_object('experienceByType',$2::jsonb))
    ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`, [userId, JSON.stringify(experience)]);
}
// Fixed SQL parameter names only; no request text is interpolated into SQL.
export function experienceForProjectSql(parameter) {
  if (!["$1", "$2"].includes(parameter)) throw new Error("Invalid project-type parameter.");
  return `coalesce((select case when jsonb_typeof(m.metadata->'experienceByType'->${parameter})='number'
    and (m.metadata->'experienceByType'->>${parameter}) ~ '^([0-7]?[0-9]|80)$'
    then (m.metadata->'experienceByType'->>${parameter})::int else 0 end
    from workspace_account_metadata m where m.user_id=u.id),0)`;
}
