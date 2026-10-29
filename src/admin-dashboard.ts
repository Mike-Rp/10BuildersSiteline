import { dateLabel, licenseState, type State } from "./model.ts"
import { hasPendingSiteReview } from "./active-sites-review.ts"
import { deadlineUrgency, type Urgency } from "./urgent-actions.ts"
import { REVIEW_MS } from "./workflows.ts"

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
  urgency?: Urgency
  due?: number
}

// Uses only the Administrator's existing authorized workspace; no additional reads.
export function adminDashboardOverview(state: State, now = Date.now()) {
  const intake = state.projects.filter(p => ["pending", "draft", "changes_requested"].includes(p.status))
  const blockers = state.projects.filter(p => p.status === "active" && p.handoffReadiness?.state === "blocked" &&
    ["pending_reviews", "current_assignment", "next_assignment", "next_scope"].includes(p.handoffReadiness.reasonCode || "") && p.handoffReadiness.reason)
    .sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const blockedIds = new Set(blockers.map(p => p.id))
  // Company policy: prepare replacements at day 33; renewals wait for verification.
  const cover = (state.license?.overview || []).filter(i => i.needsCover)
  const coverIds = new Set(cover.map(i => i.id))
  const renewals = state.license?.renewals || []
  const submitted = (p: State["projects"][number]) => (p.workflow?.checklist?.[p.phase] || []).filter(item => item.status === "submitted")
  const reviewDue = (p: State["projects"][number]) => {
    const dates = [p.workflow?.pendingUpdate?.submittedAt, ...submitted(p).map(item => item.submittedAt)]
      .map(date => date ? Date.parse(date) + REVIEW_MS : NaN).filter(Number.isFinite)
    return dates.length ? Math.min(...dates) : undefined
  }
  const items: DashboardItem[] = [
    ...blockers.map(p => ({ key: `project:${p.id}`, id: p.id, kind: "project" as const, category: "updates" as const,
      title: p.name, detail: p.handoffReadiness!.reason!, label: "Handoff blocked", icon: "alert", blocker: true })),
    ...state.companies.filter(c => c.status === "pending").map(c => ({
      key: `company:${c.id}`, id: c.id, kind: "company" as const, category: "requests" as const,
      title: c.name, detail: "Subcontractor request awaiting approval", label: "Request", icon: "shield", urgency: "attention" as const,
    })),
    ...cover.map(i => ({
      key: `license-cover:${i.id}`, id: i.id, kind: "account" as const, category: "licenses" as const,
      title: i.daysToExpiry !== null && i.daysToExpiry <= 30 ? "Engineer replacement overdue" : "Prepare engineer replacement",
      detail: `${i.name} · license expires ${i.expiry ? dateLabel(i.expiry) : ""} · Replace on: ${i.assignments.map(a => a.projectName).filter((name, index, all) => all.indexOf(name) === index).join(", ")}`,
      label: "Prepare replacement", icon: "alert", urgency: i.daysToExpiry !== null && i.daysToExpiry <= 30 ? "blocked" as const : "soon" as const,
    })),
    ...renewals.map(r => ({
      key: `license-renewal:${r.id}`, id: r.user_id, kind: "account" as const, category: "licenses" as const,
      title: "License renewal to review", detail: `${r.full_name}'s renewed license is awaiting review`, label: "Review renewal", icon: "doc", urgency: "attention" as const,
    })),
    ...state.accounts.filter(a => a.role !== "client" && a.status === "active" && !coverIds.has(a.id) && !a.renewalUnderReview &&
      ["Expired", "Grace expired", "Expiring soon"].includes(licenseState(a, state.rules.grace))).map(a => ({
      key: `account:${a.id}`, id: a.id, kind: "account" as const, category: "licenses" as const,
      title: a.name, detail: `License: ${licenseState(a, state.rules.grace)}`, label: "License review", icon: "doc",
      urgency: licenseState(a, state.rules.grace) === "Expiring soon" ? "soon" as const : "overdue" as const,
      due: Number.isFinite(Date.parse(a.expiry)) ? Date.parse(a.expiry) : undefined,
    })),
    ...state.projects.filter(p => p.status === "active" && (hasPendingSiteReview(p) || submitted(p).length > 0) && !blockedIds.has(p.id)).map(p => ({
      key: `project:${p.id}`, id: p.id, kind: "project" as const, category: "updates" as const,
      title: p.name, detail: hasPendingSiteReview(p) ? "Progress update or site issue awaiting Office PM review" : `${submitted(p).length} checklist activities awaiting Office PM review`, label: "Project update", icon: "activity",
      urgency: deadlineUrgency(reviewDue(p), now), due: reviewDue(p),
    })),
    ...intake.filter(p => p.status === "draft" || p.status === "changes_requested" || !p.opmAccepted).map(p => ({
      key: `project:${p.id}`, id: p.id,
      kind: (p.status === "draft" || p.status === "changes_requested" ? "intake" : "project") as DashboardItem["kind"],
      category: "intake" as const,
      title: p.name,
      detail: p.status === "changes_requested" ? "Intake changes requested"
        : p.status === "draft" ? "Draft intake needs setup" : "Awaiting Office PM response",
      label: "Intake follow-up", icon: "clock",
      urgency: p.status === "changes_requested" ? "attention" as const : undefined,
    })),
  ]
  return {
    activeProjects: state.projects.filter(p => p.status === "active").length,
    intakeProjects: intake.length,
    teamAccounts: state.accounts.filter(a => ["active", "invited"].includes(a.status)).length,
    items,
  }
}
