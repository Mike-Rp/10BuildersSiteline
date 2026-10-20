import { licenseState, type State } from "./model.ts"
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
}

// Uses only the Administrator's existing authorized workspace; no additional reads.
export function adminDashboardOverview(state: State) {
  const intake = state.projects.filter(p => ["pending", "draft", "changes_requested"].includes(p.status))
  const items: DashboardItem[] = [
    ...state.companies.filter(c => c.status === "pending").map(c => ({
      key: `company:${c.id}`, id: c.id, kind: "company" as const, category: "requests" as const,
      title: c.name, detail: "Subcontractor request awaiting approval", label: "Request", icon: "shield",
    })),
    ...state.accounts.filter(a => a.role !== "client" && a.status === "active" &&
      ["Expired", "Grace expired", "Expiring soon"].includes(licenseState(a, state.rules.grace))).map(a => ({
      key: `account:${a.id}`, id: a.id, kind: "account" as const, category: "licenses" as const,
      title: a.name, detail: `License: ${licenseState(a, state.rules.grace)}`, label: "License review", icon: "doc",
    })),
    ...state.projects.filter(hasPendingSiteReview).map(p => ({
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
