import { projectScheduleStatus } from "./schedule-status.ts"

export type CurrentPhaseStatus =
  | "On hold"
  | "Rework required"
  | "Delayed"
  | "Awaiting review"
  | "Ready for handoff"
  | "Ongoing"
  | "Not started"
  | "Completed"

export type CurrentPhaseActivity = {
  id?: string
  label?: string
  status: "missing" | "submitted" | "approved" | "rework_required"
  required?: boolean
  approvalWithdrawn?: boolean
  reviewNote?: string
}

export function hasUnapprovedCorrectedEvidence(
  phase: string,
  activities: readonly CurrentPhaseActivity[],
  history: readonly { phase?: string; text: string }[],
): boolean {
  return activities.some(activity => activity.required !== false && activity.status !== "approved" && (
    activity.status === "rework_required" ||
    activity.approvalWithdrawn === true ||
    Boolean(activity.reviewNote) ||
    Boolean(activity.label && history.some(entry => entry.phase === phase && entry.text.startsWith(`Office PM rejected activity evidence: ${activity.label}.`)))
  ))
}

export type CurrentPhaseStatusInput = {
  projectStatus: string
  targetCompletionDate?: string | null
  activities: readonly CurrentPhaseActivity[]
  assignedSitePmActionsPaused?: boolean
  waitingForReassignedEngineerAcceptance?: boolean
  hasOpenBlockingIssue?: boolean
  hasWithdrawnApprovalAwaitingCorrectedEvidence?: boolean
  today?: Date | string
}

export function currentPhaseStatus(input: CurrentPhaseStatusInput): CurrentPhaseStatus {
  if (input.projectStatus === "completed") return "Completed"

  if (
    input.assignedSitePmActionsPaused === true ||
    input.waitingForReassignedEngineerAcceptance === true ||
    input.hasOpenBlockingIssue === true
  ) return "On hold"

  const required = input.activities.filter(activity => activity.required !== false)

  if (input.hasWithdrawnApprovalAwaitingCorrectedEvidence === true || required.some(activity => activity.status === "rework_required" || activity.approvalWithdrawn === true && activity.status !== "approved"))
    return "Rework required"

  if (projectScheduleStatus({ status: input.projectStatus, end: input.targetCompletionDate }, input.today).status === "Delayed")
    return "Delayed"

  if (required.some(activity => activity.status === "submitted")) return "Awaiting review"

  if (required.length > 0 && required.every(activity => activity.status === "approved")) return "Ready for handoff"

  if (required.some(activity => activity.status === "submitted" || activity.status === "approved")) return "Ongoing"

  return "Not started"
}

export type ClientPhaseStatus = Extract<CurrentPhaseStatus, "Ongoing" | "Delayed" | "Ready for handoff" | "Completed" | "Not started">

export function clientPhaseStatus(status: CurrentPhaseStatus): ClientPhaseStatus {
  if (status === "Completed" || status === "Delayed" || status === "Ready for handoff" || status === "Not started") return status
  // Keep staff-only hold, rework and review details private in the Client portal.
  return "Ongoing"
}
