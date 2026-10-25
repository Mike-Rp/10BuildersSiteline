import { ADMIN_NAV } from "./adminNav"
import type { Role } from "./model"
import { Icon } from "./ui"
import "./loading-skeleton.css"

function Bar({ short = false }: { short?: boolean }) {
  return <span className={`skeleton-block skeleton-line${short ? " skeleton-short" : ""}`} />
}

export function SkeletonRows({ rows = 5, label = "Loading records" }: { rows?: number; label?: string }) {
  return <div className="skeleton-rows" role="status" aria-label={label}>
    <span className="skeleton-sr-only">{label}</span>
    <div aria-hidden="true">{Array.from({ length: Math.min(6, Math.max(1, rows)) }, (_, i) => <div className="skeleton-row" key={i}>
      <span className="skeleton-block skeleton-icon" />
      <span className="skeleton-copy"><Bar short={i % 2 === 1} /><Bar short /></span>
      <span className="skeleton-block skeleton-pill" />
    </div>)}</div>
  </div>
}

// No records, account identity, task counts, or enabled navigation before the
// authorized workspace arrives. Only a verified role selects the static layout.
export default function WorkspaceSkeleton({ role }: { role?: Role }) {
  const admin = role === "admin"
  return <div className="app-shell workspace-skeleton">
    <aside className="sidebar" aria-hidden="true">
      <div className="brand"><span className="brand-mark">10</span><div>Siteline<small>10 BUILDERS</small></div></div>
      <div className="workspace-switch"><span className="workspace-avatar">10</span><span><strong>10 Builders</strong><small>Loading workspace</small></span></div>
      {admin ? <div>{ADMIN_NAV.map(item => <div key={item.label}>
        {item.group && <div className="nav-group-label">{item.group}</div>}
        <div className={`nav-item ${item.label === "Dashboard" ? "active" : ""}`}><Icon name={item.icon} size={19} /><span>{item.label}</span></div>
      </div>)}</div> : <div className="skeleton-nav">{Array.from({ length: 6 }, (_, i) => <Bar key={i} short={i % 2 === 1} />)}</div>}
    </aside>
    <div className="main-shell">
      <header className="topbar" aria-hidden="true"><span>Workspace {admin && " / Dashboard"}</span></header>
      <main className="main-content skeleton-workspace-content" aria-busy="true" aria-label="Loading workspace">
        <div className="skeleton-heading"><div><h1>{admin ? "Workspace overview" : "Loading your workspace"}</h1><p>Preparing your authorized projects and updates.</p></div>
          {admin && <button className="button primary skeleton-intake" disabled><Icon name="plus" />New project intake</button>}
        </div>
        {admin && <div className="skeleton-metrics" aria-hidden="true">{["Active projects", "Projects in intake", "Team accounts"].map((label, i) => <div className="skeleton-metric" key={label}>
          {i !== 1 && <span className="skeleton-block skeleton-metric-icon" />}<div><span>{label}</span><Bar /></div>
        </div>)}</div>}
        <div className="skeleton-panels">
          <section className="skeleton-panel"><header><h2>{admin ? "Needs attention" : "Your workspace"}</h2></header>
            {admin && <div className="skeleton-tabs" aria-hidden="true">{["All", "Requests", "Licenses", "Project updates", "Intake"].map(label => <span key={label}>{label}</span>)}</div>}
            <SkeletonRows rows={6} label="Loading workspace records" />
          </section>
          <section className="skeleton-panel" aria-hidden="true"><header><h2>{admin ? "Recent activity" : "Updates"}</h2></header><SkeletonRows rows={5} /></section>
        </div>
      </main>
    </div>
  </div>
}
