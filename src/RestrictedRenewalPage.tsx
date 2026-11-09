import DatePicker from "./DatePicker"
import { useEffect, useRef, useState } from "react"
import { api } from "./api/client"
import { submitOwnRenewal, openRenewalFile } from "./api/licenses"
import { PROFESSIONS, licenseNumberError } from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { Button, Field, Badge } from "./ui"
import { dateLabel, type Account } from "./model"
import type { LicenseSelf } from "./licenseTypes"
import "./restricted-renewal.css"

type Submission = { id: number; profession: string; license_number: string; license_expiry: string; status: string; review_note?: string; submitted_at: string }
export default function RestrictedRenewalPage({ actor, status, onReload, onSignOut }: {
  actor: Account; status: LicenseSelf; onReload: () => Promise<unknown>; onSignOut: () => void
}) {
  const [submissions, setSubmissions] = useState<Submission[]>()
  const [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const [profession, setProfession] = useState(""), [number, setNumber] = useState(""), [expiry, setExpiry] = useState("")
  const [file, setFile] = useState<File>()
  const running = useRef(false)
  async function refresh() {
    const summary = await api<{ submissions: Submission[] }>(`/licenses/credentials/${actor.id}`)
    setSubmissions(summary.submissions)
  }
  useEffect(() => { void refresh().catch(e => setError(e.message)) }, [actor.id])
  const pending = submissions?.filter(q => q.status === "under_review") || []
  const latest = submissions?.[0]
  const submissionAllowed = status.renewalSubmissionAllowed === true
  return <main className="restricted-renewal-page">
    <header><strong>10BuildLine</strong><Button onClick={onSignOut}>Sign out</Button></header>
    <section className="restricted-renewal-card">
      <h1>{pending.length ? "Await Admin verification" : submissionAllowed ? "Submit license renewal" : "Visit your Administrator"}</h1>
      <p>{actor.name} · {actor.role === "opm" ? "Office PM" : "Site PM"}</p>
      <div className="notice"><strong>Renewal-only access</strong><p>Your license is within 30 days of expiry. Only renewal submission and status are available. Normal workspace access and new assignments are blocked.</p>
        <p>License expiry: {dateLabel(status.expiry || "")} · Self-service submission closes: {dateLabel(status.restrictedOn || "")}</p></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!submissions ? <><p role="status">Loading renewal status…</p>{error && <Button onClick={() => void refresh().then(() => setError("")).catch(e => setError(e.message))}>Retry</Button>}</> : pending.length ? <>
        <h2>Renewal submitted</h2><Badge tone="amber">License renewal under review</Badge>
        {pending.map(q => <article key={q.id} className="credential-record"><div><strong>{q.profession}</strong><p>PRC license number: {q.license_number}</p><p>Submitted expiry: {dateLabel(q.license_expiry)}</p><p>Submitted: {dateLabel(q.submitted_at)}</p><Button onClick={() => void openRenewalFile(q.id).catch(e => setError(e.message))}>View submission</Button></div></article>)}
        <p>Admin will review your evidence. Uploading does not restore workspace access or assignment eligibility.</p>
      </> : !submissionAllowed ? <div className="notice" role="status"><strong>Renewal submission window closed</strong><p>No renewal is currently awaiting review. Your seven-day submission window has ended. Visit your Administrator to complete the renewal process. Online submission and normal workspace access are blocked.</p>{latest?.status === "rejected" && <p>Correction required: {latest.review_note}</p>}</div> : <>
        {latest?.status === "rejected" && <p className="notice">Correction required: {latest.review_note}</p>}
        <form className="form-grid" onSubmit={async event => {
          event.preventDefault(); if (running.current || !submissionAllowed) return
          const issue = licenseNumberError(number)
          if (issue || !file) { setError(issue || "Choose a supporting document."); return }
          running.current = true; setBusy(true); setError("")
          try { await submitOwnRenewal({ profession, licenseNumber: number, licenseExpiry: expiry, file }); await refresh(); await onReload() }
          catch (reason) { setError((reason as Error).message) }
          finally { running.current = false; setBusy(false) }
        }}>
          <Field label="Licensed profession"><select required disabled={busy} value={profession} onChange={e => setProfession(e.target.value)}><option value="">Select profession</option>{PROFESSIONS.map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="PRC license number"><input required disabled={busy} inputMode="numeric" pattern="[0-9]{7}" minLength={7} maxLength={7} placeholder="0012345" value={number} onChange={e => setNumber(e.target.value)} /></Field>
          <Field label="New expiry date"><DatePicker required disabled={busy} calendarTitle="New expiry date" value={expiry} onValueChange={date => setExpiry(date)} /></Field>
          <Field label="Supporting license document"><input required disabled={busy} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0])} /></Field>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Submitting…" : "Submit for Admin verification"}</Button>
        </form>
      </>}
      <Button disabled={busy} onClick={() => void onReload().catch(e => setError(e.message))}>Check verification status</Button>
    </section>
  </main>
}
