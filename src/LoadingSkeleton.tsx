import { createContext, useContext, type ReactNode } from "react"
import type { Role } from "./model"
import { Icon } from "./ui"
import "./loading-skeleton.css"

const LoadingRole = createContext<Role | undefined>(undefined)

export function LoadingRoleProvider({ role, children }: { role?: Role; children: ReactNode }) {
  return <LoadingRole.Provider value={role}>{children}</LoadingRole.Provider>
}

export function LoadingStatus({ label = "Loading records" }: { label?: string }) {
  return <div className="loading-status" role="status" aria-label={label} aria-live="polite"><Icon name="clock" size={20} /><span>{label}…</span></div>
}

function Bar({ short = false }: { short?: boolean }) {
  return <span className={`skeleton-block skeleton-line${short ? " skeleton-short" : ""}`} />
}

export function SkeletonRows({ rows = 5, label = "Loading records" }: { rows?: number; label?: string }) {
  const role = useContext(LoadingRole)
  if (role !== "client") return <LoadingStatus label={label} />
  return <div className="skeleton-rows" role="status" aria-label={label}>
    <span className="skeleton-sr-only">{label}</span>
    <div aria-hidden="true">{Array.from({ length: Math.min(6, Math.max(1, rows)) }, (_, i) => <div className="skeleton-row" key={i}>
      <span className="skeleton-block skeleton-icon" />
      <span className="skeleton-copy"><Bar short={i % 2 === 1} /><Bar short /></span>
      <span className="skeleton-block skeleton-pill" />
    </div>)}</div>
  </div>
}

// A role selects presentation only; no records, counts or enabled actions are
// exposed before the authorized workspace arrives. Skeletons are Client-only.
export default function WorkspaceSkeleton({ role }: { role?: Role }) {
  if (role !== "client") return <main className="workspace-loading" aria-busy="true" aria-label="Loading workspace"><LoadingStatus label="Loading workspace" /></main>
  return <LoadingRoleProvider role="client"><div className="app-shell workspace-skeleton">
    <aside className="sidebar" aria-hidden="true">
      <div className="brand"><span className="brand-mark">10</span><div>SiteCore<small>10 BUILDERS</small></div></div>
      <div className="workspace-switch"><span className="workspace-avatar">10</span><span><strong>10 Builders</strong><small>Loading workspace</small></span></div>
      <div className="skeleton-nav">{Array.from({ length: 6 }, (_, i) => <Bar key={i} short={i % 2 === 1} />)}</div>
    </aside>
    <div className="main-shell">
      <header className="topbar" aria-hidden="true"><span>Client Portal</span></header>
      <main className="main-content skeleton-workspace-content" aria-busy="true" aria-label="Loading workspace">
        <div className="skeleton-heading"><div><h1>Loading your workspace</h1><p>Preparing your authorized projects and updates.</p></div></div>
        <div className="skeleton-panels">
          <section className="skeleton-panel"><header><h2>Your workspace</h2></header>
            <SkeletonRows rows={6} label="Loading workspace records" />
          </section>
          <section className="skeleton-panel" aria-hidden="true"><header><h2>Updates</h2></header><SkeletonRows rows={5} /></section>
        </div>
      </main>
    </div>
  </div></LoadingRoleProvider>
}
