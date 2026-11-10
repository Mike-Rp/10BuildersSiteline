import DatePicker from "./DatePicker"
import { useRef, useState } from "react"
import { PROFESSIONS, ENGINEER_SPECIALIZATIONS, licenseNumberError, isoDateValid } from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { uploadFile } from "./api/actions"
import { DOCUMENT_UPLOAD_LIMIT_MB, type Account, type RegistrationCredential, uid, today } from "./model"
import { Button, Field, Icon, Modal } from "./ui"
import "./registration-credentials.css"

function CredentialDocumentUpload({ id, name, busy, disabled, onFile }: {
  id?: string; name?: string; busy: boolean; disabled: boolean; onFile: (file?: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="credential-document-upload">
    <input ref={input} id={id} hidden type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={disabled}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; onFile(file) }} />
    <Button icon="upload" disabled={disabled} onClick={() => input.current?.click()} aria-describedby={id ? `${id}-file-status ${id}-file-help` : undefined}>
      {busy ? "Uploading…" : name ? "Replace File" : "Upload Credential"}
    </Button>
    <span id={id ? `${id}-file-status` : undefined} className="credential-file-status" role="status">
      <Icon name={name ? "check" : "doc"} size={15} />{busy ? "Uploading your document…" : name || "No document attached"}
    </span>
    <small id={id ? `${id}-file-help` : undefined}>PDF, JPG or PNG · Maximum {DOCUMENT_UPLOAD_LIMIT_MB} MB</small>
  </div>
}

export type RegistrationCredentialErrors = {
  profession?: string
  license_number?: string
  license_expiry?: string
  file_id?: string
  specializations?: string
}

export function registrationCredentialErrors(value: Partial<Account>) {
  const rows = value.initialCredentials || []
  const fields = rows.map((row): RegistrationCredentialErrors => {
    const errors: RegistrationCredentialErrors = {}
    const issue = licenseNumberError(row.license_number)
    if (!PROFESSIONS.includes(row.profession)) errors.profession = "Select a licensed profession."
    if (issue) errors.license_number = issue
    if (!isoDateValid(row.license_expiry) || row.license_expiry <= today()) errors.license_expiry = "Enter a future expiry date."
    if (!row.file_id) errors.file_id = "Attach a supporting document."
    const tags=row.specializations||[]
    if(tags.length>3||new Set(tags).size!==tags.length||tags.some(tag=>!ENGINEER_SPECIALIZATIONS.includes(tag))) errors.specializations = "Choose up to three supported specializations."
    return errors
  })
  const seenProfessions = new Set<string>()
  let duplicateProfession = false
  for (const [index, row] of rows.entries()) {
    if (!row.profession) continue
    if (seenProfessions.has(row.profession)) {
      duplicateProfession = true
      fields[index].profession = "Enter each profession only once."
    }
    seenProfessions.add(row.profession)
  }
  const verificationNote = value.credentialDecision === "verified" && (!value.credentialEvidenceReviewed || !value.credentialReviewNote?.trim())
    ? "Confirm the evidence review and enter a verification note."
    : ""
  return { fields, missingCredential: rows.length === 0, duplicateProfession, verificationNote }
}

export function validateRegistrationCredentials(value: Partial<Account>) {
  const result = registrationCredentialErrors(value)
  if (result.missingCredential) return "Add at least one professional credential."
  for (const errors of result.fields) {
    if (errors.profession) return errors.profession
    if (errors.license_number) return errors.license_number
    if (errors.license_expiry) return errors.license_expiry
    if (errors.file_id) return errors.file_id
    if (errors.specializations) return errors.specializations
  }
  if (result.duplicateProfession) return "Enter each profession only once."
  if (result.verificationNote) return result.verificationNote
  return ""
}

