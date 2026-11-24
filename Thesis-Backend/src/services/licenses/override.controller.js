import { handoverResponsibility } from '../projects/responsibility-handover.utility.js';
import { commitmentsInstalled, prepareEngineerAssignments, saveEngineerScopes } from "../projects/engineer-commitments.utility.js";
import { needsLicenseReplacement } from "../../common/utilities/license-status.utility.js";
// Admin-managed replacement from 30 days before expiry. Office signing and Admin approval finalize the switch.
import execute from "../../common/utilities/query.utility.js";
import { HttpError, handleError, hasProjectAccess, isUuid, isSmallintId, paging, requireUser, sendError, sendOk } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertEligibleManager, LICENSE_ELIGIBILITY_SQL } from "../../common/utilities/license-eligibility.utility.js";
import { loadLicenseState, loadLicenseStates, localDay } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { readChecklist } from "../progress/phase.utility.js";
import { closeOpenHistory, ensureOpenHistory, openTookOver } from "./history.js";
import { licenseAccessPolicy } from "../../domain/license-access.js";
import { loadStaffingCredentials, staffingLicenseByScope } from "../projects/staffing-license.utility.js";
import { scheduleConflicts } from "../projects/inquiry-staffing.js";
import { responsibilitiesInstalled } from "../projects/phase-responsibilities.utility.js";


// assertEligibleManager throws a plain Error carrying a status; turn it into an HttpError so the client gets a 422, not a 500.
async function requireEligible(db, userId, role) {
  try { await assertEligibleManager(db, userId, role); }
  catch (error) { if (error.status === 422) throw new HttpError(422, error.message); throw error; }
}

async function projectInfo(db, projectId) {
  const found = await db.query(
    `select p.id, p.name, p.project_type_id, p.suggested_opm_id, p.lifecycle_status, p.current_stage_id,
            p.target_end_date::text as target_end_date, to_jsonb(p)->'phase_scope' as phase_scope
       from projects p where p.id=$1 and not coalesce(p.is_deleted,false)`, [projectId]);
  if (!found.rowCount) throw new HttpError(404, "Project not found.");
  return found.rows[0];
}

function replacementWindow(project, holder, today) {
  const phase = project.phase_scope?.phase_dates?.[holder.stage];
  const end = holder.is_lead || !holder.stage ? project.target_end_date : phase?.end;
  const start = !holder.is_lead && phase?.start > today ? phase.start : today;
  return { start, end: end && end >= start ? end : start, plannedEnd: end ?? null };
}

async function holderScopes(db, project, stageId, holder) {
  if (!stageId || !project.phase_scope?.phase_dates) return [];
  const fallback = project.phase_scope.coordinator_scopes?.[holder.stage] ?? [];
  if (!await responsibilitiesInstalled(db)) return fallback;
  return (await db.query(`select assigned_disciplines from project_phase_responsibilities
    where project_id=$1 and project_stage_id=$2 and user_id=$3`, [project.id, stageId, holder.user_id])).rows[0]?.assigned_disciplines ?? fallback;
}

function assignmentExpiry(credentials, scopes, fallback) {
  const licenses = staffingLicenseByScope(credentials, scopes, "1900-01-01", 0);
  return scopes.map(scope => licenses[scope]?.expiry).filter(Boolean).sort()[0] ?? fallback;
}

async function replacementState(db, holder, scopes) {
  const state = await loadLicenseState(holder.user_id, { db });
  if (!scopes.length) return { state, expiry: state.expiry, available: needsLicenseReplacement(state) };
  const credentials = (await loadStaffingCredentials(db, [holder.user_id])).get(holder.user_id);
  const expiry = assignmentExpiry(credentials, scopes, state.expiry);
  return { state, expiry, available: licenseAccessPolicy(expiry, state.today).prepareReplacement };
}

