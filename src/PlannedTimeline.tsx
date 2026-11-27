import { Icon } from "./ui"
import { dateLabel, plannedDays, type Project } from "./model"
import ScheduleStatusBadge, { useScheduleToday } from "./ScheduleStatus"
import { projectScheduleStatus } from "./domain/schedule-status"

export default function PlannedTimeline({
  project,
  compact = false,
  summary = false,
}: {
  project: Pick<Project, "start" | "end" | "progress" | "status">
  compact?: boolean
  summary?: boolean
}) {
  const today = useScheduleToday()
  const schedule = projectScheduleStatus(project, today)
  const days = plannedDays(project.start, project.end)
  if (!schedule.targetEndDate || !days || days <= 0) {
    if (summary) return <div className="monitor-schedule-summary"><p>Calendar duration and planned time elapsed unavailable until valid target dates are recorded.</p><p>Recorded progress: {project.progress}%</p></div>
    return (
      <div className="planned-timeline">
        <span className="timeline-range">
          <Icon name="calendar" size={17} />
          {Number.isFinite(Date.parse(project.start)) ? dateLabel(project.start) : "Start date not set"} – {schedule.targetEndDate ? dateLabel(schedule.targetEndDate) : "End date not set"}
        </span>
        <ScheduleStatusBadge project={project} today={today} />
      </div>
    )
  }
  const elapsedPct = Math.min(100, Math.max(0, Math.round((plannedDays(project.start, today) || 0) / days * 100)))
  const remaining = plannedDays(today, schedule.targetEndDate)!
  if (summary) return <div className="monitor-schedule-summary"><dl>
    <div><dt>Calendar duration</dt><dd>{days.toLocaleString()} days</dd></div>
    <div><dt>Planned time elapsed</dt><dd>{elapsedPct}%</dd></div>
    <div><dt>Recorded progress</dt><dd>{project.progress}%</dd></div>
    <div><dt>{schedule.status === "Completed" ? "Project record" : remaining >= 0 ? "Days to target end" : "Days past target end"}</dt><dd>{schedule.status === "Completed" ? "Completed" : Math.abs(remaining).toLocaleString()}</dd></div>
  </dl></div>
  return (
    <div className={`planned-timeline ${compact ? "compact" : ""}`}>
      <span className="timeline-range">
        <Icon name="calendar" size={17} />
        {dateLabel(project.start)} – {dateLabel(schedule.targetEndDate)}
        <span className="mid-dot">·</span>
        {days.toLocaleString()} calendar days
      </span>
      {!compact && (
        <>
          <div className="timeline-bar" aria-hidden="true">
            <span className="elapsed" style={{ width: `${elapsedPct}%` }} />
            <span className="actual" style={{ width: `${project.progress}%` }} />
          </div>
          <div className="timeline-meta">
            <span>
              Planned time elapsed {elapsedPct}% · Recorded progress{" "}
              {project.progress}%
            </span>
            <span>
              {schedule.status === "Completed" ? "Completed project record" : remaining >= 0
                ? `${remaining.toLocaleString()} days to target end`
                : `${(-remaining).toLocaleString()} days past target end`}
            </span>
          </div>
        </>
      )}
      <ScheduleStatusBadge project={project} today={today} />
    </div>
  )
}
