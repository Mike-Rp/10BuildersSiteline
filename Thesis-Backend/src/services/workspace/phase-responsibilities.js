import { assertEvidenceHandoverReady } from '../projects/responsibility-handover.utility.js';
import {
  HttpError,
  isProjectOpmOrAdmin,
  isUuid,
} from "../../common/utilities/access.utility.js"
import { projectWorkflowSql } from "../projects/project-workflow.utility.js"
import { responsibilitiesInstalled } from "../projects/phase-responsibilities.utility.js"
import { assertAcceptancePrerequisites } from "../projects/assignment-prerequisites.utility.js"
import {
  prepareEngineerAssignments,
  engineerCommitments,
} from "../projects/engineer-commitments.utility.js"
import {
  assertEligibleManager,
  LICENSE_ELIGIBILITY_SQL,
} from "../../common/utilities/license-eligibility.utility.js"
import { assertPhaseUnlocked, readChecklist } from "../progress/phase.utility.js"
import { assertAssignmentWritable } from "../progress/assignment.utility.js"
import { transitionPhase } from "../progress/handoff.utility.js"
import { maybeCloseProject } from "../archive/policy.js"
import { recordArchiveEvent } from "../archive/audit.utility.js"

export function registerResponsibilityRoutes(router, { endpoint, project }) {
  router.get(
    "/projects/:id/engineer-responsibilities",
    endpoint(["admin", "opm", "spm"], async (db, user, req) => {
      const p = await project(db, user, req.params.id)
      if (!(await responsibilitiesInstalled(db)))
        return { available: false, rows: [] }
      const allRows = (
        await db.query(
          `select r.*,s.code as phase,u.full_name as name from project_phase_responsibilities r join project_stages s on s.id=r.project_stage_id join users u on u.id=r.user_id left join (${projectWorkflowSql}) flow on flow.project_id=r.project_id and flow.project_stage_id=r.project_stage_id where r.project_id=$1 order by flow.sort_order nulls last,r.project_stage_id,r.id`,
          [p.id],
        )
      ).rows
      const canReview = await isProjectOpmOrAdmin(user, p.id, db)
      // An engineer's own workspace lists only that engineer's responsibilities, one per phase. Other
      // engineers' notes and evidence stay with the Office PM and Administrator who review them.
      const rows = canReview ? allRows : allRows.filter((row) => String(row.user_id) === String(user.id))
      for (const row of rows) {
        row.complete = row.completion_status === "approved"
        const checklist=await readChecklist(db,p.id,row.project_stage_id,{userId:row.user_id});
        row.progress=checklist.pct;
        row.requirements=checklist.required_count;
        row.approved=checklist.approved_count;
        row.missing=checklist.items.filter(item=>item.required&&item.status!=="approved").map(item=>({title:item.title,status:item.status}));
      }
      if (canReview && rows.length) {
        const eligible = (
          await db.query(
            `select u.id,u.full_name as name from users u join roles r on r.id=u.role_id where r.code='spm' and u.status='active' and not coalesce(u.is_deleted,false) and ${LICENSE_ELIGIBILITY_SQL} order by u.full_name`,
          )
        ).rows
        const existingCommitments = await engineerCommitments(
          db,
          eligible.map((e) => e.id),
        )
        for (const row of rows) {
          row.replacement_candidates = []
          if (row.complete) continue
          for (const person of eligible)
            if (
              !rows.some(
                (r) =>
                  r.project_stage_id === row.project_stage_id &&
                  r.user_id === person.id,
              )
            )
              try {
                await prepareEngineerAssignments(
                  db,
                  p.project_type_id,
                  [
                    {
                      stage: row.phase,
                      user_id: person.id,
                      assigned_disciplines: row.assigned_disciplines,
                    },
                  ],
                  { projectId: p.id, lock: false, existingCommitments },
                )
                row.replacement_candidates.push(person)
              } catch (e) {
                if (e.status !== 409) throw e
              }
        }
      }
      const own =
        user.role === "spm" ? await engineerCommitments(db, [user.id]) : []
      const availabilityLabel = own.some((r) => r.status === "confirmed")
        ? "Committed to a project"
        : own.length
          ? "Reserved — awaiting acceptance"
          : "Available for allocation"
      return {
        available: true,
        rows,
        canReview,
        availabilityLabel,
        currentStage: p.current_stage_id,
        lifecycle: p.lifecycle_status,
      }
    }),
  )
  router.post(
    "/projects/:id/engineer-responsibilities/:responsibilityId",
    endpoint(["admin", "opm", "spm"], async (db, user, req) => {
      const p = await project(db, user, req.params.id, true)
      if (!(await responsibilitiesInstalled(db)))
        throw new HttpError(409, "Apply database migration 020 first.")
      if (p.lifecycle_status === "archived")
        throw new HttpError(409, "Archived responsibilities are read-only.")
      const row = (
        await db.query(
          `select r.*,s.code as phase from project_phase_responsibilities r join project_stages s on s.id=r.project_stage_id where r.id::text=$1 and r.project_id=$2 for update of r`,
          [req.params.responsibilityId, p.id],
        )
      ).rows[0]
      if (!row) throw new HttpError(404, "Responsibility not found.")
      const { action, note, fileId, newUserId } = req.body || {}
      if (
        note !== undefined &&
        (typeof note !== "string" || note.length > 10000)
      )
        throw new HttpError(
          422,
          "Notes must be text of at most 10,000 characters.",
        )
      if (
        ![
          "accept",
          "decline",
          "submit_completion",
          "approve_completion",
          "return_completion",
          "replace",
        ].includes(action)
      )
        throw new HttpError(400, "Unknown responsibility action.")
      const coordinator = (
        await db.query(
          "select * from project_phase_team where project_id=$1 and project_stage_id=$2",
          [p.id, row.project_stage_id],
        )
      ).rows[0]
      if (["accept", "decline", "submit_completion"].includes(action)) {
        if (user.role !== "spm" || user.id !== row.user_id)
          throw new HttpError(
            403,
            "Only the assigned engineer can respond or submit their work.",
          )
        if (!["spm_review", "active"].includes(p.lifecycle_status))
          throw new HttpError(
            409,
            "Wait for OPM acceptance and all required documents.",
          )
      }
      if (["accept", "decline"].includes(action)) {
        if (row.status !== "pending")
          throw new HttpError(
            409,
            "This responsibility has already received a response.",
          )
        if (
          (row.offer_deadline_at || coordinator?.response_deadline_at) &&
          new Date(row.offer_deadline_at || coordinator.response_deadline_at) <= new Date()
        )
          throw new HttpError(
            409,
            "The response deadline has passed. Ask Admin for reassignment.",
          )
        if (action === "accept") {
          // Same gate as phase-team acceptance: OPM accepted, six documents, Lead Site PM first.
          await assertAcceptancePrerequisites(db, p, user)
          await assertEligibleManager(db, user.id, "spm")
          await prepareEngineerAssignments(
            db,
            p.project_type_id,
            [
              {
                stage: row.phase,
                user_id: user.id,
                assigned_disciplines: row.assigned_disciplines,
              },
            ],
            { projectId: p.id },
          )
        } else if (typeof note !== "string" || !note.trim())
          throw new HttpError(422, "Give a reason for declining.")
        const status = action === "accept" ? "confirmed" : "declined"
        await db.query(
          "update project_phase_responsibilities set status=$2,responded_at=now(),review_note=$3 where id=$1",
          [row.id, status, note || null],
        )
        if (coordinator?.spm_user_id === user.id)
          await db.query(
            "update project_phase_team set status=$3,responded_at=now(),updated_by=$4 where project_id=$1 and project_stage_id=$2",
            [p.id, row.project_stage_id, status, user.id],
          )
      } else if (action === "submit_completion") {
        if (
          row.status !== "confirmed" ||
          ["submitted", "approved"].includes(row.completion_status)
        )
          throw new HttpError(
            409,
            "Accept the assignment and finish the current review first.",
          )
        await assertPhaseUnlocked(db, p, row.project_stage_id)
        await assertAssignmentWritable(db,user,p,row.project_stage_id)
        const checklist=await readChecklist(db,p.id,row.project_stage_id,{userId:row.user_id});
        if (!checklist.construction.complete) throw new HttpError(409,"All your required checklist submissions must be approved before completion.")
        if (
          p.lifecycle_status !== "active" ||
          typeof note !== "string" ||
          !note.trim() ||
          note.length > 10000
        )
          throw new HttpError(
            422,
            "An active project and a completion note are required.",
          )
        const evidence = await db.query(
          "select 1 from project_phase_files where id::text=$1 and project_id=$2 and project_stage_id=$3 and uploaded_by=$4",
          [fileId, p.id, row.project_stage_id, user.id],
        )
        if (!evidence.rowCount)
          throw new HttpError(
            422,
            "Upload supporting evidence for your phase responsibilities.",
          )
        await db.query(
          "update project_phase_responsibilities set completion_status='submitted',completion_note=$2,completion_file_id=$3,reviewed_by=null,reviewed_at=null,review_note=null where id=$1",
          [row.id, note.trim(), fileId],
        )
      } else if (["approve_completion", "return_completion"].includes(action)) {
        if (!(await isProjectOpmOrAdmin(user, p.id, db)))
          throw new HttpError(
            403,
            "Only Admin or the assigned Office PM can review completion.",
          )
        if (row.completion_status !== "submitted")
          throw new HttpError(
            409,
            "There is no submitted completion to review.",
          )
        await assertPhaseUnlocked(db, p, row.project_stage_id)
        if (action==="approve_completion") {
          const checklist=await readChecklist(db,p.id,row.project_stage_id,{userId:row.user_id});
          if (p.lifecycle_status!=="active" || Number(p.current_stage_id)!==Number(row.project_stage_id) || !checklist.construction.complete) throw new HttpError(409,"The active assignment's required checklist must be fully approved.")
          if ((await db.query(`select 1 from project_phase_updates where project_id=$1 and selected_stage_id=$2 and submitted_by=$3 and status='pending'
            union all select 1 from pending_rework_requests where project_id=$1 and project_stage_id=$2 and submitted_by=$3 and status='pending' limit 1`,[p.id,row.project_stage_id,row.user_id])).rowCount) throw new HttpError(409,"Resolve this SPM's pending reports and issues before approving completion.")
        }
        if (
          action === "return_completion" &&
          (typeof note !== "string" || !note.trim())
        )
          throw new HttpError(422, "A return reason is required.")
        await db.query(
          "update project_phase_responsibilities set completion_status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 where id=$1",
          [
            row.id,
            action === "approve_completion" ? "approved" : "returned",
            user.id,
            note || null,
          ],
        )
      } else {
        if (!(await isProjectOpmOrAdmin(user, p.id, db)))
          throw new HttpError(
            403,
            "Only Admin or the assigned Office PM can replace an engineer.",
          )
        if (row.completion_status === "approved")
          throw new HttpError(
            409,
            "Completed responsibilities remain historical records.",
          )
        if (
          typeof note !== "string" ||
          !note.trim() ||
          !isUuid(newUserId) ||
          newUserId === row.user_id
        )
          throw new HttpError(
            422,
            "Select a replacement and provide a handover reason.",
          )
        await assertEligibleManager(db, newUserId, "spm")
        await prepareEngineerAssignments(
          db,
          p.project_type_id,
          [
            {
              stage: row.phase,
              user_id: newUserId,
              assigned_disciplines: row.assigned_disciplines,
            },
          ],
          { projectId: p.id },
        )
        if (
          (
            await db.query(
              "select 1 from project_phase_responsibilities where project_id=$1 and project_stage_id=$2 and user_id=$3",
              [p.id, row.project_stage_id, newUserId],
            )
          ).rowCount
        )
          throw new HttpError(
            409,
            "That engineer already has responsibilities in this phase.",
          )
        await assertEvidenceHandoverReady(db,row)
        await db.query(
          "update project_phase_responsibilities set user_id=$2,status='pending',completion_status='unfinished',responded_at=null,completion_note=null,completion_file_id=null,reviewed_by=null,reviewed_at=null,review_note=$3 where id=$1",
          [row.id, newUserId, note.trim()],
        )
        if (coordinator?.spm_user_id === row.user_id)
          await db.query(
            "update project_phase_team set spm_user_id=$3,status='pending',responded_at=null,response_deadline_at=null,updated_by=$4 where project_id=$1 and project_stage_id=$2",
            [p.id, row.project_stage_id, newUserId, user.id],
          )
        await db.query(
          `insert into project_engineers(project_id,user_id,project_role_label,created_by,updated_by) select $1,$2,'Site PM',$3,$3 where not exists(select 1 from project_engineers where project_id=$1 and user_id=$2 and unassigned_at is null)`,
          [p.id, newUserId, user.id],
        )
      }
      if (action==="approve_completion") {
        const current={...p,current_stage:(await db.query("select code from project_stages where id=$1",[p.current_stage_id])).rows[0]?.code};
        if (!await maybeCloseProject(db,current,user.id)) await transitionPhase(db,current,user.id);
      }
      await recordArchiveEvent(
        db,
        user.id,
        "project_phase_responsibilities",
        row.id,
        action,
        {
          project_id: p.id,
          previous: row,
          note: note || null,
          replacement: newUserId || null,
        },
      )
      return { saved: true }
    }),
  )
}