async function eligibleReplacements(db, project, stageId, holder, scopes, today) {
  const rows = await candidateRows(db, project, stageId, holder.user_id, scopes);
  if (!stageId || !project.phase_scope?.phase_dates) return rows;
  const ids = rows.map(candidate => candidate.id);
  if (!ids.length) return rows;
  const window = replacementWindow(project, holder, today);
  const conflicts = await scheduleConflicts(db, ids, window, project.id);
  if (await responsibilitiesInstalled(db)) {
    const assigned = await db.query(`select user_id from project_phase_responsibilities
      where project_id=$1 and project_stage_id=$2`, [project.id, stageId]);
    for (const row of assigned.rows) conflicts.add(row.user_id);
  }
  const credentials = await loadStaffingCredentials(db, ids);
  return rows.flatMap(candidate => {
    if (conflicts.has(candidate.id)) return [];
    const licenses = staffingLicenseByScope(credentials.get(candidate.id), scopes, today);
    if (scopes.some(scope => !licenses[scope] || licenses[scope].cutoff <= window.end)) return [];
    const license = Object.values(licenses).sort((a,b) => a.cutoff.localeCompare(b.cutoff))[0];
    return [{ ...candidate, license_expiry: license?.expiry ?? candidate.license_expiry,
      coverage_start: window.start, coverage_end: window.plannedEnd }];
  });
}

async function holderOf(db, project, stageId) {
  if (stageId) {
    const row = (await db.query(
      `select t.id, t.spm_user_id as user_id, t.is_lead, t.status, t.created_at, s.code as stage
         from project_phase_team t join project_stages s on s.id=t.project_stage_id
        where t.project_id=$1 and t.project_stage_id=$2 for update of t`, [project.id, stageId])).rows[0];
    if (!row) throw new HttpError(404, "Phase assignment not found.");
    if (!["pending", "confirmed"].includes(row.status)) throw new HttpError(409, "Only a current phase assignment can be overridden.");
    return row;
  }
  if (!project.suggested_opm_id) throw new HttpError(409, "This project has no Office PM to replace.");
  return { user_id: project.suggested_opm_id, stage: null, is_lead: false };
}

/** Verified progress of a phase: approved items out of required, and work that is still waiting. */
async function phaseSummary(db, projectId, stageId) {
  if (!stageId) {
    const open = (await db.query(
      `select (select count(*) from project_phase_updates where project_id=$1 and status='pending')::int as updates,
              (select count(*) from project_phase_evidence where project_id=$1 and status='pending')::int as evidence`, [projectId])).rows[0];
    return { approved: null, required: null, pct: null, pendingUpdates: open.updates, pendingEvidence: open.evidence };
  }
  const checklist = await readChecklist(db, projectId, stageId);
  const open = (await db.query(
    `select (select count(*) from project_phase_evidence where project_id=$1 and project_stage_id=$2 and status='pending')::int as evidence,
            (select count(*) from project_phase_updates where project_id=$1 and selected_stage_id=$2 and status='pending')::int as updates`,
    [projectId, stageId])).rows[0];
  return { approved: checklist.approved_count, required: checklist.required_count, pct: checklist.pct,
    pendingUpdates: open.updates, pendingEvidence: open.evidence };
}

