import { useState, type InputHTMLAttributes } from "react"
import { dateLabel, localToday } from "./model"
import { Button, Modal } from "./ui"
import "./estimated-completion-date.css"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "min" | "max"> & {
  calendarTitle: string
  calendarSubtitle?: string
  emptyLabel?: string
  clearable?: boolean
  value: string
  min?: string
  max?: string
  start?: string
  onValueChange: (value: string, badInput?: boolean) => void
}
const months = Array.from({ length: 12 }, (_, month) => new Date(2000, month, 1).toLocaleDateString("en-US", { month: "long" }))
const calendarDate = (year: number, month: number, day: number) => {
  const date = new Date(0)
  date.setFullYear(year, month, day)
  date.setHours(0, 0, 0, 0)
  return date
}
const dateParts = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number)
  const date = calendarDate(year, month - 1, day)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}
const isoDate = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`

export default function DatePicker({ calendarTitle, calendarSubtitle, emptyLabel = "No date selected.", clearable = true, value, min = "0001-01-01", max = "9999-12-31", start = "", onValueChange, disabled, readOnly, ...inputProps }: Props) {
  const [view, setView] = useState<{ year: number; month: number }>()
  function openCalendar() {
    if (disabled || readOnly) return
    const candidate = dateParts(value) ? value : dateParts(start) ? start : localToday()
    const anchor = dateParts(value) || dateParts(start) || dateParts(candidate < min ? min : candidate > max ? max : candidate)!
    setView({ year: anchor.getFullYear(), month: anchor.getMonth() })
  }
  const anchorYear = view?.year || Number(localToday().slice(0, 4))
  const firstYear = Math.min(min === "0001-01-01" ? Math.max(1, anchorYear - 100) : Number(min.slice(0, 4)), anchorYear)
  const lastYear = Math.max(max === "9999-12-31" ? Math.min(9999, anchorYear + 100) : Number(max.slice(0, 4)), anchorYear)
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
  const offset = view ? calendarDate(view.year, view.month, 1).getDay() : 0
  const days = view ? calendarDate(view.year, view.month + 1, 0).getDate() : 0
  const monthKey = view ? isoDate(view.year, view.month, 1).slice(0, 7) : ""
  function moveMonth(direction: number) {
    if (!view) return
    const next = calendarDate(view.year, view.month + direction, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }
  return <div className="estimated-completion-date">
    <div className="estimated-completion-control">
      <input {...inputProps} type="date" value={value} min={min} max={max} disabled={disabled} readOnly={readOnly}
        onClick={event => { event.preventDefault(); openCalendar() }}
        onChange={event => onValueChange(event.target.value, event.target.validity.badInput)}
        onKeyDown={event => {
          if ((event.key === "ArrowDown" && event.altKey) || event.key === "F4" || event.key === " ") { event.preventDefault(); openCalendar() }
        }} />
      <Button icon="calendar" disabled={disabled || readOnly} aria-label={`Choose ${calendarTitle.toLowerCase()}`} aria-haspopup="dialog" aria-expanded={!!view} onClick={openCalendar} />
    </div>
    {view && <Modal title={calendarTitle} subtitle={calendarSubtitle || `Choose ${calendarTitle.toLowerCase()}.`} onClose={() => setView(undefined)}>
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
        <p className="completion-calendar-note">{value ? `Selected: ${dateLabel(value)}` : emptyLabel}</p>
        <div className="modal-actions">{clearable && value && !inputProps.required && <Button onClick={() => { onValueChange(""); setView(undefined) }}>Clear</Button>}<Button onClick={() => setView(undefined)}>Cancel</Button></div>
      </div>
    </Modal>}
  </div>
}
