export type ScheduleProject = { status: string; end?: string | null }
export type ScheduleStatus = {
  status: "Completed" | "Delayed" | "On schedule" | "No target date"
  daysOverdue: number
  targetEndDate: string | null
}

// Local calendar date, deliberately not toISOString() (which uses UTC).
export function localScheduleDate(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid local date is required.")
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function calendarDay(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86_400_000 : null
}

// Read-only projection of the loaded target date. No progress-based inference.
// UTC is used only to subtract calendar days, so DST cannot change the count.
export function projectScheduleStatus(project: ScheduleProject, today: Date | string = new Date()): ScheduleStatus {
  const target = calendarDay(project.end)
  const targetEndDate = target === null ? null : project.end!
  if (project.status === "completed") return { status: "Completed", daysOverdue: 0, targetEndDate }
  if (target === null) return { status: "No target date", daysOverdue: 0, targetEndDate: null }
  const current = calendarDay(typeof today === "string" ? today : localScheduleDate(today))
  if (current === null) throw new RangeError("Today must be a valid local calendar date.")
  const daysOverdue = Math.max(0, current - target)
  return { status: daysOverdue > 0 ? "Delayed" : "On schedule", daysOverdue, targetEndDate }
}

export function delayedProjects<T extends ScheduleProject>(projects: readonly T[], today: Date | string = new Date()): T[] {
  return projects.filter(project => project.status === "active" && projectScheduleStatus(project, today).status === "Delayed")
}
