import PasswordResetRequestPanel from "./PasswordResetRequestPanel"
import type { PasswordResetRequest } from "./PasswordResetRequests"
import { useEffect, useState, type ReactNode } from "react"
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

export default function AdminDashboard({ overview, onNavigate, onOpen, onNewIntake, onMonthlyReport, onActivity, activity, onCompletedProjects, resetRequests = [], onOpenReset = () => {}, resetRequestFocus = 0, readinessAvailable = true, delayedCount = 0, onDelayedProjects }: {
  resetRequests?: PasswordResetRequest[]
  onOpenReset?: (id:string,requestedAt?:string) => void
  resetRequestFocus?: number
  onCompletedProjects?: () => void
  delayedCount?: number
  onDelayedProjects?: () => void
  readinessAvailable?: boolean
  overview: { completedProjects?: number; activeProjects: number; intakeProjects: number; teamAccounts: number; items: DashboardItem[] }
  onNavigate: (page: string) => void
  onOpen: (item: DashboardItem) => void
  onNewIntake: () => void
  onMonthlyReport: () => void
  onActivity: () => void
  activity: ReactNode
}) {
  const [attentionView,setAttentionView]=useState("priority")
  const pendingResets=resetRequests.filter(r=>r.status!=='completed')
  const resetUnread=pendingResets.filter(r=>!r.read_at).length
  const followUpTotal=overview.items.length+pendingResets.length
  useEffect(()=>{if(resetRequestFocus>0)setAttentionView("password")},[resetRequestFocus])
  const [category, setCategory] = useState<"all" | DashboardCategory>("all")
  const [page, setPage] = useState(1)
  const blockers = [...new Map(overview.items.filter(item => item.blocker).map(item => [item.id, item])).values()]
  const priorities = adminPriorityItems(overview.items, "Dashboard", readinessAvailable)
  const filtered = overview.items.filter(item => category === "all" || item.category === category)
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * 6, current * 6)
  return <div className="admin-overview">
    <PageTitlePanel title="Dashboard" eyebrow="ADMINISTRATOR WORKSPACE">
      <div className="dashboard-actions">
        <Button icon="doc" onClick={onMonthlyReport}>Monthly report</Button>
        <Button className="ao-new-intake" variant="primary" icon="plus" onClick={onNewIntake}>New project intake</Button>
      </div>
    </PageTitlePanel>
    <div className="dashboard-attention-switch" role="tablist" aria-label="Dashboard attention views" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
      event.preventDefault()
      const next=event.key==='Home'?'priority':event.key==='End'?'password':attentionView==='priority'?'password':'priority'
      setAttentionView(next)
      event.currentTarget.querySelector<HTMLButtonElement>(next==='priority'?'#priority-items-tab':'#password-requests-tab')?.focus()
    }}>
      <button id="priority-items-tab" role="tab" aria-selected={attentionView==='priority'} aria-controls="priority-items-panel" tabIndex={attentionView==='priority'?0:-1} onClick={()=>setAttentionView('priority')}>Priority items ({priorities.length})</button>
      <button id="password-requests-tab" role="tab" aria-selected={attentionView==='password'} aria-controls="password-requests-panel" tabIndex={attentionView==='password'?0:-1} onClick={()=>setAttentionView('password')}>Password reset requests ({pendingResets.length}) {resetUnread>0 && <span className="reset-unread-dot" aria-label={resetUnread+' unread requests'}/>}</button>
    </div>
    <div id="priority-items-panel" role="tabpanel" aria-labelledby="priority-items-tab" hidden={attentionView!=='priority'}>
      <UrgentActionBanner items={priorities.map(adminBannerItem)} label="Priority attention" className={readinessAvailable && blockers.length ? "ao-blocker-banner" : ""}
      title="Priority items" showReviewButton={false}
      description={`${readinessAvailable && blockers.length ? `${blockers.length} ${blockers.length === 1 ? "project cannot" : "projects cannot"} advance. ` : ""}Open an item to review its details and take action.`}
      onOpen={item => { const source = priorities.find(priority => priority.key === item.key); if (source) onOpen(source) }} />
      {!priorities.length && <Empty title="No priority items">Urgent deadlines and license alerts will appear here.</Empty>}
    </div>
    <div id="password-requests-panel" role="tabpanel" aria-labelledby="password-requests-tab" hidden={attentionView!=='password'}>
      {attentionView==='password' && <PasswordResetRequestPanel requests={resetRequests} onOpen={onOpenReset}/>}
    </div>
    <ExecutiveSummary
      description={`${overview.activeProjects} active ${overview.activeProjects === 1 ? "project" : "projects"} and ${overview.intakeProjects} ${overview.intakeProjects === 1 ? "project" : "projects"} in intake. ${followUpTotal} follow-up ${followUpTotal === 1 ? "item needs" : "items need"} attention across project reviews, intake, requests and licenses.${delayedCount ? ` ${delayedCount} active ${delayedCount === 1 ? "project is" : "projects are"} past the target date.` : ""}`}
      metrics={[
        { label: "Active projects", value: overview.activeProjects, hint: "Open Active sites", icon: "building", onOpen: () => onNavigate("Active sites") },
        { label: "Projects in intake", value: overview.intakeProjects, hint: "Open Project intake", onOpen: () => onNavigate("Project intake") },
        { label: "Completed projects", value: overview.completedProjects ?? 0, hint: "View completed project records", icon: "check", onOpen: onCompletedProjects || (() => onNavigate("Archive")) },
        { label: "Team accounts", value: overview.teamAccounts, hint: "Active and invited accounts", icon: "users", onOpen: () => onNavigate("Team") },
      ]}
    />
    <div className="ao-content">
      <section className="ao-panel" aria-labelledby="ao-attention-title">
        <header className="ao-panel-header"><div><h2 id="ao-attention-title" >All follow-up items</h2><p>Urgent and routine work across your workspace.</p></div><span className="ao-count" aria-label={`${overview.items.length + Number(delayedCount > 0)} follow-up items`}>{overview.items.length + Number(delayedCount > 0)}</span></header>
        {onDelayedProjects && <DelayedProjectsRow count={delayedCount} onOpen={onDelayedProjects} />}
        <div className="ao-filters" role="group" aria-label="Filter follow-up items">
          {categories.map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setPage(1) }}>{label}</button>)}
        </div>
        {visible.length ? <ul className="ao-task-list">{visible.map(item => <li key={item.key}>
          <button className={`ao-task urgency-${item.blocker ? "blocked" : item.urgency || "routine"}`} onClick={() => onOpen(item)}>
            <span className={`ao-task-icon ${item.category}`} aria-hidden="true"><Icon name={item.icon} size={19} /></span>
            <span className="ao-task-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className={`ao-task-label urgency-${item.blocker ? "blocked" : item.urgency || "routine"}`}>{item.blocker ? "Blocked" : item.urgency === "overdue" ? "Overdue" : item.urgency === "soon" ? "Due soon" : item.label}</span><Icon name="chevron" size={16} />
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
