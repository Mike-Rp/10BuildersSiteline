import { type ReactNode } from "react"
import type { ClientProjectView } from "./client-access"
import { dateLabel } from "./model"
import { calendarDay } from "./project-progress"
import { clientExecutiveSummary } from "./client-executive-summary"
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
  const summary = clientExecutiveSummary(project, today)
  const validProgress = Number.isFinite(project.progress) && project.progress >= 0 && project.progress <= 100
  const endSet = calendarDay(project.end) !== null
  return <div className="client-overview">
    <div className="co-project-meta">
      <span>{project.type}{project.location ? ` · ${project.location}` : ""}</span>
      <Badge tone="green">{project.status === "completed" ? "Completed" : "Active"}</Badge>
    </div>
    <ProjectScheduleDetails project={project} today={today} />
    <section className="co-executive" aria-label="Executive summary">
      <div className="co-heading"><div><h1>Executive summary</h1><p className="co-summary-intro">A clear view of your project and the latest information shared by your team.</p></div></div>
      <p className="co-summary-narrative">{summary.narrative}</p>
      <div className="co-summary-grid">
        <div className="co-summary-card"><span className="co-summary-label"><Icon name="calendar" size={18} />Schedule update</span><Badge tone={summary.schedule.tone}>{summary.schedule.label}</Badge><p>{summary.schedule.detail}</p></div>
        <div className="co-summary-card"><span className="co-summary-label"><Icon name="activity" size={18} />Latest shared update</span><strong>{summary.latestDate || "No dated update shared"}</strong><p>{summary.underReview ? `${summary.underReview} current-phase ${summary.underReview === 1 ? "activity is" : "activities are"} awaiting project team review.` : summary.latest ? "See the latest project note below or open your progress history." : "Project updates will appear after your team shares them."}</p></div>
        <div className="co-summary-card"><span className="co-summary-label"><Icon name="users" size={18} />Your project team</span>{project.contacts.length ? <ul>{project.contacts.map(contact => <li key={contact.role}><strong>{contact.name}</strong><small>{contact.role}</small></li>)}</ul> : <p>Project contacts have not been shared yet.</p>}</div>
      </div>
      <div className="co-summary-resources"><span><Icon name="folder" size={17} />{summary.documents} shared {summary.documents === 1 ? "document" : "documents"}</span><span><Icon name="doc" size={17} />{summary.photos} shared site {summary.photos === 1 ? "photo" : "photos"}</span><span>Based on your shared project records</span></div>
    </section>
    <section className="co-highlights" aria-label="Project highlights">
      <div className="co-heading"><h2>Project highlights</h2>
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
      <div className="co-shortcuts">
        <button type="button" onClick={() => onNavigate("Project Documents")}><span className="co-shortcut-icon"><Icon name="folder" /></span><strong>Project documents</strong><Icon name="chevron" size={17} /></button>
        <button type="button" onClick={onDetails}><span className="co-shortcut-icon"><Icon name="building" /></span><strong>Project details & contacts</strong><Icon name="chevron" size={17} /></button>
      </div>
      </div>
      <section className="co-photos" aria-label="Latest site photos">
        <div className="co-heading"><h2>Latest site photos</h2></div>
        {photos}
        <Button variant="text-button co-preview-link" onClick={() => onNavigate("Site Photographs")}>View gallery <Icon name="arrow" size={16} /></Button>
      </section>
    </div>
  </div>
}
