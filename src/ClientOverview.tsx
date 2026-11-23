import { type ReactNode } from "react"
import type { ClientProjectView } from "./client-access"
import { dateLabel, initials } from "./model"
import { calendarDay, progressLabel } from "./project-progress"
import { localScheduleDate } from "./domain/schedule-status"
import { ProjectScheduleDetails, useScheduleToday } from "./ScheduleStatus"
import InfoPopover from "./InfoPopover"
import { Badge, Button, Icon } from "./ui"
import PageTitlePanel from "./PageTitlePanel"
import "./project-monitoring.css"
import "./client-overview.css"

export default function ClientOverview({ project, latest, photos, completionPhoto, onNavigate, onDetails }: {
  project: ClientProjectView
  latest?: ClientProjectView["history"][number]
  photos: ReactNode
  completionPhoto?: ReactNode
  onNavigate: (page: string) => void
  onDetails: () => void
}) {
  const today = useScheduleToday()
  const overall = project.overallProgress
  const validProgress = typeof overall === "number" && Number.isFinite(overall) && overall >= 0 && overall <= 100
  const completed = project.status === "completed"
  const targetDay = calendarDay(project.end)
  const completionTimestamp = Date.parse(project.completedAt ?? "")
  const completionDate = project.completedAt && project.completedAt.length === 10
    ? project.completedAt
    : Number.isFinite(completionTimestamp) ? localScheduleDate(new Date(completionTimestamp)) : undefined
  const completionDay = calendarDay(completionDate)
  const variance = completionDay !== null && targetDay !== null ? completionDay - targetDay : null
  const days = Math.abs(variance ?? 0)
  return <div className={`client-overview${completed ? " co-completion" : ""}`}>
    {completed ? <section className="co-completion-hero" aria-label="Project completion">
      <div className="co-completion-copy">
        <Badge tone="green"><Icon name="check" size={16} /> Project completed</Badge>
        <p className="co-completion-project">{project.name} · {project.type}</p>
        <h1>Your project has been handed over</h1>
        {completionDate && completionDay !== null && <p><strong>Completion recorded</strong> <time dateTime={completionDate}>{dateLabel(completionDate)}</time></p>}
        {project.documents.some(document => document.uploaded) && <Button onClick={() => onNavigate("Project Documents")}>View shared documents <Icon name="arrow" size={16} /></Button>}
      </div>
      {completionPhoto}
    </section> : <>
    <PageTitlePanel title="Project overview">
      <div className="co-heading-actions">
        <Button variant="text-button" onClick={onDetails}>Project details & contacts</Button>
        <InfoPopover title="About your project progress" label="Help: project progress">
          <p>Overall project progress is based on approved required activities across all applicable construction phases. Pending uploads earn no credit. If complete project totals are unavailable, no percentage is shown.</p>
        </InfoPopover>
      </div>
    </PageTitlePanel>
    <div className="co-project-meta">
      <span>{project.type}</span>
      <Badge tone="green">Active</Badge>
    </div>
    <ProjectScheduleDetails project={project} today={today} />
    </>}
    <section className="co-highlights" aria-label="Project highlights">
      <div className="co-metrics">
        {completed ? <div><span>Final phase</span><strong>{project.phases.at(-1) || project.phase}</strong></div> : <div><span>Current phase</span>
          <div className="co-phase-status"><Badge tone="blue"><Icon name={project.currentPhaseStatus === "Ready for handoff" || project.currentPhaseStatus === "Completed" ? "check" : project.currentPhaseStatus === "Delayed" ? "alert" : project.currentPhaseStatus === "Ongoing" ? "trend" : "building"} size={14} /> Current phase: {project.phase} · {project.currentPhaseStatus}</Badge></div>
        </div>}
        <div><span>Overall project progress</span><strong>{validProgress ? `${progressLabel(overall)}%` : "Unavailable"}</strong>
          {validProgress ? <progress aria-label="Overall project progress" value={overall} max={100} /> : <small>Complete approved activity totals across all phases are needed.</small>}
        </div>
        <div><span>Target completion</span><div className="co-target"><strong>{targetDay !== null ? dateLabel(project.end!) : "Not set"}</strong>
          {targetDay === null && <InfoPopover title="Target completion date" label="Help: target completion date"><p>A valid target end date has not been recorded. Contact your project team for the planned completion date.</p></InfoPopover>}
        </div>{completed && variance !== null && <small>{variance === 0 ? "Completed on the target date" : `Completed ${days} ${days === 1 ? "day" : "days"} ${variance < 0 ? "early" : "late"}`}</small>}</div>
      </div>
    </section>
    <div className={completed ? "co-preview-grid" : "co-preview-grid co-monitor-grid"}>
      <section className="co-photos" aria-label="Latest site photos">
        <div className="co-heading"><h2>Latest site photos</h2></div>
        {photos}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Site Photographs")}>View gallery <Icon name="arrow" size={16} /></Button>
      </section>
      <section className="monitor-card" aria-label="Shared project details">
        <h3><Icon name="building" size={20}/>Project details</h3>
        <dl className="monitor-facts">
          <div><dt>Project type</dt><dd>{project.type}</dd></div>
          <div><dt>Floor area</dt><dd>{project.area ? `${project.area} m²` : "Not available"}</dd></div>
          <div><dt>Floors</dt><dd>{project.floors}</dd></div>
          <div><dt>Target start</dt><dd>{calendarDay(project.start) !== null ? dateLabel(project.start) : "Not set"}</dd></div>
        </dl>
        <p className="monitor-note">Only project records shared with your account are shown here.</p>
      </section>
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
      <section className="monitor-card" aria-label="Project contacts">
        <h3><Icon name="users" size={20}/>Project contacts</h3>
        {project.contacts.map((contact,index)=><div className="monitor-person" key={`${contact.role}-${index}`}>{completed && <span className="avatar" aria-hidden="true">{initials(contact.name)}</span>}<div><strong>{contact.name}</strong><small>{contact.role}</small></div></div>)}
        {completed && <Button variant="text-button co-preview-link" onClick={onDetails}>View project contacts <Icon name="arrow" size={16} /></Button>}
      </section>
      </div>
    </div>
  </div>
}
