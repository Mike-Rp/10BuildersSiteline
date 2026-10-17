import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button, Badge, Empty, Field, Icon, Modal } from "./ui"
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
  scheduleSeries,
  spmCandidates,
  today,
  uid,
  validateFile,
  endAfterStart,
  plannedDays,
  type Account,
  type Company,
  type Doc,
  type Project,
  type Rules,
  type State,
} from "./model"

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

// Local files are stored separately from JSON state. This is browser storage, not secure cloud storage.
function fileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("siteline-files", 1)
    req.onupgradeneeded = () => req.result.createObjectStore("files")
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(new Error("Local document storage is unavailable."))
  })
}
async function saveFile(id: string, file: File) {
  const db = await fileDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite")
    tx.objectStore("files").put(file, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error("Unable to save file."))
  })
  db.close()
}
export async function fileFor(id: string): Promise<Blob | undefined> {
  const db = await fileDB()
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return file
}
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
          `SITELINE · SAMPLE DOCUMENT RECORD\n\n${doc.label}\nFilename: ${doc.name}\nOwner: ${doc.owner}\nDate: ${doc.date}\n\nThis seeded demonstration record has no original file. Documents uploaded in this browser download their actual file.`,
        ],
        { type: "text/plain" },
      ),
    file ? doc.name : `${doc.label} — sample record.txt`,
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
}: {
  label: string
  onSave: (doc: Doc) => void
  owner?: string
  disabled?: boolean
  buttonLabel?: string
  ariaLabel?: string
  spreadsheet?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  function clear() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(undefined)
    setPreview("")
    if (input.current) input.current.value = ""
  }
  async function confirm() {
    if (!file || validateFile(file, spreadsheet)) return
    setSaving(true)
    try {
      const id = uid()
      await saveFile(id, file)
      onSave({
        id,
        label,
        name: file.name,
        uploaded: true,
        clientVisible: false,
        owner,
        date: today(),
        size: file.size,
        mime: file.type,
      })
      clear()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept={spreadsheet ? ".xlsx,.xls" : ".pdf,.jpg,.jpeg,.png"}
        onChange={(e) => {
          const selected = e.target.files?.[0]
          if (!selected) return
          const message = validateFile(selected, spreadsheet)
          setError(message)
          if (!message) {
            setFile(selected)
            setPreview(URL.createObjectURL(selected))
          } else e.target.value = ""
        }}
      />
      <Button
        icon="upload"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => input.current?.click()}
      >
        {buttonLabel}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <Modal title="Confirm document upload" subtitle={label} onClose={clear}>
          <div className="upload-file">
            <Icon name="doc" />
            <div>
              <strong>{file.name}</strong>
              <p>
                {(file.size / 1024 / 1024).toFixed(2)} MB · Stored in this
                browser
              </p>
            </div>
          </div>
          {file.type.startsWith("image/") ? (
            <img
              className="file-preview"
              src={preview}
              alt="Selected document"
            />
          ) : (
            <object
              className="pdf-preview"
              data={preview}
              type="application/pdf"
            >
              <p>Preview unavailable. You can still confirm this file.</p>
            </object>
          )}
          <div className="modal-actions">
            <Button onClick={clear}>Back</Button>
            <Button
              onClick={() => {
                clear()
                setTimeout(() => input.current?.click(), 0)
              }}
            >
              Retry upload
            </Button>
            <Button variant="primary" disabled={saving} onClick={confirm}>
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
                icon="search"
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
                ? "XLSX or XLS · Maximum 15 MB"
                : "PDF, JPG or PNG · Maximum 10 MB"}
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
  viewer = "Patricia N. Domingo",
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
            <h3>{loaded ? "Sample document record" : "Loading document…"}</h3>
            <p>{doc.label}</p>
            <p>
              {downloadable
                ? "This seeded record contains metadata only. Files uploaded here can be previewed and downloaded in full."
                : "This seeded record contains metadata only. Site PM submissions are view-only; Office PM retains the download copy."}
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
            Download {url ? "original" : "sample record"}
          </Button>
        )}
      </div>
    </Modal>
  )
}
export function Chart({
  compact = false,
  seed = 73,
}: {
  compact?: boolean
  seed?: number
}) {
  const series = scheduleSeries(seed)
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(560)
  useEffect(() => {
    const node = chartRef.current
    if (!node) return
    const measure = () =>
      setChartWidth(
        Math.max(200, Math.floor(node.getBoundingClientRect().width)),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const left = 46
  const right = chartWidth - 22
  const x = (index: number) =>
    left + (index * (right - left)) / (series.length - 1)
  const last = series.at(-1)!
  const variance = last.actual - last.planned
  const planned = series
    .map((p, i) => `${x(i)},${205 - p.planned * 1.8}`)
    .join(" ")
  const actual = series
    .map((p, i) => `${x(i)},${205 - p.actual * 1.8}`)
    .join(" ")
  return (
    <div className={`schedule ${compact ? "compact" : ""}`}>
      <div className="chart-summary">
        <div>
          <span>Cumulative progress</span>
          <strong>
            {last.actual.toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div className="legend">
          <span>
            <i />
            Planned
          </span>
          <span>
            <i />
            Actual
          </span>
        </div>
      </div>
      <div ref={chartRef} className="schedule-plot">
        <svg
          className="schedule-svg"
          viewBox={`0 0 ${chartWidth} 245`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Illustrative planned and actual cumulative progress from March to August"
        >
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line
                x1={left}
                x2={right}
                y1={205 - p * 1.8}
                y2={205 - p * 1.8}
                className="chart-grid-line"
                strokeDasharray="4 5"
              />
              <text x="30" y={210 - p * 1.8} textAnchor="end">
                {p}%
              </text>
            </g>
          ))}
          <polygon
            points={`${left},205 ${actual} ${right},205`}
            className="chart-actual-area"
          />
          <polyline
            points={planned}
            fill="none"
            className="chart-planned-line"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
          <polyline
            points={actual}
            fill="none"
            className="chart-actual-line"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          <circle
            cx={right}
            cy={205 - last.actual * 1.8}
            r="4"
            className="chart-actual-point"
          />
          {["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((m, i) => (
            <text
              key={m}
              x={left + (i * (right - left)) / 5}
              y="237"
              textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"}
            >
              {m}
            </text>
          ))}
        </svg>
      </div>
      <div className="chart-footer">
        <span>
          <i className="status-dot warning" />
          {Math.abs(variance).toFixed(1)} percentage points{" "}
          {variance < 0 ? "behind" : "ahead"} of plan
        </span>
        <small>Illustrative schedule data</small>
      </div>
      {!compact && (
        <div className="daily-chart">
          <h4>Today's progress</h4>
          <div className="daily-bar">
            <span>Planned</span>
            <progress max={10} value={last.plannedDaily} />
            <strong>{last.plannedDaily.toFixed(2)}%</strong>
          </div>
          <div className="daily-bar">
            <span>Actual</span>
            <progress max={10} value={last.actualDaily} />
            <strong>{last.actualDaily.toFixed(2)}%</strong>
          </div>
          <p>
            The source generates seeded S-curve samples. These figures are not
            live project measurements.
          </p>
        </div>
      )}
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
  onSave: (a: Account, pass?: string) => void
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
  const [pass, setPass] = useState(password())
  const [error, setError] = useState("")
  const patch = (p: Partial<Account>) => setDraft({ ...draft, ...p })
  const existingClient = clientOnly
    ? clientForEmail(state, draft.email, draft.id)
    : undefined
  function submit(e: FormEvent) {
    e.preventDefault()
    const err = clientOnly
      ? !draft.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)
        ? "A client name and valid email are required."
        : state.accounts.some(
              (a) =>
                a.id !== draft.id &&
                a.email.toLowerCase() === draft.email.toLowerCase(),
            )
          ? "This email is already in use. Select the existing client instead."
          : ""
      : accountError(draft, state)
    setError(err)
    if (!err)
      onSave(
        {
          ...draft,
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
        },
        account ? undefined : pass,
      )
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
    <form onSubmit={submit}>
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
        <Field label={clientOnly ? "Client / company name *" : "Full name *"}>
          <input
            required
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Full name"
          />
        </Field>
        <Field label="Email address *">
          <input
            required
            type="email"
            value={draft.email}
            onChange={(e) => {
              patch({ email: e.target.value })
              setError("")
            }}
            placeholder="name@company.com"
          />
        </Field>
        <Field label="Contact number">
          <input
            value={draft.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="09XX XXX XXXX"
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
          {chips(DISCIPLINES, draft.scope, "scope", 3)}
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
  onConfirm: (letter: Doc, noticeDays: number) => string | undefined
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
      onSubmit={(event) => {
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
        const message = onConfirm(letter, noticeDays)
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
  onSubmit: (p: Project) => void
  onClient: (a: Account) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(project ? 2 : 1)
  const [newClient, setNewClient] = useState(false)
  const [error, setError] = useState("")
  const [run, setRun] = useState(0)
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
          start: "",
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
    : phaseDefinitions(draft.type)
  function recommend(version = 0) {
    const opms = opmCandidates(state, draft.type, draft.id, draft.excludedOpms)
    const team = allocationPhases.map((phase, sequence) => {
      const candidates = spmCandidates(state, draft.type, phase.name, draft.id)
      return {
        phase: phase.name,
        accountId:
          candidates[version % Math.max(1, candidates.length)]?.account.id ||
          "",
        status: "pending" as const,
        requiredDisciplines: [...phase.disciplines],
        sequence,
      }
    })
    patch({ opmId: opms[version % Math.max(1, opms.length)]?.id || "", team })
    setRun(version)
  }
  const datesInvalid =
    !!draft.start && !!draft.end && !endAfterStart(draft.start, draft.end)
  const duration = datesInvalid ? null : plannedDays(draft.start, draft.end)
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
    if (!draft.end) return "Enter the Target End Date."
    if (!endAfterStart(draft.start, draft.end))
      return "Target End Date must be later than Target Start Date."
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
    recommend()
    setStep(2)
  }
  function submit() {
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
          !spmCandidates(state, draft.type, t.phase, draft.id).some(
            (c) => c.account.id === t.accountId,
          ),
      )
    )
      err =
        "Every phase needs an eligible Site PM. Review team capacity and qualifications."
    setError(err)
    if (!err)
      onSubmit({
        ...draft,
        status: "pending",
        opmAccepted: false,
        clientSubcon: ownSubcon ? draft.clientSubcon?.trim() : undefined,
        clientSubconEmail: ownSubcon
          ? draft.clientSubconEmail?.trim()
          : undefined,
        team: draft.team.map((t) => ({ ...t, status: "pending" })),
      })
  }
  const count = headcount(draft.type, draft.area, draft.floors)
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
    step === 1 && !draft.type && error
      ? "Select a project type to generate allocation."
      : ""
  return (
    <>
      <div className="intake-steps">
        <span className={step === 1 ? "current" : "done"}>
          <b>{step > 1 ? <Icon name="check" size={14} /> : "1"}</b>Project
          details
        </span>
        <i />
        <span className={step === 2 ? "current" : ""}>
          <b>2</b>Staffing & agreements
        </span>
      </div>
      {step === 1 ? (
        <form onSubmit={next}>
          <div className="form-grid">
            <Field label="Project name *" wide>
              <input
                required
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Alden Heights Residences — Tower B"
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
                        patch({ type: option.name })
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
            <Field label="Target start date *">
              <input
                type="date"
                required
                value={draft.start}
                onChange={(e) => patch({ start: e.target.value })}
                disabled={!!project}
              />
            </Field>
            <Field
              label="Target end date *"
              error={
                datesInvalid
                  ? "Target End Date must be later than Target Start Date."
                  : undefined
              }
              hint={
                duration
                  ? `Planned duration: ${duration.toLocaleString()} calendar days`
                  : "Planned duration is calculated from both dates."
              }
            >
              <input
                type="date"
                required
                value={draft.end || ""}
                min={draft.start || undefined}
                onChange={(e) => patch({ end: e.target.value })}
                aria-invalid={datesInvalid}
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
              <select
                required
                value={draft.clientId}
                onChange={(e) => patch({ clientId: e.target.value })}
                disabled={!!project}
              >
                <option value="">Select an existing client</option>
                {clients.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.email}
                  </option>
                ))}
              </select>
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
            <Button type="submit" variant="primary" icon="arrow">
              Generate allocation
            </Button>
          </div>
        </form>
      ) : (
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
          <div className="notice">
            <Icon name="shield" />
            <p>
              Recommendations use qualification tags, current workload, active
              lead assignments and Office PM cooldowns. No synthetic match score
              is used.
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
                            {c.account.name}
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
                        icon="search"
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
            <Button onClick={() => setStep(1)}>Back to details</Button>
            <Button variant="primary" onClick={submit} icon="arrow">
              {project
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
            onSave={(a) => {
              onClient(a)
              patch({ clientId: a.id })
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
      onSubmit={(e) => {
        e.preventDefault()
        if (!number.trim() || !expiry || !doc) {
          setError(
            "License number, expiry date and a confirmed supporting document are required.",
          )
          return
        }
        onSave({
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
  status = "approved",
  onSave,
  onClose,
}: {
  owner: string
  status?: Company["status"]
  onSave: (company: Company) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Company>({
    id: uid(),
    name: "",
    contact: "",
    phone: "",
    email: "",
    status,
    submittedBy: owner,
    projectId: "",
    availability: "available",
    manpowerCount: 0,
    activeProjectIds: [],
    manpowerDocuments: [],
    documents: [],
    note: "",
    version: 1,
  })
  const [error, setError] = useState("")
  const patch = (values: Partial<Company>) =>
    setDraft((company) => ({ ...company, ...values }))
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.name.trim()) {
          setError("Company name is required.")
          return
        }
        onSave({ ...draft, name: draft.name.trim() })
      }}
    >
      <div className="form-grid">
        <Field label="Company name *">
          <input
            required
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Company email">
          <input
            type="email"
            value={draft.email}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>
        <Field label="Company contact person">
          <input
            value={draft.contact}
            onChange={(event) => patch({ contact: event.target.value })}
          />
        </Field>
        <Field label="Contact number">
          <input
            value={draft.phone}
            onChange={(event) => patch({ phone: event.target.value })}
          />
        </Field>
        <Field label="Company availability">
          <select
            value={draft.availability}
            onChange={(event) =>
              patch({
                availability: event.target.value as Company["availability"],
              })
            }
          >
            <option value="available">Available</option>
            <option value="limited">Limited availability</option>
            <option value="committed">Fully committed</option>
          </select>
        </Field>
        <Field label="Available manpower">
          <input
            type="number"
            min={0}
            value={draft.manpowerCount}
            onChange={(event) =>
              patch({ manpowerCount: Number(event.target.value) })
            }
          />
        </Field>
        <Field label="Company notes" wide>
          <textarea
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
          />
        </Field>
      </div>
      <section className="form-section">
        <h3>Manpower list documents</h3>
        <p>
          Upload company-level XLSX or XLS manpower lists. Individual workers
          are not stored in the directory.
        </p>
        <DocumentList
          docs={draft.manpowerDocuments}
          onPreview={() => undefined}
        />
        <Upload
          spreadsheet
          label="Company Manpower List"
          owner={owner}
          buttonLabel="Upload manpower list"
          onSave={(document) =>
            patch({
              manpowerDocuments: [...draft.manpowerDocuments, document],
            })
          }
        />
      </section>
      <section className="form-section">
        <h3>Supporting documents</h3>
        <DocumentList docs={draft.documents} onPreview={() => undefined} />
        <Upload
          label="Company Supporting Document"
          owner={owner}
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
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">
          {status === "approved" ? "Add company" : "Submit suggestion"}
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
  const [draft, setDraft] = useState(rules)
  const [confirm, setConfirm] = useState<keyof Rules>()
  const [error, setError] = useState("")
  const labels: Record<keyof Rules, [string, string, number]> = {
    grace: [
      "License grace period",
      "Days after license expiry before sign-in is blocked.",
      0,
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
        ) as [keyof Rules, [string, string, number]][]).map(
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
              onClick={() => {
                onSave(
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
