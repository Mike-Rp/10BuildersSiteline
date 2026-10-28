import { useEffect, useState } from "react"
import { localScheduleDate, projectScheduleStatus, type ScheduleProject } from "./domain/schedule-status"
import { dateLabel } from "./model"
import { Icon } from "./ui"
import "./schedule-status.css"

// Refresh at local midnight and when returning to a suspended browser tab.
// This clock is presentation state only; nothing is persisted.
export function useScheduleToday() {
  const [today, setToday] = useState(localScheduleDate)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const now = new Date()
      setToday(localScheduleDate(now))
      timer = setTimeout(refresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 50)
    }
    refresh()
    document.addEventListener("visibilitychange", refresh)
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [])
  return today
}

const statusStyle = {
  Completed: { tone: "green", icon: "check" },
  Delayed: { tone: "red", icon: "alert" },
  "On schedule": { tone: "green", icon: "calendar" },
  "No target date": { tone: "neutral", icon: "calendar" },
}
export default function ScheduleStatusBadge({ project, today }: { project: ScheduleProject; today?: string }) {
  const result = projectScheduleStatus(project, today)
  const style = statusStyle[result.status]
  return <span className={`schedule-status-badge ${style.tone}`} data-schedule-status={result.status} aria-label={`Schedule status: ${result.status}`}>
    <span aria-hidden="true"><Icon name={style.icon} size={17} /></span>{result.status}
  </span>
}

export function ProjectScheduleDetails({ project, today }: { project: ScheduleProject; today?: string }) {
  const result = projectScheduleStatus(project, today)
  return <div className="project-schedule-details" aria-label="Project schedule">
    <ScheduleStatusBadge project={project} today={today} />
    <span>Target completion: {result.targetEndDate ? <time dateTime={result.targetEndDate}>{dateLabel(result.targetEndDate)}</time> : "No target date"}</span>
    {result.status === "Delayed" && <strong>{result.daysOverdue} {result.daysOverdue === 1 ? "day" : "days"} overdue</strong>}
  </div>
}

export function DelayedProjectNotice({ project, today }: { project: ScheduleProject & { name: string }; today?: string }) {
  const result = projectScheduleStatus(project, today)
  if (result.status !== "Delayed") return null
  return <div className="schedule-delay-notice" aria-label={`Schedule notice for ${project.name}`}>
    <span aria-hidden="true"><Icon name="alert" size={22} /></span>
    <p>This project passed its target completion date on {dateLabel(result.targetEndDate!)} ({result.daysOverdue} {result.daysOverdue === 1 ? "day" : "days"} overdue).</p>
  </div>
}

export function DelayedProjectsRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (!count) return null
  return <button type="button" className="schedule-delayed-row" onClick={onOpen}>
    <span aria-hidden="true"><Icon name="alert" size={20} /></span><strong>Delayed projects ({count})</strong><span aria-hidden="true"><Icon name="arrow" size={18} /></span>
  </button>
}
