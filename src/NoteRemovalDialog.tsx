import { useState } from "react"
import { Button, Field, Modal } from "./ui"

export default function NoteRemovalDialog({ text, onClose, onRemove }: {
  text: string
  onClose: () => void
  onRemove: (reason: string) => Promise<boolean>
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  return <Modal title="Remove unrelated site diary note" onClose={() => { if (!saving) onClose() }}>
    <p>This removes the note from the project’s visible diary. Its original text and removal details remain in the audit log.</p>
    <blockquote className="site-diary-removal-quote">{text}</blockquote>
    <Field label="Why is this note unrelated to the project? *">
      <textarea rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Add a short reason for the audit record." />
    </Field>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions">
      <Button disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="danger-ghost" disabled={saving || reason.trim().length < 5} onClick={async () => {
        setSaving(true)
        setError("")
        try {
          if (await onRemove(reason.trim())) onClose()
          else setError("The note could not be removed. Refresh the project and try again.")
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "The note could not be removed.")
        } finally {
          setSaving(false)
        }
      }}>{saving ? "Removing…" : "Remove note"}</Button>
    </div>
  </Modal>
}
