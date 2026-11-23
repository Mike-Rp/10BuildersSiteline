import { HttpError } from "../../common/utilities/access.utility.js";
import { isoDateValid, qualifyingSpecializations, REQUIREMENT_SPECIALIZATIONS } from "../../domain/engineer-credentials.js";
import { licenseAccessPolicy, licensePolicyDay } from "../../domain/license-access.js";
import { scheduleConflicts } from "./inquiry-staffing.js";
import { prepareEngineerAssignments } from "./engineer-commitments.utility.js";

export function normalizePhaseDates(input, phases, project) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(phase => !phases.includes(phase)))
    throw new HttpError(422, "Enter dates for included construction phases only.");
  return Object.fromEntries(phases.flatMap(phase => {
    const range = input[phase];
    if (range === undefined) return [];
    if (!isoDateValid(range?.start) || !isoDateValid(range?.end) ||
        range.start > range.end || range.start < project.start || range.end > project.end)
      throw new HttpError(422, `Enter a valid start and end for ${phase} within the reviewed project dates.`);
    return [[phase, { start: range.start, end: range.end }]];
  }));
}

export async function loadStaffingCredentials(db, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(`
    SELECT l.*, l.license_expiry::text AS license_expiry,
      ARRAY(SELECT e.specialization FROM engineer_specializations e WHERE e.user_id=l.user_id) AS legacy
    FROM user_licenses l WHERE l.user_id=ANY($1::uuid[]) AND l.superseded_at IS NULL
      AND l.verification_status='verified'`, [ids]);
  const byUser = new Map(ids.map(id => [id, []]));
  for (const row of rows) byUser.get(row.user_id).push(row);
  return byUser;
}

export function staffingLicenseByScope(credentials = [], scopes, today = licensePolicyDay(), noticeDays = 30) {
  return Object.fromEntries(scopes.flatMap(scope => {
    const tags = REQUIREMENT_SPECIALIZATIONS[scope] ?? [scope];
    const expiry = credentials.filter(row => qualifyingSpecializations([row], tags, today, noticeDays, row.legacy).length)
      .map(row => row.license_expiry).sort().at(-1);
    return expiry ? [[scope, { expiry, cutoff: licenseAccessPolicy(expiry, today).noticeOn }]] : [];
  }));
}

// The caller holds the same user locks used by credential verification.
export async function validateStaffingLicenses(db, team, lead, project, phaseDates, backups, typeId, requiredScopes) {
  const backupPhases = Object.keys(backups);
  const people = phase => phase.engineers?.length ? phase.engineers : [phase];
  const ids = [...new Set([...team.flatMap(phase => people(phase).map(person => person.user_id)), ...Object.values(backups)])];
  const credentials = await loadStaffingCredentials(db, ids);
  const today = licensePolicyDay();
  const conflicts = backupPhases.length ? await scheduleConflicts(db, Object.values(backups), project) : new Set();
  for (const phase of team) {
    const range = phaseDates[phase.stage];
    for (const person of people(phase)) {
      const assignment = lead?.stage === phase.stage && lead.id === person.user_id ? project : range;
      if (!assignment) continue;
      const tags = person.assigned_disciplines ?? [];
      const licenses = staffingLicenseByScope(credentials.get(person.user_id), tags, today);
      if (tags.some(tag => !licenses[tag] || licenses[tag].cutoff <= assignment.start))
        throw new HttpError(422, `A selected Site PM's verified license will not cover the planned start for ${phase.stage}. Choose another engineer or wait for verification.`, "STAFFING_LICENSE_CUTOFF");
    }
    const backup = backups[phase.stage];
    if (!backup) continue;
    const primary = people(phase)[0];
    const assignment = lead?.stage === phase.stage ? project : range;
    const tags = primary.assigned_disciplines ?? [];
    const licenses = staffingLicenseByScope(credentials.get(backup), tags, today);
    if (!assignment || conflicts.has(backup) || !tags.length || people(phase).some(person => person.user_id === backup) ||
        tags.some(tag => !licenses[tag] || licenses[tag].cutoff <= assignment.end))
      throw new HttpError(422, `Select a backup with verified license coverage through the assignment for ${phase.stage}.`);
    await prepareEngineerAssignments(db, typeId, [{ stage: phase.stage, user_id: backup, assigned_disciplines: tags }],
      { lock: false, requiredScopes });
  }
}
