import type { Account, Event, Project } from "./model.ts"

export type NotificationAction = { label: string } & (
  { kind: "project"; id: string } |
  { kind: "account"; id: string } |
  { kind: "profile" } |
  { kind: "page"; page: string }
)

// Use current authorized workspace records, never IDs or URLs parsed from message text.
export function notificationAction(event: Event, actor: Pick<Account, "id" | "role">, projects: Pick<Project, "id" | "name">[], accounts: Pick<Account, "id">[], pages: string[]): NotificationAction | undefined {
  if (actor.role === "admin" && /password reset requested/i.test(event.title)) return {kind:"page",page:"Dashboard",label:"Review password reset requests"}
  if (event.projectId) {
    if (!projects.some(project => project.id === event.projectId)) return
    return { kind: "project", id: event.projectId, label: actor.role === "client" ? "Open project history" : "Open project" }
  }
  if (event.accountId) {
    if (actor.role === "admin" && accounts.some(account => account.id === event.accountId)) return { kind: "account", id: event.accountId, label: "Open account" }
    if (event.accountId === actor.id && ["opm", "spm"].includes(actor.role)) return { kind: "profile", label: "View my license" }
    return
  }
  if (/license|\bPRC\b/i.test(event.title)) {
    if (actor.role === "admin") return { kind: "page", page: "Team", label: "Open Team accounts" }
    if (["opm", "spm"].includes(actor.role) && /^(License renewal reminder|Your license was not renewed)$/i.test(event.title)) return { kind: "profile", label: "View my license" }
  }
  if (event.target !== "Dashboard" && pages.includes(event.target)) return { kind: "page", page: event.target, label: `Open ${event.target}` }
}
