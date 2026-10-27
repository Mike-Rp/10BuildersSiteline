import { useRef, useState } from "react"
import { Button, Field, Icon } from "./ui"
import type { Company } from "./model"
import "./TradeAllocationPanel.css"

export default function CompanyCapabilities({
  company,
  disciplines,
  onSave,
}: {
  company: Company
  disciplines: string[]
  onSave: (review: NonNullable<Company["capabilityReview"]>) => Promise<void>
}) {
  const review = company.capabilityReview
  const [selected, setSelected] = useState(review?.disciplines || [])
  const [documents, setDocuments] = useState(review?.documentIds || [])
  const [note, setNote] = useState(review?.note || "")
  const [unavailable, setUnavailable] = useState(review?.unavailable || false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const locked = useRef(false)
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value]
  async function save() {
    if (locked.current) return
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
  return (
    <section className="detail-section trade-allocation">
      <h3>Admin-reviewed capabilities</h3>
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
        <legend>Verified disciplines</legend>
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
              <label className="trade-check" key={d.id}>
                <input
                  type="checkbox"
                  checked={documents.includes(d.id)}
                  onChange={() => setDocuments(toggle(documents, d.id))}
                />
                {d.name}
              </label>
            ))}
          {!company.documents.some((d) => d.uploaded) && (
            <p>
              Upload supporting documents below, then select them for this
              review.
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
