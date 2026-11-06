import { HttpError } from "../../common/utilities/access.utility.js"
import { readVerifiedProgress } from "../progress/verified.utility.js"
import { recordArchiveEvent } from "../archive/audit.utility.js"
import {
  responsibilitiesInstalled,
  savePhaseResponsibilities,
} from "./phase-responsibilities.utility.js"

export async function commitmentsInstalled(db) {
  return (
    await db.query(
      "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_phase_team' and column_name='assigned_disciplines') as ready",
    )
  ).rows[0].ready
}

// Pending offers reserve capacity too. Official checklist approvals, not project dates,
// cached percentages or the current phase label, release a responsibility.
export async function engineerCommitments(db, userIds) {
  const multi = await responsibilitiesInstalled(db)
  const rows = (
    await db.query(
      `select t.spm_user_id as user_id,t.project_id,p.name as project_name,s.code as phase,
   t.project_stage_id::text as stage_id,t.assigned_disciplines as tags,t.status,false as personal
   from project_phase_team t join projects p on p.id=t.project_id join project_stages s on s.id=t.project_stage_id
   where t.spm_user_id=any($1::uuid[]) and t.status in ('pending','confirmed')
   and p.lifecycle_status not in ('draft','suggested_allocation','confirmed','archived','completed','cancelled')
   and not coalesce(p.is_deleted,false)
   and (t.status='confirmed' or t.response_deadline_at is null or t.response_deadline_at>now())
   ${
     multi
       ? `and not exists(select 1 from project_phase_responsibilities r where r.project_id=t.project_id and r.project_stage_id=t.project_stage_id)
   union all select r.user_id,r.project_id,p.name,s.code,r.project_stage_id::text,r.assigned_disciplines,r.status,true
    from project_phase_responsibilities r join projects p on p.id=r.project_id join project_stages s on s.id=r.project_stage_id
    where r.user_id=any($1::uuid[]) and r.status in ('pending','confirmed') and r.completion_status<>'approved'
    and p.lifecycle_status not in ('draft','suggested_allocation','confirmed','archived','completed','cancelled') and not coalesce(p.is_deleted,false)
    and exists(select 1 from project_phase_team t where t.project_id=r.project_id and t.project_stage_id=r.project_stage_id and (t.status='confirmed' or t.response_deadline_at is null or t.response_deadline_at>now()))`
       : ""
   }`,
      [userIds],
    )
  ).rows
  const progress = await readVerifiedProgress(db, [
    ...new Set(rows.map((r) => r.project_id)),
  ])
  return rows.filter(
    (r) =>
      r.personal ||
      !progress.get(r.project_id)?.phases.find((p) => p.id === r.stage_id)
        ?.complete,
  )
}

