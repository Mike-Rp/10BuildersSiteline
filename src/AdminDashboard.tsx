import { useRef, useState, type ReactNode } from "react"
import { Button, Empty, Icon } from "./ui"
import type { DashboardCategory, DashboardItem } from "./admin-dashboard"
import "./admin-dashboard.css"

const categories: ["all" | DashboardCategory, string][] = [
  ["all", "All"], ["requests", "Requests"], ["licenses", "Licenses"], ["updates", "Project updates"], ["intake", "Intake"],
]

export default function AdminDashboard({ overview, onNavigate, onOpen, onNewIntake, onActivity, activity, readinessAvailable = true }: {
  readinessAvailable?: boolean
  overview: { activeProjects: number; intakeProjects: number; teamAccounts: number; items: DashboardItem[] }
  onNavigate: (page: string) => void
  onOpen: (item: DashboardItem) => void
  onNewIntake: () => void
  onActivity: () => void
  activity: ReactNode
}) {
  const [category, setCategory] = useState<"all" | DashboardCategory>("all")
  const [page, setPage] = useState(1)
  const [blockersOnly, setBlockersOnly] = useState(false)
  const attentionHeading = useRef<HTMLHeadingElement>(null)
  const blockers = [...new Map(overview.items.filter(item => item.blocker).map(item => [item.id, item])).values()]
  const filtered = overview.items.filter(item => blockersOnly && blockers.length ? item.blocker : category === "all" || item.category === category)
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * 6, current * 6)
  return <div className="admin-overview">
    {readinessAvailable && blockers.length > 0 && <section className="ao-blocker-banner" aria-label="Priority attention">
      <span className="ao-blocker-icon" aria-hidden="true"><Icon name="alert" size={24} /></span>
      <div className="ao-blocker-copy"><strong>{blockers.length} {blockers.length === 1 ? "project cannot" : "projects cannot"} advance</strong>
        <p>{blockers.length === 1 ? `${blockers[0].title}: ${blockers[0].detail}` : "Review the issues preventing phase handoff."}</p></div>
      <Button onClick={() => {
        if (blockers.length === 1) onOpen(blockers[0])
        else { setBlockersOnly(true); setPage(1); attentionHeading.current?.focus(); attentionHeading.current?.scrollIntoView?.({block:"nearest",behavior:"auto"}) }
      }}>{blockers.length === 1 ? "Review issue" : "View blockers"}<Icon name="arrow" size={16} /></Button>
    </section>}
    <header className="ao-heading">
      <div><span className="ao-eyebrow">ADMINISTRATOR WORKSPACE</span><h1>Workspace overview<span>.</span></h1></div>
      <Button className="ao-new-intake" variant="primary" icon="plus" onClick={onNewIntake}>New project intake</Button>
    </header>
    <div className="ao-metrics" aria-label="Workspace totals">
      {[
        {label:"Active projects", value:overview.activeProjects, hint:"Open Active Sites", icon:"building", page:"Active sites"},
        {label:"Projects in intake", value:overview.intakeProjects, hint:"Open Project Intake", icon:null, page:"Project intake"},
        {label:"Team accounts", value:overview.teamAccounts, hint:"Active and invited accounts", icon:"users", page:"Team"},
      ].map(metric => <button className="ao-metric" key={metric.label} onClick={() => onNavigate(metric.page)}>
        {metric.icon && <span className="ao-metric-icon" aria-hidden="true"><Icon name={metric.icon} size={22} /></span>}
        <span className="ao-metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></span>
        <Icon name="chevron" size={16} />
      </button>)}
    </div>
    <div className="ao-content">
      <section className="ao-panel" aria-labelledby="ao-attention-title">
        <header className="ao-panel-header"><div><h2 id="ao-attention-title" ref={attentionHeading} tabIndex={-1}>Needs attention</h2><p>Open an item to view its details and existing actions.</p></div><span className="ao-count" aria-label={`${overview.items.length} attention items`}>{overview.items.length}</span></header>
        <div className="ao-filters" role="group" aria-label="Filter attention items">
          {categories.map(([key, label]) => <button key={key} aria-pressed={!blockersOnly && category === key} onClick={() => { setCategory(key); setBlockersOnly(false); setPage(1) }}>{label}</button>)}
          {blockersOnly && blockers.length > 0 && <button aria-pressed="true" onClick={() => {setBlockersOnly(false);setPage(1)}}>Blockers · Show all</button>}
        </div>
        {visible.length ? <ul className="ao-task-list">{visible.map(item => <li key={item.key}>
          <button className="ao-task" onClick={() => onOpen(item)}>
            <span className={`ao-task-icon ${item.category}`} aria-hidden="true"><Icon name={item.icon} size={19} /></span>
            <span className="ao-task-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className="ao-task-label">{item.label}</span><Icon name="chevron" size={16} />
          </button>
        </li>)}</ul> : <Empty title={overview.items.length ? "No items in this category" : "Nothing waiting for attention"}>
          {overview.items.length ? "Choose another category to see other follow-up items." : "No pending requests, license alerts, project reviews, or intake follow-up in your current records."}
        </Empty>}
        <footer className="ao-pager"><span role="status">{filtered.length ? `${(current - 1) * 6 + 1}–${Math.min(current * 6, filtered.length)} of ${filtered.length} items` : "0 items"}</span>
          {pages > 1 && <div><Button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button><span>Page {current} of {pages}</span><Button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button></div>}
        </footer>
      </section>
      <section className="ao-panel ao-activity" aria-labelledby="ao-activity-title">
        <header className="ao-panel-header"><div><h2 id="ao-activity-title">Recent activity</h2><p>The latest changes in your workspace.</p></div><Button variant="text-button" onClick={onActivity}>View all <Icon name="arrow" size={15} /></Button></header>
        {activity}
      </section>
    </div>
  </div>
}
