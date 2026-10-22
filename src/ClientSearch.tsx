import { useEffect, useId, useRef, useState } from "react"
import type { Account } from "./model"
import { Button, Icon } from "./ui"
import "./client-search.css"

export default function ClientSearch({ id, clients, value, onChange, disabled = false }: {
  id?: string
  clients: Account[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const generatedId = useId()
  const inputId = id || generatedId
  const resultsId = `${inputId}-results`
  const hintId = `${inputId}-hint`
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const focusResult = useRef(false)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const selected = clients.find(client => client.id === value)
  const term = query.trim().toLocaleLowerCase()
  const matches = term ? clients.filter(client =>
    [client.name, client.email, client.id].some(text => text.toLocaleLowerCase().includes(term))) : []
  const pages = Math.max(1, Math.ceil(matches.length / 3))
  const currentPage = Math.min(page, pages - 1)
  const expanded = open && !!term && !selected && !disabled

  useEffect(() => {
    if (expanded && focusResult.current) {
      focusResult.current = false
      results.current?.querySelector<HTMLButtonElement>("button[data-client-select]")?.focus()
    }
  }, [expanded])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [])

  function clear() {
    onChange("")
    setQuery("")
    setPage(0)
    setOpen(false)
    input.current?.focus()
  }

  return <div ref={root} className="client-search"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}
    onKeyDown={event => {
      if (event.key === "Escape" && expanded) {
        event.preventDefault()
        event.stopPropagation()
        input.current?.focus()
        setOpen(false)
      }
    }}>
    <div className="client-search-control">
      <div className="client-search-input">
      <Icon name="search" size={18} />
      <input id={inputId} ref={input} type="text" inputMode="search" role="combobox" required
        aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? resultsId : undefined}
        aria-describedby={hintId} autoComplete="off" placeholder="Search clients by name or email"
        disabled={disabled} value={selected?.name || query}
        onChange={event => {
          onChange("")
          setQuery(event.target.value)
          setPage(0)
          setOpen(!!event.target.value.trim())
        }}
        onFocus={() => { if (term && !selected) setOpen(true) }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && term && !selected) {
            event.preventDefault()
            if (expanded) results.current?.querySelector<HTMLButtonElement>("button[data-client-select]")?.focus()
            else { focusResult.current = true; setOpen(true) }
          }
          if (event.key === "Enter" && expanded) {
            event.preventDefault()
            results.current?.querySelector<HTMLButtonElement>("button[data-client-select]")?.focus()
          }
        }} />
      </div>
      {!disabled && (selected || query) && <Button onClick={clear}
        aria-label={selected ? "Change selected client" : "Clear client search"}>{selected ? "Change" : "Clear"}</Button>}
    </div>
    <small id={hintId} className="client-search-hint">{selected
      ? `Selected: ${selected.name} · ${selected.email}`
      : "Start typing to find an existing client."}</small>
    {expanded && <div ref={results} id={resultsId} className="client-search-results" role="dialog" aria-label="Matching clients">
      <div className="client-search-count" role="status">{matches.length} matching {matches.length === 1 ? "client" : "clients"}</div>
      {matches.slice(currentPage * 3, currentPage * 3 + 3).map(client => <div key={client.id} className="client-search-row">
        <span className="client-search-avatar" aria-hidden="true">{client.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>
        <div className="client-search-person"><strong>{client.name}</strong><span>{client.email}</span></div>
        <Button data-client-select aria-label={`Select ${client.name}`} onClick={() => {
          onChange(client.id)
          setQuery("")
          input.current?.focus()
          setOpen(false)
        }}>Select</Button>
      </div>)}
      {!matches.length && <p className="client-search-empty">No clients found. Try another name or email, or create a client account below.</p>}
      {matches.length > 3 && <div className="client-search-pages">
        <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous client results">Previous</Button>
        <span>Page {currentPage + 1} of {pages}</span>
        <Button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next client results">Next</Button>
      </div>}
    </div>}
  </div>
}
