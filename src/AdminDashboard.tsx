import { useRef, useState, type ReactNode } from "react"
import { Button, Empty, Icon } from "./ui"
import type { DashboardCategory, DashboardItem } from "./admin-dashboard"
import UrgentActionBanner from "./UrgentActionBanner"
import { adminBannerItem, adminPriorityItems } from "./urgent-actions"
import { DelayedProjectsRow } from "./ScheduleStatus"
import ExecutiveSummary from "./ExecutiveSummary"
import PageTitlePanel from "./PageTitlePanel"
import "./admin-dashboard.css"

const categories: ["all" | DashboardCategory, string][] = [
  ["all", "All"], ["requests", "Requests"], ["licenses", "Licenses"], ["updates", "Project updates"], ["intake", "Intake"],
]

export default function AdminDashboard({ overview, onNavigate, onOpen, onNewIntake, onMonthlyReport, onActivity, activity, readinessAvailable = true, delayedCount = 0, onDelayedProjects }: {
  delayedCount?: number
  onDelayedProjects?: () => void
  readinessAvailable?: boolean
  overview: { activeProjects: number; intakeProjects: number; teamAccounts: number; items: DashboardItem[] }
  onNavigate: (page: string) => void
  onOpen: (item: DashboardItem) => void
  onNewIntake: () => void
  onMonthlyReport: () => void
  onActivity: () => void
  activity: ReactNode
}) {
  const [category, setCategory] = useState<"all" | DashboardCategory>("all")
  const [page, setPage] = useState(1)
  const [blockersOnly, setBlockersOnly] = useState(false)
  const [priorityOnly, setPriorityOnly] = useState(false)
  const attentionHeading = useRef<HTMLHeadingElement>(null)
  const blockers = [...new Map(overview.items.filter(item => item.blocker).map(item => [item.id, item])).values()]
  const priorities = adminPriorityItems(overview.items, "Dashboard", readinessAvailable)
  const filtered = overview.items.filter(item => blockersOnly && blockers.length ? item.blocker : priorityOnly && priorities.length ? priorities.some(priority => priority.key === item.key) : category === "all" || item.category === category)
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * 6, current * 6)
  function showAttention() {
    setBlockersOnly(false); setPriorityOnly(false); setCategory("all"); setPage(1)
    attentionHeading.current?.focus()
    attentionHeading.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" })
  }
  return <div className="admin-overview">
    <PageTitlePanel title="Dashboard" eyebrow="ADMINISTRATOR WORKSPACE">
      <div className="dashboard-actions">
        <Button icon="doc" onClick={onMonthlyReport}>Monthly report</Button>
        <Button className="ao-new-intake" variant="primary" icon="plus" onClick={onNewIntake}>New project intake</Button>
      </div>
    </PageTitlePanel>
    <ExecutiveSummary
      description={`${overview.activeProjects} active ${overview.activeProjects === 1 ? "project" : "projects"} and ${overview.intakeProjects} ${overview.intakeProjects === 1 ? "project" : "projects"} in intake. ${overview.items.length} follow-up ${overview.items.length === 1 ? "item needs" : "items need"} attention across project reviews, intake, requests and licenses.${delayedCount ? ` ${delayedCount} active ${delayedCount === 1 ? "project is" : "projects are"} past the target date.` : ""}`}
      metrics={[
        { label: "Active projects", value: overview.activeProjects, hint: "Open Active sites", icon: "building", onOpen: () => onNavigate("Active sites") },
        { label: "Projects in intake", value: overview.intakeProjects, hint: "Open Project intake", onOpen: () => onNavigate("Project intake") },
        { label: "Follow-up items", value: overview.items.length, hint: "Review needs attention", icon: "alert", onOpen: showAttention },
        { label: "Team accounts", value: overview.teamAccounts, hint: "Active and invited accounts", icon: "users", onOpen: () => onNavigate("Team") },
      ]}
    />
    <UrgentActionBanner items={priorities.map(adminBannerItem)} label="Priority attention" className={readinessAvailable && blockers.length ? "ao-blocker-banner" : ""}
      description={`${readinessAvailable && blockers.length ? `${blockers.length} ${blockers.length === 1 ? "project cannot" : "projects cannot"} advance. ` : ""}Review urgent deadlines, license alerts and actions that need a decision.`}
      actionLabel={readinessAvailable && blockers.length ? blockers.length === 1 ? "Review issue" : "View blockers" : "Review priority items"}
      onOpen={item => { const source = priorities.find(priority => priority.key === item.key); if (source) onOpen(source) }}
      onReview={() => {
        if (readinessAvailable && blockers.length === 1) onOpen(blockers[0])
        else { setBlockersOnly(readinessAvailable && blockers.length > 0); setPriorityOnly(true); setPage(1); attentionHeading.current?.focus(); attentionHeading.current?.scrollIntoView?.({block:"nearest",behavior:"auto"}) }
      }} />
    <div className="ao-content">
      <section className="ao-panel" aria-labelledby="ao-attention-title">
        <header className="ao-panel-header"><div><h2 id="ao-attention-title" ref={attentionHeading} tabIndex={-1}>Needs attention</h2><p>Open an item to view its details and existing actions.</p></div><span className="ao-count" aria-label={`${overview.items.length + Number(delayedCount > 0)} attention items`}>{overview.items.length + Number(delayedCount > 0)}</span></header>
        {onDelayedProjects && <DelayedProjectsRow count={delayedCount} onOpen={onDelayedProjects} />}
        <div className="ao-filters" role="group" aria-label="Filter attention items">
          {categories.map(([key, label]) => <button key={key} aria-pressed={!blockersOnly && !priorityOnly && category === key} onClick={() => { setCategory(key); setBlockersOnly(false); setPriorityOnly(false); setPage(1) }}>{label}</button>)}
          {blockersOnly && blockers.length > 0 && <button aria-pressed="true" onClick={() => {setBlockersOnly(false);setPriorityOnly(false);setCategory("all");setPage(1)}}>Blockers · Show all</button>}
          {priorityOnly && !blockersOnly && <button aria-pressed="true" onClick={() => {setPriorityOnly(false);setCategory("all");setPage(1)}}>Priority items · Show all</button>}
        </div>
        {visible.length ? <ul className="ao-task-list">{visible.map(item => <li key={item.key}>
          <button className="ao-task" onClick={() => onOpen(item)}>
            <span className={`ao-task-icon ${item.category}`} aria-hidden="true"><Icon name={item.icon} size={19} /></span>
            <span className="ao-task-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className="ao-task-label">{item.label}</span><Icon name="chevron" size={16} />
          </button>
        </li>)}</ul> : delayedCount && category === "all" && !overview.items.length ? null : <Empty title={overview.items.length ? "No items in this category" : "Nothing waiting for attention"}>
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
