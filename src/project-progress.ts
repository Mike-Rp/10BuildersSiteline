import type { PhaseProgress } from "./model.ts"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import type { ConstructionPhaseStatus } from "../Thesis-Backend/src/domain/construction-phase-progress.js"
export { activityEarned, phaseProgress, projectProgress, reworkImpact } from "../Thesis-Backend/src/domain/verified-progress.js"
export type { ProgressTotals, VerifiedActivity, VerifiedPhase, VerifiedProgress } from "../Thesis-Backend/src/domain/verified-progress.js"

const DAY = 86_400_000
const phaseStatuses: ConstructionPhaseStatus[] = ["Not Started", "Ongoing", "Pending Approval", "Completed", "On Hold"]

export function constructionPhaseRows(phases: string[], source?: PhaseProgress[]) {
  return phases.map((name, position) => {
    const required = standardActivities(position, phases.length).length
    const matches = source?.filter(row => row.name === name) || []
    const row = matches.length === 1 ? matches[0] : undefined
    // An older API's aggregate totals cannot establish which requirements were approved.
    const valid = row?.required === required && Number.isSafeInteger(row.approved) && row.approved >= 0 && row.approved <= required
    const approved = valid ? row!.approved : 0
    let status: ConstructionPhaseStatus = valid && row?.status && phaseStatuses.includes(row.status)
      ? row.status : approved > 0 ? "Ongoing" : "Not Started"
    if (status === "Completed" && approved !== required) status = approved > 0 ? "Ongoing" : "Not Started"
    return { name, approved, required, status, locked: row?.locked === true }
  })
}
// Parse calendar dates without local-time/DST offsets; reject rollover dates.
export function calendarDay(value?: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY : null
}

export function plannedCompletion(start: string, end: string | undefined, reportingDate: string) {
  const first = calendarDay(start), last = calendarDay(end), current = calendarDay(reportingDate)
  if (first === null || last === null || current === null || last <= first) return null
  return Math.max(0, Math.min(100, (current - first) * 100 / (last - first)))
}

export function overallChecklistProgress(phases: string[], source?: PhaseProgress[]) {
  const duplicateIds = !!source && new Set(source.map(p => p.id)).size !== source.length
  // Show stored extra phase rows too, but do not claim the expected scope is complete.
  const names = [...new Set([...phases, ...(source || []).map(p => p.name)])]
  const rows = names.map(name => {
    const matches = source?.filter(p => p.name === name) || []
    const row = matches[0]
    const valid = !duplicateIds && matches.length === 1 && row.configured === true &&
      Number.isSafeInteger(row.required) && row.required > 0 &&
      Number.isSafeInteger(row.approved) && row.approved >= 0 && row.approved <= row.required
    return { name, approved: valid ? row.approved : null, required: valid ? row.required : null,
      percentage: valid ? row.approved * 100 / row.required : null }
  })
  const complete = phases.length > 0 && new Set(phases).size === phases.length &&
    !!source && source.length === phases.length && rows.every(row => row.percentage !== null)
  const required = complete ? rows.reduce((sum, row) => sum + row.required!, 0) : null
  const approved = complete ? rows.reduce((sum, row) => sum + row.approved!, 0) : null
  return { rows, required, approved,
    percentage: required !== null && approved !== null ? approved * 100 / required : null }
}

export const progressLabel = (value: number) => Number(value.toFixed(1)).toString()

export function progressGap(actual: number | null, planned: number | null) {
  if (actual === null || planned === null) return null
  const difference = Number((Number(progressLabel(actual)) - Number(progressLabel(planned))).toFixed(1))
  return difference === 0 ? "Matches date-based baseline."
    : `${progressLabel(Math.abs(difference))} percentage points ${difference < 0 ? "below" : "above"} date-based baseline.`
}
