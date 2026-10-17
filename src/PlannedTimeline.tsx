import { Badge, Icon } from "./ui"
import { dateLabel, plannedDays, timelineStatus, type Project } from "./model"

export default function PlannedTimeline({
  project,
  compact = false,
}: {
  project: Pick<Project, "start" | "end" | "progress">
  compact?: boolean
}) {
  const days = plannedDays(project.start, project.end)
  if (!project.end || !days || days <= 0) {
    return (
      <div className="planned-timeline">
        <span className="timeline-range">
          <Icon name="calendar" size={17} />
          {dateLabel(project.start)} – End date not set
        </span>
      </div>
    )
  }
  const status = timelineStatus(project)
  return (
    <div className={`planned-timeline ${compact ? "compact" : ""}`}>
      <span className="timeline-range">
        <Icon name="calendar" size={17} />
        {dateLabel(project.start)} – {dateLabel(project.end)}
        <span className="mid-dot">·</span>
        {days.toLocaleString()} calendar days
      </span>
      {!compact && status && (
        <>
          <div className="timeline-bar" aria-hidden="true">
            <span className="elapsed" style={{ width: `${status.elapsedPct}%` }} />
            <span className="actual" style={{ width: `${project.progress}%` }} />
          </div>
          <div className="timeline-meta">
            <span>
              Planned time elapsed {status.elapsedPct}% · Recorded progress{" "}
              {project.progress}%
            </span>
            <span>
              {status.remaining >= 0
                ? `${status.remaining.toLocaleString()} days to target end`
                : `${(-status.remaining).toLocaleString()} days past target end`}
            </span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </>
      )}
    </div>
  )
}
