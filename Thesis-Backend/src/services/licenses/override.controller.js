import { needsLicenseReplacement } from "../../common/utilities/license-status.utility.js";
// Admin-managed replacement from 33 days before expiry. Office signing and Admin approval finalize the switch.
import execute from "../../common/utilities/query.utility.js";
import { HttpError, handleError, hasProjectAccess, isUuid, isSmallintId, paging, requireUser, sendError, sendOk } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertEligibleManager, LICENSE_ELIGIBILITY_SQL } from "../../common/utilities/license-eligibility.utility.js";
import { loadLicenseState, loadLicenseStates, localDay } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { resolveNotifications } from "../notifications/notification.utility.js";
import { readChecklist } from "../progress/phase.utility.js";
import { closeOpenHistory, ensureOpenHistory, openTookOver } from "./history.js";


// assertEligibleManager throws a plain Error carrying a status; turn it into an HttpError so the client gets a 422, not a 500.
async function requireEligible(db, userId, role) {
  try { await assertEligibleManager(db, userId, role); }
  catch (error) { if (error.status === 422) throw new HttpError(422, error.message); throw error; }
}

async function projectInfo(db, projectId) {
  const found = await db.query(
    `select p.id, p.name, p.project_type_id, p.suggested_opm_id, p.lifecycle_status, p.current_stage_id,
            p.target_end_date::text as target_end_date
       from projects p where p.id=$1 and not coalesce(p.is_deleted,false)`, [projectId]);
  if (!found.rowCount) throw new HttpError(404, "Project not found.");
  return found.rows[0];
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

async function candidateRows(db, project, stageId, excludeId) {
  const role = stageId ? "spm" : "opm";
  const rules = (await db.query("select rules from workspace_settings where singleton")).rows[0]?.rules || {};
  const cap = Number(rules.cap) > 0 ? Number(rules.cap) : 3;
  if (role === "spm") {
    const required = (await db.query(
      "select discipline_id from project_stage_discipline_links where project_stage_id=$1 and project_type_id=$2", [stageId, project.project_type_id])).rows.map((r) => r.discipline_id);
    const rows = (await db.query(
      `select u.id, u.full_name, u.email, u.phone,
              (select count(*) from user_discipline_scopes s where s.user_id=u.id and s.discipline_id = any($1::int[]))::int as matching,
              (select count(distinct p.id) from project_phase_team t join projects p on p.id=t.project_id
                where t.spm_user_id=u.id and p.id<>$3 and t.status in ('pending','confirmed') and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
              (select l.license_expiry::text from user_licenses l where l.user_id=u.id and l.superseded_at is null order by l.created_at desc, l.id desc limit 1) as license_expiry
         from users u join roles r on r.id=u.role_id
        where r.code='spm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}`,
      [required, excludeId, project.id])).rows;
    return rows
      .filter((row) => row.workload < cap && (required.length === 0 || row.matching === required.length))
      .map((row) => ({ ...row, matchPercent: required.length ? Math.round((row.matching * 100) / required.length) : 100 }));
  }
  const rows = (await db.query(
    `select u.id, u.full_name, u.email, u.phone,
            (select count(*) from projects p where p.suggested_opm_id=u.id and p.id<>$3 and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
            (select l.license_expiry::text from user_licenses l where l.user_id=u.id and l.superseded_at is null order by l.created_at desc, l.id desc limit 1) as license_expiry
       from users u join roles r on r.id=u.role_id
      where r.code='opm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}
        and exists(select 1 from user_project_type_specializations s where s.user_id=u.id and s.project_type_id=$1)`,
    [project.project_type_id, excludeId, project.id])).rows;
  return rows.filter(row => row.workload < cap).map((row) => ({ ...row, matchPercent: 100 }));
}

function rank(rows, project) {
  const sorted = [...rows].sort((a, b) => b.matchPercent - a.matchPercent || a.workload - b.workload || a.full_name.localeCompare(b.full_name));
  return sorted.map((row, index) => ({
    id: row.id, name: row.full_name, email: row.email, phone: row.phone, workload: row.workload, matchPercent: row.matchPercent, licenseExpiry: row.license_expiry,
    expiresBeforeProjectEnd: Boolean(project.target_end_date && row.license_expiry && row.license_expiry < project.target_end_date),
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
      const state = await loadLicenseState(holder.user_id, { db });
      const person = (await db.query("select full_name from users where id=$1", [holder.user_id])).rows[0];
      const available = needsLicenseReplacement(state);
      const pending = (await db.query(
        `select o.id, o.to_user_id, u.full_name as to_name, o.response_deadline_at from license_overrides o join users u on u.id=o.to_user_id
          where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 and o.status='pending_acceptance'`, [projectId, stageId || 0])).rows[0] || null;
      return {
        project: { id: project.id, name: project.name, targetEndDate: project.target_end_date },
        role: stageId ? "spm" : "opm", stageId, stage: holder.stage, isLead: Boolean(holder.is_lead),
        current: { id: holder.user_id, name: person?.full_name, status: state.status, expiry: state.expiry, graceEndsOn: state.graceEndsOn, graceEnded: state.graceEnded, restricted: state.restricted,
          reason: available ? "Replacement preparation required under the company license policy" : null },
        available, pending,
        // The reason is Administrator-only: this endpoint is the only place it is returned.
        previous: (await db.query(
          `select o.id, o.status, o.reason, o.requested_at, o.responded_at, o.response_note, f.full_name as from_name, t.full_name as to_name
             from license_overrides o join users f on f.id=o.from_user_id join users t on t.id=o.to_user_id
            where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 order by o.id desc limit 10`, [projectId, stageId || 0])).rows,
        summary: await phaseSummary(db, projectId, stageId),
        candidates: available ? rank(await candidateRows(db, project, stageId, holder.user_id), project) : [],
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
              s.code as stage, t.is_lead, o.id as override_id
         from project_phase_team t join projects p on p.id=t.project_id join project_stages s on s.id=t.project_stage_id
         left join license_overrides o on o.project_id=t.project_id and o.project_stage_id=t.project_stage_id and o.status='pending_acceptance'
        where t.status in ('pending','confirmed') and p.lifecycle_status not in ('archived','completed') and not coalesce(p.is_deleted,false)
       union all
       select p.suggested_opm_id, 'opm', p.id, p.name, null, null, false, o.id
         from projects p left join license_overrides o on o.project_id=p.id and o.project_stage_id is null and o.status='pending_acceptance'
        where p.suggested_opm_id is not null and p.lifecycle_status not in ('archived','completed') and not coalesce(p.is_deleted,false)`)).rows;
    const states = await loadLicenseStates(people.map((p) => p.id));
    const byUser = new Map();
    for (const a of assignments) byUser.set(a.user_id, [...(byUser.get(a.user_id) || []), a]);
    const items = [];
    for (const person of people) {
      const state = states.get(person.id);
      const mine = (byUser.get(person.id) || []).map((a) => ({
        projectId: a.project_id, projectName: a.project_name, stageId: a.stage_id, stage: a.stage, role: a.role, isLead: a.is_lead, pendingOverrideId: needsLicenseReplacement(state) ? null : a.override_id,
      }));
      items.push({
        id: person.id, name: person.full_name, role: person.role,
        access: state.access,
        status: state.status, base: state.base, expiry: state.expiry, daysToExpiry: state.daysToExpiry, restricted: state.restricted,
        graceEnded: state.graceEnded, graceEndsOn: state.graceEndsOn, graceDaysLeft: state.graceDaysLeft,
        assignments: mine,
        needsCover: needsLicenseReplacement(state) && mine.some((a) => !a.pendingOverrideId),
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
    const state = await loadLicenseState(holder.user_id,{db});
    if (!needsLicenseReplacement(state)) throw new HttpError(409,"Replacement preparation opens 33 days before license expiry.");
    const role = stage == null ? "opm" : "spm";
    await requireEligible(db,toId,role);
    const candidates = await candidateRows(db,project,stage == null ? null : Number(stage),holder.user_id);
    if (!candidates.some(c=>c.id===toId)) throw new HttpError(422,"Choose an eligible engineer with matching qualifications and available capacity.");
    await db.query("update license_overrides set status='cancelled',responded_at=now(),response_note='Superseded by Admin-confirmed office appointment' where project_id=$1 and coalesce(project_stage_id,0)=$2 and status='pending_acceptance'",[projectId,stage || 0]);
    const audit = JSON.stringify({appointmentSigned:true,signedOn,approvedBy:user.id});
    const o = (await db.query(`insert into license_overrides(project_id,project_stage_id,role_code,from_user_id,to_user_id,reason,expired_on,grace_ended_on,requested_by,status,responded_at,response_note)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'accepted',now(),$10) returning *`,[projectId,stage || null,role,holder.user_id,toId,reason,state.expiry,state.graceEndsOn,user.id,audit])).rows[0];
    const historyId = await applyAdminHandover(db,o,project,user.id);
    await notify(db,{title:"Engineer replacement approved",projectId,actorId:user.id,recipientIds:[toId,holder.user_id,...await adminIds(db)],
      detail:project.name + " · Office signing confirmed by Admin; assignment switched. Past work remains on record."});
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
