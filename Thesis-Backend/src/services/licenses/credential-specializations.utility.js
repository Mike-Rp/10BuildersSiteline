import {ENGINEER_SPECIALIZATIONS} from '../../domain/engineer-credentials.js';
import {HttpError} from '../../common/utilities/access.utility.js';

export function validateSpecializations(values) {
 if (!Array.isArray(values) || values.length>3 || new Set(values).size!==values.length || values.some(tag=>!ENGINEER_SPECIALIZATIONS.includes(tag))) {
  throw new HttpError(400,'Choose up to three supported specializations per professional credential.');
 }
 return values;
}
export async function credentialTagsInstalled(db) {
 return (await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_licenses' and column_name='specializations') as ready")).rows[0].ready;
}
export async function requireCredentialTags(db) {
 if (!await credentialTagsInstalled(db)) throw new HttpError(409,'Apply migration 026 before saving credential specializations.');
}
export function specializationSummary(credentials,submissions,legacy=[]) {
 return [...new Set([...legacy,...credentials.filter(c=>!c.superseded_at).flatMap(c=>c.specializations||[]),...submissions.filter(q=>q.status==='under_review').flatMap(q=>q.specializations||[])])];
}
