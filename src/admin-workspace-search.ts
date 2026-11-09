import { ROLE_NAMES, type Doc, type State } from "./model.ts"
import { projectDocumentIndex } from "./project-document-index.ts"

export const SEARCH_CATEGORIES = ["projects", "people", "companies", "documents"] as const
export type SearchCategory = typeof SEARCH_CATEGORIES[number]
export type WorkspaceResult = {
  id: string
  category: SearchCategory
  name: string
  subtitle: string
  text: string
  status?: string
  type?: string
  doc?: Doc
}
export const categoryLabels: Record<SearchCategory, string> = {
  projects: "Projects", people: "People", companies: "Companies", documents: "Documents",
}
export const friendlyStatus = (value: string) => value.replace(/[-_]/g, " ").replace(/^./, letter => letter.toUpperCase())
export const normalizeSearch = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ")

// Index the complete authorized workspace, before filtering or limiting results.
export function adminWorkspaceIndex(state: State, projectStatuses: Record<string, string>): WorkspaceResult[] {
  const results: WorkspaceResult[] = []
  const documents = new Set<string>()
  function addDocument(doc: Doc, source: string, context: string) {
    if (!doc.uploaded || documents.has(doc.id)) return
    documents.add(doc.id)
    results.push({ id: doc.id, category: "documents", name: doc.name || doc.label,
      subtitle: `${doc.label} · ${context}`, type: source, doc,
      text: `${doc.name} ${doc.label} ${context} ${doc.owner} ${doc.phase || ""}` })
  }
  for (const project of state.projects) {
    const status = projectStatuses[project.status] || friendlyStatus(project.status)
    results.push({ id: project.id, category: "projects", name: project.name,
      subtitle: `${project.type} · ${status}`, status: project.status, type: project.type,
      text: `${project.name} ${project.type} ${status} ${project.location} ${project.phase}` })
    for (const category of projectDocumentIndex(project)) for (const folder of category.folders)
      for (const { doc } of folder.files) addDocument(doc, "Project", project.name)
  }
  for (const account of state.accounts) {
    results.push({ id: account.id, category: "people", name: account.name,
      subtitle: `${ROLE_NAMES[account.role]} · ${friendlyStatus(account.status)}`, status: account.status, type: ROLE_NAMES[account.role],
      text: `${account.name} ${account.email} ${ROLE_NAMES[account.role]} ${friendlyStatus(account.status)} ${account.license} ${account.scope.join(" ")}` })
    for (const doc of account.docs) addDocument(doc, "Person", account.name)
  }
  for (const company of state.companies) {
    results.push({ id: company.id, category: "companies", name: company.name,
      subtitle: `Subcontractor · ${friendlyStatus(company.status)}`, status: company.status, type: company.availability,
      text: `${company.name} ${company.email} ${company.contact} ${company.primaryTrade || ""} ${friendlyStatus(company.status)} ${company.availability}` })
    for (const doc of [...company.documents, ...company.manpowerDocuments]) addDocument(doc, "Company", company.name)
  }
  return results
}

export function searchWorkspace(results: WorkspaceResult[], query: string, sort: "relevance" | "name") {
  const normalized = normalizeSearch(query)
  const tokens = normalized.split(" ").filter(Boolean)
  const score = (result: WorkspaceResult) => {
    const name = normalizeSearch(result.name)
    return !normalized ? 0 : name === normalized ? 3 : name.startsWith(normalized) ? 2 : name.includes(normalized) ? 1 : 0
  }
  return results.filter(result => tokens.every(token => normalizeSearch(result.text).includes(token)))
    .sort((a, b) => (sort === "relevance" ? score(b) - score(a) : 0) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id))
}
