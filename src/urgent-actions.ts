import type { DashboardItem } from "./admin-dashboard.ts"
import type { Account, State } from "./model.ts"
import { assignmentBlock, checklistFor, officePmStage, ownedProjects, REVIEW_MS, workflowFor } from "./workflows.ts"

export type Urgency = "overdue" | "soon" | "blocked" | "attention"
export type UrgentItem = {
  key: string
  title: string
  detail: string
  status: string
  urgency: Urgency
  due?: number
  dateOnly?: boolean
  overdue?: number
  dueSoon?: number
  actionLabel?: string
}
export type StaffUrgentItem = UrgentItem & {
  projectId: string
  module: string
  target: "qa" | "progress" | "rework" | "assignment" | "responses" | "project" | "documents"
}
const DAY = 86_400_000
export function deadlineUrgency(due: number | undefined, now = Date.now()): Urgency {
  return due === undefined || !Number.isFinite(due) ? "attention" : due <= now ? "overdue" : due <= now + DAY ? "soon" : "attention"
}
export function sortUrgentItems<T extends UrgentItem>(items: T[]): T[] {
  const rank = { overdue: 0, blocked: 0, soon: 1, attention: 2 }
  return items.slice().sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.due ?? Infinity) - (b.due ?? Infinity) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
}
export function adminPriorityItems(items: DashboardItem[], page = "Dashboard", readinessAvailable = true) {
  const modules: Record<string, string> = { licenses: "Team", updates: "Active sites", intake: "Project intake", requests: "Directory" }
  return items.filter(item => (item.blocker ? readinessAvailable : !!item.urgency) &&
    (page === "Dashboard" || modules[item.category] === page))
}
export function adminBannerItem(item: DashboardItem): UrgentItem {
  return {
    key: item.key, title: item.title, detail: item.detail, urgency: item.blocker ? "blocked" : item.urgency || "attention", due: item.due, dateOnly: item.category === "licenses",
    status: item.blocker ? "Phase handoff blocked" : item.urgency === "overdue" ? "Overdue / expired" : item.urgency === "soon" ? "Due soon" : item.label,
    actionLabel: `Open priority item: ${item.title}`,
  }
}

// Presentation-only projection of current, authorized work. Never changes workflow rules.
export function staffUrgentItems(state: State, actor: Account, page = "Dashboard", now = Date.now()): StaffUrgentItem[] {
  if (actor.status !== "active" || !["opm", "spm"].includes(actor.role)) return []
  const items: StaffUrgentItem[] = []
  const isOpm = actor.role === "opm"
  for (const project of ownedProjects(state, actor)) {
    if (!["active", "pending"].includes(project.status)) continue
    const work = workflowFor(project)
    if (isOpm && project.status === "active") {
      const submitted = checklistFor(project).filter(item => item.status === "submitted")
      if (submitted.length) {
        const deadlines = submitted.map(item => item.submittedAt ? Date.parse(item.submittedAt) + REVIEW_MS : NaN).filter(Number.isFinite)
        const due = deadlines.length ? Math.min(...deadlines) : undefined
        const urgency = deadlineUrgency(due, now)
        items.push({ key: `qa:${project.id}`, projectId: project.id, title: project.name, module: "Rework & approvals", target: "qa", due, urgency,
          detail: `${project.phase} · ${submitted.length} checklist ${submitted.length === 1 ? "activity" : "activities"} awaiting your approval`,
          status: due === undefined ? "Submission date unavailable" : urgency === "overdue" ? "Overdue for review" : urgency === "soon" ? "Due within 24 hours" : "Review due",
          overdue: deadlines.filter(date => date <= now).length, dueSoon: deadlines.filter(date => date > now && date <= now + DAY).length,
          actionLabel: `Review checklist for ${project.name}`,
        })
      }
      if (work.pendingUpdate) {
        const raw = Date.parse(work.pendingUpdate.submittedAt) + REVIEW_MS
        const due = Number.isFinite(raw) ? raw : undefined
        const urgency = deadlineUrgency(due, now)
        items.push({ key: `progress:${project.id}`, projectId: project.id, title: project.name, module: "Rework & approvals", target: "progress", due, urgency,
          detail: "A submitted progress report is waiting for your review.", status: urgency === "overdue" ? "Overdue for review" : urgency === "soon" ? "Due within 24 hours" : "Progress review required" })
      }
      if (work.pendingRework) items.push({ key: `rework:${project.id}`, projectId: project.id, title: project.name, module: "Rework & approvals", target: "rework", urgency: "attention", detail: "A site issue or rework request needs your decision.", status: "Manual review required" })
      if (project.handoffReadiness?.state === "blocked" && project.handoffReadiness.reason && ["current_assignment", "next_assignment", "next_scope"].includes(project.handoffReadiness.reasonCode || ""))
        items.push({ key: `handoff:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "project", urgency: "blocked", detail: project.handoffReadiness.reason, status: "Phase handoff blocked" })
    }
    if (isOpm) {
      const stage = officePmStage(project)
      if (stage.kind === "action" && stage.reason === "reassign") items.push({ key: `reassign:${project.id}`, projectId: project.id, title: project.name, module: "Confirmation queue", target: "responses", urgency: "blocked", detail: stage.message, status: "Phase reassignment required" })
      if (stage.kind === "action" && stage.reason === "documents") items.push({ key: `documents:${project.id}`, projectId: project.id, title: project.name, module: "Documents", target: "documents", urgency: "attention", detail: stage.message, status: "Required intake documents missing" })
    }
    const deadline = work.deadline
    if (!deadline || deadline.expired || !project.team.some(row => row.accountId === deadline.accountId && row.status === "pending")) continue
    if (!isOpm && (deadline.accountId !== actor.id || assignmentBlock(project, actor.id))) continue
    const soft = Date.parse(deadline.soft), hard = Date.parse(deadline.hard)
    const due = Number.isFinite(hard) && hard <= now ? hard : soft
    const urgency = deadlineUrgency(due, now)
    if (urgency === "attention") continue
    items.push({ key: `response:${project.id}`, projectId: project.id, title: project.name, module: isOpm ? "Confirmation queue" : "Assignments", target: isOpm ? "responses" : "assignment", due, urgency,
      detail: isOpm ? "An assigned Site PM response needs follow-up." : "Your assigned phase responsibility is awaiting your response.",
      status: Number.isFinite(hard) && hard <= now ? "Hard response deadline passed" : due <= now ? "Past soft response target" : "Response due within 24 hours" })
  }
  return sortUrgentItems(items.filter(item => page === "Dashboard" || item.module === page ||
    (page === "Deadlines" && (item.due !== undefined || ["qa", "progress", "rework"].includes(item.target))) ||
    (page === "Active sites" && ["qa", "progress", "rework"].includes(item.target))))
}
