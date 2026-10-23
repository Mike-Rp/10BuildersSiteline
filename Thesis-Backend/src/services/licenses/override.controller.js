// Administrator override after a license was not renewed within the grace period.
// The system suggests; the Administrator decides; the replacement must accept. Nothing moves until then.
import execute from "../../common/utilities/query.utility.js";
import { HttpError, handleError, hasProjectAccess, isUuid, isSmallintId, paging, requireUser, sendError, sendOk } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertEligibleManager, LICENSE_ELIGIBILITY_SQL } from "../../common/utilities/license-eligibility.utility.js";
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js";
import { loadLicenseState, loadLicenseStates } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { businessDeadline } from "../archive/audit.utility.js";
import { readChecklist } from "../progress/phase.utility.js";
import { closeOpenHistory, ensureOpenHistory, openTookOver } from "./history.js";

const PREVIOUS_ENGINEER_UNAVAILABLE = "Previous engineer unavailable";

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
  if (role === "spm") {
    const required = (await db.query(
      "select discipline_id from project_stage_discipline_links where project_stage_id=$1 and project_type_id=$2", [stageId, project.project_type_id])).rows.map((r) => r.discipline_id);
    const rows = (await db.query(
      `select u.id, u.full_name,
              (select count(*) from user_discipline_scopes s where s.user_id=u.id and s.discipline_id = any($1::int[]))::int as matching,
              (select count(*) from project_phase_team t join projects p on p.id=t.project_id
                where t.spm_user_id=u.id and t.status in ('pending','confirmed') and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
              (select l.license_expiry::text from user_licenses l where l.user_id=u.id and l.superseded_at is null order by l.created_at desc, l.id desc limit 1) as license_expiry
         from users u join roles r on r.id=u.role_id
        where r.code='spm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}`,
      [required, excludeId])).rows;
    return rows
      .filter((row) => required.length === 0 || row.matching > 0)
      .map((row) => ({ ...row, matchPercent: required.length ? Math.round((row.matching * 100) / required.length) : 100 }));
  }
  const rows = (await db.query(
    `select u.id, u.full_name,
            (select count(*) from projects p where p.suggested_opm_id=u.id and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false))::int as workload,
            (select l.license_expiry::text from user_licenses l where l.user_id=u.id and l.superseded_at is null order by l.created_at desc, l.id desc limit 1) as license_expiry
       from users u join roles r on r.id=u.role_id
      where r.code='opm' and u.status='active' and not coalesce(u.is_deleted,false) and u.id<>$2 and ${LICENSE_ELIGIBILITY_SQL}
        and exists(select 1 from user_project_type_specializations s where s.user_id=u.id and s.project_type_id=$1)`,
    [project.project_type_id, excludeId])).rows;
  return rows.map((row) => ({ ...row, matchPercent: 100 }));
}

