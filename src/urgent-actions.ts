import type { DashboardItem } from "./admin-dashboard.ts"
import type { Account, State } from "./model.ts"
import { intakeGuidance } from "./intake-guidance.ts"
import { assignmentBlock, checklistFor, ownedProjects, REVIEW_MS, workflowFor } from "./workflows.ts"

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
  target: "qa" | "progress" | "rework" | "assignment" | "responses" | "project" | "documents" | "confirm" | "photos" | "coordinate"
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
    const guidance = intakeGuidance(state, project, actor)
    if (guidance?.kind === "action" && guidance.action === "confirm")
      items.push({ key: `confirm:${project.id}`, projectId: project.id, title: project.name, module: "Confirmation queue", target: "confirm", urgency: "attention", detail: guidance.next, status: "Office PM acceptance required" })
    if (!isOpm && guidance?.kind === "action" && guidance.action === "coordinate")
      items.push({ key: `coordinate:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "coordinate", urgency: "attention", detail: guidance.next, status: guidance.stage })
    if (isOpm && project.status === "active") {
      const photos = (work.photos || []).filter(photo => photo.photoReviewStatus === "pending")
      if (photos.length) items.push({ key: `photos:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "photos", urgency: "attention", detail: `${photos.length} site ${photos.length === 1 ? "photo needs" : "photos need"} your review before client release.`, status: "Site photo review required" })
      const submitted = checklistFor(project).filter(item => item.status === "submitted")
      if (submitted.length) {
        const deadlines = submitted.map(item => item.submittedAt ? Date.parse(item.submittedAt) + REVIEW_MS : NaN).filter(Number.isFinite)
        const due = deadlines.length ? Math.min(...deadlines) : undefined
        const urgency = deadlineUrgency(due, now)
        items.push({ key: `qa:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "qa", due, urgency,
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
        items.push({ key: `progress:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "progress", due, urgency,
          detail: "A submitted progress report is waiting for your review.", status: urgency === "overdue" ? "Overdue for review" : urgency === "soon" ? "Due within 24 hours" : "Progress review required" })
      }
      if (work.pendingRework) items.push({ key: `rework:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "rework", urgency: "attention", detail: "A site issue or rework request needs your decision.", status: "Manual review required" })
      if (project.handoffReadiness?.state === "blocked" && project.handoffReadiness.reason && ["current_assignment", "next_assignment", "next_scope"].includes(project.handoffReadiness.reasonCode || ""))
        items.push({ key: `handoff:${project.id}`, projectId: project.id, title: project.name, module: "Active sites", target: "project", urgency: "blocked", detail: project.handoffReadiness.reason, status: "Phase handoff blocked" })
    }
    if (isOpm) {
      if (guidance?.kind === "action" && guidance.action === "reassign") items.push({ key: `reassign:${project.id}`, projectId: project.id, title: project.name, module: "Confirmation queue", target: "responses", urgency: "blocked", detail: guidance.next, status: "Phase reassignment required" })
      if (guidance?.kind === "action" && guidance.action === "documents") items.push({ key: `documents:${project.id}`, projectId: project.id, title: project.name, module: "Documents", target: "documents", urgency: "attention", detail: guidance.next, status: "Required intake documents missing" })
    }
    const deadline = work.deadline
    const ownPending = project.team.some(row => (row.accountId === actor.id && row.status === "pending") || row.engineers?.some(engineer => engineer.accountId === actor.id && engineer.status === "pending"))
    const storedPending = deadline && project.team.some(row => row.accountId === deadline.accountId && row.status === "pending")
    if (isOpm && (!deadline || deadline.expired || !storedPending)) continue
    if (!isOpm && (!ownPending || assignmentBlock(project, actor.id) || deadline?.expired)) continue
    const ownDeadline = isOpm || deadline?.accountId === actor.id ? deadline : undefined
    const soft = ownDeadline ? Date.parse(ownDeadline.soft) : NaN
    const hard = ownDeadline ? Date.parse(ownDeadline.hard) : NaN
    const candidate = Number.isFinite(hard) && hard <= now ? hard : soft
    const due = Number.isFinite(candidate) ? candidate : undefined
    const urgency = deadlineUrgency(due, now)
    if (isOpm && urgency === "attention") continue
    items.push({ key: `response:${project.id}`, projectId: project.id, title: project.name, module: isOpm ? "Confirmation queue" : "Active sites", target: isOpm ? "responses" : "assignment", due, urgency,
      detail: isOpm ? "An assigned Site PM response needs follow-up." : "Your assigned phase responsibility is awaiting your response.",
      status: Number.isFinite(hard) && hard <= now ? "Hard response deadline passed" : due !== undefined && due <= now ? "Past soft response target" : urgency === "soon" ? "Response due within 24 hours" : "Assignment response required" })
  }
  return sortUrgentItems(items.filter(item => page === "Dashboard" || item.module === page ||
    (page === "Rework & approvals" && ["qa", "progress", "rework"].includes(item.target)) ||
    (page === "Assignments" && ["assignment", "coordinate"].includes(item.target)) ||
    (page === "Deadlines" && (item.due !== undefined || ["qa", "progress", "rework"].includes(item.target))) ||
    (page === "Active sites" && ["qa", "progress", "rework"].includes(item.target))))
}
