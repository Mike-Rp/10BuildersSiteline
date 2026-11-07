import { useRef, useState } from "react"
import { projectPhaseDisciplines, type Project, type State } from "./model"
import { api } from "./api/client"
import { Badge, Button, Icon } from "./ui"
import "./engineer-scope-review.css"

export default function EngineerScopeReview({ project, state, onReload }: {
  project: Project
  state: State
  onReload: () => Promise<unknown>
}) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<string[]>([])
  const locked = useRef(false)
  const rows = project.team.filter(row => state.accounts.find(account => account.id === row.accountId)?.engineerCommitments?.some(commitment => commitment.project_id === project.id && commitment.phase === row.phase && commitment.tags === null))
  if (!rows.length) return null

  async function save(phase: string, userId: string, key: string, eligible: string[]) {
    const tags = chosen[key] || []
    if (locked.current || saved.includes(key) || !tags.length || tags.length > 3 || tags.some(tag => !eligible.includes(tag))) return
    locked.current = true
    setBusy(true)
    setError("")
    try {
      await api(`/projects/${project.id}/engineer-scope`, { method: "POST", json: { phase, userId, tags } })
      setSaved(previous => [...previous, key])
      try { await onReload() }
      catch { setError("Specializations saved, but the workspace could not refresh. Reload to see the updated assignment.") }
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  return <section className="detail-section engineer-scope-review">
    <h3>Complete Missing Assignment Details</h3>
    <p className="scope-review-intro">Record the specializations already assigned to each engineer. This updates the existing assignment.</p>
    {rows.map(row => {
      const key = `${project.id}:${row.phase}:${row.accountId}`
      const account = state.accounts.find(person => person.id === row.accountId)
      const tags = [...new Set(projectPhaseDisciplines(project, row.phase).filter(tag => (account?.qualifiedRequirements || []).includes(tag)))]
      const selected = chosen[key] || []
      const complete = saved.includes(key)
      return <div className="scope-review-row" key={key}>
        <fieldset disabled={busy || complete}>
          <legend>{row.phase} · {account?.name || "Engineer record unavailable"}</legend>
          <div className="scope-review-heading"><span>Select the responsibilities actually assigned in this phase.</span><Badge tone={complete ? "green" : "amber"}>{complete ? "Saved" : "Existing assignment"}</Badge></div>
          <div className="scope-review-options">{tags.map(tag => <label key={tag} className={selected.includes(tag) ? "selected" : ""}>
            <input type="checkbox" checked={selected.includes(tag)} disabled={!selected.includes(tag) && selected.length >= 3} onChange={event => {
              const checked = event.target.checked
              setChosen(previous => ({ ...previous, [key]: checked ? [...(previous[key] || []), tag] : (previous[key] || []).filter(value => value !== tag) }))
            }} />
            <span>{tag}</span>
          </label>)}</div>
          <small>{tags.length ? `${selected.length} of 3 specializations selected${selected.length === 3 ? " · Maximum reached" : ""}` : "No verified specializations match this phase. Review the engineer’s credentials before recording responsibilities."}</small>
        </fieldset>
        <Button variant="primary" disabled={busy || complete || !selected.length} onClick={() => void save(row.phase, row.accountId, key, tags)}>{complete ? "Specializations saved" : "Save Assigned Specializations"}</Button>
      </div>
    })}
    <p className="scope-review-note"><Icon name="shield" size={16} />Only verified specializations matching this phase are shown. Existing allocation checks still apply.</p>
    {error && <p role="alert">{error}</p>}
    {saved.length > 0 && <p role="status">Assigned specializations saved.</p>}
  </section>
}
