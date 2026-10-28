import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react"
import { Button } from "./ui"
import "./location-search.css"

type Option = { code: string; name: string; searchText?: string }
type Props = Pick<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-describedby" | "aria-invalid"> & {
  label: string; options: Option[]; value: string; onChange: (code: string) => void; disabled?: boolean; placeholder?: string
}
const searchKey = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase()

export default function LocationSearch({ id, label, options, value, onChange, disabled = false, placeholder, ...aria }: Props) {
  const generatedId = useId(), inputId = id || generatedId, listId = `${inputId}-locations`, statusId = `${inputId}-location-status`
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const [popup, setPopup] = useState({ above: false, height: 250 })
  const selected = options.find(option => option.code === value)
  const words = searchKey(query).split(/\s+/).filter(Boolean)
  const matches = options.filter(option => words.every(word => searchKey(option.name + " " + (option.searchText || "")).includes(word)))
  const expanded = open && !disabled, activeIndex = Math.min(active, matches.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  useEffect(() => {
    input.current?.setCustomValidity(!selected && query.trim() ? "Choose a location from the matching suggestions." : "")
  }, [selected, query])
  useEffect(() => {
    if (expanded && activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" })
  }, [expanded, activeIndex, query])
  useEffect(() => {
    if (!expanded || !root.current) return
    const element = root.current, scrollContainer = element.closest(".modal-body")
    const position = () => {
      const rect = element.getBoundingClientRect(), container = scrollContainer?.getBoundingClientRect()
      const below = Math.min(window.innerHeight, container?.bottom || window.innerHeight) - rect.bottom
      const above = rect.top - Math.max(0, container?.top || 0)
      const needed = matches.length ? Math.min(250, matches.length * 48 + 12) : 90
      const flip = below < needed + 20 && above > below
      setPopup({ above: flip, height: Math.max(80, Math.min(250, (flip ? above : below) - 20)) })
    }
    position()
    window.addEventListener("resize", position)
    scrollContainer?.addEventListener("scroll", position, { passive: true })
    return () => { window.removeEventListener("resize", position); scrollContainer?.removeEventListener("scroll", position) }
  }, [expanded, matches.length, query])

  function choose(option: Option) {
    input.current?.setCustomValidity("")
    onChange(option.code); setQuery(""); setOpen(false); setActive(0)
  }
  return <div ref={root} className="location-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      const exact = !selected && query.trim() ? options.filter(option => searchKey(option.name) === searchKey(query)) : []
      if (exact.length === 1) choose(exact[0])
      setOpen(false)
    }
  }}>
    <div className="location-search-control">
      <input {...aria} id={inputId} ref={input} type="text" inputMode="search" role="combobox" required disabled={disabled}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={[aria["aria-describedby"], statusId].filter(Boolean).join(" ")}
        autoComplete="off" title={selected?.name} placeholder={placeholder || "Type or select a location"} value={selected?.name || query}
        onFocus={() => { setOpen(true); setActive(0) }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); onChange("") }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true)
            setActive(event.key === "ArrowDown" ? expanded ? Math.min(activeIndex + 1, Math.max(0, matches.length - 1)) : 0 : expanded ? Math.max(0, activeIndex - 1) : Math.max(0, matches.length - 1))
          }
          if (event.key === "Enter" && expanded) { event.preventDefault(); if (matches[activeIndex]) choose(matches[activeIndex]) }
        }} />
      <Button className="location-search-toggle" disabled={disabled} aria-label={`Show ${label.replace(/ \*$/, "")} choices`} aria-expanded={expanded}
        onMouseDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!expanded); setActive(0) }}><span aria-hidden="true">▾</span></Button>
    </div>
    {expanded && <div className={`location-search-menu${popup.above ? " above" : ""}`}>
      <ul id={listId} role="listbox" aria-label={`${label.replace(/ \*$/, "")} choices`} style={{ maxHeight: popup.height }}>
        {matches.map((option, index) => <li key={option.code} id={optionId(index)} role="option" data-location-code={option.code}
          aria-selected={selected?.code === option.code} className={index === activeIndex ? "active" : ""}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option.name}</li>)}
      </ul>
      {!matches.length && <p role="status">No matching locations in this area. Check the spelling or parent location.</p>}
    </div>}
    <small id={statusId} className="location-search-status" role="status" aria-live="polite">{expanded
      ? `${matches.length} matching location${matches.length === 1 ? "" : "s"}. Use arrow keys and Enter to select.`
      : selected ? "Location selected." : disabled ? "Complete the parent location first." : "Type to search, then select a matching location."}</small>
  </div>
}
