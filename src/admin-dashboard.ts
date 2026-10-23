import { dateLabel, licenseState, type State } from "./model.ts"
import { hasPendingSiteReview } from "./active-sites-review.ts"

export type DashboardCategory = "requests" | "licenses" | "updates" | "intake"
export type DashboardItem = {
  key: string
  id: string
  kind: "company" | "account" | "project" | "intake"
  category: DashboardCategory
  title: string
  detail: string
  label: string
  icon: string
  blocker?: boolean
}

// Uses only the Administrator's existing authorized workspace; no additional reads.
export function adminDashboardOverview(state: State) {
  const intake = state.projects.filter(p => ["pending", "draft", "changes_requested"].includes(p.status))
  const blockers = state.projects.filter(p => p.status === "active" && p.handoffReadiness?.state === "blocked" &&
    ["pending_reviews", "current_assignment", "next_assignment", "next_scope"].includes(p.handoffReadiness.reasonCode || "") && p.handoffReadiness.reason)
    .sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const blockedIds = new Set(blockers.map(p => p.id))
  // Expired-license workflow: engineers whose grace period ended need cover; renewals wait for verification.
  const cover = (state.license?.overview || []).filter(i => i.needsCover)
  const coverIds = new Set(cover.map(i => i.id))
  const renewals = state.license?.renewals || []
  const items: DashboardItem[] = [
    ...blockers.map(p => ({ key: `project:${p.id}`, id: p.id, kind: "project" as const, category: "updates" as const,
      title: p.name, detail: p.handoffReadiness!.reason!, label: "Handoff blocked", icon: "alert", blocker: true })),
    ...state.companies.filter(c => c.status === "pending").map(c => ({
      key: `company:${c.id}`, id: c.id, kind: "company" as const, category: "requests" as const,
      title: c.name, detail: "Subcontractor request awaiting approval", label: "Request", icon: "shield",
    })),
    ...cover.map(i => ({
      key: `license-cover:${i.id}`, id: i.id, kind: "account" as const, category: "licenses" as const,
      title: "Engineer license expired: assignment needs cover",
      detail: `${i.name} · expired ${i.expiry ? dateLabel(i.expiry) : ""} · Not renewed after the grace period`,
      label: "Override assignment", icon: "alert",
    })),
    ...renewals.map(r => ({
      key: `license-renewal:${r.id}`, id: r.user_id, kind: "account" as const, category: "licenses" as const,
      title: "License renewal to review", detail: `${r.full_name}'s renewed license is awaiting review`, label: "Review renewal", icon: "doc",
    })),
    ...state.accounts.filter(a => a.role !== "client" && a.status === "active" && !coverIds.has(a.id) && !a.renewalUnderReview &&
      ["Expired", "Grace expired", "Expiring soon"].includes(licenseState(a, state.rules.grace))).map(a => ({
      key: `account:${a.id}`, id: a.id, kind: "account" as const, category: "licenses" as const,
      title: a.name, detail: `License: ${licenseState(a, state.rules.grace)}`, label: "License review", icon: "doc",
    })),
    ...state.projects.filter(p => hasPendingSiteReview(p) && !blockedIds.has(p.id)).map(p => ({
      key: `project:${p.id}`, id: p.id, kind: "project" as const, category: "updates" as const,
      title: p.name, detail: "Progress update or site issue awaiting Office PM review", label: "Project update", icon: "activity",
    })),
    ...intake.filter(p => p.status === "draft" || p.status === "changes_requested" || !p.opmAccepted).map(p => ({
      key: `project:${p.id}`, id: p.id,
      kind: (p.status === "draft" || p.status === "changes_requested" ? "intake" : "project") as DashboardItem["kind"],
      category: "intake" as const,
      title: p.name,
      detail: p.status === "changes_requested" ? "Intake changes requested"
        : p.status === "draft" ? "Draft intake needs setup" : "Awaiting Office PM response",
      label: "Intake follow-up", icon: "clock",
    })),
  ]
  return {
    activeProjects: state.projects.filter(p => p.status === "active").length,
    intakeProjects: intake.length,
    teamAccounts: state.accounts.filter(a => ["active", "invited"].includes(a.status)).length,
    items,
  }
}
