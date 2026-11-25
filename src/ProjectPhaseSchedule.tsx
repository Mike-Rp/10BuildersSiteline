import { useState } from "react"
import type { FormEvent } from "react"
import type { MixedUseScope, PhaseScheduleImpact } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import { api } from "./api/client"
import { dateLabel, type Project } from "./model"
import { Button } from "./ui"

export default function ProjectPhaseSchedule({ project, today, onReload }: {
  project: Project
  today: string
  onReload: () => unknown
}) {
  const [saved, setSaved] = useState<MixedUseScope>()
  const [phase, setPhase] = useState("")
  const [release, setRelease] = useState("")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<PhaseScheduleImpact>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const scope = saved ?? project.phaseScope
  const dates = scope?.phase_dates
  if (project.status !== "active" || !dates || !Object.keys(dates).length) return null
  const pending = scope.pending_phase_revision
  const impact = pending ?? preview
  const activeEnd = dates[project.phase]?.end
  const format = (range: { start: string; end: string }) => `${dateLabel(range.start)} – ${dateLabel(range.end)}`

  async function change(action: "preview" | "submit" | "approve" | "discard") {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const endpoint = `/projects/${encodeURIComponent(project.id)}/phase-schedule`
      const json = { action, phase, release, reason, revisionId: pending?.id }
      if (action === "preview") setPreview(await api<PhaseScheduleImpact>(endpoint, { method: "POST", json }))
      else {
        setSaved(await api<MixedUseScope>(endpoint, { method: "POST", json }))
        setPreview(undefined)
        setReason("")
        await onReload()
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update the schedule.")
    } finally {
      setBusy(false)
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void change("preview")
  }

  return <section className="detail-section" aria-label="Construction phase schedule">
    <h3>Construction phase schedule</h3>
    {activeEnd && activeEnd < today && <p className="notice">{project.phase} is overdue. The planned end was {dateLabel(activeEnd)}.</p>}
    <details><summary>Confirmed phase dates</summary>
      <ul>{Object.entries(dates).map(([name, range]) => <li key={name}>{name} · {format(range)}</li>)}</ul>
    </details>
    {!pending && <form onSubmit={review} className="inquiry-form-stack">
      <label>Affected phase<select required value={phase} disabled={busy} onChange={event => {
        setPhase(event.target.value)
        setPreview(undefined)
      }}>
        <option value="">Select a phase</option>
        {(scope.phases ?? Object.keys(dates)).filter(name => dates[name]).map(name => <option key={name}>{name}</option>)}
      </select></label>
      <label>Forecast release date<input type="date" required value={release} disabled={busy} onChange={event => {
        setRelease(event.target.value)
        setPreview(undefined)
      }} /></label>
      <button className="button" disabled={busy}>Review schedule impact</button>
    </form>}
    {impact && <div className="inquiry-form-stack">
      <h4>{pending ? "Pending schedule revision" : "Proposed schedule revision"}</h4>
      <p>{impact.phase} · Forecast release {dateLabel(impact.release)}</p>
      <ul>{Object.entries(impact.dates).filter(([name, range]) =>
        dates[name] && (dates[name].start !== range.start || dates[name].end !== range.end)
      ).map(([name, range]) => <li key={name}><strong>{name}</strong> · {format(dates[name])} → {format(range)}</li>)}</ul>
      <p>Forecast completion · {dateLabel(impact.completion)}</p>
      {impact.completion > project.end && <p className="notice">Forecast exceeds the project completion date. An approved extension is required.</p>}
      {pending ? <>
        <p>Reason · {pending.reason}</p>
        <Button variant="primary" disabled={busy || impact.completion > project.end} onClick={() => void change("approve")}>Recheck staffing and approve</Button>
        <Button disabled={busy} onClick={() => void change("discard")}>Discard revision</Button>
      </> : <>
        <label>Reason for revision<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
        <Button variant="primary" disabled={busy || !reason.trim()} onClick={() => void change("submit")}>Submit for approval</Button>
      </>}
    </div>}
    {!!scope.phase_schedule_history?.length && <details><summary>Schedule revision history</summary>
      <ul>{scope.phase_schedule_history.map(revision => <li key={revision.id}>{revision.phase} · {revision.reason} · {dateLabel(revision.completion)}</li>)}</ul>
    </details>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>
}
