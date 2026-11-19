import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { api } from "./api/client"
import { uploadFile } from "./api/actions"
import { Icon, Modal } from "./ui"
import { IntakeTabs } from "./IntakeGuidance"
import type { IntakeView } from "./intake-guidance"
import { phaseCoverageQuota } from "./phase-coverage-policy"
import { selectInquiryLead } from "../Thesis-Backend/src/domain/inquiry-lead.js"
import "./project-inquiries.css"

const projectTypes = [
  ["Residential", "home", "Houses, condos, and apartments."],
  ["Commercial", "building", "Offices, retail, and hotels."],
  ["Mixed-Use", "mixed-building", "Residential and commercial spaces."],
] as const
const fields = [
  ["client_name", "Client name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["name", "Project name", "text"], ["address", "Project address", "text"],
  ["land_area", "Land area (m²)", "number"], ["lot_area", "Lot area (m²)", "number"],
  ["floor_area_sqm", "Total floor area (m²)", "number"], ["floor_count", "Number of floors", "number"],
] as const
type Details = Record<string, string | number>
type Inquiry = { id: string; details: Details; status: string; updated_at?: string; opm_id?: string; opm_name?: string; reason?: string; project_status?: string }
type Candidate = { id: string; name: string; qualifiedTags: string[]; experienceYears?: number }
type Engineer = { user_id: string; assigned_disciplines: string[] }
type Phase = { stage: string; user_id: string | null; assigned_disciplines?: string[]; engineers?: Engineer[]; missing_specializations?: string[] }
type Planning = { phases: string[]; estimate: { size: string | null; end: string | null }; team?: Phase[]; candidates?: Record<string, Candidate[]> }
type Recommendation = { id: string; full_name: string; experience_years: number; availability: string; active_projects?: number }
const timing = [[30, "30 minutes"], [60, "1 hour"], [1440, "1 day"]] as const
const statuses: Record<string,string> = {
  draft: "Ready for routing", offered: "Awaiting OPM response", returned: "Returned to Admin",
  consulting: "Awaiting client decision", approved: "Ready for project intake", withdrawn: "Client withdrew",
  dropped: "Dropped", converted: "Project intake complete",
}

const statusLabel = (row: Inquiry) => row.project_status === "spm_review" ? "Staffing in progress" : statuses[row.status]
const officeActions = {
  offered: { label: "Review request", dialog: "review", bucket: "action" },
  consulting: { label: "Record client decision", dialog: "outcome", bucket: "waiting" },
  approved: { label: "Open project intake", dialog: "intake", bucket: "action" },
} as const
const officeAction = (status: string) => Object.prototype.hasOwnProperty.call(officeActions, status)
  ? officeActions[status as keyof typeof officeActions] : undefined
const inquiryDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "Asia/Manila" })
const inquiryDay = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" })

const post = <T,>(path: string, json: unknown) => api<T>(path, { method: "POST", json })

function FormSection({ title, icon, description, children }: { title: string; icon?: string; description?: string; children: ReactNode }) {
  return <section className="inquiry-form-section">
    {icon ? <header className="inquiry-section-heading">
      <span className="inquiry-list-icon"><Icon name={icon} /></span>
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
    </header> : <h3>{title}</h3>}
    <div>{children}</div>
  </section>
}

function InquiryFields({ details, onChange, standaloneTypeSection = false }: { details: Details; onChange: (key: string, value: string | number) => void; standaloneTypeSection?: boolean }) {
  const field = (key: string, label: string, type = "text", required = true, maxLength?: number) => <label key={key}>{label}
    <input type={type} required={required} maxLength={maxLength} value={details[key] ?? ""} min={type === "number" ? key === "floor_count" ? 1 : 0.01 : undefined}
      step={type === "number" ? key === "floor_count" ? 1 : "any" : undefined}
      onChange={event => onChange(key, event.target.value)} />
  </label>
  const renderFields = (group: typeof fields[number][]) => group.map(([key, label, type]) => field(key, label, type))
  const types = <fieldset className="inquiry-type-field"><legend>Project type</legend><div className={`inquiry-types ${standaloneTypeSection ? "inquiry-intake-style-types" : ""}`}>
      {projectTypes.map(([type, icon, description]) => {
        const selected = details.project_type === type
        return <label key={type} className={`${standaloneTypeSection ? "button project-type-card" : ""} ${selected ? "selected" : ""}`}>
          <input type="radio" name="project-type" required checked={selected} onChange={() => onChange("project_type",type)} />
          {standaloneTypeSection ? <>
            <span className="project-type-icon"><Icon name={icon} size={24} /></span>
            <strong>{type}</strong>
            {selected && <span className="project-type-check"><Icon name="check" size={15} /></span>}
          </> : <><Icon name={icon} /><strong>{type}</strong><span>{description}</span></>}
        </label>
      })}
    </div></fieldset>
  if (standaloneTypeSection) return <>
    <FormSection title="Client information" icon="users" description="Who should we contact about this project?">
      <div className="inquiry-create-grid">
        {field("client_name", "Client or organization", "text", true, 150)}
        {field("primary_contact", "Primary contact (optional)", "text", false, 150)}
        {field("email", "Email address", "email", true, 150)}
        {field("phone", "Phone number", "tel", true, 150)}
      </div>
    </FormSection>
    <FormSection title="Project details" icon="doc" description="Share the key information known today.">
      <div className="inquiry-create-grid">
        {field("name", "Project name", "text", true, 150)}
        {field("address", "Project location", "text", true, 500)}
        {field("floor_area_sqm", "Estimated total floor area (m²)", "number")}
        {field("anticipated_start", "Anticipated start (optional)", "date", false)}
        {renderFields([fields[5], fields[6], fields[8]])}
        <label className="inquiry-overview">Project overview (optional)
          <textarea rows={3} maxLength={2000} value={details.overview ?? ""} onChange={event => onChange("overview", event.target.value)} />
        </label>
      </div>
    </FormSection>
    <FormSection title="Project type" icon="building" description="Select the option that best fits the project.">{types}</FormSection>
  </>
  return <>
    <FormSection title="Client information"><div className="inquiry-fields">{renderFields(fields.slice(0, 3))}</div></FormSection>
    <FormSection title="Project details">
      <div className="inquiry-fields inquiry-location">{renderFields(fields.slice(3, 5))}</div>
      <div className="inquiry-fields inquiry-measurements">{renderFields(fields.slice(5))}</div>
      {types}
    </FormSection>
  </>
}

