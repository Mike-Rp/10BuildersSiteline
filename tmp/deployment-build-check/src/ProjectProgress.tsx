import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button, Empty, Icon, Modal } from "./ui"
import { dateLabel, localToday, type PhaseProgress } from "./model"
import { calendarDay, constructionPhaseRows, overallChecklistProgress, plannedCompletion, progressGap, progressLabel } from "./project-progress"
import "./project-progress.css"

type ProgressView = {
  id: string
  name: string
  start: string
  end?: string
  phase: string
  phases: string[]
  checklistProgress?: PhaseProgress[]
}

export default function ProjectProgress({ project, reportingDate = localToday() }: {
  project: ProgressView
  reportingDate?: string
}) {
  const [open, setOpen] = useState(false)
  const previousScroll = useRef<{ element: HTMLElement; top: number } | null>(null)
  const showBreakdown = (trigger: HTMLElement) => {
    const element = trigger.closest<HTMLElement>(".modal-body")
    previousScroll.current = element ? { element, top: element.scrollTop } : null
    setOpen(true)
  }
  useEffect(() => {
    if (open || !previousScroll.current) return
    const saved = previousScroll.current
    const frame = requestAnimationFrame(() => { saved.element.scrollTop = saved.top })
    return () => cancelAnimationFrame(frame)
  }, [open])
  const actual = overallChecklistProgress(project.phases, project.checklistProgress)
  const phaseRows = constructionPhaseRows(project.phases, project.checklistProgress)
  const planned = plannedCompletion(project.start, project.end, reportingDate)
  const gap = progressGap(actual.percentage, planned)
  const date = (value?: string) => calendarDay(value) !== null ? dateLabel(value!) : "Not set"
  const bar = (label: string, value: number | null, kind: string, unavailable: string) => (
    <div className="pp-bar-row">
      <span>{label}</span>
      <span className={`pp-track ${kind}`} role={value === null ? undefined : "meter"} aria-label={label}
        aria-hidden={value === null ? true : undefined}
        aria-valuemin={value === null ? undefined : 0} aria-valuemax={value === null ? undefined : 100}
        aria-valuenow={value === null ? undefined : Number(value.toFixed(1))}
        aria-valuetext={value === null ? undefined : `${progressLabel(value)}%`}>
        {value !== null && <span style={{ width: `${value}%` }} />}
      </span>
      <strong title={value === null ? unavailable : undefined}>{value === null ? "Unavailable" : `${progressLabel(value)}%`}</strong>
    </div>
  )
  return <section className="project-progress" aria-label={`${project.name} project progress`}>
    <div className="pp-heading"><div><h3>Project progress</h3><p>Overall approved checklist completion across all phases.</p></div>
      <span>Reporting date: {date(reportingDate)}</span></div>
    <button type="button" className="pp-comparison" aria-haspopup="dialog" aria-label={`View phase breakdown for ${project.name}`} onClick={event => showBreakdown(event.currentTarget)}>
      <span className="pp-question">Where should we be today?</span>
      {gap && <span className="pp-gap">{gap}</span>}
      {bar("Planned completion", planned, "pp-planned", "Planned completion unavailable")}
      {bar("Actual approved completion", actual.percentage, "pp-actual", "Overall completion unavailable")}
      <span className="pp-scale" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></span>
    </button>
    {planned === null && <p className="pp-unavailable">Planned completion unavailable. Valid target start and end dates are required.</p>}
    {actual.percentage === null && <p className="pp-unavailable">Overall completion unavailable. Complete authorized required-activity totals for every project phase are needed; missing scope is not counted as zero.</p>}
    <div className="pp-info">
      <div><Icon name="calendar" size={20} /><span><strong>Target dates</strong>{date(project.start)} → {date(project.end)}</span></div>
      <div><Icon name="check" size={20} /><span><strong>Overall approved work</strong>{actual.required === null ? "Approved / required totals unavailable" : `${actual.approved} of ${actual.required} required activities approved`}</span></div>
    </div>
    <p className="pp-note">Date-based baseline assumes uniform progress. Actual completion weights each required activity equally and excludes pending, rejected, missing, and optional activities. This project-wide measure can differ from phase-local progress shown elsewhere.</p>
    <Button icon="activity" onClick={event => showBreakdown(event.currentTarget)} aria-haspopup="dialog">View phase breakdown</Button>
    {open && createPortal(<Modal wide title="Progress by construction phase" subtitle={project.name} onClose={() => setOpen(false)}>
      <div className="project-progress pp-breakdown">
        <p>Office PM approved checklists: four for Mobilization and Closeout, three for each intermediate phase.</p>
        {phaseRows.length ? <div className="pp-table-scroll"><table className="pp-table">
          <thead><tr><th scope="col">Construction Phase</th><th scope="col">Approved Activities</th><th scope="col">Phase Status</th></tr></thead>
          <tbody>{phaseRows.map(row => <tr key={row.name}>
            <th scope="row"><span>{row.name}</span><div className="pp-phase-labels">
              {row.name === project.phase && <span className="pp-current">Current Phase</span>}
              {row.locked && <span className="pp-locked"><Icon name="shield" size={14} />Locked</span>}
            </div></th>
            <td>{row.approved} / {row.required}</td>
            <td><span className={`pp-status pp-status-${row.status.toLowerCase().replace(/ /g, "-")}`}>{row.status}</span></td>
          </tr>)}</tbody>
        </table></div> : <Empty title="Phase breakdown unavailable">No authorized stored phase sequence is available for this project.</Empty>}
        <p className="pp-note">Uploads await Office PM validation. Rejected evidence remains incomplete. Any additional legacy mandatory documents also require approval before completion and handoff.</p>
        <div className="modal-actions"><Button onClick={() => setOpen(false)}>Close phase breakdown</Button></div>
      </div>
    </Modal>, document.body)}
  </section>
}