export default function RegistrationCredentials({ value, onChange, onBusy, onError, errors = [] }: {
  value: Partial<Account>
  onChange: (value: Partial<Account>) => void
  onBusy: (busy: boolean) => void
  onError: (message: string) => void
  errors?: RegistrationCredentialErrors[]
}) {
  const running = useRef(false)
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [collapsed,setCollapsed]=useState<string[]>([])
  const [removeKey,setRemoveKey]=useState<string>()
  const latest=useRef(value);latest.current=value
  const rows = value.initialCredentials || []
  const patch = (next: Partial<Account>) => onChange({ ...value, ...next })
  const update = (index: number, next: Partial<RegistrationCredential>) =>
    onChange({...latest.current, initialCredentials: (latest.current.initialCredentials||[]).map((row, i) => i === index ? { ...row, ...next } : row) })
  async function upload(index: number, file?: File) {
    if (!file || running.current) return
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || file.size > DOCUMENT_UPLOAD_LIMIT_MB * 1024 * 1024) {
      onError(`Choose a PDF, JPG or PNG no larger than ${DOCUMENT_UPLOAD_LIMIT_MB} MB.`); return
    }
    running.current = true; setUploadingIndex(index); onBusy(true); onError("")
    try {
      const id = uid()
      await uploadFile(id, file, "document", "credential")
      update(index, { file_id: id, fileName: file.name })
    } catch (error) { onError((error as Error).message) }
    finally { running.current = false; setUploadingIndex(null); onBusy(false) }
  }
  return <>
    <section className="form-section registration-credentials">
      <h3>Professional license details</h3>
      <p>Save credentials with this account. Uploading alone does not verify them.</p>
      {rows.map((row, index) => {const key=row.clientKey||String(index),open=!collapsed.includes(key),tags=row.specializations||[];return <section className="credential-record" key={key}>
        <header className="registration-credential-heading"><h4>Credential {index + 1}</h4>
          <Button aria-expanded={open} aria-controls={`credential-${key}`} onClick={()=>setCollapsed(current=>open?[...current,key]:current.filter(k=>k!==key))}>{open?'Collapse':'Expand'} credential {index+1}</Button>
          {rows.length > 1 && <Button className="remove-registration-credential" icon="close" disabled={uploadingIndex !== null} aria-label={`Remove credential ${index + 1}`} onClick={() => setRemoveKey(key)}>Remove Credential</Button>}
        </header>
        <p className="role-muted">{row.profession||'Select a profession'} · {tags.length}/3 specializations · Pending verification until reviewed</p>
        <div id={`credential-${key}`} hidden={!open}>
        <div className="form-grid">
          <Field label="Licensed profession *" error={errors[index]?.profession}><select required value={row.profession} onChange={e => update(index, { profession: e.target.value })}>
            <option value="">Select profession</option>{PROFESSIONS.map(p => <option key={p}>{p}</option>)}
          </select></Field>
          <Field label="License number exactly as printed *" error={errors[index]?.license_number}><input required inputMode="numeric" pattern="[0-9]{7}" minLength={7} maxLength={7} placeholder="e.g. 0012345" value={row.license_number} onChange={e => update(index, { license_number: e.target.value })} /></Field>
          <Field label="Expiry date *" error={errors[index]?.license_expiry}><DatePicker required calendarTitle="Expiry date" min={today()} value={row.license_expiry} onValueChange={date => update(index, { license_expiry: date })} /></Field>
          <Field label="Supporting credential document *" error={errors[index]?.file_id}><CredentialDocumentUpload name={row.fileName} busy={uploadingIndex === index} disabled={uploadingIndex !== null} onFile={file => void upload(index, file)} /></Field>
        </div>
        {errors[index]?.specializations && <p className="field-error" role="alert">{errors[index]?.specializations}</p>}
        <fieldset className="credential-specializations"><legend>Areas of specialization · Credential {index+1} · Choose up to 3</legend><div className="tag-list account-choice-chips">{ENGINEER_SPECIALIZATIONS.map(tag=><button type="button" key={tag} className={`chip ${tags.includes(tag)?'selected':''}`} aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag)&&tags.length>=3} onClick={()=>update(index,{specializations:tags.includes(tag)?tags.filter(t=>t!==tag):[...tags,tag]})}>{tag}</button>)}</div></fieldset>
        </div>
      </section>})}
      <Button disabled={uploadingIndex !== null || rows.length >= PROFESSIONS.length} onClick={() => patch({ initialCredentials: [...rows, { clientKey:uid(),profession: "", license_number: "", license_expiry: "", file_id: "", fileName: "",specializations:[] }] })}>Add another professional credential</Button>
      <p>Leading zeros are preserved. Format checking does not verify authenticity.</p>
    </section>
    {removeKey!==undefined&&<Modal title="Remove professional credential?" onClose={()=>setRemoveKey(undefined)}><p>This removes this credential from the unsaved form. Your other credentials and attachments will be retained.</p><div className="modal-actions"><Button onClick={()=>setRemoveKey(undefined)}>Keep credential</Button><Button variant="danger-ghost" onClick={()=>{patch({initialCredentials:rows.filter((row,i)=>(row.clientKey||String(i))!==removeKey)});setRemoveKey(undefined)}}>Remove this credential</Button></div></Modal>}

  </>
}

export function RegistrationVerification({ value, onChange, noteError }: { value: Partial<Account>; onChange: (value: Partial<Account>) => void; noteError?: string }) {
  const patch = (next: Partial<Account>) => onChange({ ...value, ...next })
  return (
    <section className="form-section">
      <h3>Admin verification</h3>
      <p>Credentials are saved as Pending Verification. Only confirm this review if you have checked the supporting evidence and want to verify them when creating the account.</p>
        <label className="check-row"><input type="checkbox" checked={!!value.credentialEvidenceReviewed} onChange={e => patch({ credentialEvidenceReviewed: e.target.checked })} />I reviewed the supporting evidence for every credential</label>
        {value.credentialEvidenceReviewed&&<Field label="Verification note *" error={noteError}><textarea required maxLength={2000} value={value.credentialReviewNote || ""} onChange={e => patch({ credentialReviewNote: e.target.value })} /></Field>}
      <p className="notice">Your review identity, note and time are recorded. Assignments still require matching scope, account activation and availability.</p>
    </section>
  )
}
