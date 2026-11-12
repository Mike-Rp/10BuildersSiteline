import type { PhaseProgress } from "./model.ts"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import type { ConstructionPhaseStatus } from "../Thesis-Backend/src/domain/construction-phase-progress.js"
import { FOUNDATION_WEIGHTING, FOUNDATION_PROJECT_WEIGHT } from "../Thesis-Backend/src/domain/verified-progress.js"
export { activityEarned, phaseProgress, projectProgress, reworkImpact, phaseProjectWeights, FOUNDATION_WEIGHTING, FOUNDATION_PROJECT_WEIGHT } from "../Thesis-Backend/src/domain/verified-progress.js"
export type { ProgressTotals, VerifiedActivity, VerifiedPhase, VerifiedProgress } from "../Thesis-Backend/src/domain/verified-progress.js"

const DAY = 86_400_000
const phaseStatuses: ConstructionPhaseStatus[] = ["Not Started", "Ongoing", "Pending Approval", "Completed", "On Hold"]

export function constructionPhaseRows(phases: string[], source?: PhaseProgress[]) {
  return phases.map((name, position) => {
    const standardRequired = standardActivities(position, phases.length).length
    const matches = source?.filter(row => row.name === name) || []
    const row = matches.length === 1 ? matches[0] : undefined
    // An older API's aggregate totals cannot establish which requirements were approved.
    const explicitStatus = !!row?.status && phaseStatuses.includes(row.status)
    // Multi-engineer phases contain one standard checklist per engineer. Only
    // accept those larger totals with an explicit, configured server status.
    const validScope = row?.required === standardRequired || (row?.configured === true && explicitStatus &&
      Number.isSafeInteger(row.required) && row.required > 0 && row.required % standardRequired === 0)
    const valid = validScope && !!row && Number.isSafeInteger(row.approved) && row.approved >= 0 && row.approved <= row.required
    const required = valid ? row!.required : standardRequired
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

export function overallChecklistProgress(phases: string[], source?: PhaseProgress[], weighting?: string | null) {
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
  let percentage = required !== null && approved !== null ? approved * 100 / required : null
  // Newly configured projects: Foundation is worth a fixed share of the whole project and the rest is
  // shared in proportion to required checklist weight (every activity weighs the same, so required counts).
  const foundation = rows.filter(row => row.name.trim().toLowerCase() === "foundation")
  if (percentage !== null && weighting === FOUNDATION_WEIGHTING && foundation.length === 1) {
    const others = rows.filter(row => row !== foundation[0])
    const pool = others.reduce((sum, row) => sum + row.required!, 0)
    let points = foundation[0].percentage! * (others.length ? FOUNDATION_PROJECT_WEIGHT : 100) / 100
    for (const row of others) points += row.percentage! * ((100 - FOUNDATION_PROJECT_WEIGHT) * row.required! / pool) / 100
    const rounded = Number(points.toFixed(9))
    percentage = Math.abs(rounded - Math.round(rounded)) < 1e-9 ? Math.round(rounded) : rounded
  }
  return { rows, required, approved, percentage }
}

export const progressLabel = (value: number) => Number(value.toFixed(1)).toString()

export function progressGap(actual: number | null, planned: number | null) {
  if (actual === null || planned === null) return null
  const difference = Number((Number(progressLabel(actual)) - Number(progressLabel(planned))).toFixed(1))
  return difference === 0 ? "Matches date-based baseline."
    : `${progressLabel(Math.abs(difference))} percentage points ${difference < 0 ? "below" : "above"} date-based baseline.`
}
