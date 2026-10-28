import { useId, useState } from "react"
import { Button } from "./ui"
import "./reports.css"

export default function ReportProjectSearch({ projects, value, onChange }: {
  projects: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const matches = projects.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const pages = Math.max(1, Math.ceil(matches.length / 9))
  const current = Math.min(page, pages)
  const selected = projects.find(p => p.id === value)
  return <section className="report-project-search" aria-label="Find a report project">
    <label htmlFor={id}>Search projects</label>
    <input id={id} type="search" placeholder="Search by project name…" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} />
    <p role="status">{matches.length} matching projects · Selected: {selected?.name || "None"}</p>
    <div className="report-project-results" aria-label="Matching projects">
      {matches.slice((current - 1) * 9, current * 9).map(p => <button type="button" key={p.id} aria-pressed={p.id === value} onClick={() => onChange(p.id)}>
        <strong>{p.name}</strong><small>Reference: {p.id.slice(0, 8)}{p.id === value ? " · Selected" : ""}</small>
      </button>)}
    </div>
    {!matches.length && <p>No projects match your search. Try another name.</p>}
    {pages > 1 && <nav className="role-actions" aria-label="Project search pages">
      <Button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous projects</Button>
      <span>Page {current} of {pages}</span>
      <Button disabled={current === pages} onClick={() => setPage(current + 1)}>Next projects</Button>
    </nav>}
  </section>
}