async function candidateRows(db, project, stageId, excludeId, scopes = []) {
  const role = stageId ? "spm" : "opm";
  const rules = (await db.query("select rules from workspace_settings where singleton")).rows[0]?.rules || {};
  const cap = Number(rules.cap) > 0 ? Number(rules.cap) : 3;
  if (role === "spm") {
    const required = (scopes.length
      ? await db.query("select id as discipline_id from disciplines where code=any($1::text[])", [scopes])
      : await db.query("select discipline_id from project_stage_discipline_links where project_stage_id=$1 and project_type_id=$2",
        [stageId, project.project_type_id])).rows.map(r => r.discipline_id);
    const rows = (await db.query(
      `select u.id, u.full_name, u.email, u.phone,
              (select count(*) from engineer_qualified_scopes s where s.user_id=u.id and s.discipline_id = any($1::int[]))::int as matching,
              (select count(distinct p.id) from project_phase_team t join projects p on p.id=t.project_id
                where t.spm_user_id=u.id and p.id<>$3 and t.status in ('pending','confirmed') and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
              (select max(l.license_expiry)::text from user_licenses l where l.user_id=u.id and l.superseded_at is null
                and to_jsonb(l)->>'verification_status'='verified') as license_expiry
         from users u join roles r on r.id=u.role_id
        where r.code='spm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}`,
      [required, excludeId, project.id])).rows;
    if(await commitmentsInstalled(db)) {
      const stage=(await db.query('select code from project_stages where id=$1',[stageId])).rows[0];
      const available=[];
      for(const row of rows) {
        const team=[{stage:stage.code,user_id:row.id,...(scopes.length ? {assigned_disciplines:scopes} : {})}];
        try { await prepareEngineerAssignments(db,project.project_type_id,team,{projectId:project.id,lock:false});available.push({...row,matchPercent:required.length?Math.round(row.matching*100/required.length):100}); }
        catch(error){if(error.status!==409)throw error;}
      }
      return available;
    }
    return rows
      .filter((row) => row.workload < cap && (required.length === 0 || row.matching === required.length))
      .map((row) => ({ ...row, matchPercent: required.length ? Math.round((row.matching * 100) / required.length) : 100 }));
  }
  const rows = (await db.query(
    `select u.id, u.full_name, u.email, u.phone,
            (select count(*) from projects p where p.suggested_opm_id=u.id and p.id<>$3 and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
            (select max(l.license_expiry)::text from user_licenses l where l.user_id=u.id and l.superseded_at is null
              and to_jsonb(l)->>'verification_status'='verified') as license_expiry
       from users u join roles r on r.id=u.role_id
      where r.code='opm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}
        and exists(select 1 from user_project_type_specializations s where s.user_id=u.id and s.project_type_id=$1)`,
    [project.project_type_id, excludeId, project.id])).rows;
  return rows.filter(row => row.workload < cap).map((row) => ({ ...row, matchPercent: 100 }));
}

function rank(rows, project, stage) {
  const backup = project.phase_scope?.planning_backups?.[stage];
  const sorted = [...rows].sort((a, b) => Number(b.id === backup) - Number(a.id === backup) || b.matchPercent - a.matchPercent || a.workload - b.workload || a.full_name.localeCompare(b.full_name));
  return sorted.map((row, index) => ({
    id: row.id, name: row.full_name, email: row.email, phone: row.phone, workload: row.workload, matchPercent: row.matchPercent, licenseExpiry: row.license_expiry,
    expiresBeforeProjectEnd: Boolean(project.target_end_date && row.license_expiry && row.license_expiry < project.target_end_date),
    coverageStart: row.coverage_start ?? null, coverageEnd: row.coverage_end ?? null, planningBackup: row.id === backup,
    best: index === 0,
  }));
}

/** GET /licenses/override-options?project_id=&stage_id= (omit stage_id for the Office PM role). */
export const overrideOptions = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { project_id: projectId, stage_id: stage } = req.query;
    if (!isUuid(projectId) || (stage !== undefined && !isSmallintId(stage))) return sendError(res, "Invalid project or phase.", 400);
    const stageId = stage === undefined ? null : Number(stage);
    const data = await withTransaction(async (db) => {
      const project = await projectInfo(db, projectId);
      const holder = await holderOf(db, project, stageId);
      const scopes = await holderScopes(db, project, stageId, holder);
      const { state, expiry, available } = await replacementState(db, holder, scopes);
      const person = (await db.query("select full_name from users where id=$1", [holder.user_id])).rows[0];
      const pending = (await db.query(
        `select o.id, o.to_user_id, u.full_name as to_name, o.response_deadline_at from license_overrides o join users u on u.id=o.to_user_id
          where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 and o.status='pending_acceptance'`, [projectId, stageId || 0])).rows[0] || null;
      return {
        project: { id: project.id, name: project.name, targetEndDate: project.target_end_date,
          coverageEnd: replacementWindow(project, holder, state.today).plannedEnd },
        requiresAvailabilityConfirmation: Boolean(stageId && project.phase_scope?.phase_dates),
        role: stageId ? "spm" : "opm", stageId, stage: holder.stage, isLead: Boolean(holder.is_lead),
        current: { id: holder.user_id, name: person?.full_name, status: state.status, expiry,
          workAccessCutoff: licenseAccessPolicy(expiry, state.today).noticeOn,
          graceEndsOn: state.graceEndsOn, graceEnded: state.graceEnded, restricted: state.restricted,
          reason: available ? "Replacement preparation required under the company license policy" : null },
        available, pending,
        // The reason is Administrator-only: this endpoint is the only place it is returned.
        previous: (await db.query(
          `select o.id, o.status, o.reason, o.requested_at, o.responded_at, o.response_note, f.full_name as from_name, t.full_name as to_name
             from license_overrides o join users f on f.id=o.from_user_id join users t on t.id=o.to_user_id
            where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 order by o.id desc limit 10`, [projectId, stageId || 0])).rows,
        summary: await phaseSummary(db, projectId, stageId),
        candidates: available ? rank(await eligibleReplacements(db, project, stageId, holder, scopes, state.today), project, holder.stage) : [],
      };
    });
    return sendOk(res, "Override options retrieved.", 1, data);
  } catch (error) { return handleError(res, error); }
};

