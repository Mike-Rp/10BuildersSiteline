import OverallProjectProgress from "./OverallProjectProgress"
import type { VerifiedProgress } from "./project-progress"
import { progressLabel } from "./project-progress"
import { useId, useMemo, useState, type ReactNode } from "react"
import { PROJECT_TYPES, dateLabel, phaseDefinitions, type PhaseDefinition } from "./model"
import ScheduleStatusBadge, { DelayedProjectNotice, useScheduleToday } from "./ScheduleStatus"
import { projectScheduleStatus } from "./domain/schedule-status"

import { Button, Empty, Icon } from "./ui"
import "./active-sites.css"
export type SiteCard = {
  id: string
  name: string
  type: string
  phase: string
  status: string
  verifiedProgress?: VerifiedProgress
  progress: number
  overallProgress?: number | null
  start: string
  end?: string
  lead?: string
  needsReview?: boolean
}

// Accept only the caller's existing authorized projection, never global state.
const progressValue = (project: SiteCard, overallOnly: boolean) => {
  const value = overallOnly ? project.overallProgress : project.progress
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : NaN
}

export default function ActiveSites({
  projects,
  onOpen,
  renderActions,
  reviewAvailable = false,
  phaseDefinitionsByType,
  initialScheduleFilter = "",
  showDelayNotice = false,
  today,
  overallOnly = false,
}: {
  projects: SiteCard[]

  onOpen: (id: string) => void

  renderActions?: (id: string) => ReactNode
  reviewAvailable?: boolean
  phaseDefinitionsByType?: Record<string, PhaseDefinition[]>
  initialScheduleFilter?: "" | "delayed"
  showDelayNotice?: boolean
  today?: string
  overallOnly?: boolean
}) {
  const localToday = useScheduleToday()
  const reportingDate = today ?? localToday
  const [query, setQuery] = useState("")
  const [scheduleFilter, setScheduleFilter] = useState(initialScheduleFilter)
  const [layout, setLayout] = useState<"cards" | "list">("cards")
  const [type, setType] = useState("")
  const [phase, setPhase] = useState("")
  const [tab, setTab] = useState<"all" | "review">("all")
  const tabId = useId()
  const selectedTab = reviewAvailable ? tab : "all"
  const activeProjects = useMemo(() => projects.filter(p => p.status === "active"), [projects])
  const reviewProjects = activeProjects.filter(p => p.needsReview === true)
  const [sort, setSort] = useState("name")
  const size = 9
  const [page, setPage] = useState(1)
  const [recent, setRecent] = useState<string[]>([])
  const definitionsFor = (projectType: string) => phaseDefinitionsByType?.[projectType] ?? phaseDefinitions(projectType)
  const allPhases = definitionsFor("Mixed-Use").map(p => p.name)
  const phases = type ? definitionsFor(type).map(p => p.name) : allPhases


  const filtered = useMemo(
    () =>
      activeProjects
        .filter(
          (p) =>
            (selectedTab === "all" || p.needsReview === true) &&
            (!scheduleFilter || projectScheduleStatus(p, reportingDate).status === "Delayed") &&
            p.name
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()) &&
            (!type || p.type === type) &&
            (!phase || p.phase.toLowerCase() === phase.toLowerCase()),
        )
        .sort((a, b) => {
          if (sort === "progress")
            return (progressValue(b, overallOnly) || 0) - (progressValue(a, overallOnly) || 0) || a.name.localeCompare(b.name)

          if (sort === "end")
            return (
              (a.end || "9999").localeCompare(b.end || "9999") ||
              a.name.localeCompare(b.name)
            )

          return a.name.localeCompare(b.name)
        }),
    [activeProjects, query, type, phase, selectedTab, sort, scheduleFilter, reportingDate, overallOnly],
  )

  const pages = Math.max(1, Math.ceil(filtered.length / size))

  const current = Math.min(page, pages)

  const visible = filtered.slice((current - 1) * size, current * size)

  const recorded = activeProjects.filter((p) => Number.isFinite(progressValue(p, overallOnly)))

  const schedules = activeProjects.map(p => projectScheduleStatus(p, reportingDate)).filter(s => s.targetEndDate !== null)
  const onSchedule = schedules.filter(s => s.status === "On schedule").length

  const attention = activeProjects.filter(
    (p) =>
      (reviewAvailable && p.needsReview === true) || projectScheduleStatus(p, reportingDate).status === "Delayed",
  ).length

  const open = (id: string) => {
    if (!activeProjects.some((p) => p.id === id)) return

    setRecent((previous) =>
      [id, ...previous.filter((x) => x !== id)].slice(0, 3),
    )

    onOpen(id)
  }

  const reset = () => {
    setQuery("")
    setType("")
    setPhase("")
    setScheduleFilter("")
    setPage(1)
  }

  return (
    <section className="active-sites" aria-label="Active project dashboard">
      <div className="as-summary">
        <div>
          <span className="as-summary-icon" aria-hidden="true"><Icon name="building" size={25} /></span>
          <span>Active projects</span>
          <strong>{activeProjects.length}</strong>
          <small>Within your access</small>
        </div>
        <div>
          <span className="as-summary-icon" aria-hidden="true"><Icon name="trend" size={25} /></span>
          <span>{overallOnly ? "Average overall progress" : "Average recorded progress"}</span>
          <strong>
            {recorded.length
              ? `${Math.round(recorded.reduce((sum, p) => sum + progressValue(p, overallOnly), 0) / recorded.length)}%`
              : "—"}
          </strong>
          <small>{overallOnly ? "Approved work across all phases" : "Recorded completion only"}</small>
        </div>
        {schedules.length > 0 && (
            <div>
              <span className="as-summary-icon" aria-hidden="true"><Icon name="calendar" size={25} /></span>
              <span>On schedule</span>
              <strong>{onSchedule}</strong>
              <small>Target date today or later · {schedules.length} dated projects</small>
            </div>
        )}
        {(schedules.length > 0 || reviewAvailable) && (
            <div>
              <span className="as-summary-icon" aria-hidden="true"><Icon name="alert" size={25} /></span>
              <span>Requiring attention</span>
              <strong>{attention}</strong>
              <small>{reviewAvailable ? "Past target date or pending review" : "Past target completion date"}</small>
            </div>
        )}
      </div>
      <div className="as-toolbar">
        <label className="as-search">
          Search projects
          <input
            type="search"
            placeholder="Search by project name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Project type
          <select
            value={type}
            onChange={(e) => {
              const nextType = e.target.value
              setType(nextType)
              const nextPhases = nextType ? definitionsFor(nextType).map(p => p.name) : allPhases
              if (!nextPhases.some(name => name.toLowerCase() === phase.toLowerCase())) {
                setPhase("")
              }
              setPage(1)
            }}
          >
            <option value="">All types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Current phase
          <select
            value={phase}
            onChange={(e) => {
              setPhase(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All phases</option>
            {phases.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
          >
            <option value="name">Project name A–Z</option>
            <option value="progress">Progress: highest first</option>
            <option value="end">Target date: earliest first</option>
          </select>
        </label>
        <div className="as-schedule-filter"><span>Schedule status</span>
          <Button icon="alert" variant={scheduleFilter ? "primary" : ""} aria-pressed={scheduleFilter === "delayed"} onClick={() => { setScheduleFilter(current => current ? "" : "delayed"); setPage(1) }}>Delayed</Button>
        </div>
      </div>
      {recent.some((id) => activeProjects.some((p) => p.id === id)) && (
        <div className="as-recent">
          <span>Recently viewed</span>
          {recent
            .map((id) => activeProjects.find((p) => p.id === id))
            .filter((p) => p !== undefined)
            .map((p) => (
              <button key={p.id} onClick={() => open(p.id)}>
                {p.name} <span aria-hidden="true">↗</span>
              </button>
            ))}
        </div>
      )}
      <div className="as-tabs" role="tablist" aria-label="Active project views" onKeyDown={event => {
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        const index = tabs.indexOf(event.target as HTMLButtonElement)
        if (index < 0) return
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1
        if (next < 0) return
        event.preventDefault()
        tabs[next].focus()
        tabs[next].click()
      }}>
        <button type="button" role="tab" id={`${tabId}-all`} aria-controls={`${tabId}-panel`} aria-selected={selectedTab === "all"} tabIndex={selectedTab === "all" ? 0 : -1} onClick={() => { setTab("all"); setPage(1) }}>
          All active projects <span>{activeProjects.length}</span>
        </button>
        {reviewAvailable && <button type="button" role="tab" id={`${tabId}-review`} aria-controls={`${tabId}-panel`} aria-selected={selectedTab === "review"} tabIndex={selectedTab === "review" ? 0 : -1} onClick={() => { setTab("review"); setPage(1) }}>
          Awaiting review <span>{reviewProjects.length}</span>
        </button>}
      </div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${selectedTab}`} tabIndex={0}>
      <div className="as-results">
        <div>
          <h2>{selectedTab === "review" ? "Projects awaiting review" : "All active projects"}</h2>
          <p role="status">{filtered.length ? `Showing ${(current - 1) * size + 1}-${Math.min(current * size, filtered.length)} of ${filtered.length} projects` : "0 projects"}</p>
        </div>
        <div className="as-layout" role="group" aria-label="Project layout">
          <Button variant={layout === "cards" ? "primary" : ""} aria-pressed={layout === "cards"} onClick={() => setLayout("cards")} icon="grid">Cards</Button>
          <Button variant={layout === "list" ? "primary" : ""} aria-pressed={layout === "list"} onClick={() => setLayout("list")} icon="doc">List</Button>
          {(query || type || phase || scheduleFilter) && <Button variant="text-button" onClick={reset}>Clear filters</Button>}
        </div>
      </div>
      {layout === "cards" ? <div className="as-grid">
        {visible.map((p) => (
          <article className="as-card" key={p.id}>
            <div className="as-card-body">
              <div className="as-card-heading">
                <span className="as-type">{p.type}</span>
                <div className="as-card-flags">
                  {reviewAvailable && p.needsReview === true && <span className="as-review" title="A progress update or site issue is awaiting Office PM review."><Icon name="alert" size={12} />Awaiting review</span>}
                </div>
              </div>
              <h2>{p.name}</h2>
              <p className="as-phase">{p.phase || "Phase not recorded"}</p>
              <div className="as-schedule"><ScheduleStatusBadge project={p} today={reportingDate} /></div>
              {showDelayNotice && <DelayedProjectNotice project={p} today={reportingDate} />}
              <div className="as-progress-label">
                <span>{overallOnly ? "Overall project progress" : "Recorded progress"}</span>
                <strong>
                  {Number.isFinite(progressValue(p, overallOnly))
                    ? `${progressLabel(progressValue(p, overallOnly))}%`
                    : overallOnly ? "Unavailable" : "Not recorded"}
                </strong>
              </div>
              {(!overallOnly || Number.isFinite(progressValue(p, overallOnly))) && <progress
                aria-label={`${p.name} ${overallOnly ? "overall project progress" : "recorded progress"}`}
                max={100}
                value={Number.isFinite(progressValue(p, overallOnly)) ? progressValue(p, overallOnly) : undefined}
              />}
              {!overallOnly && <OverallProjectProgress name={p.name} verifiedProgress={p.verifiedProgress} />}
              <dl>
                {p.lead && (
                  <div>
                    <dt>Lead Site PM</dt>
                    <dd>{p.lead}</dd>
                  </div>
                )}
                <div>
                  <dt>Target completion</dt>
                  <dd>{p.end ? dateLabel(p.end) : "Not set"}</dd>
                </div>
              </dl>
              <div className="as-card-actions">
                {renderActions && <div className="as-workflow-actions">{renderActions(p.id)}</div>}
                <Button className="as-details" onClick={() => open(p.id)}>
                  View Project Details <Icon name="arrow" size={16} />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div> : <div className="as-list-view">
        {visible.length > 0 && <p className="as-list-hint" id={`${tabId}-list-hint`}>
          <span aria-hidden="true">↔</span> Swipe to see more. Project names stay visible.
        </p>}
        <div className="as-list-scroll" role="region" aria-label="Active projects list" aria-describedby={visible.length ? `${tabId}-list-hint` : undefined} tabIndex={0}><table className="as-list">
        <thead><tr><th>Project</th><th>Current phase</th><th>Schedule status</th><th>Target completion</th><th>Details</th></tr></thead>
        <tbody>{visible.map(p => {
          const schedule = projectScheduleStatus(p, reportingDate)
          return <tr key={p.id}><th scope="row">{p.name}</th><td>{p.phase || "Phase not recorded"}</td><td><ScheduleStatusBadge project={p} today={reportingDate} />{schedule.status === "Delayed" && <span className="as-overdue">{schedule.daysOverdue} {schedule.daysOverdue === 1 ? "day" : "days"} overdue</span>}</td><td>{schedule.targetEndDate ? dateLabel(schedule.targetEndDate) : "No target date"}</td><td><Button onClick={() => open(p.id)} aria-label={`View project details: ${p.name}`}>View details</Button></td></tr>
        })}</tbody>
      </table></div></div>}
      {!visible.length && (
        <Empty
          title={
            query || type || phase ? "No matching projects" : scheduleFilter ? "No delayed projects" : selectedTab === "review" ? "No projects awaiting review" : "No active sites yet"
          }
        >
          {query || type || phase
            ? "Try another name or clear the filters."
            : scheduleFilter ? "No active projects in your access have passed their target completion date."
            : selectedTab === "review"
              ? "No pending progress updates or site issues in your authorized active projects."
              : "Authorized projects will appear here once activated."}
        </Empty>
      )}
      <nav className="as-pagination" aria-label="Project pagination">
        <span>9 projects per page</span>
        <span aria-live="polite">
          {filtered.length
            ? `${(current - 1) * size + 1}–${Math.min(current * size, filtered.length)} of ${filtered.length}`
            : "0 projects"}{" "}
          · Page {current} of {pages}
        </span>
        <div>
          <Button disabled={current === 1} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
      </div>
    </section>
  )
}

