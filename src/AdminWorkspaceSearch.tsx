import { useMemo, useState } from "react"
import { type Doc, type Role, type State } from "./model"
import { Button, Icon, Modal } from "./ui"
import { adminWorkspaceIndex, categoryLabels, friendlyStatus, normalizeSearch, SEARCH_CATEGORIES, searchWorkspace, type SearchCategory, type WorkspaceResult } from "./admin-workspace-search"
import "./admin-workspace-search.css"

type Props = {
  role: Role
  state: State
  projectStatuses: Record<string, string>
  onClose: () => void
  onOpen: (kind: "project" | "account" | "company", id: string) => void
  onPreview: (doc: Doc) => void
}
function Match({ text, query }: { text: string; query: string }) {
  const term = query.trim()
  const index = term ? text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) : -1
  return index < 0 ? <>{text}</> : <>{text.slice(0, index)}<mark>{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>
}

export default function AdminWorkspaceSearch({ role, state, projectStatuses, onClose, onOpen, onPreview }: Props) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<SearchCategory | "all">("all")
  const [sort, setSort] = useState<"relevance" | "name">("relevance")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [limit, setLimit] = useState(10)
  const index = useMemo(() => role === "admin" ? adminWorkspaceIndex(state, projectStatuses) : [], [role, state, projectStatuses])
  const matches = useMemo(() => searchWorkspace(index, query, sort), [index, query, sort])
  if (role !== "admin") return null
  const groups = Object.fromEntries(SEARCH_CATEGORIES.map(key => [key, matches.filter(result => result.category === key)])) as Record<SearchCategory, WorkspaceResult[]>
  const categoryItems = category === "all" ? matches : groups[category]
  const filtered = categoryItems.filter(item => (!status || item.status === status) && (!type || item.type === type))
  const options = (key: "status" | "type") => [...new Set(index.filter(item => item.category === category).map(item => item[key]).filter((value): value is string => !!value))].sort()
  const statusLabel = (value: string) => category === "projects" ? projectStatuses[value] || friendlyStatus(value) : friendlyStatus(value)
  const changeCategory = (next: typeof category) => { setCategory(next); setStatus(""); setType(""); setLimit(10) }
  const browsePrompt = category === "all" && !normalizeSearch(query)
  function open(result: WorkspaceResult) {
    if (result.doc) { onClose(); onPreview(result.doc); return }
    onOpen(result.category === "projects" ? "project" : result.category === "people" ? "account" : "company", result.id)
  }
  function rows(items: WorkspaceResult[]) {
    return <ul className="admin-search-results">{items.map(item => <li key={`${item.category}:${item.id}`}>
      <button type="button" onClick={() => open(item)}>
        <span className="admin-search-result-icon"><Icon name={item.category === "projects" ? "building" : item.category === "people" || item.category === "companies" ? "users" : "doc"} size={20} /></span>
        <span className="admin-search-result-text"><strong><Match text={item.name} query={query} /></strong><small>{item.subtitle}</small></span>
        <Icon name="chevron" size={15} />
      </button>
    </li>)}</ul>
  }
  return <div className="admin-workspace-search"><Modal title="Search workspace" onClose={onClose}>
    <div className="admin-search-controls">
      <div className="admin-search-input"><Icon name="search" size={20} />
        <input autoFocus type="search" aria-label="Search the entire workspace" placeholder="Search projects, people, companies or documents" value={query} onChange={event => { setQuery(event.target.value); setLimit(10) }} />
        {query && <Button variant="icon-button" icon="close" aria-label="Clear search" onClick={() => { setQuery(""); setLimit(10) }} />}
      </div>
      <div className="admin-search-categories" role="group" aria-label="Search category">
        <button type="button" aria-pressed={category === "all"} onClick={() => changeCategory("all")}>All <span>{matches.length}</span></button>
        {SEARCH_CATEGORIES.map(key => <button type="button" key={key} aria-pressed={category === key} onClick={() => changeCategory(key)}>{categoryLabels[key]} <span>{groups[key].length}</span></button>)}
      </div>
      <div className="admin-search-filters">
        {category !== "all" && category !== "documents" && <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setLimit(10) }}><option value="">All statuses</option>{options("status").map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>}
        {category !== "all" && <label>{category === "projects" ? "Project type" : category === "people" ? "Role" : category === "companies" ? "Availability" : "Document source"}<select value={type} onChange={event => { setType(event.target.value); setLimit(10) }}><option value="">All</option>{options("type").map(value => <option key={value} value={value}>{friendlyStatus(value)}</option>)}</select></label>}
        <label className="admin-search-sort">Sort by<select value={sort} onChange={event => { setSort(event.target.value as typeof sort); setLimit(10) }}><option value="relevance">Most relevant</option><option value="name">Name A–Z</option></select></label>
        {(status || type) && <Button variant="text-button" onClick={() => { setStatus(""); setType(""); setLimit(10) }}>Clear filters</Button>}
      </div>
    </div>
    <div className="admin-search-content">
      <p className="admin-search-summary" role="status" aria-live="polite">{browsePrompt ? "Choose a category to browse, or type to search." : `${filtered.length} result${filtered.length === 1 ? "" : "s"}${category === "all" ? " across your workspace" : ` in ${categoryLabels[category].toLowerCase()}`}`}</p>
      {browsePrompt ? <div className="admin-search-empty"><Icon name="search" size={30} /><h3>Find something in your workspace</h3><p>Search by name, email, project type or document name.</p></div> : filtered.length === 0 ? <div className="admin-search-empty"><h3>No matching results</h3><p>Try a different search or clear your filters.</p></div> : category === "all" ? SEARCH_CATEGORIES.filter(key => groups[key].length).map(key => <section className="admin-search-group" key={key} aria-label={categoryLabels[key]}>
        <div className="admin-search-group-heading"><h3>{categoryLabels[key]}</h3>{groups[key].length > 5 && <Button variant="text-button" onClick={() => changeCategory(key)}>View all {groups[key].length} {key}</Button>}</div>
        {rows(groups[key].slice(0, 5))}
      </section>) : <>{rows(filtered.slice(0, limit))}<div className="admin-search-more"><span>Showing {Math.min(limit, filtered.length)} of {filtered.length} results</span>{limit < filtered.length && <Button onClick={() => setLimit(current => current + 10)}>Show more</Button>}</div></>}
    </div>
    <p className="admin-search-access">Search includes only records you can access.</p>
  </Modal></div>
}
