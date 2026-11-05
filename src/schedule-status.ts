import { dateLabel } from "./model.ts"

// Schedule status is calculated on screen from data already loaded: the project's
// status and its target end date (`Project.end`, the backend's target_end_date).
// Nothing here is stored.
export type ScheduleStatus =
  | { state: "completed"; label: "Completed"; targetEnd?: string }
  | { state: "delayed"; label: "Delayed"; targetEnd: string; daysOverdue: number }
  | { state: "on_schedule"; label: "On schedule"; targetEnd: string }
  | { state: "no_target"; label: "No target date" }

const DAY_MS = 86_400_000

// Calendar days only: parsed at UTC midnight so DST and time zones never shift the count.
function calendarDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY_MS
    : null
}

// The user's LOCAL calendar date as YYYY-MM-DD (model.today() is the UTC date).
export function localToday(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function scheduleStatus(
  project: { status: string; end?: string },
  today = localToday(),
): ScheduleStatus {
  const end = calendarDay(project.end)
  if (project.status === "completed")
    return { state: "completed", label: "Completed", targetEnd: end === null ? undefined : project.end }
  if (end === null) return { state: "no_target", label: "No target date" }
  const now = calendarDay(today)
  const daysOverdue = now === null ? 0 : now - end
  if (daysOverdue > 0)
    return { state: "delayed", label: "Delayed", targetEnd: project.end!, daysOverdue }
  return { state: "on_schedule", label: "On schedule", targetEnd: project.end! }
}

// Only live projects can be delayed; completed and not-yet-active records never are.
export const isDelayed = (project: { status: string; end?: string }, today?: string) =>
  project.status === "active" && scheduleStatus(project, today).state === "delayed"

export const delayedProjects = <P extends { status: string; end?: string }>(projects: P[], today?: string) =>
  projects.filter((p) => isDelayed(p, today))

export const overdueText = (days: number) => `${days} ${days === 1 ? "day" : "days"} overdue`

export const delayedBannerText = (status: Extract<ScheduleStatus, { state: "delayed" }>) =>
  `This project passed its target completion date on ${dateLabel(status.targetEnd)} (${overdueText(status.daysOverdue)}).`
