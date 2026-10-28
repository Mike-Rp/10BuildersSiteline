import { useState, type InputHTMLAttributes } from "react"
import { dateLabel, localToday } from "./model"
import { Button, Modal } from "./ui"
import "./estimated-completion-date.css"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "min" | "max"> & {
  value: string
  min: string
  max: string
  start: string
  onValueChange: (value: string, badInput?: boolean) => void
}
const months = Array.from({ length: 12 }, (_, month) => new Date(2000, month, 1).toLocaleDateString("en-US", { month: "long" }))
const dateParts = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}
const isoDate = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`

export default function EstimatedCompletionDate({ value, min, max, start, onValueChange, disabled, ...inputProps }: Props) {
  const [view, setView] = useState<{ year: number; month: number }>()
  function openCalendar() {
    const anchor = dateParts(value) || dateParts(start) || dateParts(localToday())!
    setView({ year: anchor.getFullYear(), month: anchor.getMonth() })
  }
  const firstYear = Math.min(Number(min.slice(0, 4)), view?.year || Infinity)
  const lastYear = Math.max(Number(max.slice(0, 4)), view?.year || 0)
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
  const offset = view ? new Date(view.year, view.month, 1).getDay() : 0
  const days = view ? new Date(view.year, view.month + 1, 0).getDate() : 0
  const monthKey = view ? isoDate(view.year, view.month, 1).slice(0, 7) : ""
  function moveMonth(direction: number) {
    if (!view) return
    const next = new Date(view.year, view.month + direction, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }
  return <div className="estimated-completion-date">
    <div className="estimated-completion-control">
      <input {...inputProps} type="date" value={value} min={min} max={max} disabled={disabled}
        onChange={event => onValueChange(event.target.value, event.target.validity.badInput)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); openCalendar() }
        }} />
      <Button icon="calendar" disabled={disabled} aria-label="Choose estimated completion date" aria-haspopup="dialog" aria-expanded={!!view} onClick={openCalendar} />
    </div>
    {view && <Modal title="Estimated completion date" subtitle="Choose a date after the estimated start date." onClose={() => setView(undefined)}>
      <div className="completion-calendar">
        <div className="completion-calendar-heading">
          <Button aria-label="Previous month" disabled={monthKey <= min.slice(0, 7)} onClick={() => moveMonth(-1)}>‹</Button>
          <strong aria-live="polite">{months[view.month]} {view.year}</strong>
          <Button aria-label="Next month" disabled={monthKey >= max.slice(0, 7)} onClick={() => moveMonth(1)}>›</Button>
        </div>
        <div className="completion-calendar-selectors">
          <label>Month<select value={view.month} onChange={event => setView({ ...view, month: Number(event.target.value) })}>
            {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select></label>
          <label>Year<select value={view.year} onChange={event => setView({ ...view, year: Number(event.target.value) })}>
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select></label>
        </div>
        <div className="completion-calendar-days" role="group" aria-label={`${months[view.month]} ${view.year} dates`}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="completion-weekday">{day}</span>)}
          {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const iso = isoDate(view.year, view.month, index + 1)
            return <Button key={iso} aria-label={dateLabel(iso)} aria-pressed={iso === value} disabled={iso < min || iso > max}
              className={iso === value ? "completion-selected" : ""} onClick={() => { onValueChange(iso); setView(undefined) }}>{index + 1}</Button>
          })}
        </div>
        <p className="completion-calendar-note">{value ? `Selected: ${dateLabel(value)}` : "No completion date selected."}</p>
        <div className="modal-actions"><Button onClick={() => setView(undefined)}>Cancel</Button></div>
      </div>
    </Modal>}
  </div>
}