function rank(rows, project) {
  const sorted = [...rows].sort((a, b) => b.matchPercent - a.matchPercent || a.workload - b.workload || a.full_name.localeCompare(b.full_name));
  return sorted.map((row, index) => ({
    id: row.id, name: row.full_name, workload: row.workload, matchPercent: row.matchPercent, licenseExpiry: row.license_expiry,
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
      const available = state.graceEnded && state.restricted;
      const pending = (await db.query(
        `select o.id, o.to_user_id, u.full_name as to_name, o.response_deadline_at from license_overrides o join users u on u.id=o.to_user_id
          where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 and o.status='pending_acceptance'`, [projectId, stageId || 0])).rows[0] || null;
      return {
        project: { id: project.id, name: project.name, targetEndDate: project.target_end_date },
        role: stageId ? "spm" : "opm", stageId, stage: holder.stage, isLead: Boolean(holder.is_lead),
        current: { id: holder.user_id, name: person?.full_name, status: state.status, expiry: state.expiry, graceEndsOn: state.graceEndsOn, graceEnded: state.graceEnded, restricted: state.restricted,
          reason: available ? "Not renewed after the grace period" : null },
        available, pending,
        // The reason is Administrator-only: this endpoint is the only place it is returned.
        previous: (await db.query(
          `select o.id, o.status, o.reason, o.requested_at, o.responded_at, o.response_note, f.full_name as from_name, t.full_name as to_name
             from license_overrides o join users f on f.id=o.from_user_id join users t on t.id=o.to_user_id
            where o.project_id=$1 and coalesce(o.project_stage_id,0)=$2 order by o.id desc limit 10`, [projectId, stageId || 0])).rows,
        summary: await phaseSummary(db, projectId, stageId),
        candidates: available && !pending ? rank(await candidateRows(db, project, stageId, holder.user_id), project) : [],
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
        where t.status in ('pending','confirmed') and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false)
       union all
       select p.suggested_opm_id, 'opm', p.id, p.name, null, null, false, o.id
         from projects p left join license_overrides o on o.project_id=p.id and o.project_stage_id is null and o.status='pending_acceptance'
        where p.suggested_opm_id is not null and p.lifecycle_status<>'archived' and not coalesce(p.is_deleted,false)`)).rows;
    const states = await loadLicenseStates(people.map((p) => p.id));
    const byUser = new Map();
    for (const a of assignments) byUser.set(a.user_id, [...(byUser.get(a.user_id) || []), a]);
    const items = [];
    for (const person of people) {
      const state = states.get(person.id);
      const mine = (byUser.get(person.id) || []).map((a) => ({
        projectId: a.project_id, projectName: a.project_name, stageId: a.stage_id, stage: a.stage, role: a.role, isLead: a.is_lead, pendingOverrideId: a.override_id,
      }));
      items.push({
        id: person.id, name: person.full_name, role: person.role,
        status: state.status, base: state.base, expiry: state.expiry, daysToExpiry: state.daysToExpiry, restricted: state.restricted,
        graceEnded: state.graceEnded, graceEndsOn: state.graceEndsOn, graceDaysLeft: state.graceDaysLeft,
        assignments: mine,
        needsCover: state.graceEnded && state.restricted && mine.some((a) => !a.pendingOverrideId),
      });
    }
    const filtered = req.query.needs_cover === "true" ? items.filter((i) => i.needsCover) : items;
    // Paged only when asked (page, pageSize, limit or offset). `count` is always the full total.
    const paged = ["page", "pageSize", "limit", "offset"].some((key) => req.query[key] !== undefined);
    const { limit, offset } = paging(req, 50, 100);
    return sendOk(res, "License overview retrieved.", filtered.length, paged ? filtered.slice(offset, offset + limit) : filtered);
  } catch (error) { return handleError(res, error); }
};

/** POST /licenses/overrides — ask a replacement to take over. Nothing moves until they accept. */
export const createOverride = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { project_id: projectId, stage_id: stage, to_user_id: toId } = req.body || {};
    const reason = String(req.body?.reason ?? "").trim();
    if (!isUuid(projectId) || !isUuid(toId) || (stage != null && !isSmallintId(stage))) return sendError(res, "Invalid project, phase or engineer.", 400);
    if (!reason) return sendError(res, "A reason is required.", 400);
    const stageId = stage == null ? null : Number(stage);
    const data = await withTransaction(async (db) => {
      await db.query("select id from projects where id=$1 for update", [projectId]);
      const project = await projectInfo(db, projectId);
      if (project.lifecycle_status === "archived") throw new HttpError(409, "Archived projects are read-only.");
      const holder = await holderOf(db, project, stageId);
      const state = await loadLicenseState(holder.user_id, { db });
      if (!state.restricted) throw new HttpError(409, "This engineer's license is not expired.");
      if (!state.graceEnded) throw new HttpError(409, `Override opens after the grace period ends on ${state.graceEndsOn}.`);
      if (toId === holder.user_id) throw new HttpError(422, "Choose a different engineer.");
      const role = stageId ? "spm" : "opm";
      await requireEligible(db, toId, role);
      const suggestions = rank(await candidateRows(db, project, stageId, holder.user_id), project);
      if (!suggestions.some((c) => c.id === toId)) throw new HttpError(422, role === "spm" ? "This engineer does not cover the phase disciplines." : "This Office PM is not specialised in this project type.");
      const rules = state.rules;
      const deadline = businessDeadline(new Date(), rules.response);
      let override;
      try {
        override = (await db.query(
          `insert into license_overrides(project_id,project_stage_id,role_code,from_user_id,to_user_id,reason,expired_on,grace_ended_on,response_deadline_at,requested_by)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, status, response_deadline_at`,
          [projectId, stageId, role, holder.user_id, toId, reason, state.expiry, state.graceEndsOn, deadline, user.id])).rows[0];
      } catch (error) {
        if (error.code === "23505") throw new HttpError(409, "A reassignment request is already waiting for a response.");
        throw error;
      }
      const summary = await phaseSummary(db, projectId, stageId);
      const progress = stageId ? ` · verified progress ${summary.approved} of ${summary.required} items (${summary.pct}%)` : "";
      await notify(db, {
        title: stageId ? "Reassigned phase" : "Reassigned project", projectId, actorId: user.id, recipientIds: [toId],
        detail: `${project.name}${holder.stage ? " · " + holder.stage : ""}${progress} · ${PREVIOUS_ENGINEER_UNAVAILABLE}`,
      });
      await notify(db, { title: "Reassignment requested", projectId, actorId: user.id, recipientIds: await adminIds(db),
        detail: `${project.name}${holder.stage ? " · " + holder.stage : ""} · waiting for the replacement to accept` });
      return override;
    });
    return sendOk(res, "Reassignment requested.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

/** GET /licenses/requests — reassignment requests waiting for the signed-in engineer. No license detail is shown. */
export const myRequests = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    const rows = (await execute(
      `select o.id, o.project_id, p.name as project_name, o.project_stage_id as stage_id, s.code as stage, o.role_code, o.response_deadline_at
         from license_overrides o join projects p on p.id=o.project_id left join project_stages s on s.id=o.project_stage_id
        where o.to_user_id=$1 and o.status='pending_acceptance' order by o.requested_at`, [user.id])).rows;
    const out = [];
    const reader = { query: (sql, params) => execute(sql, params) };
    for (const row of rows) {
      out.push({ id: row.id, projectId: row.project_id, projectName: row.project_name, stageId: row.stage_id, stage: row.stage, role: row.role_code,
        title: row.role_code === "spm" ? "Reassigned phase" : "Reassigned project", reason: PREVIOUS_ENGINEER_UNAVAILABLE,
        responseDeadlineAt: row.response_deadline_at, summary: await phaseSummary(reader, row.project_id, row.stage_id) });
    }
    return sendOk(res, "Requests retrieved.", out.length, out);
  } catch (error) { return handleError(res, error); }
};

async function respond(req, res, accept) {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    if (!/^\d+$/.test(req.params.id)) return sendError(res, "Invalid request id.", 400);
    const note = String(req.body?.note ?? "").trim() || null;
    const data = await withTransaction(async (db) => {
      const found = await db.query("select * from license_overrides where id=$1 and to_user_id=$2 for update", [req.params.id, user.id]);
      const o = found.rows[0];
      if (!o) throw new HttpError(404, "Request not found.");
      if (o.status !== "pending_acceptance") throw new HttpError(409, `This request is already ${o.status}.`);
      const project = await projectInfo(db, o.project_id);
      if (project.lifecycle_status === "archived") throw new HttpError(409, "Archived projects are read-only.");
      const admins = await adminIds(db);
      const place = async () => (await db.query("select code from project_stages where id=$1", [o.project_stage_id])).rows[0]?.code;
      const stageCode = o.project_stage_id ? await place() : null;
      const label = `${project.name}${stageCode ? " · " + stageCode : ""}`;
      if (!accept) {
        await db.query("update license_overrides set status='declined', responded_at=now(), response_note=$2 where id=$1", [o.id, note]);
        await notify(db, { title: "Reassignment declined", projectId: o.project_id, actorId: user.id, recipientIds: admins,
          detail: `${label} · ${user.full_name} declined${note ? ": " + note : ""} · choose another engineer` });
        return { id: o.id, status: "declined" };
      }
      await assertLicenseActive(user, db);
      if (o.response_deadline_at && new Date(o.response_deadline_at) < new Date()) throw new HttpError(409, "The response deadline has passed; ask an Administrator to reassign.");
      await requireEligible(db, user.id, o.role_code);
      const lockedHolder = o.role_code === "spm"
        ? (await db.query("select * from project_phase_team where project_id=$1 and project_stage_id=$2 for update", [o.project_id, o.project_stage_id])).rows[0]
        : null;
      const currentHolder = o.role_code === "spm" ? lockedHolder?.spm_user_id : project.suggested_opm_id;
      if (currentHolder !== o.from_user_id) {
        await db.query("update license_overrides set status='cancelled', responded_at=now(), response_note='The assignment changed before this was answered' where id=$1", [o.id]);
        throw new HttpError(409, "This assignment changed in the meantime. Ask an Administrator to reassign.");
      }
      // The original engineer stays on record: their history row is closed, not removed.
      await ensureOpenHistory(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code, userId: o.from_user_id,
        startedAt: lockedHolder?.created_at || null, createdBy: o.requested_by });
      await closeOpenHistory(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code });
      const historyId = await openTookOver(db, { projectId: o.project_id, stageId: o.project_stage_id, role: o.role_code, userId: user.id, createdBy: user.id });
      if (o.role_code === "spm") {
        // is_lead stays on the same row, so the Lead Site PM designation moves with the phase.
        await db.query(
          `update project_phase_team set spm_user_id=$3, status='confirmed', responded_at=now(), response_deadline_at=null, updated_by=$4, updated_at=now()
            where project_id=$1 and project_stage_id=$2`, [o.project_id, o.project_stage_id, user.id, user.id]);
        await db.query(
          `update project_engineers set unassigned_at=now(), updated_by=$3, updated_at=now()
            where project_id=$1 and user_id=$2 and unassigned_at is null
              and not exists(select 1 from project_phase_team t where t.project_id=$1 and t.spm_user_id=$2)`, [o.project_id, o.from_user_id, user.id]);
      } else {
        await db.query("update projects set suggested_opm_id=$2, suggested_opm_match_score=null, updated_by=$3, updated_at=now() where id=$1", [o.project_id, user.id, user.id]);
        await db.query("update project_engineers set unassigned_at=now(), updated_by=$3, updated_at=now() where project_id=$1 and user_id=$2 and project_role_label='Office PM (oversight)' and unassigned_at is null", [o.project_id, o.from_user_id, user.id]);
        await db.query(
          `insert into project_engineers(project_id,user_id,project_role_label,assigned_at,created_by,updated_by)
           select $1,$2,'Office PM (oversight)',now(),$2,$2
            where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and project_role_label='Office PM (oversight)' and unassigned_at is null)`,
          [o.project_id, user.id]);
      }
      await db.query("update license_overrides set status='accepted', responded_at=now(), response_note=$2 where id=$1", [o.id, note]);
      await notify(db, { title: stageCode ? `${user.full_name} took over ${stageCode}` : `${user.full_name} took over as Office PM`, projectId: o.project_id, actorId: user.id,
        recipientIds: [...admins, ...(o.role_code === "spm" ? [project.suggested_opm_id] : [])], detail: project.name });
      await notify(db, { title: stageCode ? `${stageCode} reassigned` : "Project reassigned", projectId: o.project_id, actorId: user.id, recipientIds: [o.from_user_id],
        detail: "Your past work and approvals stay on record." });
      return { id: o.id, status: "accepted", historyId };
    });
    return sendOk(res, accept ? "You took over this assignment." : "Request declined.", 1, data);
  } catch (error) { return handleError(res, error); }
}
export const acceptRequest = (req, res) => respond(req, res, true);
export const declineRequest = (req, res) => respond(req, res, false);

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
