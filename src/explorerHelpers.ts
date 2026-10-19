// Pure helpers for the Project Explorer (the project level of the Document Repository).
// Callers pass only projects the signed-in role may open (the backend scopes them),
// so counters, search and recents can never reveal anything else.
export type ExplorerProject = {
  id: string
  name: string
  type?: string
  phase?: string
  status?: string
  fileCount: number
  // Names and titles of the files, so searching finds a project by its documents too.
  searchText: string
}

export const EXPLORER_PAGE_SIZES = [6, 12, 24]
export const MAX_RECENT_PROJECTS = 2

export function explorerCounters(projects: ExplorerProject[]) {
  return {
    projects: projects.length,
    files: projects.reduce((total, p) => total + p.fileCount, 0),
    empty: projects.filter((p) => p.fileCount === 0).length,
  }
}

export const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "files-desc", label: "Most files" },
  { value: "files-asc", label: "Fewest files" },
  { value: "phase", label: "Current phase" },
]

/** Sorted copy; ties always fall back to name then id so pages never repeat or skip a project. */
export function sortProjects(projects: ExplorerProject[], sort: string) {
  const byName = (a: ExplorerProject, b: ExplorerProject) =>
    a.name.localeCompare(b.name)
  const compare: Record<string, (a: ExplorerProject, b: ExplorerProject) => number> = {
    name: byName,
    "name-desc": (a, b) => byName(b, a),
    "files-desc": (a, b) => b.fileCount - a.fileCount,
    "files-asc": (a, b) => a.fileCount - b.fileCount,
    phase: (a, b) => (a.phase || "").localeCompare(b.phase || ""),
  }
  const primary = compare[sort] ?? byName
  return [...projects].sort(
    (a, b) => primary(a, b) || byName(a, b) || a.id.localeCompare(b.id),
  )
}

/** "in_progress" -> "In progress" */
export const statusLabel = (status: string) => {
  const text = status.replace(/[_-]+/g, " ").trim()
  return text ? text[0].toUpperCase() + text.slice(1) : ""
}

/** Most recent first, no duplicates, at most MAX_RECENT_PROJECTS kept. */
export function pushRecent(
  recent: string[],
  projectId: string,
  max = MAX_RECENT_PROJECTS,
) {
  return [projectId, ...recent.filter((id) => id !== projectId)].slice(0, max)
}

/** Only projects that are still accessible, in recency order (never more than `max`). */
export function visibleRecents(
  recent: string[],
  accessible: ExplorerProject[],
  max = MAX_RECENT_PROJECTS,
) {
  const byId = new Map(accessible.map((p) => [p.id, p]))
  return recent
    .map((id) => byId.get(id))
    .filter((p): p is ExplorerProject => !!p)
    .slice(0, max)
}

// Remembered per signed-in account in this browser (just ids, never file data).
const KEY = "siteline-recent-projects:"
export function readRecents(accountKey: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + accountKey) || "[]")
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}
export function writeRecents(accountKey: string, ids: string[]) {
  try {
    localStorage.setItem(KEY + accountKey, JSON.stringify(ids))
  } catch {
    /* Recents are a convenience; the explorer works without them. */
  }
}
