import { uploadFile } from "./api/actions"
import ClientSearch from "./ClientSearch"
import CompanyTradePicker from "./CompanyTradePicker"
import EstimatedCompletionDate from "./EstimatedCompletionDate"
import ProjectScopeReview from "./ProjectScopeReview"
import ProjectScopeSummary from "./ProjectScopeSummary"
import { defaultMixedUseScope, mixedUsePhaseReview, mixedUseScopeError, normalizeMixedUseScope } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import { CLIENT_EMAIL_PATTERN, clientEmailError } from "../Thesis-Backend/src/domain/client-email.js"
import { recordedProgress, type ProgressProject } from "./progress"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from "react"
import { Button, Badge, Empty, Field, Icon, Modal } from "./ui"
import { apiEnabled, downloadApiFile } from "./api/client"
import { canHideNativePdfToolbar, renderPdfFirstPage } from "./pdfFirstPage"
import { LicenseAssignmentWarning } from "./LicenseWorkflow"
import { newUploadedDoc } from "./uploadDocument"
import { COMPANY_EMAIL_PATTERN, COMPANY_PHONE_PATTERN, companyRegistrationErrors, normalizeCompanyForemen, type CompanyRegistrationErrors } from "../Thesis-Backend/src/domain/company-registration.js"
import "./company-foremen.css"
import { EXPERIENCE_PROJECT_TYPES, normalizeExperience, experienceText } from "../Thesis-Backend/src/domain/engineer-experience.js"
import {
  accountError,
  clientForEmail,
  dateLabel,
  DISCIPLINES,
  DOC_LABELS,
  eligible,
  headcount,
  initials,
  licenseState,
  opmCandidates,
  password,
  phaseDefinitions,
  projectPhaseDisciplines,
  projectPhaseNames,
  projectDocs,
  ROLE_NAMES,
  spmCandidates,
  today,
  uid,
  validateFile,
  uploadRequirements,
  endAfterStart,
  plannedDays,
  addDays,
  localToday,
  latestProjectDate,
  projectDateErrors,
  startsInLabel,
  DATE_ERRORS,
  type Account,
  type Company,
  type Doc,
  type Project,
  type Rules,
  type Role,
  type State,
  suggestWorkEmail,
} from "./model"
import "./upload-control.css"

const INTAKE_PROJECT_TYPES = [
  {
    name: "Residential",
    description: "Houses, condominiums, apartments, and residential buildings.",
    icon: "home",
  },
  {
    name: "Commercial",
    description: "Offices, retail spaces, hotels, and business establishments.",
    icon: "storefront",
  },
  {
    name: "Mixed-Use",
    description: "Developments combining residential and commercial spaces.",
    icon: "mixed-building",
  },
] as const