/** GET /licenses/overview — every Office PM and Site PM with calculated status and current assignments. */
export const overview = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const people = (await execute(
      `select u.id, u.full_name, r.code as role from users u join roles r on r.id=u.role_id
        where r.code in ('opm','spm') and u.status in ('active','suspended') and not coalesce(u.is_deleted,false) order by u.full_name, u.id`)).rows;
    const assignments = (await execute(
      `select t.spm_user_id as user_id, 'spm' as role, p.id as project_id, p.name as project_name, t.project_stage_id as stage_id,
              s.code as stage, t.is_lead, o.id as override_id, to_jsonb(p)->'phase_scope'->'coordinator_scopes'->s.code AS coordinator_scopes
         from project_phase_team t join projects p on p.id=t.project_id join project_stages s on s.id=t.project_stage_id
         left join license_overrides o on o.project_id=t.project_id and o.project_stage_id=t.project_stage_id and o.status='pending_acceptance'
        where t.status in ('pending','confirmed') and p.lifecycle_status not in ('archived','completed') and not coalesce(p.is_deleted,false)
       union all
       select p.suggested_opm_id, 'opm', p.id, p.name, null, null, false, o.id, null::jsonb
         from projects p left join license_overrides o on o.project_id=p.id and o.project_stage_id is null and o.status='pending_acceptance'
        where p.suggested_opm_id is not null and p.lifecycle_status not in ('archived','completed') and not coalesce(p.is_deleted,false)`)).rows;
    const states = await loadLicenseStates(people.map((p) => p.id));
    const db = { query: execute };
    const scoped = await responsibilitiesInstalled(db) ? (await execute(`
      select r.project_id,r.project_stage_id,r.user_id,r.assigned_disciplines
      from project_phase_responsibilities r join projects p on p.id=r.project_id
      where r.is_coordinator and r.status in ('pending','confirmed')
        and p.lifecycle_status not in ('completed','archived') and not coalesce(p.is_deleted,false)
        and to_jsonb(p)->'phase_scope' ? 'phase_dates'`)).rows : [];
    const scopeKey = a => `${a.project_id}:${a.project_stage_id ?? a.stage_id ?? 0}:${a.user_id}`;
    const scopesByAssignment = new Map(scoped.map(row => [scopeKey(row), row.assigned_disciplines]));
    const credentials = await loadStaffingCredentials(db, [...new Set([
      ...scoped.map(row => row.user_id), ...assignments.filter(row => row.coordinator_scopes?.length).map(row => row.user_id),
    ])]);
    const byUser = new Map();
    for (const a of assignments) byUser.set(a.user_id, [...(byUser.get(a.user_id) || []), a]);
    const items = [];
    for (const person of people) {
      const state = states.get(person.id);
      const mine = (byUser.get(person.id) || []).map(a => {
        const scopes = scopesByAssignment.get(scopeKey(a)) ?? a.coordinator_scopes;
        const expiry = scopes?.length ? assignmentExpiry(credentials.get(person.id), scopes, state.expiry) : state.expiry;
        const policy = licenseAccessPolicy(expiry);
        return { projectId: a.project_id, projectName: a.project_name, stageId: a.stage_id, stage: a.stage, role: a.role,
          isLead: a.is_lead, pendingOverrideId: a.override_id, expiry, workAccessCutoff: policy.noticeOn,
          needsCover: policy.prepareReplacement && !a.override_id };
      });
      items.push({
        id: person.id, name: person.full_name, role: person.role,
        access: state.access,
        status: state.status, base: state.base, expiry: state.expiry, daysToExpiry: state.daysToExpiry, restricted: state.restricted,
        graceEnded: state.graceEnded, graceEndsOn: state.graceEndsOn, graceDaysLeft: state.graceDaysLeft,
        assignments: mine,
        needsCover: mine.some(a => a.needsCover),
      });
    }
    const filtered = req.query.needs_cover === "true" ? items.filter((i) => i.needsCover) : items;
    // Paged only when asked (page, pageSize, limit or offset). `count` is always the full total.
    const paged = ["page", "pageSize", "limit", "offset"].some((key) => req.query[key] !== undefined);
    const { limit, offset } = paging(req, 50, 100);
    return sendOk(res, "License overview retrieved.", filtered.length, paged ? filtered.slice(offset, offset + limit) : filtered);
  } catch (error) { return handleError(res, error); }
};

