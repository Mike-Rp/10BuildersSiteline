import { dateLabel } from "./model"
import { delayedBannerText, overdueText, scheduleStatus, type ScheduleStatus } from "./schedule-status"
import { Icon } from "./ui"
import "./schedule-status.css"

const ICONS: Record<ScheduleStatus["state"], string> = {
  completed: "check",
  delayed: "alert",
  on_schedule: "calendar",
  no_target: "clock",
}

// Status is always an icon plus text, never colour alone.
export default function ScheduleBadge({
  status,
  withDays = false,
}: {
  status: ScheduleStatus
  withDays?: boolean
}) {
  return (
    <span className={`schedule-badge ${status.state}`}>
      <Icon name={ICONS[status.state]} size={16} />
      {status.label}
      {withDays && status.state === "delayed" && ` · ${overdueText(status.daysOverdue)}`}
    </span>
  )
}

// Badge, target date and (when delayed) days overdue. Only live and completed projects have a schedule.
export function ScheduleDetails({
  project,
  today,
}: {
  project: { status: string; end?: string }
  today?: string
}) {
  if (project.status !== "active" && project.status !== "completed") return null
  const status = scheduleStatus(project, today)
  return (
    <div className="schedule-details">
      <ScheduleBadge status={status} />
      {"targetEnd" in status && status.targetEnd && <span>Target completion: {dateLabel(status.targetEnd)}</span>}
      {status.state === "delayed" && <span className="schedule-overdue">{overdueText(status.daysOverdue)}</span>}
    </div>
  )
}

// Read-only notice for a Site PM on a delayed project; renders nothing otherwise.
export function DelayedBanner({
  project,
  today,
}: {
  project: { status: string; end?: string }
  today?: string
}) {
  if (project.status !== "active") return null
  const status = scheduleStatus(project, today)
  if (status.state !== "delayed") return null
  return (
    <div className="schedule-banner" role="status">
      <Icon name="alert" size={20} />
      <p>{delayedBannerText(status)}</p>
    </div>
  )
}
