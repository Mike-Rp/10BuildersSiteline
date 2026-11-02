import { useRef } from "react"
import { PROFESSIONS, licenseNumberError, isoDateValid } from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { uploadFile } from "./api/actions"
import { type Account, type RegistrationCredential, uid, today } from "./model"
import { Button, Field } from "./ui"

export function validateRegistrationCredentials(value: Partial<Account>) {
  const rows = value.initialCredentials || []
  if (!rows.length) return "Add at least one professional credential."
  for (const row of rows) {
    const issue = licenseNumberError(row.license_number)
    if (!PROFESSIONS.includes(row.profession)) return "Select each licensed profession."
    if (issue) return issue
    if (!isoDateValid(row.license_expiry) || row.license_expiry <= today()) return "Enter a future credential expiry date."
    if (!row.file_id) return "Attach a supporting document for each credential."
  }
  if (new Set(rows.map(c => c.profession)).size !== rows.length) return "Enter each profession only once."
  if (value.credentialDecision === "verified" && (!value.credentialEvidenceReviewed || !value.credentialReviewNote?.trim()))
    return "Confirm the evidence review and record a verification note."
  return ""
}

export default function RegistrationCredentials({ value, onChange, onBusy, onError }: {
  value: Partial<Account>
  onChange: (value: Partial<Account>) => void
  onBusy: (busy: boolean) => void
  onError: (message: string) => void
}) {
  const running = useRef(false)
  const rows = value.initialCredentials || []
  const patch = (next: Partial<Account>) => onChange({ ...value, ...next })
  const update = (index: number, next: Partial<RegistrationCredential>) =>
    patch({ initialCredentials: rows.map((row, i) => i === index ? { ...row, ...next } : row) })
  async function upload(index: number, file?: File) {
    if (!file || running.current) return
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      onError("Choose a PDF, JPG or PNG no larger than 10 MB."); return
    }
    running.current = true; onBusy(true); onError("")
    try {
      const id = uid()
      await uploadFile(id, file)
      update(index, { file_id: id, fileName: file.name })
    } catch (error) { onError((error as Error).message) }
    finally { running.current = false; onBusy(false) }
  }
  return <>
    <section className="form-section registration-credentials">
      <h3>Professional credentials</h3>
      <p>Save credentials with this account. Uploading alone does not verify them.</p>
      {rows.map((row, index) => <section className="credential-record" key={index}>
        <h4>Credential {index + 1}</h4>
        <div className="form-grid">
          <Field label="Licensed profession *"><select required value={row.profession} onChange={e => update(index, { profession: e.target.value })}>
            <option value="">Select profession</option>{PROFESSIONS.map(p => <option key={p}>{p}</option>)}
          </select></Field>
          <Field label="License number exactly as printed *"><input required maxLength={120} value={row.license_number} onChange={e => update(index, { license_number: e.target.value })} /></Field>
          <Field label="Expiry date *"><input required type="date" min={today()} value={row.license_expiry} onChange={e => update(index, { license_expiry: e.target.value })} /></Field>
          <Field label="Supporting credential document *"><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => void upload(index, e.target.files?.[0])} />
            {row.fileName && <small>Attached: {row.fileName}</small>}
          </Field>
        </div>
        {rows.length > 1 && <Button onClick={() => patch({ initialCredentials: rows.filter((_, i) => i !== index) })}>Remove credential</Button>}
      </section>)}
      <Button disabled={rows.length >= PROFESSIONS.length} onClick={() => patch({ initialCredentials: [...rows, { profession: "", license_number: "", license_expiry: "", file_id: "", fileName: "" }] })}>Add another professional credential</Button>
      <p>Leading zeros are preserved. Format checking does not verify authenticity.</p>
    </section>
    <section className="form-section">
      <h3>Admin verification</h3>
      <Field label="Credential decision"><select value={value.credentialDecision || "pending"} onChange={e => patch({ credentialDecision: e.target.value as "pending" | "verified" })}>
        <option value="pending">Pending Admin verification</option><option value="verified">Verify credentials during creation</option>
      </select></Field>
      {value.credentialDecision === "verified" && <>
        <label className="check-row"><input type="checkbox" checked={!!value.credentialEvidenceReviewed} onChange={e => patch({ credentialEvidenceReviewed: e.target.checked })} />I reviewed the supporting evidence for every credential</label>
        <Field label="Verification note *"><textarea required maxLength={2000} value={value.credentialReviewNote || ""} onChange={e => patch({ credentialReviewNote: e.target.value })} /></Field>
      </>}
      <p className="notice">{value.credentialDecision === "verified"
        ? "Your review identity, note and time are recorded. Assignments still require matching scope, account activation and availability."
        : "Credentials and specializations are saved. New assignments remain blocked until an appropriate credential is verified."}</p>
    </section>
  </>
}
