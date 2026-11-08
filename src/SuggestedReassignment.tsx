import { useEffect, useRef, useState } from "react"
import { api } from "./api/client"
import type { Project } from "./model"
import { Badge, Button, Field, Modal } from "./ui"
import "./suggested-reassignment.css"

type Options = {
  available: boolean; canReassign: boolean; message: string; version: string
  phase: string; userId: string; name: string; tags: string[]; status: string
  offeredAt?: string; deadline?: string; candidates: { id: string; name: string; tags: string[] }[]
}
export default function SuggestedReassignment({ project, phase, userId, onClose, onSaved }: {
  project: Project; phase: string; userId: string; onClose: () => void; onSaved: () => unknown | Promise<unknown>
}) {
  const [data, setData] = useState<Options>()
  const [selected, setSelected] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const lock = useRef(false)
  useEffect(() => {
    let live = true
    setData(undefined); setSelected(""); setError("")
    api<Options>(`/projects/${project.id}/reassignment-options?phase=${encodeURIComponent(phase)}&userId=${encodeURIComponent(userId)}`)
      .then(next => { if (live) { setData(next); setSelected(next.candidates?.[0]?.id || "") } })
      .catch(reason => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [project.id, phase, userId, reload])
  const date = (value: string) => new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current || done || !data?.canReassign || !selected || !note.trim()) return
    lock.current = true; setBusy(true); setError("")
    try {
      await api(`/projects/${project.id}/reassign-offer`, { method: "POST", json: { phase, userId, newUserId: selected, version: data.version, note: note.trim() } })
      setDone(true)
      try { await onSaved(); onClose() }
      catch { setError("Reassignment saved. Reload the workspace to see the replacement offer.") }
    } catch (reason) { setError((reason as Error).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal title="Review Suggested Reassignment" subtitle={`${project.name} · ${phase}`} onClose={() => { if (!busy) onClose() }}>
    <form className="suggested-reassignment" onSubmit={confirm}>
      {!data && !error && <p role="status">Checking the offer and eligible replacements…</p>}
      {data && !data.available && <p>{data.message}</p>}
      {data?.available && <>
        <div className="reassignment-current">
          <Badge tone="amber">{data.status === "declined" ? "Assignment declined" : data.status === "auto_expired" || (data.deadline && Date.parse(data.deadline) <= Date.now()) ? "Response overdue — deadline passed" : "Awaiting acceptance"}</Badge>
          <h3>{data.name}</h3><p>Responsibilities: {data.tags.join(" · ") || "No responsibility tags recorded"}</p>
          {data.offeredAt && <p>Offered: {date(data.offeredAt)}</p>}
          {data.deadline && <p>Response due: {date(data.deadline)}</p>}
        </div>
        <h3>System-Suggested Replacements</h3><p>{data.message}</p>
        {data.candidates.length > 0 && <fieldset disabled={busy || done} className="reassignment-candidates"><legend>Select a replacement</legend>
          {data.candidates.map(candidate => <label key={candidate.id} className={selected === candidate.id ? "selected" : ""}>
            <input type="radio" name="replacement" value={candidate.id} checked={selected === candidate.id} onChange={() => setSelected(candidate.id)} />
            <span><strong>{candidate.name}</strong><span className="reassignment-tags">{candidate.tags.map(tag => <span key={tag}>{tag}</span>)}</span><small>Verified credentials · Covers all responsibilities in this offer</small></span><Badge tone="green">Eligible</Badge>
          </label>)}
        </fieldset>}
        {data.canReassign && data.candidates.length > 0 && <>
          <Field label="Reason for reassignment"><textarea aria-label="Reason for reassignment" value={note} required maxLength={2000} rows={2} disabled={busy || done} onChange={event => setNote(event.target.value)} placeholder="Record the reason and any contact attempts." /></Field>
          <div className="reassignment-next"><strong>After you confirm</strong><ul><li>The previous offer closes and stays in history.</li><li>The replacement receives an internal notification and a new three-calendar-day response window.</li><li>The replacement must accept these responsibilities before becoming confirmed.</li></ul></div>
        </>}
      </>}
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">Replacement offer saved; awaiting the new Site PM’s acceptance.</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={onClose}>{done ? "Close" : "Cancel"}</Button>{!done && <Button disabled={busy} onClick={() => setReload(previous => previous + 1)}>Refresh Suggestions</Button>}<Button type="submit" variant="primary" disabled={busy || done || !data?.canReassign || !selected || !note.trim()}>{busy ? "Reassigning…" : "Confirm Reassignment"}</Button></div>
    </form>
  </Modal>
}
