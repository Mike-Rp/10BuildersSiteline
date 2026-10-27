import { useRef, useState } from "react"
import { Button, Field, Icon } from "./ui"
import type { Company, Doc, Role } from "./model"
import "./TradeAllocationPanel.css"

export default function CompanyCapabilities({
  company,
  disciplines,
  role,
  onSave,
  onPreview,
}: {
  company: Company
  disciplines: string[]
  role: Role
  onSave?: (review: NonNullable<Company["capabilityReview"]>) => Promise<void>
  onPreview?: (doc: Doc) => void
}) {
  const review = company.capabilityReview
  const [selected, setSelected] = useState(review?.disciplines || [])
  const [documents, setDocuments] = useState(review?.documentIds || [])
  const [note, setNote] = useState(review?.note || "")
  const [unavailable, setUnavailable] = useState(review?.unavailable || false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const locked = useRef(false)
  const editable = role === "spm" && !!onSave
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value]
  async function save() {
    if (locked.current || !editable || !onSave) return
    locked.current = true
    setBusy(true)
    setError("")
    try {
      await onSave({
        disciplines: selected,
        documentIds: documents,
        note: note.trim(),
        unavailable,
        reviewedAt: "",
        reviewedBy: "",
        reviewedById: "",
      })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  if (!editable) return (
    <section className="detail-section trade-allocation">
      <h3>Company capabilities</h3>
      <p>View only. Capability reviews are managed in the Site PM workspace.</p>
      <p>Directory classification: <strong>{company.primaryTrade || "Not recorded"}</strong></p>
      {review ? <>
        <div className="tag-list">{review.disciplines.map(discipline => <span key={discipline}>{discipline}</span>)}</div>
        {!review.disciplines.length && <p>No verified capabilities recorded.</p>}
        <p><Icon name="check" size={16} /> Last reviewed by {review.reviewedBy} on {new Date(review.reviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p>
        <p>{review.note}</p>
        <p>{review.unavailable ? "Unavailable for new commitments" : "Available for capacity checks"}</p>
        <p>Supporting records: {company.documents.filter(document => (review.documentIds || []).includes(document.id)).map(document => document.name).join(", ") || "No linked records available"}</p>
      </> : <p>Site PM capability review required.</p>}
    </section>
  )
  return (
    <section className="detail-section trade-allocation">
      <h3>Site PM capability review</h3>
      <p>
        Verify disciplines against the company’s supporting records before
        saving. Worker roster disciplines and the directory classification do
        not automatically verify company capabilities.
      </p>
      <p>
        Directory classification:{" "}
        <strong>{company.primaryTrade || "Not recorded"}</strong>
      </p>
      {review && (
        <p>
          <Icon name="check" size={16} /> Last reviewed by {review.reviewedBy}{" "}
          on{" "}
          {new Date(review.reviewedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          .
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>Capabilities to verify</legend>
        <div className="trade-checks">
          {disciplines.map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={selected.includes(d)}
                onChange={() => setSelected(toggle(selected, d))}
              />
              {d}
            </label>
          ))}
        </div>
        <fieldset>
          <legend>Supporting company records</legend>
          {company.documents
            .filter((d) => d.uploaded)
            .map((d) => (
              <div className="trade-heading" key={d.id}>
              <label className="trade-check">
                <input
                  type="checkbox"
                  checked={documents.includes(d.id)}
                  onChange={() => setDocuments(toggle(documents, d.id))}
                />
                {d.name}
              </label>
              {onPreview && <Button disabled={busy} onClick={() => onPreview(d)}>Preview {d.name}</Button>}
              </div>
            ))}
          {!company.documents.some((d) => d.uploaded) && (
            <p>
              Supporting company records are required. Add them through the company registration or supporting-document workflow, then select them for this review.
            </p>
          )}
        </fieldset>
        <Field label="Capability review note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Which records support these capabilities?"
            maxLength={2000}
          />
        </Field>
        <label className="trade-check">
          <input
            type="checkbox"
            checked={unavailable}
            onChange={(e) => setUnavailable(e.target.checked)}
          />
          Company unavailable for new commitments
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="primary"
        disabled={busy || !documents.length || !note.trim()}
        onClick={() => void save()}
      >
        {busy ? "Saving review…" : "Save capability review"}
      </Button>
      <p>
        A company can reserve up to 2 concurrent project commitments. This
        review does not accept any project on its behalf.
      </p>
    </section>
  )
}
