import { useEffect, useRef, type ReactNode } from "react"
import type { ClientProjectView } from "./client-access"
import { dateLabel } from "./model"
import { calendarDay } from "./project-progress"
import PhaseTimeline from "./PhaseTimeline"
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
  const timeline = useRef<HTMLElement>(null)
  useEffect(() => {
    const centerCurrent = () => {
      const list = timeline.current?.querySelector("ol")
      const current = list?.querySelector<HTMLElement>("li.current")
      if (list && current && list.scrollWidth > list.clientWidth) {
        list.scrollLeft = current.offsetLeft - list.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
      }
    }
    centerCurrent()
    window.addEventListener("resize", centerCurrent)
    return () => window.removeEventListener("resize", centerCurrent)
  }, [project.id, project.phase])
  const validProgress = Number.isFinite(project.progress) && project.progress >= 0 && project.progress <= 100
  const endSet = calendarDay(project.end) !== null
  return <div className="client-overview">
    <div className="co-project-meta">
      <span>{project.type}{project.location ? ` · ${project.location}` : ""}</span>
      <Badge tone="green">{project.status === "completed" ? "Completed" : "Active"}</Badge>
    </div>
    <section className="co-highlights" aria-label="Project highlights">
      <div className="co-heading"><h1>Project highlights</h1>
        <InfoPopover title="About your project progress" label="Help: project progress">
          <p>The percentage shown is recorded progress for the current phase, not overall project completion. Your view includes only information shared with your account.</p>
        </InfoPopover>
      </div>
      <div className="co-metrics">
        <div><span>Current phase</span><strong>{project.phase}</strong></div>
        <div><span>Current phase progress</span><strong>{validProgress ? `${project.progress}%` : "Not available"}</strong>
          {validProgress && <progress aria-label="Current phase progress" value={project.progress} max={100} />}
        </div>
        <div><span>Target completion</span><div className="co-target"><strong>{endSet ? dateLabel(project.end!) : "Not set"}</strong>
          {!endSet && <InfoPopover title="Target completion date" label="Help: target completion date"><p>A valid target end date has not been recorded. Contact your project team for the planned completion date.</p></InfoPopover>}
        </div></div>
      </div>
      {project.status === "completed" && <p className="co-completed"><Icon name="check" size={16} /> {project.completedAt ? `Completion recorded ${dateLabel(project.completedAt)}` : "Completed project record"}</p>}
    </section>
    <section ref={timeline} className="co-timeline" aria-label="Construction timeline">
      <div className="co-heading"><h2>Construction timeline</h2><Button variant="text-button" onClick={() => onNavigate("Phase Timeline")}>View timeline <Icon name="arrow" size={16} /></Button></div>
      <PhaseTimeline phase={project.phase} phases={project.phases} completed={project.status === "completed"} compact />
    </section>
    <div className="co-preview-grid">
      <section className="co-update" aria-label="Latest project update">
        <div className="co-heading"><h2>Latest project update</h2></div>
        {latest ? <div className="co-update-body">
          <div className="co-update-meta"><span>{dateLabel(latest.date)}</span><Badge tone="blue">{latest.phase}</Badge></div>
          <p>Recorded progress <strong>{latest.progress}%</strong></p>
          <details key={latest.id}><summary>View recorded note</summary><p>{latest.text || "No note was recorded."}</p></details>
        </div> : <p className="co-empty">No shared updates yet.</p>}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Progress History")}>View progress history <Icon name="arrow" size={16} /></Button>
      </section>
      <section className="co-photos" aria-label="Latest site photos">
        <div className="co-heading"><h2>Latest site photos</h2></div>
        {photos}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Site Photographs")}>View gallery <Icon name="arrow" size={16} /></Button>
      </section>
    </div>
    <div className="co-shortcuts">
      <button type="button" onClick={() => onNavigate("Project Documents")}><span className="co-shortcut-icon"><Icon name="folder" /></span><strong>Project documents</strong><Icon name="chevron" size={17} /></button>
      <button type="button" onClick={onDetails}><span className="co-shortcut-icon"><Icon name="building" /></span><strong>Project details & contacts</strong><Icon name="chevron" size={17} /></button>
    </div>
  </div>
}