/** Admin confirms office signing and immediately approves the replacement. */
export const createOverride = async (req, res) => {
 try {
  const user = await requireUser(req,res,["admin"]); if (!user) return;
  const { project_id: projectId, stage_id: stage, to_user_id: toId, signed_on: signedOn, from_user_id: expectedHolder } = req.body || {};
  const reason = String(req.body?.reason || "").trim();
  if (!isUuid(projectId) || !isUuid(toId) || !isUuid(expectedHolder) || (stage != null && !isSmallintId(stage))) throw new HttpError(400,"Invalid project, phase or engineer.");
  if (!reason) throw new HttpError(400,"A reason is required.");
  if (req.body?.appointment_signed !== true || !/^\d{4}-\d{2}-\d{2}$/.test(signedOn || "") || !Number.isFinite(Date.parse(signedOn + "T00:00:00Z")) || new Date(signedOn + "T00:00:00Z").toISOString().slice(0,10) !== signedOn || signedOn > localDay())
    throw new HttpError(422,"Confirm office signing and enter its actual date, no later than today.");
  const data = await withTransaction(async db => {
    await db.query("select id from projects where id=$1 for update",[projectId]);
    const project = await projectInfo(db,projectId);
    if (["archived","completed"].includes(project.lifecycle_status)) throw new HttpError(409,"Completed or archived projects cannot be reassigned.");
    const holder = await holderOf(db,project,stage == null ? null : Number(stage));
    if (holder.user_id !== expectedHolder) throw new HttpError(409,"The assignment changed. Refresh before approving a replacement.");
    await db.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[holder.user_id,toId]]);
    const stageId = stage == null ? null : Number(stage);
    const scopes = await holderScopes(db, project, stageId, holder);
    const { state, expiry, available } = await replacementState(db,holder,scopes);
    if (!available) throw new HttpError(409,"Replacement preparation opens 30 days before license expiry. Refresh if a renewal was just verified.");
    if (stageId && project.phase_scope?.phase_dates &&
        (req.body?.contacted !== true || req.body?.availability_confirmed !== true))
      throw new HttpError(422,"Confirm that the replacement was contacted and available for the remaining assignment.");
    const role = stage == null ? "opm" : "spm";
    await requireEligible(db,toId,role);
    const candidates = await eligibleReplacements(db,project,stageId,holder,scopes,state.today);
    if (!candidates.some(c=>c.id===toId)) throw new HttpError(422,"Choose an eligible engineer with matching qualifications and available capacity.");
    await db.query("update license_overrides set status='cancelled',responded_at=now(),response_note='Superseded by Admin-confirmed office appointment' where project_id=$1 and coalesce(project_stage_id,0)=$2 and status='pending_acceptance'",[projectId,stage || 0]);
    const audit = JSON.stringify({appointmentSigned:true,signedOn,approvedBy:user.id,
      contacted:req.body?.contacted === true, availabilityConfirmed:req.body?.availability_confirmed === true});
    const o = (await db.query(`insert into license_overrides(project_id,project_stage_id,role_code,from_user_id,to_user_id,reason,expired_on,grace_ended_on,requested_by,status,responded_at,response_note)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'accepted',now(),$10) returning *`,[projectId,stage || null,role,holder.user_id,toId,reason,expiry,state.graceEndsOn,user.id,audit])).rows[0];
    const historyId = await applyAdminHandover(db,o,project,user.id);
    await notify(db,{title:"Engineer replacement approved",projectId,actorId:user.id,recipientIds:[toId,holder.user_id,...await adminIds(db)],
      detail:project.name + " · Office signing confirmed by Admin; assignment switched. Past work remains on record."});
    if (stageId && project.suggested_opm_id)
      await notify(db,{title:"Coordinate Site PM handover",projectId,actorId:user.id,recipientIds:[project.suggested_opm_id],
        detail:`${project.name} · ${holder.stage} was reassigned to ${candidates.find(candidate => candidate.id === toId).full_name}. Coordinate handover of unfinished work.`});
    return {id:o.id,status:"accepted",historyId,signedOn,approvedBy:user.id};
  });
  return sendOk(res,"Appointment confirmed. Replacement assigned immediately.",1,data,201);
 } catch(error) { return handleError(res,error); }
};