function InquiryDetails({ details, includeClient = false }: { details: Details; includeClient?: boolean }) {
  return <dl className="inquiry-fields">
    {[...(includeClient ? fields : fields.slice(3)), ["project_type", "Project type"]].map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>{details[key] || "—"}</dd></div>)}
    {includeClient && details.primary_contact && <div><dt>Primary contact</dt><dd>{details.primary_contact}</dd></div>}
    {details.anticipated_start && <div><dt>Anticipated start</dt><dd>{details.anticipated_start}</dd></div>}
    {details.overview && <div className="inquiry-overview"><dt>Project overview</dt><dd>{details.overview}</dd></div>}
  </dl>
}

const consultationLabel = (details: Details) => timing.find(([value]) => value === Number(details.consultation))?.[1] || "—"

function requiredAreas(entry?: Phase) {
  return [...new Set([
    ...(entry?.missing_specializations || []),
    ...(entry?.engineers || []).flatMap(person => person.assigned_disciplines),
  ])].sort()
}

function StaffingLineup({ phases, team, candidates }: { phases: string[]; team: Phase[]; candidates: Record<string, Candidate[]> }) {
  const people = new Map(Object.values(candidates).flat().map(person => [person.id, person]))
  const experience = new Map([...people].map(([id, person]) => [id, Number(person.experienceYears ?? 0)]))
  const lead = selectInquiryLead(phases, team, experience)
  if (!lead) return null
  const years = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2, style: "unit", unit: "year", unitDisplay: "long" })
  return <section className="inquiry-card inquiry-lineup">
    <h3>Staffing lineup</h3>
    <div className="inquiry-lineup-table">
      <table>
        <thead><tr><th scope="col">Phase</th><th scope="col">Assigned Site PM</th><th scope="col">Relevant experience</th><th scope="col">Designation</th></tr></thead>
        <tbody>{phases.flatMap(stage => {
          const entry = team.find(item => item.stage === stage)
          const assigned = entry?.engineers?.map(person => person.user_id) ?? (entry?.user_id ? [entry.user_id] : [])
          return assigned.map(id => {
            const isLead = lead.id === id && lead.stage === stage
            const designation = isLead ? "Lead SPM" : entry?.user_id === id && lead.stage !== stage ? "Phase coordinator" : "Phase SPM"
            return <tr key={`${stage}:${id}`} data-lead={isLead}>
              <td>{stage}</td><td>{people.get(id)?.name || "Site PM"}</td>
              <td>{years.format(experience.get(id) ?? 0)}</td>
              <td>{isLead ? <strong className="inquiry-pill">Lead SPM</strong> : designation}</td>
            </tr>
          })
        })}</tbody>
      </table>
    </div>
    <p className="inquiry-lineup-lead"><strong>{people.get(lead.id)?.name || "Site PM"} · {lead.stage}</strong> is the proposed Lead. Relevant project-type experience ranks first, with phase order as the first tiebreaker.</p>
    <p className="inquiry-muted">The Lead accepts first and manages subcontractor allocation once the project is ready.</p>
  </section>
}

