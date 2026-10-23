// Administrator sidebar and page-shell navigation. Pure data/helpers (no React) so they can be tested.
export type DocumentsTab = "project" | "engineer"
export type DirectoryTab = "engineers" | "subcontractors"

export const ADMIN_NAV = [
  { label: "Dashboard", icon: "grid", group: "WORKSPACE" },
  { label: "Active sites", icon: "building" },
  { label: "Project intake", icon: "plus" },
  { label: "Documents", icon: "folder", group: "RESOURCES" },
  { label: "Directory", icon: "users" },
  { label: "Reports", icon: "doc" },
  { label: "Team", icon: "users", group: "ORGANIZATION" },
  { label: "Archive", icon: "archive" },
  { label: "Settings", icon: "settings" },
]

export const DOCUMENT_TABS: [DocumentsTab, string][] = [
  ["project", "Project documents"],
  ["engineer", "Engineer documents"],
]
export const DIRECTORY_TABS: [DirectoryTab, string][] = [
  ["engineers", "Engineers"],
  ["subcontractors", "Subcontractors"],
]

export type AdminTarget = {
  page: "Documents" | "Directory"
  documentsTab?: DocumentsTab
  directoryTab?: DirectoryTab
  subconTab?: "pending"
}

// The four former RESOURCES pages (and the pending-requests shortcut) now live in two tabbed pages.
// Stored notification targets and links still use the old labels, so they are mapped here.
const LEGACY_TARGETS: Record<string, AdminTarget> = {
  "Project documents": { page: "Documents", documentsTab: "project" },
  "Engineer documents": { page: "Documents", documentsTab: "engineer" },
  "Engineer directory": { page: "Directory", directoryTab: "engineers" },
  "Subcon directory": { page: "Directory", directoryTab: "subcontractors" },
  Approvals: {
    page: "Directory",
    directoryTab: "subcontractors",
    subconTab: "pending",
  },
}
export const resolveAdminTarget = (label: string): AdminTarget | undefined =>
  LEGACY_TARGETS[label]

/** Breadcrumb segments after "Workspace", e.g. ["Directory", "Subcontractors"]. */
export function adminBreadcrumb(
  page: string,
  documentsTab: DocumentsTab,
  directoryTab: DirectoryTab,
) {
  if (page === "Documents")
    return [page, DOCUMENT_TABS.find(([id]) => id === documentsTab)![1]]
  if (page === "Directory")
    return [page, DIRECTORY_TABS.find(([id]) => id === directoryTab)![1]]
  return [page]
}

// Older notifications may still point to the retired standalone schedule page.
export const normalizeWorkspacePage = (page: string) =>
  page.toLowerCase() === "schedule performance" ? "Active sites" : page