/** GET /licenses/requests — reassignment requests waiting for the signed-in engineer. No license detail is shown. */
export const myRequests = async (req,res) => {
 try { const user = await requireUser(req,res,["opm","spm"]); if(user) return sendOk(res,"Replacements are confirmed by Admin.",0,[]); }
 catch(error) { return handleError(res,error); }
};

export const acceptRequest = async (req,res) => {
 try { const user = await requireUser(req,res,["opm","spm"]); if(user) return sendError(res,"Replacement assignments require Admin confirmation of office signing.",409); }
 catch(error) { return handleError(res,error); }
};
export const declineRequest = acceptRequest;

const labelFor = (row) =>
  row.completed_at ? (row.kind === "took_over" ? "Completed phase" : "Completed")
    : row.ended_at ? "Contributed" : row.kind === "took_over" ? "Took over" : "Original engineer";

/** GET /licenses/history?project_id= — per phase: each engineer with dates. Never includes reasons. */
export const projectHistory = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    if (!isUuid(req.query.project_id)) return sendError(res, "Invalid project id.", 400);
    const rows = await withTransaction(async (db) => {
      if (!(await hasProjectAccess(user, req.query.project_id, db, { includeFormer: true }))) throw new HttpError(404, "Project not found.");
      return (await db.query(
        `select h.id, h.project_stage_id as stage_id, s.code as stage, h.role_code as role, h.user_id, u.full_name as name, h.kind,
                h.started_at, h.ended_at, h.completed_at
           from engineer_assignment_history h join users u on u.id=h.user_id left join project_stages s on s.id=h.project_stage_id
          where h.project_id=$1 order by s.sort_order nulls first, h.started_at, h.id`, [req.query.project_id])).rows;
    });
    return sendOk(res, "History retrieved.", rows.length, rows.map((r) => ({ ...r, label: labelFor(r) })));
  } catch (error) { return handleError(res, error); }
};

