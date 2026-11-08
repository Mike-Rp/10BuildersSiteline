import { HttpError, isProjectOpmOrAdmin, isUuid } from "../../common/utilities/access.utility.js"
import { assertEligibleManager, LICENSE_ELIGIBILITY_SQL } from "../../common/utilities/license-eligibility.utility.js"
import { engineerCommitments, prepareEngineerAssignments } from "../projects/engineer-commitments.utility.js"
import { recordArchiveEvent } from "../archive/audit.utility.js"

const installed = async db => (await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_phase_responsibilities' and column_name='offer_deadline_at') as ready")).rows[0].ready
async function eligible(db, id, role) {
  try { await assertEligibleManager(db, id, role) }
  catch (error) { if (error.status) throw new HttpError(error.status, error.message); throw error }
}
async function offer(db, projectId, phase, userId) {
  if (typeof phase !== "string" || !isUuid(userId)) throw new HttpError(400, "Select an assigned Site PM and phase.")
  const personal = (await db.query(`select r.*,s.code as phase,'responsibility' as source,
    coalesce(r.offer_deadline_at,t.response_deadline_at) as deadline
    from project_phase_responsibilities r join project_stages s on s.id=r.project_stage_id
    left join project_phase_team t on t.project_id=r.project_id and t.project_stage_id=r.project_stage_id
    where r.project_id=$1 and s.code=$2 and r.user_id=$3 and r.status<>'released'`, [projectId, phase, userId])).rows[0]
  if (personal) return personal
  const legacy = (await db.query(`select t.*,t.spm_user_id as user_id,s.code as phase,'legacy' as source,t.response_deadline_at as deadline
    from project_phase_team t join project_stages s on s.id=t.project_stage_id
    where t.project_id=$1 and s.code=$2 and t.spm_user_id=$3
    and not exists(select 1 from project_phase_responsibilities r where r.project_id=t.project_id and r.project_stage_id=t.project_stage_id)`, [projectId, phase, userId])).rows[0]
  if (!legacy) throw new HttpError(409, "This assignment has changed. Refresh the project before reassigning.")
  return legacy
}
const version = row => JSON.stringify([row.source, String(row.id), row.user_id, row.status, row.deadline ? new Date(row.deadline).toISOString() : null, row.assigned_disciplines])
const replaceable = (row, now) => ["declined", "auto_expired"].includes(row.status) || (row.status === "pending" && row.deadline && new Date(row.deadline).getTime() <= now)
async function ready(db, p) {
  if (!["spm_review", "active"].includes(p.lifecycle_status)) return false
  if (p.lifecycle_status === "active") return true
  return (await db.query(`select count(distinct dt.code)::int as n from project_documents d join document_types dt on dt.id=d.document_type_id
    where d.project_id=$1 and d.status='uploaded' and dt.code=any($2::text[])`, [p.id, ["notice_to_proceed", "building_permit", "owner_contract", "registered_plans", "environmental_certificate", "budget_boq"]])).rows[0].n === 6
}
async function authorize(db, user, p) {
  if (!(await isProjectOpmOrAdmin(user, p.id, db))) throw new HttpError(403, "Only Admin or the assigned Office PM can reassign this offer.")
}
export function registerEngineerReassignmentRoutes(router, { endpoint, project, event }) {
  router.get("/projects/:id/reassignment-options", endpoint(["admin", "opm"], async (db, user, req) => {
    const p = await project(db, user, req.params.id)
    await authorize(db, user, p)
    if (!(await installed(db))) return { available: false, message: "Apply database migration 023 to enable suggested reassignment." }
    const row = await offer(db, p.id, req.query.phase, req.query.userId)
    const now = new Date((await db.query("select now() as now")).rows[0].now).getTime()
    const actionable = await ready(db, p)
    const tags = row.assigned_disciplines || []
    const canReassign = actionable && tags.length > 0 && tags.length <= 3 && row.completion_status !== "approved" && replaceable(row, now)
    const candidates = []
    if (canReassign) {
      const people = (await db.query(`select u.id,u.full_name as name from users u join roles role on role.id=u.role_id where role.code='spm' and u.status='active' and not coalesce(u.is_deleted,false) and ${LICENSE_ELIGIBILITY_SQL} order by u.full_name`)).rows
      const commitments = await engineerCommitments(db, people.map(person => person.id))
      for (const person of people) {
        if (person.id === row.user_id || (await db.query("select 1 from project_phase_responsibilities where project_id=$1 and project_stage_id=$2 and user_id=$3", [p.id, row.project_stage_id, person.id])).rowCount) continue
        try {
          await prepareEngineerAssignments(db, p.project_type_id, [{ stage: row.phase, user_id: person.id, assigned_disciplines: tags }], { projectId: p.id, lock: false, existingCommitments: commitments })
          candidates.push({ ...person, tags })
        } catch (error) { if (error.status !== 409) throw error }
      }
    }
    const current = (await db.query("select full_name as name from users where id=$1", [row.user_id])).rows[0]
    return { available: true, canReassign, version: version(row), phase: row.phase, userId: row.user_id, name: current?.name || "Engineer record unavailable", tags,
      status: row.status, offeredAt: row.offer_started_at || null, deadline: row.deadline, candidates,
      message: !actionable ? "Reassignment offers open after Office PM acceptance and the required documents are complete." : !tags.length ? "This older assignment has no recorded responsibility tags. The system cannot safely guess the replacement scope." : tags.length > 3 ? "This recorded scope exceeds three tags. It requires a reviewed allocation with multiple engineers." : !canReassign ? "Reassignment becomes available when the Site PM declines or the response deadline passes." : candidates.length ? "Candidates cover every responsibility in this offer. Eligibility is checked again when you confirm." : "No eligible replacement covers this responsibility scope. The existing offer has not been changed." }
  }))
  router.post("/projects/:id/reassign-offer", endpoint(["admin", "opm"], async (db, user, req) => {
    const p = await project(db, user, req.params.id, true)
    await authorize(db, user, p)
    if (user.role === "opm") await eligible(db, user.id, "opm")
    if (!(await installed(db))) throw new HttpError(409, "Apply database migration 023 first.")
    const { phase, userId, newUserId, note, version: expected } = req.body || {}
    if (typeof note !== "string" || !note.trim() || note.length > 10000 || !isUuid(newUserId) || newUserId === userId) throw new HttpError(422, "Select a replacement and provide a reassignment reason.")
    const row = await offer(db, p.id, phase, userId)
    if (expected !== version(row)) throw new HttpError(409, "This offer has changed. Reload the suggestions and review it again.")
    const clock = new Date((await db.query("select now() as now")).rows[0].now)
    if (!(await ready(db, p)) || !replaceable(row, clock.getTime()) || row.completion_status === "approved") throw new HttpError(409, "This offer is not eligible for declined or overdue reassignment.")
    const tags = row.assigned_disciplines
    if (!tags?.length || tags.length > 3) throw new HttpError(409, "A recorded responsibility scope of one to three tags is required.")
    await eligible(db, newUserId, "spm")
    await prepareEngineerAssignments(db, p.project_type_id, [{ stage: row.phase, user_id: newUserId, assigned_disciplines: tags }], { projectId: p.id })
    if ((await db.query("select 1 from project_phase_responsibilities where project_id=$1 and project_stage_id=$2 and user_id=$3", [p.id, row.project_stage_id, newUserId])).rowCount) throw new HttpError(409, "That engineer already has a responsibility record in this phase.")
    const deadline = new Date(clock.getTime() + 3 * 86400000)
    // Freeze peers' prior deadline before changing a coordinator's shared deadline.
    await db.query(`update project_phase_responsibilities r set offer_deadline_at=t.response_deadline_at
      from project_phase_team t where r.project_id=$1 and r.project_stage_id=$2 and t.project_id=r.project_id and t.project_stage_id=r.project_stage_id and r.status='pending' and r.offer_deadline_at is null`, [p.id, row.project_stage_id])
    if (row.source === "responsibility") await db.query(`update project_phase_responsibilities set user_id=$2,status='pending',completion_status='unfinished',responded_at=null,completion_note=null,completion_file_id=null,reviewed_by=null,reviewed_at=null,review_note=$3,offer_started_at=$4,offer_deadline_at=$5 where id=$1`, [row.id, newUserId, note.trim(), clock, deadline])
    // Multi-engineer offers now use their own windows; the legacy shared timer must not expire the replacement or change a peer's window.
    await db.query(`update project_phase_team set spm_user_id=$3,status='pending',responded_at=null,response_deadline_at=$4,updated_by=$5,updated_at=now() where project_id=$1 and project_stage_id=$2 and spm_user_id=$6`, [p.id, row.project_stage_id, newUserId, row.source === "legacy" ? deadline : null, user.id, row.user_id])
    await db.query(`insert into project_engineers(project_id,user_id,project_role_label,created_by,updated_by) select $1,$2,'Site PM',$3,$3 where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and unassigned_at is null)`, [p.id, newUserId, user.id])
    await recordArchiveEvent(db, user.id, row.source === "responsibility" ? "project_phase_responsibilities" : "project_phase_team", row.id, "offer_reassigned", { project_id: p.id, previous: row, replacement: newUserId, note: note.trim(), offered_at: clock, response_deadline_at: deadline, tags })
    await event(db, user, p, "Site PM responsibility reassigned", `${row.phase} · ${tags.join(", ")}. A replacement offer requires acceptance by ${deadline.toISOString()}. Previous offer closed. ${note.trim()}`, [row.user_id, newUserId])
    return { saved: true, status: "pending", deadline }
  }))
}
