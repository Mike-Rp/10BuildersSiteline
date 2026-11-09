import type { State } from "./model.ts"
import { adminWorkspaceIndex, type WorkspaceResult } from "./admin-workspace-search.ts"

export type AdminSearchDestination = {
  page: string
  listKey: string
  recordId: string
  recordKind: "project" | "account" | "company"
  name: string
  dialog: "project" | "intake-record" | "account" | "company"
  directoryTab?: "engineers" | "subcontractors"
  documentsTab?: "project" | "engineer"
  subconTab?: string
  archiveTab?: string
  repositoryPath?: { projectId: string; categoryId?: string; folderId?: string }
  document?: WorkspaceResult["doc"]
}

export function resolveAdminSearchDestination(state: State, result: WorkspaceResult): AdminSearchDestination | undefined {
  if (result.category === "documents") {
    // Resolve against current records, rather than trusting a stale search snapshot.
    const current = adminWorkspaceIndex(state, {}).find(item => item.category === "documents" && item.id === result.id)
    const source = current?.documentContext
    if (!source || !current?.doc) return
    const ownerCategory = source.kind === "project" ? "projects" : source.kind === "account" ? "people" : "companies"
    const owner = resolveAdminSearchDestination(state, { ...result, id: source.id, category: ownerCategory })
    if (!owner) return
    if (source.kind === "project") return { ...owner, page: "Documents", documentsTab: "project", listKey: "admin:documents",
      repositoryPath: { projectId: source.id, categoryId: source.categoryId, folderId: source.folderId }, document: current.doc }
    if (source.kind === "account" && state.accounts.find(account => account.id === source.id)?.role !== "client")
      return { ...owner, page: "Documents", documentsTab: "engineer", listKey: "admin:engineer-docs", document: current.doc }
    return { ...owner, document: current.doc }
  }
  if (result.category === "projects") {
    const project = state.projects.find(item => item.id === result.id)
    if (!project) return
    const base = { recordId: project.id, recordKind: "project" as const, name: project.name, dialog: "project" as const }
    if (project.status === "active") return { ...base, page: "Active sites", listKey: "admin:active-sites" }
    if (["completed", "declined", "expired"].includes(project.status)) {
      const archiveTab = project.status === "completed" ? "closed" : project.status
      return { ...base, page: "Archive", archiveTab, listKey: `admin:archive-${archiveTab}` }
    }
    return { ...base, page: "Project intake", listKey: "admin:intake", dialog: "intake-record" }
  }
  if (result.category === "people") {
    const account = state.accounts.find(item => item.id === result.id)
    if (!account) return
    const base = { recordId: account.id, recordKind: "account" as const, name: account.name, dialog: "account" as const }
    if (account.status === "deactivated") return { ...base, page: "Archive", archiveTab: "accounts", listKey: "admin:archive-deactivated" }
    return account.role === "client" ? { ...base, page: "Team", listKey: "admin:team" }
      : { ...base, page: "Directory", directoryTab: "engineers", listKey: "admin:engineers" }
  }
  const company = state.companies.find(item => item.id === result.id)
  if (!company) return
  return { recordId: company.id, recordKind: "company", name: company.name, dialog: "company", page: "Directory", directoryTab: "subcontractors",
    subconTab: company.status === "approved" ? "registered" : company.status,
    listKey: company.status === "approved" ? "admin:companies" : `admin:subcon-${company.status}` }
}