/** GET /licenses/work-record/:userId — the engineer's profile "Work record". Administrator or the engineer. */
export const workRecord = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    if (!isUuid(req.params.userId)) return sendError(res, "Invalid engineer id.", 400);
    if (user.role !== "admin" && user.id !== req.params.userId) return sendError(res, "Engineer not found.", 404);
    const rows = (await execute(
      `select h.id, h.project_id, p.name as project_name, s.code as stage, h.role_code as role, h.kind, h.started_at, h.ended_at, h.completed_at
         from engineer_assignment_history h join projects p on p.id=h.project_id left join project_stages s on s.id=h.project_stage_id
        where h.user_id=$1 order by h.started_at desc, h.id desc`, [req.params.userId])).rows;
    const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
    const record = rows.map((r) => ({
      ...r,
      label: r.completed_at ? (r.kind === "took_over" ? `Completed · took over ${day(r.started_at)}` : "Completed")
        : r.ended_at ? `Contributed · ${day(r.started_at)} to ${day(r.ended_at)}`
          : r.kind === "took_over" ? `In progress · took over ${day(r.started_at)}` : "In progress",
    }));
    return sendOk(res, "Work record retrieved.", record.length, record);
  } catch (error) { return handleError(res, error); }
};

async function applyAdminHandover(db, o, project, actorId) {
 let scopedTeam=[];
 if(o.role_code==='spm') {
  const scope=(await db.query('select p.project_type_id,s.code from projects p join project_stages s on s.id=$2 where p.id=$1',[o.project_id,o.project_stage_id])).rows[0];
  const previous=await handoverResponsibility(db,{...project,id:o.project_id,project_type_id:scope.project_type_id},o.project_stage_id,o.from_user_id,o.to_user_id,actorId,'Office-signed license handover.',{confirmed:true});
  scopedTeam=[{stage:scope.code,user_id:o.to_user_id,...(previous?{assigned_disciplines:previous.assigned_disciplines}:{})}];
  await prepareEngineerAssignments(db,scope.project_type_id,scopedTeam,{projectId:o.project_id});
 }
 const lockedHolder = o.role_code === "spm" ? (await db.query("select * from project_phase_team where project_id=$1 and project_stage_id=$2 for update", [o.project_id,o.project_stage_id])).rows[0] : null;
      // The original engineer stays on record: their history row is closed, not removed.
      await ensureOpenHistory(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code, userId: o.from_user_id,
        startedAt: lockedHolder?.created_at || null, createdBy: o.requested_by });
      await closeOpenHistory(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code });
      const historyId = await openTookOver(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code, userId: o.to_user_id, createdBy: actorId });
      if (o.role_code === "spm") {
        // is_lead stays on the same row, so the Lead Site PM designation moves with the phase.
        await db.query(
          `update project_phase_team set spm_user_id=$3, status='confirmed', responded_at=now(), response_deadline_at=null, updated_by=$4, updated_at=now()
            where project_id=$1 and project_stage_id=$2`, [o.project_id, o.project_stage_id, o.to_user_id, actorId]);
        await saveEngineerScopes(db,o.project_id,scopedTeam,actorId);
        await db.query(
          `update project_engineers set unassigned_at=now(), updated_by=$3, updated_at=now()
            where project_id=$1 and user_id=$2 and unassigned_at is null
              and not exists(select 1 from project_phase_team t where t.project_id=$1 and t.spm_user_id=$2)`, [o.project_id, o.from_user_id, actorId]);
        await db.query(`insert into project_engineers(project_id,user_id,project_role_label,assigned_at,created_by,updated_by)
          select $1,$2,'Site PM',now(),$3,$3 where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and unassigned_at is null)`,[o.project_id,o.to_user_id,actorId]);
      } else {
        await db.query("update projects set suggested_opm_id=$2, suggested_opm_match_score=null, updated_by=$3, updated_at=now() where id=$1", [o.project_id, o.to_user_id, actorId]);
        await db.query("update project_engineers set unassigned_at=now(), updated_by=$3, updated_at=now() where project_id=$1 and user_id=$2 and project_role_label='Office PM (oversight)' and unassigned_at is null", [o.project_id, o.from_user_id, actorId]);
        await db.query(
          `insert into project_engineers(project_id,user_id,project_role_label,assigned_at,created_by,updated_by)
           select $1,$2,'Office PM (oversight)',now(),$3,$3
            where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and project_role_label='Office PM (oversight)' and unassigned_at is null)`,
          [o.project_id, o.to_user_id, actorId]);
      }

 return historyId;
}