export async function prepareEngineerAssignments(
  db,
  typeId,
  team,
  {
    projectId = null,
    lock = true,
    legacyReview = false,
    existingCommitments,
  } = {},
) {
  if (existingCommitments === undefined && !(await commitmentsInstalled(db)))
    return
  const ids = [...new Set(team.map((t) => t.user_id))].sort()
  if (lock)
    for (const id of ids)
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [
        "engineer-commitment:" + id,
      ])
  const existing = existingCommitments ?? (await engineerCommitments(db, ids))
  const singleProject = await responsibilitiesInstalled(db)
  for (const row of team) {
    const other = existing.filter(
      (r) => r.user_id === row.user_id && r.project_id !== projectId,
    )
    if (singleProject && !legacyReview && other.length)
      throw new HttpError(
        409,
        `Unavailable: this engineer has unfinished responsibilities in ${other[0].project_name || "another project"}. Complete or formally release all current responsibilities first.`,
      )
    if (!legacyReview && new Set(other.map((r) => r.project_id)).size >= 2)
      throw new HttpError(
        409,
        "This engineer already has two unfinished project commitments.",
      )
    const qualified = (
      await db.query(
        `select distinct d.code from engineer_qualified_scopes q
    join project_stage_discipline_links l on l.discipline_id=q.discipline_id and l.project_type_id=$1
    join project_stages s on s.id=l.project_stage_id join disciplines d on d.id=q.discipline_id
    where q.user_id=$2 and s.code=$3 order by d.code`,
        [typeId, row.user_id, row.stage],
      )
    ).rows.map((r) => r.code)
    const conflicts = other.filter((r) => r.phase === row.stage)
    const free = qualified.filter(
      (tag) => !conflicts.some((r) => r.tags === null || r.tags.includes(tag)),
    )
    const savedRow = projectId
      ? (
          await db.query(
            `select assigned_disciplines from project_phase_team t join project_stages s on s.id=t.project_stage_id
    where t.project_id=$1 and t.spm_user_id=$2 and s.code=$3 and t.status in ('pending','confirmed')`,
            [projectId, row.user_id, row.stage],
          )
        ).rows[0]
      : undefined
    if (savedRow?.assigned_disciplines === null && !row.assigned_disciplines)
      throw new HttpError(
        409,
        "Admin must review the specialization used by this legacy assignment before acceptance.",
      )
    const saved = savedRow?.assigned_disciplines
    const coordinating =
      singleProject && projectId
        ? (
            await db.query(
              "select r.assigned_disciplines from project_phase_responsibilities r join project_stages s on s.id=r.project_stage_id where r.project_id=$1 and s.code=$2 and r.is_coordinator",
              [projectId, row.stage],
            )
          ).rows[0]?.assigned_disciplines
        : undefined
    const tags =
      row.assigned_disciplines ?? saved ?? coordinating ?? free.slice(0, 1)
    if (
      !Array.isArray(tags) ||
      !tags.length ||
      new Set(tags).size !== tags.length ||
      tags.some((tag) => !qualified.includes(tag))
    )
      throw new HttpError(
        409,
        `No available qualified specialization for ${row.stage}. Choose another engineer or an uncommitted specialization.`,
      )
    if (!legacyReview && tags.some((tag) => !free.includes(tag))) {
      const conflict = conflicts.find(
        (r) => r.tags === null || r.tags.some((t) => tags.includes(t)),
      )
      throw new HttpError(
        409,
        `Unavailable: ${row.stage} — ${tags.join(", ")} is committed to ${conflict?.project_name || "another project"}.${
          conflict?.tags === null
            ? " Its legacy specialization needs Admin review."
            : ""
        }`,
      )
    }
    row.assigned_disciplines = tags
  }
}

export async function saveEngineerScopes(db, projectId, team, actorId) {
  if (!(await commitmentsInstalled(db))) return
  for (const row of team)
    if (row.assigned_disciplines) {
      const changed = await db.query(
        `update project_phase_team set assigned_disciplines=$4::text[],scope_recorded_at=now(),scope_recorded_by=$5
   where project_id=$1 and project_stage_id=(select id from project_stages where code=$2) and spm_user_id=$3 and assigned_disciplines is distinct from $4::text[] returning id`,
        [projectId, row.stage, row.user_id, row.assigned_disciplines, actorId],
      )
      for (const assignment of changed.rows)
        await recordArchiveEvent(
          db,
          actorId,
          "project_phase_team",
          assignment.id,
          "assignment_specialization_recorded",
          {
            project_id: projectId,
            user_id: row.user_id,
            phase: row.stage,
            tags: row.assigned_disciplines,
          },
        )
    }
  await savePhaseResponsibilities(db, projectId, team, actorId)
  if (await responsibilitiesInstalled(db))
    for (const phase of team)
      if (!phase.engineers && phase.assigned_disciplines) {
        const old = (
          await db.query(
            "select r.* from project_phase_responsibilities r join project_stages s on s.id=r.project_stage_id where r.project_id=$1 and s.code=$2 and r.is_coordinator and r.user_id<>$3 for update of r",
            [projectId, phase.stage, phase.user_id],
          )
        ).rows[0]
        if (old) {
          await db.query(
            "update project_phase_responsibilities set user_id=$2,assigned_disciplines=$3,status=(select status from project_phase_team where project_id=$4 and project_stage_id=$5),completion_status='unfinished',completion_note=null,completion_file_id=null,reviewed_by=null,reviewed_at=null,responded_at=null where id=$1",
            [
              old.id,
              phase.user_id,
              phase.assigned_disciplines,
              projectId,
              old.project_stage_id,
            ],
          )
          await recordArchiveEvent(
            db,
            actorId,
            "project_phase_responsibilities",
            old.id,
            "coordinator_reassigned",
            {
              previous: old,
              to_user_id: phase.user_id,
              tags: phase.assigned_disciplines,
            },
          )
        }
      }
}
