import type { ClientProjectView } from "./client-access.ts"
import { dateLabel, localToday } from "./model.ts"
import { calendarDay, progressLabel } from "./project-progress.ts"

// Read only the already-authorized Client projection. No additional records or forecasts.
export function clientExecutiveSummary(project: ClientProjectView, reportingDate = localToday()) {
  const progress = Number.isFinite(project.progress) && project.progress >= 0 && project.progress <= 100
    ? `${progressLabel(project.progress)}%` : null
  const phase = project.phase.trim()
  const narrative = project.status === "completed"
    ? `${project.name} is recorded as completed.`
    : `${project.name} is active${phase ? ` in the ${phase} phase` : ""}. ${progress ? `Recorded progress for the current phase is ${progress}.` : "Current phase progress has not been shared."}`
  const end = calendarDay(project.end)
  const start = calendarDay(project.start)
  const current = calendarDay(reportingDate)
  let schedule = {
    label: "Date not confirmed", tone: "", detail: "Ask your project team to confirm the target completion date.",
  }
  if (project.status === "completed") {
    const completedAt = project.completedAt && Number.isFinite(Date.parse(project.completedAt)) ? dateLabel(project.completedAt) : null
    schedule = { label: "Completed", tone: "green", detail: completedAt ? `Completion recorded ${completedAt}.` : "Completion is recorded; a completion date has not been shared." }
  } else if (end !== null && (start === null || end > start) && current !== null) {
    const days = end - current
    schedule = days < 0
      ? { label: "Target date passed", tone: "amber", detail: `The recorded target was ${dateLabel(project.end!)}. Ask the project team to confirm the completion date and next steps.` }
      : days === 0
        ? { label: "Target date is today", tone: "amber", detail: "Ask your project team for the latest completion update." }
        : days <= 14
          ? { label: `Target in ${days} ${days === 1 ? "day" : "days"}`, tone: "amber", detail: `Target completion is ${dateLabel(project.end!)}. This is the recorded date, not a completion forecast.` }
          : { label: "Target date recorded", tone: "", detail: `Target completion is ${dateLabel(project.end!)}. Schedule performance has not been confirmed in this view.` }
  }
  const latest = project.history.slice().reverse().sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0]
  const latestDate = latest && Number.isFinite(Date.parse(latest.date)) ? dateLabel(latest.date) : null
  const underReview = project.status === "completed" ? 0 : project.checklist.filter(item => item.status === "under_review").length
  return {
    narrative, schedule, latest, latestDate, underReview,
    documents: project.documents.filter(doc => doc.uploaded).length,
    photos: project.photos.filter(photo => photo.uploaded).length,
  }
}