async function saveFile(id:string,file:File,spreadsheet=false) { return await uploadFile(id,file,spreadsheet ? "manpower" : "document") }
export async function fileFor(id:string) { return downloadApiFile(id) }
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function downloadDoc(doc: Doc) {
  const file = await fileFor(doc.id)
  downloadBlob(
    file ||
      new Blob(
        [
          `BuildAxis · DOCUMENT RECORD\n\n${doc.label}\nFilename: ${doc.name}\nOwner: ${doc.owner}\nDate: ${doc.date}\n\nThis record has no attached original file. Documents uploaded in BuildAxis download their actual file.`,
        ],
        { type: "text/plain" },
      ),
    file ? doc.name : `${doc.label} — record.txt`,
  )
}
export function Upload({
  label,
  onSave,
  owner = "Administrator",
  disabled = false,
  buttonLabel = "Upload document",
  ariaLabel,
  spreadsheet = false,
  clientVisible = false,
}: {
  label: string
  onSave: (doc: Doc) => void | boolean | Promise<void | boolean>
  owner?: string
  disabled?: boolean
  buttonLabel?: string
  ariaLabel?: string
  spreadsheet?: boolean
  // Internal by default, including site photos that still require an authorized release.
  clientVisible?: boolean
}) {
  const hintId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  // Browsers that ignore "#toolbar=0" (Firefox, Safari, mobile) get page 1 as an image.
  const isPdf =
    !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
  const needsFallback = isPdf && !canHideNativePdfToolbar(navigator)
  const [pageImage, setPageImage] = useState("")
  const [pageFailed, setPageFailed] = useState(false)
  useEffect(() => {
    setPageImage("")
    setPageFailed(false)
    if (!needsFallback || !preview) return
    let cancelled = false
    renderPdfFirstPage(preview)
      .then((src) => {
        if (!cancelled) setPageImage(src)
      })
      .catch(() => {
        if (!cancelled) setPageFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [needsFallback, preview])
  function clear() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(undefined)
    setPreview("")
    setError("")
    if (input.current) input.current.value = ""
  }
  async function confirm() {
    if (savingRef.current || disabled || !file) return
    const validation = validateFile(file, spreadsheet)
    if (validation) { setError(validation); return }
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      const id = uid()
      const uploaded = await saveFile(id, file, spreadsheet)
      const doc = newUploadedDoc({ id, label, file, owner, clientVisible })
      if (spreadsheet && Number.isInteger(uploaded.manpowerCount) && uploaded.manpowerCount >= 0) doc.manpowerCount = uploaded.manpowerCount
      const saved=await onSave(doc)
      if(saved===false)throw new Error("We couldn’t save your upload. Your file is still selected—please try again.")
      clear()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Your file is still selected; try again.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return (
    <>
      <input
        ref={input}
        className="hidden"
        type="file"
        aria-label={ariaLabel || label}
        aria-describedby={hintId}
        disabled={disabled || saving}
        accept={spreadsheet ? ".xlsx,.xls" : ".pdf,.jpg,.jpeg,.png"}
        onChange={(e) => {
          const selected = e.target.files?.[0]
          if (!selected) return
          if (disabled || savingRef.current) { e.target.value = ""; return }
          const message = validateFile(selected, spreadsheet)
          clear()
          setError(message)
          if (!message) {
            setFile(selected)
            setPreview(URL.createObjectURL(selected))
          }
        }}
      />
      <span className="upload-control">
        <Button
          icon="upload"
          disabled={disabled || saving}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          onClick={() => input.current?.click()}
        >
          {buttonLabel}
        </Button>
        <span className="upload-limit" id={hintId}>{uploadRequirements(spreadsheet)}</span>
      </span>
      {error && !file && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <Modal title="Confirm document upload" subtitle={label} onClose={() => { if (!savingRef.current) clear() }}>
          <p className="upload-limit">{uploadRequirements(spreadsheet)}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="upload-file">
            <Icon name="doc" />
            <div>
              <strong>{file.name}</strong>
              <p>
                {(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload
              </p>
            </div>
          </div>
          {spreadsheet ? <p>Excel manpower list · Confirm to upload this workbook.</p> : file.type.startsWith("image/") ? (
            <img
              className="file-preview"
              src={preview}
              alt="Selected document"
            />
          ) : needsFallback ? (
            <div
              className="pdf-preview"
              style={{ overflow: "auto" }}
              role="group"
              aria-label="Document preview"
            >
              {pageImage ? (
                <img
                  src={pageImage}
                  alt="First page of the selected document"
                  style={{ width: "100%", display: "block" }}
                />
              ) : (
                <p>
                  {pageFailed
                    ? "Preview unavailable. You can still confirm this file."
                    : "Loading preview…"}
                </p>
              )}
            </div>
          ) : (
            <object
              className="pdf-preview"
              data={`${preview}#toolbar=0&navpanes=0&scrollbar=1`}
              type="application/pdf"
              aria-label="Document preview"
            >
              <p>Preview unavailable. You can still confirm this file.</p>
            </object>
          )}
          <div className="modal-actions">
            <Button disabled={saving} onClick={clear}>Back</Button>
            <Button
              disabled={saving}
              onClick={() => {
                clear()
                setTimeout(() => input.current?.click(), 0)
              }}
            >
              Retry upload
            </Button>
            <Button variant="primary" disabled={disabled || saving} onClick={confirm}>
              {saving ? "Saving…" : "Confirm upload"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
export function DocumentList({
  docs,
  onPreview,
  onUpload,
  uploadLabel,
  spreadsheet = false,
}: {
  docs: Doc[]
  onPreview: (doc: Doc) => void
  onUpload?: (doc: Doc) => void
  uploadLabel?: string
  spreadsheet?: boolean
}) {
  return (
    <div className="document-list">
      {docs.map((doc) => (
        <div className="document-row" key={doc.id}>
          <span className="file-icon">
            <Icon name="doc" />
          </span>
          <div className="document-info">
            <strong>{doc.label}</strong>
            <p>
              {doc.uploaded
                ? `${doc.name} · ${doc.date ? dateLabel(doc.date) : "On file"}`
                : `Not uploaded · ${doc.owner}`}
            </p>
          </div>
          <Badge tone={doc.clientVisible ? "green" : ""}>
            {doc.clientVisible ? "Client visible" : "Internal"}
          </Badge>
          {doc.uploaded && (
            <>
              <Button
                variant="icon-button"
                title="Preview document"
                aria-label={`Preview ${doc.label}`}
                icon="eye"
                onClick={() => onPreview(doc)}
              />
              <Button
                variant="icon-button"
                title="Download document"
                aria-label={`Download ${doc.label}`}
                icon="download"
                onClick={() => downloadDoc(doc)}
              />
            </>
          )}
        </div>
      ))}
      {onUpload && (
        <div className="document-upload">
          <div>
            <strong>{uploadLabel || "Add a signed document"}</strong>
            <p>
              {spreadsheet
                ? "Excel manpower list (.xlsx or .xls) · Maximum 15 MB"
                : "PDF, JPG, JPEG or PNG · Maximum 10 MB"}
            </p>
          </div>
          <Upload
            spreadsheet={spreadsheet}
            label={uploadLabel || "Supporting document"}
            onSave={onUpload}
          />
        </div>
      )}
      {!docs.length && !onUpload && <Empty title="No documents on file" />}
    </div>
  )
}
export function Preview({
  doc,
  onClose,
  viewer = "Signed-in user",
  downloadable = true,
  onDownload,
}: {
  doc: Doc
  onClose: () => void
  viewer?: string
  downloadable?: boolean
  onDownload?: () => void
}) {
  const [url, setUrl] = useState("")
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl = ""
    fileFor(doc.id)
      .then((file) => {
        if (cancelled) return
        if (file) {
          objectUrl = URL.createObjectURL(file)
          setUrl(objectUrl)
        }
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc.id])
  return (
    <Modal
      title={doc.label}
      subtitle={`${doc.owner} · ${doc.name || "Not uploaded"}`}
      wide
      onClose={() => {
        if (url) URL.revokeObjectURL(url)
        onClose()
      }}
    >
      <div className="preview-watermark">
        Viewed by {viewer} · {dateLabel(today())}
        {!downloadable && " · View only"}
      </div>
      <div className="watermarked-preview">
        {url ? (
          /\.(png|jpe?g)$/i.test(doc.name) ? (
            <img className="file-preview" src={url} alt={doc.label} />
          ) : (
            <object
              className="pdf-preview large"
              data={downloadable ? url : `${url}#toolbar=0&navpanes=0`}
              type="application/pdf"
            >
              <p>
                {downloadable
                  ? "PDF preview unavailable. Download the original below."
                  : "PDF preview unavailable in this browser. This submission is view-only."}
              </p>
            </object>
          )
        ) : (
          <div className="sample-record">
            <Icon name="doc" size={40} />
            <h3>{loaded ? "Document record" : "Loading document…"}</h3>
            <p>{doc.label}</p>
            <p>
              {downloadable
                ? "This record contains metadata only. Files uploaded here can be previewed and downloaded in full."
                : "This record contains metadata only. Site PM submissions are view-only; Office PM retains the download copy."}
            </p>
          </div>
        )}
        <div className="document-watermark-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i}>
              {viewer}
              <br />
              {dateLabel(today())}
            </span>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>Close</Button>
        {downloadable && (
          <Button
            icon="download"
            variant="primary"
            onClick={() => (onDownload ? onDownload() : downloadDoc(doc))}
          >
            Download {url ? "original" : "record"}
          </Button>
        )}
      </div>
    </Modal>
  )
}
export function Chart({
  compact = false,
  projects = [],
  summaryProjects,
}: {
  compact?: boolean
  projects?: ProgressProject[]
  // All projects the summary should cover when `projects` is only the current page.
  summaryProjects?: ProgressProject[]
}) {
  if (!projects.length)
    return (
      <Empty title="No project progress yet">
        Recorded progress will appear when projects are available.
      </Empty>
    )
  const summary = summaryProjects ?? projects
  const project = summary.length === 1 ? projects[0] : undefined
  const series = project ? recordedProgress(project) : []
  const average =
    summary.reduce((sum, item) => sum + item.progress, 0) / summary.length
  const left = 46,
    right = 538
  const start = series[0]?.time ?? 0
  const span = (series.at(-1)?.time ?? start) - start
  const x = (time: number) =>
    span ? left + ((time - start) / span) * (right - left) : (left + right) / 2
  const points = series
    .map((row) => `${x(row.time)},${205 - row.progress * 1.8}`)
    .join(" ")
  const visible = compact ? projects.slice(0, 5) : projects
  return (
    <div className={`schedule ${compact ? "compact" : ""}`}>
      <div className="chart-summary">
        <div>
          <span>
            {project
              ? project.name
              : summary.length > projects.length
                ? `Average across ${summary.length} projects`
                : "Average recorded completion"}
          </span>
          <strong>
            {average.toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <span>Recorded progress</span>
      </div>
      {project ? (
        series.length ? (
          <div className="schedule-plot">
            <svg
              className="schedule-svg"
              viewBox="0 0 560 245"
              role="img"
              aria-label={`Recorded progress history for ${project.name}`}
            >
              {[0, 25, 50, 75, 100].map((value) => (
                <g key={value}>
                  <line
                    x1={left}
                    x2={right}
                    y1={205 - value * 1.8}
                    y2={205 - value * 1.8}
                    className="chart-grid-line"
                    strokeDasharray="4 5"
                  />
                  <text x="30" y={210 - value * 1.8} textAnchor="end">
                    {value}%
                  </text>
                </g>
              ))}
              <polyline
                points={points}
                fill="none"
                className="chart-actual-line"
                strokeWidth="2.8"
                strokeLinejoin="round"
              />
              {series.map((row, index) => (
                <circle
                  key={index}
                  cx={x(row.time)}
                  cy={205 - row.progress * 1.8}
                  r="4"
                  className="chart-actual-point"
                >
                  <title>
                    {dateLabel(row.date)}: {row.progress}%
                  </title>
                </circle>
              ))}
              <text x={left} y="237" textAnchor="start">
                {dateLabel(series[0].date)}
              </text>
              {span > 0 && (
                <text x={right} y="237" textAnchor="end">
                  {dateLabel(series.at(-1)!.date)}
                </text>
              )}
            </svg>
          </div>
        ) : (
          <Empty title="No progress history yet">
            Recorded completion is shown above. History will appear when
            progress updates are recorded.
          </Empty>
        )
      ) : (
        <div className="daily-chart">
          {visible.map((item) => (
            <div className="daily-bar" key={item.id}>
              <span>{item.name}</span>
              <progress
                max={100}
                value={item.progress}
                aria-label={`${item.name} recorded completion`}
              />
              <strong>{item.progress}%</strong>
            </div>
          ))}
          {visible.length < projects.length && (
            <p>
              Showing {visible.length} of {projects.length} projects.
            </p>
          )}
        </div>
      )}
      <div className="chart-footer">
        <small>Recorded completion and history from project records.</small>
      </div>
    </div>
  )
}
export function AccountForm({
  state,
  account,
  clientOnly = false,
  onSave,
  onUseExisting,
  onClose,
}: {
  state: State
  account?: Account
  clientOnly?: boolean
  onSave: (a: Account, pass?: string) => void | Promise<void>
  onUseExisting?: (a: Account) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Account>(
    account || {
      id: uid(),
      name: "",
      email: "",
      phone: "",
      role: clientOnly ? "client" : "spm",
      scope: [],
      projectTypes: [],
      status: clientOnly ? "pending-setup" : "invited",
      added: today(),
      license: "",
      expiry: "",
      docs: [],
    },
  )
  const [nameParts, setNameParts] = useState({ first: "", middle: "", last: "" })
  const generatedIdentity = !account && !clientOnly
  // Once the administrator edits the email, name changes stop overwriting it.
  const [emailEdited, setEmailEdited] = useState(false)
  const suggestion = suggestWorkEmail(nameParts, state.accounts)
  const plainEmail = suggestWorkEmail({ ...nameParts, middle: "" }, [])
  function updateName(part: "first" | "middle" | "last", value: string) {
    const next = { ...nameParts, [part]: value }
    setNameParts(next)
    setDraft(current => ({ ...current,
      lastName: next.last.trim(),
      name: [next.first, next.middle, next.last].map(value => value.trim()).filter(Boolean).join(" "),
      ...(emailEdited ? {} : { email: suggestWorkEmail(next, state.accounts) }),
    }))
    setError("")
  }
  const [pass, setPass] = useState(password())
  const [error, setError] = useState("")
  const patch = (p: Partial<Account>) => setDraft({ ...draft, ...p })
  const [emailError, setEmailError] = useState("")
  const requiresClientEmail = !account && draft.role === "client"
  const existingClient = clientOnly
    ? clientForEmail(state, draft.email, draft.id)
    : undefined
  async function submit(e: FormEvent) {
    e.preventDefault()
    const invalidClientEmail = requiresClientEmail ? clientEmailError(draft.email) : ""
    setEmailError(invalidClientEmail)
    if (invalidClientEmail) { setError(""); return }
    if (["opm", "spm"].includes(draft.role)) {
      try { normalizeExperience(draft.experienceByType || {}) } catch (reason) { setError((reason as Error).message); return }
      if (!account && !Object.keys(draft.experienceByType || {}).length) { setError("Enter years of experience for at least one project type. Use 0 for a new engineer."); return }
    }
    if (generatedIdentity && (!nameParts.first.trim() || !nameParts.last.trim() || !draft.email)) { setError("Enter a first and last name to generate the company email."); return }
    if (draft.phone && !/^\d{11}$/.test(draft.phone)) { setError("Contact number must contain exactly 11 digits."); return }
    if (!account && ["spm", "opm"].includes(draft.role) && (!draft.license.trim() || !draft.expiry || !draft.docs.some(d => d.label === "PRC License" && d.uploaded))) { setError("License number, expiry date and supporting document are required."); return }
    const err = clientOnly
      ? !draft.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
        ? "A client name and valid email are required."
        : state.accounts.some(
              (a) =>
                a.id !== draft.id &&
                a.email.trim().toLowerCase() === draft.email.trim().toLowerCase(),
            )
          ? "This email is already in use. Select the existing client instead."
          : ""
      : accountError(requiresClientEmail ? { ...draft, email: draft.email.trim() } : draft, state)
    setError(err)
    if (!err) try {
      await onSave(
        {
          ...draft,
          name: draft.name.trim(),
          email: requiresClientEmail ? draft.email.trim().toLowerCase() : draft.email.trim(),
          phone: draft.phone.trim(),
        },
        account ? undefined : pass,
      )
    } catch(reason) { setError((reason as Error).message) }
  }
  function chips(
    values: string[],
    current: string[],
    key: "scope" | "projectTypes",
    max: number,
  ) {
    return (
      <div className="chip-options">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${current.includes(value) ? "selected" : ""}`}
            onClick={() => {
              if (!current.includes(value) && current.length >= max) {
                setError(`Select no more than ${max} tags.`)
                return
              }
              patch({
                [key]: current.includes(value)
                  ? current.filter((v) => v !== value)
                  : [...current, value],
              })
              setError("")
            }}
          >
            {value}
          </button>
        ))}
      </div>
    )
  }
  return (
    <form onSubmit={submit} noValidate={requiresClientEmail}>
      <div className="form-grid">
        {!clientOnly && (
          <Field label="Account role" wide>
            <select
              value={draft.role}
              disabled={!!account}
              onChange={(e) =>
                patch({
                  role: e.target.value as Account["role"],
                  scope: [],
                  projectTypes: [],
                  experienceByType: undefined,
                })
              }
            >
              {Object.entries(ROLE_NAMES).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {generatedIdentity ? <>
          <Field label="First name *"><input required autoComplete="given-name" value={nameParts.first} onChange={e => updateName("first", e.target.value)} placeholder="First name" /></Field>
          <Field label="Middle name"><input autoComplete="additional-name" value={nameParts.middle} onChange={e => updateName("middle", e.target.value)} placeholder="Middle name (optional)" /></Field>
          <Field label="Last name *"><input required autoComplete="family-name" value={nameParts.last} onChange={e => updateName("last", e.target.value)} placeholder="Last name" /></Field>
        </> : <Field label={clientOnly ? "Client / company name *" : "Full name *"}>
          <input
            required
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Full name"
          />
        </Field>}
        <Field label="Email address *" wide={generatedIdentity} error={requiresClientEmail ? emailError : undefined} hint={requiresClientEmail ? "Use the client's @10builders.com account address." : undefined}>
          <input
            required
            type="email"
            maxLength={254}
            pattern={requiresClientEmail ? CLIENT_EMAIL_PATTERN : undefined}
            value={draft.email}
            onChange={(e) => {
              if (generatedIdentity) setEmailEdited(true)
              patch({ email: e.target.value })
              if (emailError) setEmailError(requiresClientEmail ? clientEmailError(e.target.value) : "")
              setError("")
            }}
            placeholder={requiresClientEmail || generatedIdentity ? "lastname.firstname@10builders.com" : "name@company.com"}
          />
        </Field>
        {generatedIdentity && <div className="field wide">
          {emailEdited && <Button onClick={() => { setEmailEdited(false); setDraft(current => ({ ...current, email: suggestion })); setError("") }}>Use suggested email{suggestion ? ` (${suggestion})` : ""}</Button>}
        </div>}
        <Field label="Contact number">
          <input
            value={draft.phone}
            type="tel" inputMode="numeric" maxLength={11} pattern="[0-9]{11}" title="Enter exactly 11 digits" onChange={(e) => patch({ phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
            placeholder="09123456789"
          />
        </Field>
        {clientOnly && (
          <Field label="Contact person">
            <input
              name="contact-person"
              value={draft.contactPerson || ""}
              onChange={(e) => patch({ contactPerson: e.target.value })}
              placeholder="Primary client contact"
            />
          </Field>
        )}
      </div>
      {!clientOnly && draft.role === "spm" && (
        <section className="form-section">
          <h3>
            Discipline scope <span>Choose 1–3</span>
          </h3>
          {chips(state.referenceDisciplines || DISCIPLINES, draft.scope, "scope", 3)}
        </section>
      )}
      {draft.role === "opm" && (
        <section className="form-section">
          <h3>
            Project specialization <span>Choose 1–2</span>
          </h3>
          {chips(
            ["Residential", "Commercial", "Mixed-Use"],
            draft.projectTypes,
            "projectTypes",
            2,
          )}
        </section>
      )}
      {!clientOnly && ["opm", "spm"].includes(draft.role) && <section className="form-section">
        <h3>Project experience</h3>
        <p>Enter whole years for each project type. Use 0 for no experience; leave blank if not recorded.</p>
        <div className="form-grid">
          {EXPERIENCE_PROJECT_TYPES.map(type => <Field key={type} label={`${type} experience (years)`}>
            <input type="number" inputMode="numeric" min={0} max={80} step={1} placeholder="Not recorded"
              value={draft.experienceByType?.[type] ?? ""}
              onChange={event => {
                const experienceByType = { ...draft.experienceByType }
                if (event.target.value === "") delete experienceByType[type]
                else experienceByType[type] = Number(event.target.value)
                patch({ experienceByType }); setError("")
              }} />
          </Field>)}
        </div>
      </section>}
      {draft.role === "client" && !clientOnly && (
        <section className="form-section">
          <h3>
            Linked projects <span>At least one required</span>
          </h3>
          {state.projects.map((p) => (
            <label className="check-row" key={p.id}>
              <input
                type="checkbox"
                checked={draft.scope.includes(p.id)}
                onChange={() =>
                  patch({
                    scope: draft.scope.includes(p.id)
                      ? draft.scope.filter((id) => id !== p.id)
                      : [...draft.scope, p.id],
                  })
                }
              />
              {p.name}
            </label>
          ))}
        </section>
      )}
      {!account && !clientOnly && ["spm", "opm"].includes(draft.role) && <section className="form-section">
        <h3>Professional license</h3>
        <div className="form-grid">
          <Field label="PRC license number *"><input required value={draft.license} onChange={e => patch({ license: e.target.value })} /></Field>
          <Field label="Expiry date *"><input required type="date" value={draft.expiry} onChange={e => patch({ expiry: e.target.value })} /></Field>
        </div>
        {draft.docs.some(d => d.label === "PRC License" && d.uploaded)
          ? <div className="uploaded-inline"><Icon name="check" />{draft.docs.find(d => d.label === "PRC License")?.name}<Button onClick={() => patch({ docs: draft.docs.filter(d => d.label !== "PRC License") })}>Replace</Button></div>
          : <Upload label="PRC License" onSave={doc => patch({ docs: [...draft.docs, doc] })} />}
      </section>}
      {!account && !clientOnly && (
        <section className="form-section">
          <h3>Temporary credentials</h3>
          <div className="password-display">
            <code>{pass}</code>
            <Button onClick={() => setPass(password())}>Regenerate</Button>
          </div>
          <p>
            Shown once after creation. Share securely; delivery and first-login
            authentication require a backend.
          </p>
        </section>
      )}
      {clientOnly && (
        <div className="notice">
          <Icon name="shield" />
          <p>
            Client details are saved for intake. Project access is not activated
            until all internal setup checks pass.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {clientOnly && existingClient && onUseExisting && (
        <div className="existing-client-match">
          <div>
            <strong>Existing client found</strong>
            <p>
              {existingClient.name} · {existingClient.email}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => onUseExisting(existingClient)}
          >
            Use Existing Client
          </Button>
        </div>
      )}
      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">
          {account
            ? "Save changes"
            : clientOnly
              ? "Save client for project"
              : "Create account"}
        </Button>
      </div>
    </form>
  )
}
export function AccountDeactivationForm({
  account,
  activeProjects,
  admin,
  onConfirm,
  onClose,
}: {
  account: Account
  activeProjects: Project[]
  admin: Account
  onConfirm: (letter: Doc, noticeDays: number) => Promise<string | undefined>
  onClose: () => void
}) {
  const [noticeDays, setNoticeDays] = useState(30)
  const [letter, setLetter] = useState<Doc>()
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState("")
  const blocked = activeProjects.length > 0
  const effectiveDate = new Date(
    Date.now() + noticeDays * 86400000,
  ).toISOString()
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (blocked) {
          setError(
            "Routine resignation is unavailable while active project assignments remain.",
          )
          return
        }
        if (!letter) {
          setError("Upload and confirm the employee resignation letter.")
          return
        }
        if (
          !Number.isInteger(noticeDays) ||
          noticeDays < 0 ||
          noticeDays > 180
        ) {
          setError("Enter a whole notice period from 0 to 180 days.")
          return
        }
        if (!confirmed) {
          setError("Administrator confirmation is required.")
          return
        }
        const message = await onConfirm(letter, noticeDays)
        if (message) setError(message)
      }}
    >
      <div className={`resignation-eligibility ${blocked ? "blocked" : ""}`}>
        <Icon name={blocked ? "alert" : "shield"} />
        <div>
          <strong>
            {blocked
              ? "Active project assignments found"
              : "Eligible for routine resignation"}
          </strong>
          <p>
            {blocked
              ? "Reassign or complete every active project before starting the notice period."
              : "No active project assignment was found. Confirmation immediately activates Assignment Hold."}
          </p>
        </div>
      </div>
      {blocked && (
        <div className="resignation-projects">
          {activeProjects.map((project) => (
            <div key={project.id}>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.opmId === account.id
                    ? "Office Project Manager"
                    : project.team.find((row) => row.accountId === account.id)
                        ?.phase || "Site PM assignment"}
                </small>
              </span>
              <Badge tone="amber">Active</Badge>
            </div>
          ))}
        </div>
      )}
      {!blocked && (
        <>
          <div className="form-grid resignation-form-grid">
            <Field
              label="Notice period (days) *"
              hint={`Effective date: ${dateLabel(effectiveDate)}`}
            >
              <input
                required
                type="number"
                min="0"
                max="180"
                step="1"
                value={noticeDays}
                onChange={(event) => {
                  setNoticeDays(Number(event.target.value))
                  setError("")
                }}
              />
            </Field>
            <div className="resignation-letter">
              <span>Resignation letter *</span>
              {letter ? (
                <div className="uploaded-inline">
                  <Icon name="check" />
                  <span>{letter.name}</span>
                  <Badge tone="green">Confirmed</Badge>
                </div>
              ) : (
                <Upload
                  label="Resignation Letter"
                  owner={admin.name}
                  buttonLabel="Upload resignation letter"
                  onSave={(document) => {
                    setLetter(document)
                    setError("")
                  }}
                />
              )}
            </div>
          </div>
          <div className="notice subsection">
            <Icon name="shield" />
            <p>
              Assignment Hold begins immediately. The employee keeps access
              during the notice period but is excluded from every new Office PM
              and Site PM allocation.
            </p>
          </div>
          <label className="check-row resignation-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked)
                setError("")
              }}
            />
            I, {admin.name}, confirm the resignation details and effective
            deactivation date.
          </label>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button onClick={onClose}>{blocked ? "Close" : "Cancel"}</Button>
        {!blocked && (
          <Button type="submit" variant="primary" icon="shield">
            Activate Assignment Hold
          </Button>
        )}
      </div>
    </form>
  )
}
export function IntakeForm({
  state,
  project,
  onSubmit,
  onClient,
  onClose,
}: {
  state: State
  project?: Project
  onSubmit: (p: Project) => void | Promise<void>
  onClient: (a: Account) => Account | Promise<Account>
  onClose: () => void
}) {
  const [step, setStep] = useState(project ? "allocation" : "details")
  const [scopeDraft, setScopeDraft] = useState(project?.phaseScope || defaultMixedUseScope())
  const [newClient, setNewClient] = useState(false)
  const [error, setError] = useState("")
  const [run, setRun] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const submitGuard = useRef(false)
  const [ownSubcon, setOwnSubcon] = useState(!!project?.clientSubcon)
  const [agreementPreview, setAgreementPreview] = useState<Doc>()
  const [draft, setDraft] = useState<Project>(
    project
      ? { ...project, team: project.team.map((t) => ({ ...t })) }
      : {
          id: uid(),
          name: "",
          type: "",
          area: "",
          floors: "",
          start: localToday(),
          end: "",
          clientId: "",
          status: "pending",
          opmId: "",
          team: [],
          phase: "Mobilization",
          progress: 0,
          opmAccepted: false,
          docs: projectDocs(),
          created: today(),
          location: "",
          note: "",
          excludedOpms: [],
          history: [],
        },
  )
  const patch = (p: Partial<Project>) => setDraft((d) => ({ ...d, ...p }))
  const clients = state.accounts.filter(
    (a) =>
      a.role === "client" && !["suspended", "deactivated"].includes(a.status),
  )
  const selectedClient = clients.find((client) => client.id === draft.clientId)
  const allocationPhases = project
    ? projectPhaseNames(project).map((name) => ({
        name,
        disciplines: projectPhaseDisciplines(project, name),
      }))
    : draft.type === "Mixed-Use" && draft.phaseScope
      ? mixedUsePhaseReview(draft.phaseScope).filter(phase => phase.included)
      : (state.backendPhases?.[draft.type] || phaseDefinitions(draft.type))
  function recommend(version = 0, phases = allocationPhases, phaseScope = draft.phaseScope) {
    const opms = opmCandidates(state, draft.type, draft.id, draft.excludedOpms)
    const team = phases.map((phase, sequence) => {
      const candidates = spmCandidates(state, draft.type, phase.name, draft.id, phase.disciplines)
      return {
        phase: phase.name,
        accountId:
          candidates[0]?.account.id ||
          "",
        status: "pending" as const,
        requiredDisciplines: [...phase.disciplines],
        sequence,
      }
    })
    patch({ opmId: opms[0]?.id || "", team, phaseScope })
    setRun(version)
  }
  // Date rules apply to new projects only; an existing project's dates are locked here.
  const [badDate, setBadDate] = useState({ start: false, end: false })
  const [endCleared, setEndCleared] = useState(false)
  const dateErrs: { start?: string; end?: string } = project
    ? {}
    : projectDateErrors(draft.start, draft.end || "")
  const startError =
    dateErrs.start || (badDate.start ? DATE_ERRORS.invalid : undefined)
  const endError =
    dateErrs.end || (badDate.end ? DATE_ERRORS.invalid : undefined)
  const datesBlocked = !project && (!!startError || !!endError)
  const datesInvalid = !!endError
  const duration =
    datesBlocked || !draft.start || !draft.end
      ? null
      : plannedDays(draft.start, draft.end)
  const todayIso = localToday()
  const maxIso = latestProjectDate()
  const endMin = addDays(
    draft.start && !startError && draft.start >= todayIso
      ? draft.start
      : todayIso,
    1,
  )
  function changeStart(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setBadDate((b) => ({ ...b, start: e.target.validity.badInput }))
    const nextErr = projectDateErrors(value, draft.end || "")
    if (draft.end && !!value && nextErr.end === DATE_ERRORS.endNotAfter) {
      patch({ start: value, end: "" })
      setEndCleared(true)
      setBadDate((b) => ({ ...b, end: false }))
    } else {
      patch({ start: value })
    }
  }
  function changeEnd(value: string, badInput = false) {
    setEndCleared(false)
    setBadDate((b) => ({ ...b, end: badInput }))
    patch({ end: value })
  }
  const markBad = (field: "start" | "end") => (e: FocusEvent<HTMLInputElement>) =>
    setBadDate((b) => ({ ...b, [field]: e.target.validity.badInput }))
  function validDetails() {
    if (!draft.type.trim())
      return "Select a project type to generate allocation."
    if (
      ![
        draft.name,
        draft.area,
        draft.floors,
        draft.start,
        draft.clientId,
      ].every((v) => v.trim())
    )
      return "Complete all required project fields."
    if (!selectedClient) return "Select an available client account from the search results."
    if (datesBlocked) return startError || endError || DATE_ERRORS.invalid
    if (!draft.end) return "Enter the Target End Date."
    if (!endAfterStart(draft.start, draft.end))
      return DATE_ERRORS.endNotAfter
    if (
      !(Number(draft.area.replace(/,/g, "")) > 0) ||
      !(Number(draft.floors) > 0) ||
      !Number.isInteger(Number(draft.floors))
    )
      return "Enter a positive floor area and whole number of floors."
    return ""
  }
  function next(e: FormEvent) {
    e.preventDefault()
    const err = validDetails()
    setError(err)
    if (err) return
    if (draft.type === "Mixed-Use" && !project) setStep("scope")
    else { recommend(); setStep("allocation") }
  }
  async function submit() {
    if (submitGuard.current) return
    let err = validDetails()
    if (
      !draft.docs.some(
        (d) => d.label === "Client Contract Agreement" && d.uploaded,
      )
    )
      err = "Upload and confirm the signed Client Contract Agreement."
    if (ownSubcon) {
      if (!draft.clientSubcon?.trim())
        err = "Enter the subcontractor company name."
      else if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          draft.clientSubconEmail?.trim() || "",
        )
      )
        err = "Enter a valid email address for the client subcontractor."
      else if (
        !draft.docs.some(
          (d) => d.label === "Client & Subcontractor Agreement" && d.uploaded,
        )
      )
        err = "Upload and confirm the Client–Subcontractor Agreement."
    }
    if (
      !opmCandidates(state, draft.type, draft.id, draft.excludedOpms).some(
        (a) => a.id === draft.opmId,
      )
    )
      err =
        "Select an eligible Office PM. A cooldown, capacity limit or account status may block assignment."
    if (
      draft.team.length !== allocationPhases.length ||
      draft.team.some(
        (t) =>
          !spmCandidates(state, draft.type, t.phase, draft.id, t.requiredDisciplines).some(
            (c) => c.account.id === t.accountId,
          ),
      )
    )
      err =
        "Every phase needs an eligible Site PM. Review team capacity and qualifications."
    setError(err)
    if (!err) try {
      submitGuard.current = true
      setSubmitting(true)
      await onSubmit({
        ...draft,
        status: "pending",
        opmAccepted: false,
        clientSubcon: ownSubcon ? draft.clientSubcon?.trim() : undefined,
        clientSubconEmail: ownSubcon
          ? draft.clientSubconEmail?.trim()
          : undefined,
        team: draft.team.map((t) => ({ ...t, status: "pending" })),
      })
    } catch(reason) { setError((reason as Error).message) }
    finally { submitGuard.current = false; setSubmitting(false) }
  }
  const count = headcount(draft.type, draft.area, draft.floors, allocationPhases)
  const opms = opmCandidates(state, draft.type, draft.id, draft.excludedOpms)
  const requiredDisciplines = [
    ...new Set(allocationPhases.flatMap((phase) => phase.disciplines)),
  ]
  const assignedSitePms = new Set(
    draft.team.map((row) => row.accountId).filter(Boolean),
  ).size
  const clientSubconAgreement = draft.docs.find(
    (doc) => doc.label === "Client & Subcontractor Agreement" && doc.uploaded,
  )
  const projectTypeError =
    step === "details" && !draft.type && error
      ? "Select a project type to generate allocation."
      : ""
  return (
    <>
      <div className="intake-steps">
        <span className={step === "details" ? "current" : "done"}>
          <b>{step !== "details" ? <Icon name="check" size={14} /> : "1"}</b>Project
          details
        </span>
        <i />
        {draft.type === "Mixed-Use" && <><span className={step === "scope" ? "current" : step === "allocation" ? "done" : ""}><b>2</b>Project scope</span><i /></>}
        <span className={step === "allocation" ? "current" : ""}>
          <b>{draft.type === "Mixed-Use" ? "3" : "2"}</b>Staffing & agreements
        </span>
      </div>
      {step === "details" ? (
        <form onSubmit={next}>
          <div className="form-grid">
            <Field label="Project name *" wide>
              <input
                required
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Residential development"
                disabled={!!project}
              />
            </Field>
            <fieldset
              className="field wide project-type-field"
              aria-invalid={!!projectTypeError}
              aria-describedby={
                projectTypeError ? "project-type-error" : undefined
              }
            >
              <legend>Project type *</legend>
              <div
                className="project-type-options"
                role="radiogroup"
                aria-label="Project type"
              >
                {INTAKE_PROJECT_TYPES.map((option) => {
                  const selected = draft.type === option.name
                  return (
                    <Button
                      key={option.name}
                      className={`project-type-card ${
                        selected ? "selected" : ""
                      }`}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        patch({ type: option.name, ...(option.name !== draft.type ? {phaseScope: undefined} : {}) })
                        if (projectTypeError) setError("")
                      }}
                    >
                      <span className="project-type-icon">
                        <Icon name={option.icon} size={24} />
                      </span>
                      <span className="project-type-copy">
                        <strong>{option.name}</strong>
                        <span>{option.description}</span>
                      </span>
                      {selected && (
                        <span className="project-type-check">
                          <Icon name="check" size={15} />
                        </span>
                      )}
                    </Button>
                  )
                })}
              </div>
              {projectTypeError && (
                <small
                  id="project-type-error"
                  className="field-error"
                  role="alert"
                >
                  {projectTypeError}
                </small>
              )}
            </fieldset>
            <Field
              label="Estimated start date *"
              error={startError ? `⚠ ${startError}` : undefined}
            >
              <input
                type="date"
                required
                value={draft.start}
                min={project ? undefined : todayIso}
                max={project ? undefined : maxIso}
                onChange={changeStart}
                onBlur={markBad("start")}
                aria-invalid={!!startError}
                disabled={!!project}
              />
            </Field>
            <Field
              label="Estimated completion date *"
              error={
                endError
                  ? `⚠ ${endError}`
                  : endCleared
                    ? "⚠ End date was cleared because it is no longer after the start date."
                    : undefined
              }
              hint={
                duration
                  ? `Planned duration: ${duration.toLocaleString()} calendar days${
                      startsInLabel(draft.start)
                        ? ` · ${startsInLabel(draft.start)}`
                        : ""
                    }`
                  : "Set valid dates to see the duration."
              }
            >
              <EstimatedCompletionDate
                required
                value={draft.end || ""}
                start={draft.start}
                min={endMin}
                max={maxIso}
                onValueChange={changeEnd}
                onBlur={markBad("end")}
                aria-invalid={datesInvalid || endCleared}
                disabled={!!project}
              />
            </Field>
            <Field label="Floor area (sqm) *">
              <input
                required
                value={draft.area}
                onChange={(e) => patch({ area: e.target.value })}
                placeholder="18,400"
                disabled={!!project}
              />
            </Field>
            <Field label="Number of floors *">
              <input
                required
                type="number"
                min="1"
                step="1"
                value={draft.floors}
                onChange={(e) => patch({ floors: e.target.value })}
                disabled={!!project}
              />
            </Field>
            <Field label="Client *" wide>
              <ClientSearch
                clients={clients}
                value={draft.clientId}
                onChange={(clientId) => patch({ clientId })}
                disabled={!!project}
              />
            </Field>
            {selectedClient && (
              <section
                className="selected-client-details wide"
                aria-label="Selected client account details"
              >
                <div className="selected-client-heading">
                  <span>Selected client account</span>
                  <Badge tone="green">Existing record</Badge>
                </div>
                <div className="selected-client-grid">
                  <Field label="Client / Company Name">
                    <input readOnly value={selectedClient.name} />
                  </Field>
                  <Field label="Email Address">
                    <input readOnly value={selectedClient.email} />
                  </Field>
                  <Field label="Contact Number">
                    <input
                      readOnly
                      value={selectedClient.phone}
                      placeholder="Not on file"
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      readOnly
                      value={selectedClient.contactPerson || ""}
                      placeholder="Not on file"
                    />
                  </Field>
                </div>
              </section>
            )}
            <Button onClick={() => setNewClient(true)} icon="plus">
              Create a client account
            </Button>
          </div>
          {error && !projectTypeError && <p className="error">{error}</p>}
          <div className="modal-actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              icon="arrow"
              disabled={datesBlocked}
            >
              {draft.type === "Mixed-Use" ? "Review project scope" : "Generate allocation"}
            </Button>
          </div>
        </form>
      ) : step === "scope" ? <ProjectScopeReview value={scopeDraft} onChange={setScopeDraft} onBack={() => {setError("");setStep("details")}} error={error}
        onConfirm={() => {
          const issue = mixedUseScopeError(scopeDraft)
          setError(issue)
          if (issue) return
          const scope = normalizeMixedUseScope(scopeDraft)
          recommend(0, mixedUsePhaseReview(scope).filter(phase => phase.included), scope)
          setStep("allocation")
        }} /> : (
        <>
          <div className="allocation-summary">
            <div>
              <span className="eyebrow">
                {draft.type} ·{" "}
                {Number(draft.area.replace(/,/g, "")).toLocaleString()} SQM
              </span>
              <h3>{draft.name}</h3>
            </div>
            <Button icon="activity" onClick={() => recommend(run + 1)}>
              Re-run allocation
            </Button>
          </div>
          {draft.phaseScope && <>
            <ProjectScopeSummary scope={draft.phaseScope} />
            {!project && <Button onClick={() => {setError("");setStep("scope")}}>Review scope</Button>}
          </>}
          <div className="notice">
            <Icon name="shield" />
            <p>
              Among qualified engineers, more years in this project type rank first.
              License eligibility, workload limits, active lead assignments and Office PM cooldowns still apply.
            </p>
          </div>
          <Field label="Recommended Office Project Manager *">
            <select
              value={draft.opmId}
              onChange={(e) => patch({ opmId: e.target.value })}
            >
              <option value="">Select eligible Office PM</option>
              {opms.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name} ·{" "}
                  {experienceText(a.experienceByType, draft.type)} ·{" "}
                  {a.projectTypes.includes(draft.type)
                    ? "Project-type match"
                    : "No direct type specialization"}{" "}
                  ·{" "}
                  {
                    state.projects.filter(
                      (p) => p.status === "active" && p.opmId === a.id,
                    ).length
                  }{" "}
                  active
                </option>
              ))}
            </select>
          </Field>
          <LicenseAssignmentWarning expiry={opms.find((a) => a.id === draft.opmId)?.expiry} projectEnd={draft.end} />
          {!opms.length && (
            <p className="error">
              No eligible Office PM. Review cooldowns, license records and the
              workload cap in Team or Settings.
            </p>
          )}
          <section className="form-section">
            <div className="staffing-summary">
              <div>
                <span>PROJECT TYPE</span>
                <strong>{draft.type}</strong>
              </div>
              <div>
                <span>CONSTRUCTION PHASES</span>
                <strong>{allocationPhases.length}</strong>
              </div>
              <div>
                <span>REQUIRED DISCIPLINES</span>
                <strong>{requiredDisciplines.length}</strong>
              </div>
              <div>
                <span>STAFFING ASSIGNMENTS</span>
                <strong>
                  {assignedSitePms} Site PM{assignedSitePms === 1 ? "" : "s"}
                </strong>
              </div>
            </div>
            <div className="staffing-section-heading">
              <div>
                <h3>Site PM team by construction phase</h3>
                <p>
                  One qualified Site PM owns each phase. The same Site PM may
                  own multiple phases when eligible and available.
                </p>
              </div>
              <span>
                {count.tier} project · {count.multiplier}× size multiplier
              </span>
            </div>
            <div className="allocation-rows">
              {allocationPhases.map((phase, index) => {
                const candidates = spmCandidates(
                  state,
                  draft.type,
                  phase.name,
                  draft.id,
                  phase.disciplines,
                )
                const row = draft.team.find((t) => t.phase === phase.name)
                const current = candidates.find(
                  (c) => c.account.id === row?.accountId,
                )
                return (
                  <div className="allocation-row" key={phase.name}>
                    <div className="allocation-phase">
                      <span className="phase-sequence">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {phase.name}
                          {phase.name === "Mobilization" && (
                            <small>Lead SPM</small>
                          )}
                        </strong>
                        <div className="discipline-tags">
                          {phase.disciplines.map((discipline) => (
                            <span key={discipline}>{discipline}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="allocation-control">
                      <label htmlFor={`phase-${index}`}>Assigned Site PM</label>
                      <select
                        id={`phase-${index}`}
                        aria-label={`${phase.name} Site PM`}
                        value={row?.accountId || ""}
                        onChange={(e) =>
                          patch({
                            team: draft.team.map((t) =>
                              t.phase === phase.name
                                ? { ...t, accountId: e.target.value }
                                : t,
                            ),
                          })
                        }
                      >
                        <option value="">No eligible Site PM selected</option>
                        {candidates.map((c) => (
                          <option key={c.account.id} value={c.account.id}>
                            {c.account.name} · {experienceText(c.account.experienceByType, draft.type)}
                          </option>
                        ))}
                      </select>
                      <small>
                        {current
                          ? `${current.matched} of ${current.total} required discipline tags matched`
                          : candidates.length
                            ? "Assignment required"
                            : "No eligible Site PM currently matches this phase"}
                      </small>
                      <LicenseAssignmentWarning expiry={current?.account.expiry} projectEnd={draft.end} />
                    </div>
                  </div>
                )
              })}
            </div>
            <p>
              {count.base} base discipline workload slots × {count.multiplier}{" "}
              size multiplier = {count.total} estimated workload slots.
              Discipline totals do not represent unique Site PM headcount.
            </p>
          </section>
          <section className="form-section">
            <h3>
              Client contract agreement <span>Required before handoff</span>
            </h3>
            {draft.docs.some((d) => d.label === "Client Contract Agreement") ? (
              <div className="uploaded-inline">
                <Icon name="check" />
                {
                  draft.docs.find(
                    (d) => d.label === "Client Contract Agreement",
                  )?.name
                }
              </div>
            ) : (
              <Upload
                label="Client Contract Agreement"
                onSave={(doc) => patch({ docs: [...draft.docs, doc] })}
              />
            )}
            <label className="check-row subsection">
              <input
                type="checkbox"
                checked={ownSubcon}
                disabled={!!project}
                onChange={(e) => setOwnSubcon(e.target.checked)}
              />
              Client has their own subcontractor
            </label>
            {ownSubcon && (
              <div className="subcontractor-agreement">
                <div className="client-subcon-fields">
                  <Field label="Subcontractor Company Name *">
                    <input
                      required
                      disabled={!!project}
                      value={draft.clientSubcon || ""}
                      onChange={(e) => patch({ clientSubcon: e.target.value })}
                      placeholder="Enter registered company name"
                    />
                  </Field>
                  <Field label="Subcontractor Email *">
                    <input
                      required
                      type="email"
                      disabled={!!project}
                      value={draft.clientSubconEmail || ""}
                      onChange={(e) =>
                        patch({ clientSubconEmail: e.target.value })
                      }
                      placeholder="name@company.com"
                    />
                  </Field>
                </div>
                <p>This company is locked to the project after submission.</p>
                <div className="client-subcon-upload">
                  <div>
                    <strong>Client–Subcontractor Agreement *</strong>
                    <p>PDF, JPG or PNG · Maximum 10 MB</p>
                  </div>
                  {clientSubconAgreement ? (
                    <div className="client-subcon-file">
                      <span className="file-icon">
                        <Icon name="doc" size={18} />
                      </span>
                      <span>
                        <strong>{clientSubconAgreement.name}</strong>
                        <small>
                          Uploaded {dateLabel(clientSubconAgreement.date)}
                        </small>
                      </span>
                      <Badge tone="green">Validated</Badge>
                      <Button
                        variant="icon-button"
                        icon="eye"
                        aria-label="Preview Client–Subcontractor Agreement"
                        onClick={() =>
                          setAgreementPreview(clientSubconAgreement)
                        }
                      />
                    </div>
                  ) : (
                    <Upload
                      label="Client & Subcontractor Agreement"
                      buttonLabel="Upload agreement"
                      onSave={(doc) =>
                        patch({
                          docs: [
                            ...draft.docs.filter(
                              (item) =>
                                item.label !==
                                "Client & Subcontractor Agreement",
                            ),
                            doc,
                          ],
                        })
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={() => setStep("details")}>Back to details</Button>
            <Button
              variant="primary"
              onClick={submit}
              icon="arrow"
              disabled={datesBlocked || submitting}
            >
              {submitting
                ? "Sending…"
                : project
                  ? "Resubmit to Office PM"
                  : "Confirm & send to Office PM"}
            </Button>
          </div>
        </>
      )}
      {newClient && (
        <Modal
          title="Create client account"
          subtitle="Save client details without activating project access."
          onClose={() => setNewClient(false)}
        >
          <AccountForm
            state={state}
            clientOnly
            onClose={() => setNewClient(false)}
            onUseExisting={(client) => {
              patch({ clientId: client.id })
              setNewClient(false)
              setError("")
            }}
            onSave={async (a) => {
              const saved=await onClient(a)
              patch({ clientId: saved.id })
              setNewClient(false)
            }}
          />
        </Modal>
      )}
      {agreementPreview && (
        <Preview
          doc={agreementPreview}
          downloadable={false}
          onClose={() => setAgreementPreview(undefined)}
        />
      )}
    </>
  )
}
export function LicenseForm({
  account,
  onSave,
  onClose,
}: {
  account: Account
  onSave: (a: Account) => void
  onClose: () => void
}) {
  const [number, setNumber] = useState(account.license)
  const [expiry, setExpiry] = useState(account.expiry)
  const [certifications, setCertifications] = useState(
    (account.certifications || []).join(", "),
  )
  const [doc, setDoc] = useState<Doc>()
  const [error, setError] = useState("")
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!number.trim() || !expiry || !doc) {
          setError(
            "License number, expiry date and a confirmed supporting document are required.",
          )
          return
        }
        await onSave({
          ...account,
          license: number,
          expiry,
          renewed: false,
          certifications: certifications
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          docs: [
            ...account.docs.map((existing) =>
              existing.label === "PRC License"
                ? { ...existing, label: "PRC License (superseded)" }
                : existing,
            ),
            doc,
          ],
        })
      }}
    >
      <div className="form-grid">
        <Field label="PRC license number *" wide>
          <input
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </Field>
        <Field label="Expiry date *">
          <input
            required
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </Field>
        <Field label="Certifications (comma-separated)" wide>
          <input
            value={certifications}
            onChange={(e) => setCertifications(e.target.value)}
            placeholder="PRC-Civil, DOLE-Safety"
          />
        </Field>
      </div>
      <section className="form-section">
        <h3>Supporting license document *</h3>
        {doc ? (
          <div className="uploaded-inline">
            <Icon name="check" />
            {doc.name}
          </div>
        ) : (
          <Upload label="PRC License" onSave={setDoc} />
        )}
      </section>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">
          Save license record
        </Button>
      </div>
    </form>
  )
}
export function CompanyForm({
  owner,
  actorId,
  project,
  saving = false,
  status = "approved",
  role,
  onSave,
  onClose,
}: {
  owner: string
  actorId?: string
  project?: Project
  saving?: boolean
  status?: Company["status"]
  role?: Role
  onSave: (company: Company) => unknown | Promise<unknown>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Company>({
    id: uid(),
    name: "",
    contact: "",
    phone: "",
    foremen: [{ name: "", phone: "" }, { name: "", phone: "" }],
    email: "",
    status,
    submittedBy: owner,
    submittedById: actorId,
    projectId: project?.id || "",
    availability: "available",
    manpowerCount: 0,
    activeProjectIds: [],
    manpowerDocuments: [],
    documents: [],
    note: "",
    version: 1,
  })
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<CompanyRegistrationErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const busy = saving || submitting
  const patch = (values: Partial<Company>) => {
    setDraft((company) => ({ ...company, ...values }))
    const errors = companyRegistrationErrors({ ...draft, ...values })
    setFieldErrors(current => {
      const next = { ...current }
      for (const key of Object.keys(current) as (keyof CompanyRegistrationErrors)[]) {
        if (key in values || ("foremen" in values && key.startsWith("forem"))) {
          if (errors[key]) next[key] = errors[key]
          else delete next[key]
        }
      }
      return next
    })
    setError("")
  }
  const patchForeman = (index: number, values: Partial<{ name: string; phone: string }>) => {
    const foremen = (draft.foremen || [{ name: "", phone: "" }, { name: "", phone: "" }]).map((foreman, position) => position === index ? { ...foreman, ...values } : foreman)
    patch({ foremen, contact: foremen[0].name, phone: foremen[0].phone })
  }
  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (submittingRef.current || saving) return
        const errors = companyRegistrationErrors(draft)
        setFieldErrors(errors)
        if (Object.keys(errors).length) return
        submittingRef.current = true
        setSubmitting(true)
        setError("")
        try {
          const foremen = normalizeCompanyForemen(draft)!
          const saved = await onSave({ ...draft, foremen, contact: foremen[0].name, phone: foremen[0].phone, name: draft.name.trim(), email: draft.email.trim().toLowerCase(),
            availability: "available", activeProjectIds: [], manpowerCount: 0, manpowerDocuments: [] })
          if (saved === false) setError("We couldn’t submit this company. Your details are still here—please try again.")
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "We couldn’t submit this company. Please try again.")
        } finally {
          submittingRef.current = false
          setSubmitting(false)
        }
      }}
    >
      <div className="form-grid">
        <Field label="Company name *" error={fieldErrors.name}>
          <input
            required
            maxLength={150}
            disabled={busy}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Company email *" error={fieldErrors.email} hint="Use an @gmail.com address.">
          <input
            type="email"
            required
            maxLength={254}
            pattern={COMPANY_EMAIL_PATTERN}
            disabled={busy}
            value={draft.email}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>
      </div>
      <section className="company-foremen" aria-label="Foreman contacts">
        <h3>Foreman contacts</h3>
        <p>Provide a primary contact and an optional backup.</p>
        <div className="company-foreman-grid">{(draft.foremen || []).map((foreman, index) => {
          const label = index === 0 ? "Primary foreman" : "Backup foreman"
          const required = index === 0 || !!foreman.name.trim() || !!foreman.phone
          const nameError = index === 0 ? fieldErrors.foreman1Name : fieldErrors.foreman2Name
          const phoneError = index === 0 ? fieldErrors.foreman1Phone : fieldErrors.foreman2Phone
          return <section key={index} className={`foreman-contact-card${index === 0 ? " primary" : ""}`} role="group" aria-label={label}>
            <div className="foreman-contact-heading"><h4>{label}</h4><span>{index === 0 ? "Required" : "Optional"}</span></div>
            <Field label={index === 0 ? "Full name *" : "Full name"} error={nameError}><input aria-label={`${label} full name`} required={required} maxLength={150} disabled={busy} value={foreman.name} placeholder={index === 0 ? "Enter full name" : "Enter backup foreman name"} onChange={event => patchForeman(index, { name: event.target.value })} /></Field>
            <Field label={index === 0 ? "Mobile number *" : "Mobile number"} error={phoneError} hint={index === 0 ? "Enter exactly 11 digits." : undefined}><input aria-label={`${label} mobile number`} required={required} type="tel" inputMode="numeric" maxLength={11} pattern={COMPANY_PHONE_PATTERN} disabled={busy} value={foreman.phone} placeholder="09XXXXXXXXX" onChange={event => patchForeman(index, { phone: event.target.value.replace(/\D/g, "").slice(0, 11) })} /></Field>
            {index === 1 && <p>Leave both blank, or complete both fields.</p>}
          </section>
        })}</div>
        {fieldErrors.foremen && <p className="error" role="alert">{fieldErrors.foremen}</p>}
      </section>
      {role === "spm" && <section className="form-section trade-allocation capability-proposal">
        <CompanyTradePicker selected={draft.proposedDisciplines || []} onChange={proposedDisciplines => patch({ proposedDisciplines })} disabled={busy} label="Proposed company trades" />
        <p>Choose the trades this company offers. These remain proposals until a Site PM reviews supporting records and saves verified capabilities in company details. Company approval remains with Admin.</p>
      </section>}
      <div className="form-grid">
        <Field label="Company availability" hint="Not assigned to a project. Company approval does not assign a project.">
          <input readOnly value="Available" />
        </Field>
        <Field label="Company notes" wide>
          <textarea
            value={draft.note}
            disabled={busy}
            onChange={(event) => patch({ note: event.target.value })}
          />
        </Field>
      </div>
      {project && <p className="role-muted subsection">Suggested for {project.name}. The company remains unassigned until project acceptance is completed separately.</p>}
      <section className="form-section">
        <h3>Supporting documents</h3>
        <DocumentList docs={draft.documents} onPreview={() => undefined} />
        <Upload
          label="Company Supporting Document"
          owner={owner}
          disabled={busy}
          onSave={(document) =>
            patch({ documents: [...draft.documents, document] })
          }
        />
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Submitting…" : status === "approved" ? "Add company" : "Submit for Admin approval"}
        </Button>
      </div>
    </form>
  )
}

export function SettingsForm({
  rules,
  onSave,
}: {
  rules: Rules
  onSave: (rules: Rules, label: string) => void
}) {
  type NumericRule = "grace" | "cap" | "response" | "idle"
  const [draft, setDraft] = useState(rules)
  const [confirm, setConfirm] = useState<NumericRule>()
  const [error, setError] = useState("")
  const [reminders, setReminders] = useState((rules.reminderDays || [60, 30, 14, 7, 0]).join(", "))
  const parsedReminders = reminders
    .split(/[s,]+/)
    .filter(Boolean)
    .map(Number)
  const remindersValid =
    parsedReminders.length > 0 && parsedReminders.length <= 12 && parsedReminders.every((n) => Number.isInteger(n) && n >= 0 && n <= 365)
  const remindersChanged = reminders.replace(/s/g, "") !== (rules.reminderDays || [60, 30, 14, 7, 0]).join(",")
  const labels: Record<NumericRule, [string, string, number]> = {
    grace: [
      "License grace period",
      "Days an engineer keeps their assignments after a license expires. Signing and approving are paused; an Administrator can reassign only after this period.",
      1,
    ],
    cap: [
      "Active projects per assignee",
      "Maximum concurrent project workload for allocation eligibility.",
      1,
    ],
    response: [
      "Site PM response window",
      "Business days before an unanswered assignment is escalated.",
      1,
    ],
    idle: [
      "Idle session timeout",
      "Minutes of inactivity before a local session warning.",
      1,
    ],
  }
  return (
    <>
      <div className="settings-rules">
        {(Object.entries(
          labels,
        ) as [NumericRule, [string, string, number]][]).map(
          ([key, [label, desc, min]]) => (
            <div className="rule-row" key={key}>
              <div>
                <h3>{label}</h3>
                <p>{desc}</p>
              </div>
              <input
                aria-label={label}
                type="number"
                min={min}
                step="1"
                value={draft[key]}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: Number(e.target.value) })
                }
              />
              {rules[key] !== draft[key] && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (!Number.isInteger(draft[key]) || draft[key] < min) {
                        setError(`Enter a whole number of at least ${min}.`)
                        return
                      }
                      setError("")
                      setConfirm(key)
                    }}
                  >
                    Confirm change
                  </Button>
                  <Button
                    onClick={() => setDraft({ ...draft, [key]: rules[key] })}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          ),
        )}
        <div className="rule-row">
          <div>
            <h3>License renewal reminders</h3>
            <p>Days before expiry when the engineer, their superior and the Administrator are reminded. Use 0 for the expiry day.</p>
          </div>
          <input
            aria-label="License renewal reminder days"
            value={reminders}
            onChange={(e) => setReminders(e.target.value)}
          />
          {remindersChanged && (
            <>
              <Button
                variant="primary"
                disabled={!remindersValid}
                onClick={async () => {
                  const days = [...new Set(parsedReminders)].sort((a, b) => b - a)
                  await onSave({ ...rules, reminderDays: days }, "License renewal reminders")
                  setReminders(days.join(", "))
                }}
              >
                Confirm change
              </Button>
              <Button onClick={() => setReminders((rules.reminderDays || [60, 30, 14, 7, 0]).join(", "))}>Cancel</Button>
            </>
          )}
          {remindersChanged && !remindersValid && (
            <p className="error">Enter up to 12 whole numbers from 0 to 365, separated by commas.</p>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {confirm && (
        <Modal
          title="Apply organization-wide change?"
          subtitle={labels[confirm][0]}
          onClose={() => setConfirm(undefined)}
        >
          <p>
            This changes {labels[confirm][0].toLowerCase()} from{" "}
            <strong>{rules[confirm]}</strong> to{" "}
            <strong>{draft[confirm]}</strong> for all future checks and
            allocations in this workspace.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setConfirm(undefined)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await onSave(
                  { ...rules, [confirm]: draft[confirm] },
                  labels[confirm][0],
                )
                setConfirm(undefined)
              }}
            >
              Apply change
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
