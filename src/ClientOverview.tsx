import { type ReactNode } from "react"
import type { ClientProjectView } from "./client-access"
import { dateLabel } from "./model"
import { calendarDay, progressLabel } from "./project-progress"
import { ProjectScheduleDetails, useScheduleToday } from "./ScheduleStatus"
import InfoPopover from "./InfoPopover"
import { Badge, Button, Icon } from "./ui"
import "./client-overview.css"

export default function ClientOverview({ project, latest, photos, onNavigate, onDetails }: {
  project: ClientProjectView
  latest?: ClientProjectView["history"][number]
  photos: ReactNode
  onNavigate: (page: string) => void
  onDetails: () => void
}) {
  const today = useScheduleToday()
  const overall = project.overallProgress
  const validProgress = typeof overall === "number" && Number.isFinite(overall) && overall >= 0 && overall <= 100
  const endSet = calendarDay(project.end) !== null
  return <div className="client-overview">
    <div className="co-project-meta">
      <span>{project.type}{project.location ? ` · ${project.location}` : ""}</span>
      <Badge tone="green">{project.status === "completed" ? "Completed" : "Active"}</Badge>
    </div>
    <ProjectScheduleDetails project={project} today={today} />
    <section className="co-highlights" aria-label="Project highlights">
      <div className="co-heading"><h1>Project overview</h1><div className="co-heading-actions">
        <Button variant="text-button" onClick={onDetails}>Project details & contacts</Button>
        <InfoPopover title="About your project progress" label="Help: project progress">
          <p>Overall project progress is based on approved required activities across all applicable construction phases. Pending uploads earn no credit. If complete project totals are unavailable, no percentage is shown.</p>
        </InfoPopover></div>
      </div>
      <div className="co-metrics">
        <div><span>Current phase</span><strong>{project.phase}</strong></div>
        <div><span>Overall project progress</span><strong>{validProgress ? `${progressLabel(overall)}%` : "Unavailable"}</strong>
          {validProgress ? <progress aria-label="Overall project progress" value={overall} max={100} /> : <small>Complete approved activity totals across all phases are needed.</small>}
        </div>
        <div><span>Target completion</span><div className="co-target"><strong>{endSet ? dateLabel(project.end!) : "Not set"}</strong>
          {!endSet && <InfoPopover title="Target completion date" label="Help: target completion date"><p>A valid target end date has not been recorded. Contact your project team for the planned completion date.</p></InfoPopover>}
        </div></div>
      </div>
      {project.status === "completed" && <p className="co-completed"><Icon name="check" size={16} /> {project.completedAt ? `Completion recorded ${dateLabel(project.completedAt)}` : "Completed project record"}</p>}
    </section>
    <div className="co-preview-grid">
      <div className="co-update-stack">
      <section className="co-update" aria-label="Latest project update">
        <div className="co-heading"><h2>Latest project update</h2></div>
        {latest ? <div className="co-update-body">
          <div className="co-update-meta"><span>{Number.isFinite(Date.parse(latest.date)) ? dateLabel(latest.date) : "Date not shared"}</span><Badge tone="blue">{latest.phase}</Badge></div>
          <p>Recorded phase progress <strong>{Number.isFinite(latest.progress) && latest.progress >= 0 && latest.progress <= 100 ? `${latest.progress}%` : "Not available"}</strong></p>
          <details key={latest.id}><summary>View recorded note</summary><p>{latest.text || "No note was recorded."}</p></details>
        </div> : <p className="co-empty">No shared updates yet.</p>}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Progress History")}>View progress history <Icon name="arrow" size={16} /></Button>
      </section>
      </div>
      <section className="co-photos" aria-label="Latest site photos">
        <div className="co-heading"><h2>Latest site photos</h2></div>
        {photos}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Site Photographs")}>View gallery <Icon name="arrow" size={16} /></Button>
      </section>
    </div>
  </div>
}