function StaffingCards({ stage, entry, suggested, choices, adding, setAdding, onChange }: {
  stage: string
  entry?: Phase
  suggested?: Phase
  choices: Candidate[]
  adding: boolean
  setAdding: (value: boolean) => void
  onChange: (entry: Phase) => void
}) {
  const multi = !!suggested?.engineers
  const engineers = entry?.engineers ?? (entry?.user_id ? [
    { user_id: entry.user_id, assigned_disciplines: entry.assigned_disciplines || [] },
  ] : [])
  const required = requiredAreas(suggested)
  const missing = required.filter(area => !engineers.some(person => person.assigned_disciplines.includes(area)))
  const quota = phaseCoverageQuota(required)
  const coverage = required.length - missing.length
  const update = (next: Engineer[]) => onChange({
    ...entry, stage, user_id: next[0]?.user_id || null,
    assigned_disciplines: next[0]?.assigned_disciplines,
    ...(multi ? { engineers: next } : {}),
  })
  function options(index: number) {
    const others = engineers.filter((_, current) => current !== index)
    const used = new Set(others.flatMap(person => person.assigned_disciplines))
    return choices.filter(candidate => !others.some(person => person.user_id === candidate.id))
      .map(candidate => ({ ...candidate, tags: candidate.qualifiedTags.filter(tag => !used.has(tag)).slice(0, multi ? 3 : 1) }))
      .filter(candidate => !multi || candidate.tags.length > 0)
  }
  function assign(index: number, id: string) {
    const candidate = options(index).find(option => option.id === id)
    if (!candidate) return
    const next = [...engineers]
    next[index] = { user_id: id, assigned_disciplines: candidate.tags }
    update(next)
    setAdding(false)
  }
  return <section className="inquiry-card inquiry-staffing">
    <div className="inquiry-staff-heading"><h3>{stage}</h3>
      {multi && <span className={`inquiry-pill ${coverage >= quota ? "ready" : "pending"}`}>{coverage} of {required.length} areas covered · minimum {quota} (50%)</span>}
    </div>
    {missing.length > 0 && <p className="inquiry-coverage-warning"><strong>{missing.length} coverage {missing.length === 1 ? "gap" : "gaps"} in {stage}.</strong> Still needed: {missing.join(", ")}</p>}
    <div className={`inquiry-staff-layout${required.length ? " with-coverage" : ""}`}>
    <div className="inquiry-form-stack">
    <div className="inquiry-staff-heading">
      <strong>Assigned engineers · {engineers.length}</strong>
      {!adding && engineers.length < (multi ? 3 : 1) && <button className="button" type="button" disabled={!options(engineers.length).length} onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add engineer</button>}
    </div>
    {!engineers.length && <p>Unfilled</p>}
    <div className="inquiry-engineers">
      {engineers.map((person, index) => {
        const assigned = choices.find(candidate => candidate.id === person.user_id)
        const replacements = options(index)
        return <article className="inquiry-card" key={person.user_id}>
          <label>Assigned Site PM<select value={person.user_id} onChange={event => assign(index, event.target.value)}>
            {!replacements.some(option => option.id === person.user_id) && <option value={person.user_id}>{assigned?.name || "Site PM"}</option>}
            {replacements.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <p className="inquiry-muted">Site PM{assigned?.qualifiedTags.length ? ` · ${assigned.qualifiedTags.join(", ")}` : ""}</p>
          {multi && <fieldset>
            <legend>Responsibilities in {stage}</legend>
            {required.map(area => {
              const checked = person.assigned_disciplines.includes(area)
              const qualified = assigned?.qualifiedTags.includes(area)
              const alreadyAssigned = engineers.some(other => other !== person && other.assigned_disciplines.includes(area))
              return <label className="inquiry-check" key={area}>
                <input type="checkbox" checked={checked} disabled={checked ? !qualified : !qualified || alreadyAssigned || person.assigned_disciplines.length >= 3}
                  onChange={() => update(engineers.map(other => other === person ? {
                    ...person, assigned_disciplines: checked ? person.assigned_disciplines.filter(tag => tag !== area) : [...person.assigned_disciplines, area],
                  } : other))} />
                <span>{area}{!qualified && <small>No eligible qualification for this area</small>}{qualified && alreadyAssigned && <small>Assigned to another engineer</small>}</span>
              </label>
            })}
          </fieldset>}
          <button className="button" type="button" onClick={() => { update(engineers.filter(other => other !== person)); setAdding(false) }}>Remove engineer</button>
        </article>
      })}
      {adding && <article className="inquiry-card"><label>Add SPM to phase
        <select value="" onChange={event => assign(engineers.length, event.target.value)}>
          <option value="">Select an eligible SPM</option>
          {options(engineers.length).map(option => <option key={option.id} value={option.id}>{option.name} · {option.tags.join(", ")}</option>)}
        </select></label>
        <button className="button" type="button" onClick={() => setAdding(false)}>Cancel</button>
      </article>}
    </div>
    </div>
    {!!required.length && <aside className="inquiry-summary-card inquiry-phase-coverage">
      <h4>Phase coverage</h4>
      <ul>{required.map(area => {
        const covered = !missing.includes(area)
        return <li key={area} className={covered ? "covered" : "gap"}><Icon name={covered ? "check" : "alert"} size={16} />{area} <span className="sr-only">{covered ? "covered" : "unfilled"}</span></li>
      })}</ul>
    </aside>}
    </div>
  </section>
}

export default function ProjectInquiries({ role, onReload }: { role: "admin" | "opm"; onReload: () => unknown }) {
  const [rows, setRows] = useState<Inquiry[]>()
  const [search, setSearch] = useState("")
  const [queueView, setQueueView] = useState<IntakeView>("all")
  const [queueStatus, setQueueStatus] = useState("")
  const [queueType, setQueueType] = useState("")
  const recordHeading = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState("")
  const [dialog, setDialog] = useState<"new" | "route" | "review" | "outcome" | "intake" | "details">()
  const [step, setStep] = useState(1)
  const [staffingPhase, setStaffingPhase] = useState("")
  const [addingEngineer, setAddingEngineer] = useState(false)
  const [showProject, setShowProject] = useState(false)
  const stepperRef = useRef<HTMLOListElement>(null)
  const [details, setDetails] = useState<Details>({ consultation: 30 })
  const [matchOnCreate, setMatchOnCreate] = useState(true)
  const [recommendation, setRecommendation] = useState<Recommendation | null>()
  const [planning, setPlanning] = useState<Planning>()
  const [phases, setPhases] = useState<string[]>([])
  const [team, setTeam] = useState<Phase[]>([])
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [budget, setBudget] = useState("")
  const [reason, setReason] = useState("")
  const [outcome, setOutcome] = useState<"approve" | "withdraw">()
  const [decisionDate, setDecisionDate] = useState("")
  const [decisionNote, setDecisionNote] = useState("")
  const [contract, setContract] = useState<File>()
  const [contractPreview, setContractPreview] = useState("")
  const [contractFileId, setContractFileId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const row = rows?.find(item => item.id === selected)
  const root = "/projects/inquiries"
  const change = (key: string, value: string | number) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setPlanning(undefined)
    setTeam([])
  }
  const refresh = async () => setRows(await api<Inquiry[]>(root))
  useEffect(() => {
    const mime = /.(pdf)$/i.test(contract?.name || "") ? "application/pdf"
      : /.png$/i.test(contract?.name || "") ? "image/png"
        : /.jpe?g$/i.test(contract?.name || "") ? "image/jpeg" : ""
    if (!contract || !mime) {
      setContractPreview("")
      return
    }
    const url = URL.createObjectURL(contract.slice(0, contract.size, mime))
    setContractPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [contract])
  useEffect(() => {
    if (dialog === "intake") stepperRef.current?.closest(".modal-body")?.scrollTo?.(0, 0)
  }, [dialog, step])
  useEffect(() => {
    let mounted = true
    void api<Inquiry[]>(root).then(data => { if (mounted) setRows(data) }, e => { if (mounted) setError(String(e.message)) })
    return () => { mounted = false }
  }, [])
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  function open(item?: Inquiry) {
    setSelected(item?.id || "")
    setDetails(item ? { ...item.details } : { consultation: 30 })
    setRecommendation(undefined)
    setPlanning(undefined)
    setTeam([])
    setPhases([])
    setReason("")
    setOutcome(undefined)
    setDecisionDate("")
    setDecisionNote("")
    setStart(typeof item?.details.anticipated_start === "string" ? item.details.anticipated_start : "")
    setEnd("")
    setBudget("")
    setContract(undefined)
    setContractFileId(undefined)
    setError("")
    setStep(1)
    setAddingEngineer(false)
    setDialog(undefined)
  }
  function closeDialog() {
    if (busy) return
    setDialog(undefined)
    setError("")
  }
  async function recommend(id: string) {
    const result = await api<Recommendation | { data: null } | null>(`${root}/${id}/recommendation`)
    setRecommendation(result && "id" in result ? result : null)
    setShowProject(false)
    setDialog("route")
  }
  async function decision(action: string) {
    const updated = await post<Inquiry>(`${root}/${selected}/decision`, {
      action, reason, opm_id: recommendation?.id,
      ...(action === "approve" || action === "withdraw" ? { decision_date: decisionDate, decision_note: decisionNote } : {}),
    })
    setRecommendation(undefined)
    if (action === "approve") {
      setRows(previous => previous?.map(item => item.id === updated.id ? { ...item, ...updated } : item))
      setDetails({ ...updated.details })
      setStep(1)
      setDialog("intake")
    } else {
      await refresh()
      setDialog(undefined)
    }
    void onReload()
  }
  function openOutcome() {
    setOutcome(undefined)
    setDecisionDate(inquiryDay.format(new Date()))
    setDecisionNote("")
    setReason("")
    setDialog("outcome")
  }
  function openOfficeInquiry(item: Inquiry) {
    if (item.id !== selected) open(item)
    setError("")
    setShowProject(false)
    const action = officeAction(item.status)
    if (action?.dialog === "outcome") openOutcome()
    else setDialog(action?.dialog ?? "details")
  }
  async function intakePreview(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const result = await post<Planning>(`${root}/${selected}/planning`, { ...details, target_start_date: start })
      setPlanning(result)
      setTeam([])
      setPhases(result.phases)
      if (!end && result.estimate.end) setEnd(result.estimate.end)
      setStep(2)
    })
  }
  async function allocate() {
    const fileId = await uploadIntakeContract()
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...details, target_start_date: start, target_end_date: end, phases, estimated_budget: budget, contract_file_id: fileId })
    setPlanning(result)
    setTeam(result.team || [])
    setStaffingPhase(phases.includes(staffingPhase) ? staffingPhase : phases[0] || "")
    setAddingEngineer(false)
    setStep(3)
  }
  async function uploadIntakeContract() {
    if (contractFileId) return contractFileId
    if (!contract) throw new Error("Attach the signed client contract agreement.")
    const id = crypto.randomUUID()
    await uploadFile(id, contract)
    setContractFileId(id)
    return id
  }
  async function submit() {
    const fileId = await uploadIntakeContract()
    await post("/projects/intake", {
      ...details, inquiry_id: selected, suggested_opm_id: row?.opm_id, target_start_date: start,
      target_end_date: end, estimated_budget: budget, contract_file_id: fileId,
      phases, phase_team: phases.map(stage => team.find(item => item.stage === stage)),
    })
    await refresh()
    setDialog(undefined)
    void onReload()
  }
  const canAllocate = !!contract && !!start && !!end && end >= start && Number(budget) > 0 && phases.length > 0
  const canSend = canAllocate && phases.every(stage => {
    const entry = team.find(item => item.stage === stage)
    if (!entry?.user_id) return false
    if (!entry.engineers) return true
    const required = requiredAreas(planning?.team?.find(item => item.stage === stage))
    const covered = new Set(entry.engineers.flatMap(person => person.assigned_disciplines))
    return entry.engineers.every(person => person.assigned_disciplines.length) &&
      required.filter(area => covered.has(area)).length >= phaseCoverageQuota(required)
  })
  const feedback = <>
    {busy && <p role="status">Saving or loading inquiry…</p>}
    {error && <p role="alert">{error}</p>}
  </>
  const admin = role === "admin"
  const query = search.trim().toLowerCase()
  const matchesSearch = (item: Inquiry) => !query ||
    [item.details.name, item.details.client_name, statusLabel(item)]
      .some(value => String(value ?? "").toLowerCase().includes(query))
  const visibleRows = rows?.filter(matchesSearch)
  const queueRows = visibleRows?.filter(item =>
    (queueView === "all" || officeAction(item.status)?.bucket === queueView) &&
    (!queueStatus || statusLabel(item) === queueStatus) &&
    (!queueType || item.details.project_type === queueType)
  )
  const queueCounts = (rows ?? []).reduce((counts, item) => {
    counts.all++
    const bucket = officeAction(item.status)?.bucket
    if (bucket) counts[bucket]++
    return counts
  }, { all: 0, action: 0, waiting: 0 })
  const statusOptions = [...new Set([...(rows ?? []).map(statusLabel), queueStatus].filter(Boolean))]
  return <section className={`project-inquiries ${admin ? "admin-inquiries" : "opm-inquiries"}`}>
    <header className="inquiries-page-heading">
      <div><h1>Project inquiries</h1>
        {admin && <p>Review saved inquiries or start a new project request.</p>}
      </div>
      <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      {admin && <button className="button primary" disabled={busy} onClick={() => { open(); setMatchOnCreate(true); setDialog("new") }}><Icon name="plus" size={17} />New project inquiry</button>}
    </header>
    {!admin && <section className="opm-inquiry-queue" aria-label="Project inquiry queue">
      <div className="confirmation-intake-filters">
        <IntakeTabs value={queueView} counts={queueCounts} onChange={setQueueView} allLabel="All inquiries" waitingLabel="Waiting for client"
          help="Needs your action includes requests to review and projects ready for intake. Waiting for client includes accepted consultations with no client decision recorded yet." />
      </div>
      <div className="opm-inquiry-filters">
        <div className="inquiry-list-search">
          <Icon name="search" size={17} />
          <input type="search" aria-label="Search inquiries" placeholder="Search inquiries" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <label>Status<select value={queueStatus} onChange={event => setQueueStatus(event.target.value)}>
          <option value="">All statuses</option>
          {statusOptions.map(status => <option key={status}>{status}</option>)}
        </select></label>
        <label>Project type<select value={queueType} onChange={event => setQueueType(event.target.value)}>
          <option value="">All types</option>
          {projectTypes.map(([type]) => <option key={type}>{type}</option>)}
        </select></label>
      </div>
      {queueRows && <p className="inquiry-muted" role="status">{queueRows.length} {queueRows.length === 1 ? "inquiry" : "inquiries"}</p>}
      {queueRows?.length ? <div className="opm-inquiry-results">
        <table aria-label="Assigned project inquiries">
          <thead><tr><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Next action</th></tr></thead>
          <tbody>{queueRows.map(item => <tr key={item.id}>
            <th scope="row">{item.details.name || "Untitled project"}<small>{item.details.project_type || "Project type unavailable"}</small></th>
            <td><span className="inquiry-list-status" data-status={item.status}>{statusLabel(item) || "Status unavailable"}</span></td>
            <td><button type="button" className="button" disabled={busy} onClick={() => openOfficeInquiry(item)}
              aria-label={`${officeAction(item.status)?.label ?? "View inquiry"} for ${item.details.name || "Untitled project"}`}>
              {officeAction(item.status)?.label ?? "View inquiry"} <Icon name="chevron" size={16} />
            </button></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="opm-inquiry-empty">
        <Icon name="folder" size={24} />
        <p>{rows?.length ? "No inquiries match the current filters." : rows ? "No consultation requests yet." : error ? "Inquiries could not be loaded." : "Loading inquiries…"}</p>
        {!!rows?.length && <button className="button" type="button" onClick={() => { setSearch(""); setQueueStatus(""); setQueueType(""); setQueueView("all") }}>Clear filters</button>}
      </div>}
    </section>}
    {admin && <section className="inquiry-list-panel" aria-labelledby="existing-inquiries-heading">
      <div className="inquiry-list-heading">
        <div>
          <h2 id="existing-inquiries-heading">Existing inquiries
            {rows && <span className="inquiry-list-count" aria-label={`${rows.length} saved inquiries`}>{rows.length}</span>}
          </h2>
          <p>Open a saved record to review details and continue the workflow.</p>
        </div>
        <div className="inquiry-list-search">
          <Icon name="search" size={17} />
          <input type="search" aria-label="Search inquiries" placeholder="Search inquiries" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
      </div>
      {!!visibleRows?.length && <div className="inquiry-list-columns" aria-hidden="true">
        <span>Project</span><span>Status</span><span>Last updated</span>
      </div>}
      {visibleRows?.length ? <ul className="inquiry-list">
        {visibleRows.map(item => {
          const name = item.details.name || "Untitled project"
          const status = statusLabel(item) || "Status unavailable"
          const updated = item.updated_at && Number.isFinite(Date.parse(item.updated_at)) ? item.updated_at : undefined
          const updatedLabel = updated ? inquiryDate.format(new Date(updated)) : ""
          return <li key={item.id}>
            <button type="button" className="inquiry-list-row" disabled={busy} aria-pressed={item.id === selected}
              aria-label={`View inquiry for ${name}, ${[item.details.client_name, status, updatedLabel && `last updated ${updatedLabel}`].filter(Boolean).join(", ")}`}
              onClick={() => {
                open(item)
                requestAnimationFrame(() => recordHeading.current?.focus())
              }}>
              <span className="inquiry-list-project">
                <span className="inquiry-list-icon"><Icon name="building" /></span>
                <span className="inquiry-list-name"><strong>{name}</strong>
                  {item.details.client_name && <small>{item.details.client_name}</small>}
                </span>
              </span>
              <span className="inquiry-list-status" data-status={item.status}>{status}</span>
              <span className="inquiry-list-updated">{updated
                ? <time dateTime={updated}>{updatedLabel}</time>
                : "—"}</span>
              <span className="inquiry-list-action">View inquiry <Icon name="chevron" size={16} /></span>
            </button>
          </li>
        })}
      </ul> : <p className="inquiry-list-empty">
        {rows?.length ? "No inquiries match your search." : rows ? "No project inquiries have been created yet." :
          error ? "Inquiries could not be loaded." : "Loading inquiries…"}
      </p>}
    </section>}
    {admin && row && <fieldset disabled={busy} className="inquiry-record">
      <div className="inquiry-record-heading">
        <div>
          <span className={`inquiry-pill ${row.status === "offered" ? "pending" : ""}`}>{statusLabel(row)}</span>
          <h2 ref={recordHeading} tabIndex={-1}>{row.details.name}</h2>
          <p>{row.details.client_name}</p>
        </div>
        {row.status === "offered" && <button type="button" className="button" disabled>OPM selected</button>}
      </div>
      {row.status === "offered" ? <div className="inquiry-sent-notice" role="status">
        <span className="inquiry-list-icon"><Icon name="clock" /></span>
        <div>
          <strong>Consultation request sent</strong>
          <p>{row.opm_name ? `${row.opm_name} has been invited to review this project.` : "The assigned Office Project Manager has been invited to review this project."}</p>
          <small>You can continue once the Office PM responds.</small>
        </div>
      </div> : row.opm_name && <p>Office Project Manager: {row.opm_name}</p>}
      {row.reason && <p>Withdrawal reason: {row.reason}</p>}
      {row.details.client_decision_date && <p>Client decision confirmed on {row.details.client_decision_date}</p>}
      {row.details.client_decision_note && <p className="inquiry-overview">Internal decision note: {row.details.client_decision_note}</p>}
      <InquiryDetails details={row.details} includeClient />
      <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
      {["draft", "returned"].includes(row.status) && <div>
        <button className="button primary" onClick={() => void run(() => recommend(row.id))}>Find OPM</button>
      </div>}
      {row.status === "withdrawn" && <button className="button" onClick={() => void run(() => decision("drop"))}>Mark inquiry dropped</button>}
    </fieldset>}

    {dialog === "details" && role === "opm" && row && <Modal title={String(row.details.name || "Inquiry details")} wide onClose={closeDialog}>
      <div className="inquiry-dialog-content">
        <div><span className="inquiry-pill">{statusLabel(row) || "Status unavailable"}</span></div>
        <InquiryDetails details={row.details} includeClient />
        <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
        {row.reason && <p>Withdrawal reason: {row.reason}</p>}
        {row.details.client_decision_date && <p>Client decision confirmed on {row.details.client_decision_date}</p>}
        {row.details.client_decision_note && <p className="inquiry-overview">Internal decision note: {row.details.client_decision_note}</p>}
      </div>
    </Modal>}

    {dialog === "review" && role === "opm" && row?.status === "offered" && <Modal title="Review consultation request" wide onClose={closeDialog} footer={<>
      <button className="button inquiry-decline" disabled={busy} onClick={() => void run(() => decision("cancel"))}>Decline request</button>
      <button className="button primary" disabled={busy} onClick={() => void run(() => decision("confirm"))}>Accept consultation</button>
    </>}>
      <div className="inquiry-dialog-content inquiry-opm-review">
        <div className="inquiry-sent-notice">
          <span className="inquiry-list-icon"><Icon name="users" /></span>
          <div><strong>You’ve been invited to consult on this project</strong><p>Review the inquiry and consultation details before accepting.</p></div>
          {row.updated_at && Number.isFinite(Date.parse(row.updated_at)) && <time dateTime={row.updated_at}>Sent {inquiryDate.format(new Date(row.updated_at))}</time>}
        </div>
        <div className="inquiry-review-columns">
          <FormSection title="Consultation scope" icon="doc" description="Provided by the Admin">
            <dl className="inquiry-fields"><div><dt>Preferred consultation timing</dt><dd>{consultationLabel(row.details)}</dd></div></dl>
            <p className="inquiry-muted">Review the project and discuss the proposal with the client after accepting.</p>
          </FormSection>
          <FormSection title={String(row.details.name)} icon="building" description="Project inquiry">
            <dl className="inquiry-fields">
              <div><dt>Client</dt><dd>{row.details.client_name}</dd></div>
              <div><dt>Location</dt><dd>{row.details.address}</dd></div>
              <div><dt>Type</dt><dd>{row.details.project_type}</dd></div>
              <div><dt>Total floor area (m²)</dt><dd>{row.details.floor_area_sqm}</dd></div>
            </dl>
            <div className="inquiry-disclosure">
              <button type="button" aria-expanded={showProject} aria-controls="opm-review-details" onClick={() => setShowProject(previous => !previous)}>
                {showProject ? "Hide project details" : "View project details"}<Icon name="down" size={17} />
              </button>
              <div id="opm-review-details" hidden={!showProject}><InquiryDetails details={row.details} includeClient /></div>
            </div>
          </FormSection>
        </div>
        <p className="inquiry-sent-notice inquiry-accepted-notice">Accepting the consultation lets you record the client’s decision. Intake opens once the client accepts the proposal.</p>
        {feedback}
      </div>
    </Modal>}

    {dialog === "outcome" && role === "opm" && row?.status === "consulting" && <Modal title="Record client decision" onClose={closeDialog} footer={<>
      <button className="button" disabled={busy} onClick={closeDialog}>Cancel</button>
      <button form="inquiry-outcome-form" type="submit" className="button primary" disabled={busy || !outcome || !decisionDate || (outcome === "withdraw" && !reason.trim())}>
        {outcome === "approve" ? "Save and open intake" : "Save decision"}
      </button>
    </>}>
      <form id="inquiry-outcome-form" className="inquiry-dialog-content inquiry-outcome" onSubmit={event => {
        event.preventDefault()
        if (!busy && outcome) void run(() => decision(outcome))
      }}>
        <div className="inquiry-sent-notice"><span className="inquiry-list-icon"><Icon name="doc" /></span>
          <div><strong>Confirm the outcome with the client first</strong><p>Use this form to record the decision after your conversation outside 10BuildLine.</p></div>
        </div>
        <FormSection title={String(row.details.name)} icon="building" description={String(row.details.client_name)}>
          {row.details.primary_contact && <p>Primary contact: {row.details.primary_contact}</p>}
          <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
          <details><summary>View project details</summary><InquiryDetails details={row.details} includeClient /></details>
        </FormSection>
        <fieldset disabled={busy} className="inquiry-form-stack">
          <fieldset className="inquiry-routing-options inquiry-outcome-options">
            <legend>Did the client accept the proposal?</legend>
            <label><input type="radio" name="client-outcome" required checked={outcome === "approve"} onChange={() => setOutcome("approve")} />
              <span><strong>Yes, client accepted</strong><small>Open project intake after saving the decision.</small></span>
            </label>
            <label><input type="radio" name="client-outcome" required checked={outcome === "withdraw"} onChange={() => setOutcome("withdraw")} />
              <span><strong>No, client declined</strong><small>Return the outcome to Admin without starting intake.</small></span>
            </label>
          </fieldset>
          {outcome && <>
            <label>Decision confirmed on<input type="date" required max={inquiryDay.format(new Date())} value={decisionDate} onChange={event => setDecisionDate(event.target.value)} /></label>
            {outcome === "withdraw" && <label>Reason the client declined<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} rows={2} /></label>}
            <label>Internal note (optional)<textarea maxLength={1000} value={decisionNote} onChange={event => setDecisionNote(event.target.value)} rows={3} /></label>
          </>}
        </fieldset>
        {feedback}
      </form>
    </Modal>}

    {dialog === "new" && <Modal title="New project inquiry" wide onClose={closeDialog} footer={<>
      <button className="button" disabled={busy} onClick={closeDialog}>Cancel</button>
      <button type="submit" form="new-inquiry-form" className="button primary" disabled={busy}>Create inquiry</button>
    </>}>
      <form id="new-inquiry-form" className="inquiry-dialog-content inquiry-create" onSubmit={event => {
        event.preventDefault()
        void run(async () => {
          const result = await post<Inquiry>(root, details)
          setRows(previous => [result, ...(previous || []).filter(item => item.id !== result.id)])
          setSearch("")
          open(result)
          if (matchOnCreate) await recommend(result.id)
        })
      }}>
        <p className="inquiry-create-intro">Tell us what you’re building. You can review and route the inquiry after it’s created.</p>
        <fieldset disabled={busy} className="inquiry-form-stack">
          <InquiryFields details={details} onChange={change} standaloneTypeSection />
          <FormSection title="Consultation" icon="users" description="Choose what should happen after creation.">
            <fieldset className="inquiry-routing-options">
              <legend className="sr-only">Routing after creation</legend>
              <label>
                <input type="radio" name="match-on-create" checked={matchOnCreate} onChange={() => setMatchOnCreate(true)} />
                <span><strong>Yes, help me find the right OPM</strong><small>We’ll match the project with an available Office Project Manager.</small></span>
              </label>
              <label>
                <input type="radio" name="match-on-create" checked={!matchOnCreate} onChange={() => setMatchOnCreate(false)} />
                <strong>No, save this inquiry for later</strong>
              </label>
            </fieldset>
            <label className="inquiry-consultation-field">Preferred consultation timing
              <select value={details.consultation} onChange={event => change("consultation", Number(event.target.value))}>
                {timing.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </FormSection>
        </fieldset>
        {feedback}
      </form>
    </Modal>}

    {dialog === "route" && row && <Modal title="Route inquiry" wide onClose={closeDialog} footer={<>
      <button className="button" disabled={busy} onClick={closeDialog}>Cancel</button>
      {recommendation && <button className="button primary" disabled={busy} onClick={() => void run(() => decision("send"))}>Send consultation request</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-routing">
        <section className="inquiry-route-summary" aria-label="Inquiry summary">
          <p className="inquiry-route-label">Inquiry summary</p>
          <h3>{row.details.name}</h3>
          <p>{row.details.client_name}</p>
          <dl>
            <div><dt>Project type</dt><dd>{row.details.project_type}</dd></div>
            <div><dt>Location</dt><dd>{row.details.address}</dd></div>
            <div><dt>Total floor area</dt><dd>{row.details.floor_area_sqm ? `${Number(row.details.floor_area_sqm).toLocaleString("en-PH")} m²` : "—"}</dd></div>
            <div><dt>Anticipated start</dt><dd>{row.details.anticipated_start || "—"}</dd></div>
            <div><dt>Consultation timing</dt><dd>{consultationLabel(row.details)}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(row)}</dd></div>
          </dl>
          <div className="inquiry-disclosure">
            <button type="button" aria-expanded={showProject} aria-controls="route-project-details" onClick={() => setShowProject(previous => !previous)}>
              {showProject ? "Hide project details" : "View project details"} <Icon name="down" size={18} />
            </button>
            <div id="route-project-details" hidden={!showProject}><InquiryDetails details={row.details} /></div>
          </div>
        </section>
        <section className="inquiry-route-result">
          <p className="inquiry-route-label">System match</p>
          <h3>Recommended Office Project Manager</h3>
          {recommendation ? <div className="inquiry-card inquiry-match">
            <div className="inquiry-match-heading">
              <div><h4>{recommendation.full_name}</h4><p>Office Project Manager</p></div>
              <span className={`inquiry-pill ${recommendation.availability === "available" ? "ready" : ""}`}>{recommendation.availability || "Availability unknown"}</span>
            </div>
            <dl className="inquiry-match-metrics">
              <div><Icon name="building" size={18} /><dt>Specialization</dt><dd>{row.details.project_type}</dd></div>
              <div><Icon name="clock" size={18} /><dt>Relevant experience</dt><dd>{recommendation.experience_years == null ? "—" : `${recommendation.experience_years} years`}</dd></div>
              {recommendation.active_projects != null && <div><Icon name="doc" size={18} /><dt>Active projects</dt><dd>{recommendation.active_projects}</dd></div>}
            </dl>
            <p className="inquiry-match-note"><Icon name="check" size={16} /> Matched by project type, relevant experience, and availability.</p>
          </div> : <p className="inquiry-card">No eligible Office Project Manager is currently available.</p>}
        </section>
        {feedback}
      </div>
    </Modal>}

    {dialog === "intake" && row?.status === "approved" && <Modal title="Project intake" subtitle={String(details.name || row.details.name || "")} wide onClose={closeDialog} footer={<>
      <span className="inquiry-intake-progress">Step {step} of 3</span>
      <button type="button" className="button" disabled={busy} onClick={step === 1 ? closeDialog : () => setStep(step - 1)}>{step === 1 ? "Close" : "Back"}</button>
      {step === 1 && <button type="submit" form="inquiry-intake-form" className="button primary" disabled={busy}>Review project size and phases</button>}
      {step === 2 && <button className="button primary" disabled={busy || !canAllocate} onClick={() => {
        if (planning?.candidates) setStep(3)
        else void run(allocate)
      }}>Continue to staffing</button>}
      {step === 3 && <button className="button primary" disabled={busy || !canSend} onClick={() => void run(submit)}>Send assignment offers</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-intake">
        <ol ref={stepperRef} className="inquiry-stepper" aria-label="Project intake steps">
          {["Intake details", "Size & phases", "Staffing"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-complete={step > index + 1}>
            <span aria-hidden="true">{step > index + 1 ? <Icon name="check" size={14} /> : index + 1}</span>{label}
          </li>)}
        </ol>
        <form id="inquiry-intake-form" hidden={step !== 1} onSubmit={event => {
          if (planning) { event.preventDefault(); setStep(2) }
          else void intakePreview(event)
        }}>
          <fieldset disabled={busy || step !== 1} className="inquiry-form-stack">
            <InquiryFields details={details} onChange={change} />
            <FormSection title="Schedule and budget" icon="calendar"><div className="inquiry-fields">
              <label>Target start date<input type="date" required value={start} onChange={event => { setStart(event.target.value); setPlanning(undefined); setTeam([]) }} /></label>
              <label>Overall end date<input type="date" min={start} value={end} onChange={event => { setEnd(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
              <label>Estimated budget (₱)<input type="number" min="0.01" step="0.01" required value={budget} onChange={event => { setBudget(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
            </div></FormSection>
            <FormSection title="Signed contract" icon="doc" description="Attach the executed agreement.">
              <label>Signed Client Contract Agreement<input type="file" accept=".pdf,.png,.jpg,.jpeg" required={!contract} onChange={event => { setContract(event.target.files?.[0]); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})); setContractFileId(undefined) }} /></label>
            {contract && contractPreview && <div className="inquiry-sent-notice inquiry-contract-preview">
              <span className="inquiry-list-icon"><Icon name="doc" /></span>
              <div><strong>{contract.name}</strong><small>Contract attached</small></div>
              <a className="button" href={contractPreview} target="_blank" rel="noopener noreferrer">View contract</a>
            </div>}
            </FormSection>
          </fieldset>
        </form>
        {step === 2 && planning && <fieldset className="inquiry-review" disabled={busy}>
          <aside className="inquiry-summary-card">
            <h3>Inquiry summary</h3>
            {details.overview && <p>{details.overview}</p>}
            <span className="inquiry-pill">{statusLabel(row)}</span>
            <dl>
              <div><dt>Client</dt><dd>{details.client_name}</dd></div>
              <div><dt>Project type</dt><dd>{details.project_type}</dd></div>
              <div><dt>Project address</dt><dd>{details.address}</dd></div>
              <div><dt>Total floor area (m²)</dt><dd>{details.floor_area_sqm}</dd></div>
              <div><dt>Number of floors</dt><dd>{details.floor_count}</dd></div>
              <div><dt>Target start</dt><dd>{start || "—"}</dd></div>
            </dl>
            <details><summary>View full inquiry</summary>
              <InquiryDetails details={row.details} includeClient />
              <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
            </details>
          </aside>
          <div className="inquiry-review-main">
            <div className="inquiry-fields inquiry-estimates">
              <div className="inquiry-card"><h3>Suggested project size</h3><p>{planning.estimate.size || "Unavailable"}</p></div>
              <div className="inquiry-card"><h3>Suggested overall end date</h3>
                <p>{planning.estimate.end || "Enter the end date in Intake details."}</p>
                {planning.estimate.end && end !== planning.estimate.end && <button className="button" type="button" onClick={() => {
                  setEnd(planning.estimate.end || "")
                  setTeam([])
                  setPlanning({ ...planning, candidates: undefined })
                }}>Use suggested date</button>}
              </div>
            </div>
            <h3>Construction phases</h3>
            <div className="inquiry-phase-grid">
              {planning.phases.map(stage => <label className="inquiry-check inquiry-phase-option" key={stage}>
                <input type="checkbox" checked={phases.includes(stage)} onChange={event => {
                  setPhases(previous => event.target.checked ? planning.phases.filter(item => item === stage || previous.includes(item)) : previous.filter(item => item !== stage))
                  setTeam([])
                  setPlanning({ ...planning, candidates: undefined })
                }} />{stage}
              </label>)}
            </div>
            {!canAllocate && <p className="inquiry-muted">Enter a valid schedule and budget, attach the signed contract, and select at least one phase to continue.</p>}
          </div>
        </fieldset>}
        {step === 3 && planning?.candidates && <fieldset className="inquiry-form-stack" disabled={busy}>
          <div><h3>Build the project team</h3><p className="inquiry-muted">Review staffing by phase and assign qualified engineers to cover responsibilities.</p></div>
          <StaffingLineup phases={phases} team={team} candidates={planning.candidates} />
          <div className="inquiry-phase-nav" role="group" aria-label="Staffing phase">
            {phases.map(stage => <button key={stage} type="button" className={`button ${staffingPhase === stage ? "primary" : ""}`} aria-pressed={staffingPhase === stage} onClick={() => {
              setStaffingPhase(stage)
              setAddingEngineer(false)
            }}>{stage}</button>)}
          </div>
          <StaffingCards stage={staffingPhase} entry={team.find(entry => entry.stage === staffingPhase)}
            suggested={planning.team?.find(entry => entry.stage === staffingPhase)}
            choices={planning.candidates[staffingPhase] || []} adding={addingEngineer} setAdding={setAddingEngineer}
            onChange={entry => setTeam(previous => [...previous.filter(item => item.stage !== entry.stage), entry])} />
          {!canSend && <p className="inquiry-muted">Fill every selected phase and meet its minimum coverage before sending assignment offers.</p>}
        </fieldset>}
        {feedback}
      </div>
    </Modal>}
    {!dialog && feedback}
    {admin && <details className="inquiry-workflow-help">
      <summary>
        <span className="inquiry-list-icon"><Icon name="doc" /></span>
        <span><strong>What happens after an inquiry?</strong>
          <small>Review the project, match it with an available Office Project Manager, then begin project intake.</small>
        </span>
        <span className="inquiry-workflow-action">See an example <Icon name="chevron" size={16} /></span>
      </summary>
      <p>For example, open a saved residential inquiry and choose <strong>Find OPM</strong>. Review the system match and send a consultation request. Once the client agrees to proceed, the Office PM can start project intake.</p>
    </details>}
  </section>
}
