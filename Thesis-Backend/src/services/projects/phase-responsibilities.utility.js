import { HttpError } from "../../common/utilities/access.utility.js"
import { assertEligibleManager } from "../../common/utilities/license-eligibility.utility.js"
import { prepareEngineerAssignments } from "./engineer-commitments.utility.js"
import { recordArchiveEvent } from "../archive/audit.utility.js"
import { phaseCoverageQuota } from "../../domain/engineer-phase-coverage.js"

export async function responsibilitiesInstalled(db) {
  return (
    await db.query(
      "select to_regclass('public.project_phase_responsibilities') is not null as ready",
    )
  ).rows[0].ready
}
export async function preparePhaseResponsibilities(
  db,
  typeId,
  team,
  options = {},
) {
  if (!(await responsibilitiesInstalled(db))) return false
  const flat = []
  for (const phase of team) {
    if (!Array.isArray(phase.engineers) || !phase.engineers.length)
      throw new HttpError(
        422,
        `Assign engineers to cover every specialization in ${phase.stage}.`,
      )
    if (phase.engineers[0].user_id !== phase.user_id)
      throw new HttpError(
        422,
        "The first engineer must be the phase coordinator.",
      )
    const required = (
      await db.query(
        `select d.code from project_stage_discipline_links l join disciplines d on d.id=l.discipline_id join project_stages s on s.id=l.project_stage_id where l.project_type_id=$1 and s.code=$2 order by d.code`,
        [typeId, phase.stage],
      )
    ).rows.map((r) => r.code)
    if (required.length >= 5 && phase.engineers.length > 3)
      throw new HttpError(422, `Assign no more than three engineers to ${phase.stage}.`)
    const used = new Set(),
      people = new Set()
    for (const engineer of phase.engineers) {
      if (people.has(engineer.user_id))
        throw new HttpError(
          422,
          "Assign each engineer only once within a phase.",
        )
      people.add(engineer.user_id)
      const tags = engineer.assigned_disciplines
      if (
        !Array.isArray(tags) ||
        !tags.length ||
        tags.length > 3 ||
        new Set(tags).size !== tags.length ||
        tags.some((t) => !required.includes(t) || used.has(t))
      )
        throw new HttpError(
          422,
          "Assign one qualified owner to each required specialization, with at most three tags per engineer.",
        )
      for (const tag of tags) used.add(tag)
      flat.push({ ...engineer, stage: phase.stage })
    }
    const covered = required.filter((tag) => used.has(tag)).length
    const quota = phaseCoverageQuota(required)
    if (covered < quota)
      throw new HttpError(
        422,
        `The specialization coverage for ${phase.stage} is below the required minimum of ${quota} of ${required.length}.`,
      )
  }
  // Lock the complete team in a consistent order before individual credential checks.
  await prepareEngineerAssignments(db, typeId, flat, options)
  for (const row of flat) await assertEligibleManager(db, row.user_id, "spm")
  for (const phase of team)
    phase.assigned_disciplines = phase.engineers[0].assigned_disciplines
  return true
}
export async function savePhaseResponsibilities(db, projectId, team, actorId) {
  if (!(await responsibilitiesInstalled(db))) return
  for (const phase of team)
    if (phase.engineers) {
      const stage = (
        await db.query("select id from project_stages where code=$1", [
          phase.stage,
        ])
      ).rows[0].id
      const existing = (
        await db.query(
          "select * from project_phase_responsibilities where project_id=$1 and project_stage_id=$2 for update",
          [projectId, stage],
        )
      ).rows
      if (existing.some((row) => row.status === "confirmed"))
        throw new HttpError(
          409,
          "Confirmed responsibilities require a formal handover; they cannot be overwritten.",
        )
      await db.query(
        "delete from project_phase_responsibilities where project_id=$1 and project_stage_id=$2",
        [projectId, stage],
      )
      for (const [index, engineer] of phase.engineers.entries()) {
        const row = (
          await db.query(
            `insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,created_by,is_coordinator) values($1,$2,$3,$4,$5,$6) returning id`,
            [
              projectId,
              stage,
              engineer.user_id,
              engineer.assigned_disciplines,
              actorId,
              index === 0,
            ],
          )
        ).rows[0]
        await db.query(
          `insert into project_engineers(project_id,user_id,project_role_label,created_by,updated_by) select $1,$2,'Site PM',$3,$3 where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and unassigned_at is null)`,
          [projectId, engineer.user_id, actorId],
        )
        await recordArchiveEvent(
          db,
          actorId,
          "project_phase_responsibilities",
          row.id,
          "responsibility_offered",
          {
            project_id: projectId,
            phase: phase.stage,
            user_id: engineer.user_id,
            tags: engineer.assigned_disciplines,
          },
        )
      }
    }
}
