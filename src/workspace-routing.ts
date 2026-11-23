import type { Role } from "./model"

export const PROJECT_SETUP_LABEL = "Project setup"
export const workspacePageLabel = (page: string) => page === "Project intake" ? PROJECT_SETUP_LABEL : page

// Only real pages belong here. Dialogs, filters and in-page tabs stay local.
export const WORKSPACE_ROUTES: Record<Role, Record<string, string>> = {
  admin: {
    Dashboard: "dashboard", "Active sites": "active-sites", "Project intake": "project-intake", "Project inquiries": "project-inquiries",
    Documents: "documents", Directory: "directory", Archive: "archive", Team: "team",
    "Activity log": "activity-log", Settings: "settings",
  },
  opm: {
    Dashboard: "dashboard", "Project intake": "project-intake", Documents: "documents",
    "Confirmation queue": "confirmation-queue", "Project inquiries": "project-inquiries",
    "Active sites": "active-sites", Archive: "archive", "Activity log": "activity-log", Preferences: "preferences",
  },
  spm: {
    Dashboard: "dashboard", "Active sites": "active-sites", Resources: "resources",
    Archive: "archive", "Activity log": "activity-log", Preferences: "preferences",
  },
  client: {
    "Active sites": "active-sites", "Project Overview": "overview", "Project Documents": "documents",
    "Progress History": "progress-history", "Site Photographs": "site-photos", Preferences: "preferences",
  },
}

export const ROUTE_CHANGE = "siteline-route-change"
export const defaultPage = (role: Role) => role === "client" ? "Project Overview" : "Dashboard"
const projectPages = ["Project Overview", "Project Documents", "Progress History", "Site Photographs"]

export function pagePath(role: Role, page = defaultPage(role), projectId?: string): string {
  const slug = WORKSPACE_ROUTES[role][page] || WORKSPACE_ROUTES[role][defaultPage(role)]
  return role === "client" && projectId && projectPages.includes(page)
    ? `/client/projects/${encodeURIComponent(projectId)}/${slug}` : `/${role}/${slug}`
}

export function resolveWorkspaceRoute(role: Role, pathname: string): { page: string; projectId?: string } | undefined {
  const parts = pathname.replace(/\/$/, "").split("/").slice(1)
  if (parts[0] !== role) return
  if (parts.length === 1) return { page: defaultPage(role) }
  const nested = role === "client" && parts.length === 4 && parts[1] === "projects"
  if (!nested && parts.length !== 2) return
  const page = Object.keys(WORKSPACE_ROUTES[role]).find(label => WORKSPACE_ROUTES[role][label] === parts[nested ? 3 : 1])
  if (!page || (nested && !projectPages.includes(page))) return
  try { return { page, ...(nested ? { projectId: decodeURIComponent(parts[2]) } : {}) } } catch { return }
}

export function changeRoute(path: string, replace = false, state: Record<string, unknown> = {}) {
  if (window.location.pathname + window.location.search + window.location.hash !== path || replace) {
    window.history[replace ? "replaceState" : "pushState"](state, "", path)
    window.dispatchEvent(new window.Event(ROUTE_CHANGE))
  }
  return window.location.pathname
}
