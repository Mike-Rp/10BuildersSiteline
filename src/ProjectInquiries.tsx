import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { api } from "./api/client"
import { uploadFile } from "./api/actions"
import { Icon, Modal } from "./ui"
import residential from "./assets/inquiry/residential.png"
import commercial from "./assets/inquiry/commercial.png"
import mixedUse from "./assets/inquiry/mixed-use.png"
import { phaseCoverageQuota } from "./phase-coverage-policy"
import "./project-inquiries.css"

const projectTypes = [
  ["Residential", "home", "Houses, condos, and apartments.", residential],
  ["Commercial", "building", "Offices, retail, and hotels.", commercial],
  ["Mixed-Use", "mixed-building", "Residential and commercial spaces.", mixedUse],
] as const
const fields = [
  ["client_name", "Client name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["name", "Project name", "text"], ["address", "Project address", "text"],
  ["land_area", "Land area (m²)", "number"], ["lot_area", "Lot area (m²)", "number"],
  ["floor_area_sqm", "Total floor area (m²)", "number"], ["floor_count", "Number of floors", "number"],
] as const
type Details = Record<string, string | number>
type Inquiry = { id: string; details: Details; status: string; opm_id?: string; opm_name?: string; reason?: string; project_status?: string }
type Candidate = { id: string; name: string; qualifiedTags: string[] }
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

const post = <T,>(path: string, json: unknown) => api<T>(path, { method: "POST", json })

function FormSection({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return <section className="inquiry-form-section"><h3>{icon && <Icon name={icon} />}{title}</h3><div>{children}</div></section>
}

function InquiryFields({ details, onChange, illustrated = false }: { details: Details; onChange: (key: string, value: string | number) => void; illustrated?: boolean }) {
  const renderFields = (group: typeof fields[number][]) => group.map(([key, label, type]) => <label key={key}>{label}
        <input type={type} required value={details[key] ?? ""} min={type === "number" ? key === "floor_count" ? 1 : 0.01 : undefined}
          step={type === "number" ? key === "floor_count" ? 1 : "any" : undefined}
          onChange={event => onChange(key,event.target.value)} />
      </label>)
  const types = <fieldset className="inquiry-type-field"><legend>Project type</legend><div className={`inquiry-types ${illustrated ? "illustrated" : ""}`}>
      {projectTypes.map(([type, icon, description, art]) => <label key={type} className={details.project_type === type ? "selected" : ""}>
        <input type="radio" name="project-type" required checked={details.project_type === type} onChange={() => onChange("project_type",type)} />
        {illustrated ? <img src={art} alt="" /> : <Icon name={icon} />}<strong>{type}</strong><span>{description}</span>
      </label>)}
    </div></fieldset>
  return <>
    <FormSection title="Client information" icon={illustrated ? "users" : undefined}><div className="inquiry-fields">{renderFields(fields.slice(0, 3))}</div></FormSection>
    <FormSection title="Project details" icon={illustrated ? "building" : undefined}>
      <div className="inquiry-fields inquiry-location">{renderFields(fields.slice(3, 5))}</div>
      <div className="inquiry-fields inquiry-measurements">{renderFields(fields.slice(5))}</div>
      {!illustrated && types}
    </FormSection>
    {illustrated && <FormSection title="Project type" icon="home">{types}</FormSection>}
  </>
}

function InquiryDetails({ details, includeClient = false }: { details: Details; includeClient?: boolean }) {
  return <dl className="inquiry-fields">
    {[...(includeClient ? fields : fields.slice(3)), ["project_type", "Project type"]].map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>{details[key] || "—"}</dd></div>)}
  </dl>
}

const consultationLabel = (details: Details) => timing.find(([value]) => value === Number(details.consultation))?.[1] || "—"

function requiredAreas(entry?: Phase) {
  return [...new Set([
    ...(entry?.missing_specializations || []),
    ...(entry?.engineers || []).flatMap(person => person.assigned_disciplines),
  ])].sort()
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
    {missing.length > 0 && <p>Still needed: <strong>{missing.join(", ")}</strong></p>}
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
    {!adding && engineers.length < (multi ? 3 : 1) && <button className="button" type="button" disabled={!options(engineers.length).length} onClick={() => setAdding(true)}>Add engineer</button>}
  </section>
}

export default function ProjectInquiries({ role, onReload }: { role: "admin" | "opm"; onReload: () => unknown }) {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [selected, setSelected] = useState("")
  const [dialog, setDialog] = useState<"new" | "route" | "intake">()
  const [step, setStep] = useState(1)
  const [staffingPhase, setStaffingPhase] = useState("")
  const [addingEngineer, setAddingEngineer] = useState(false)
  const [showProject, setShowProject] = useState(false)
  const stepperRef = useRef<HTMLOListElement>(null)
  const [details, setDetails] = useState<Details>({ consultation: 30 })
  const [recommendation, setRecommendation] = useState<Recommendation | null>()
  const [planning, setPlanning] = useState<Planning>()
  const [phases, setPhases] = useState<string[]>([])
  const [team, setTeam] = useState<Phase[]>([])
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [budget, setBudget] = useState("")
  const [reason, setReason] = useState("")
  const [withdrawing, setWithdrawing] = useState(false)
  const [contract, setContract] = useState<File>()
  const [plans, setPlans] = useState<File>()
  const [uploads, setUploads] = useState<{ contract?: string; plans?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const row = rows.find(item => item.id === selected)
  const root = "/projects/inquiries"
  const change = (key: string, value: string | number) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setPlanning(undefined)
    setTeam([])
  }
  const refresh = async () => setRows(await api<Inquiry[]>(root))
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
    setWithdrawing(false)
    setStart("")
    setEnd("")
    setBudget("")
    setContract(undefined)
    setPlans(undefined)
    setUploads({})
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
    await post(`${root}/${selected}/decision`, { action, reason, opm_id: recommendation?.id })
    setWithdrawing(false)
    setRecommendation(undefined)
    await refresh()
    setDialog(undefined)
    void onReload()
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
    const saved = await uploadIntakeDocuments();
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...details, target_start_date: start, target_end_date: end, phases, estimated_budget: budget, contract_file_id: saved.contract })
    setPlanning(result)
    setTeam(result.team || [])
    setStaffingPhase(phases.includes(staffingPhase) ? staffingPhase : phases[0] || "")
    setAddingEngineer(false)
    setStep(3)
  }
  async function uploadIntakeDocuments() {
    const saved = { ...uploads }
    if (!saved.contract && contract) {
      const id = crypto.randomUUID()
      await uploadFile(id, contract)
      saved.contract = id
      setUploads({ ...saved })
    }
    if (!saved.plans && plans) {
      const id = crypto.randomUUID()
      await uploadFile(id, plans)
      saved.plans = id
      setUploads({ ...saved })
    }
    return saved
  }
  async function submit() {
    const saved = await uploadIntakeDocuments()
    await post("/projects/intake", {
      ...details, inquiry_id: selected, suggested_opm_id: row?.opm_id, target_start_date: start,
      target_end_date: end, estimated_budget: budget, contract_file_id: saved.contract,
      plans_file_id: saved.plans, phases, phase_team: phases.map(stage => team.find(item => item.stage === stage)),
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
  return <section className="project-inquiries">
    <header className="inquiries-page-heading"><h1>Project inquiries</h1>
      <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      {role === "admin" && <button className="button primary" disabled={busy} onClick={() => { open(); setDialog("new") }}>New project inquiry</button>}
    </header>
    <div className="inquiry-list">
      {rows.map(item => <button type="button" key={item.id} disabled={busy} aria-pressed={item.id === selected} onClick={() => open(item)}>
        <strong>{item.details.name}</strong><span>{statusLabel(item)}</span>
      </button>)}
      {!rows.length && role === "opm" && <p>No consultation requests.</p>}
    </div>
    {row && <fieldset disabled={busy} className="inquiry-record">
      <h2>{row.details.name}</h2><p>{statusLabel(row)}</p>
      {row.opm_name && <p>Office Project Manager: {row.opm_name}</p>}
      {row.reason && <p>Withdrawal reason: {row.reason}</p>}
      <InquiryDetails details={row.details} includeClient />
      <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
      {role === "admin" && ["draft", "returned"].includes(row.status) && <div>
        <button className="button primary" onClick={() => void run(() => recommend(row.id))}>Find OPM</button>
      </div>}
        {role === "admin" && row.status === "withdrawn" && <button className="button" onClick={() => void run(() => decision("drop"))}>Mark inquiry dropped</button>}
        {role === "opm" && row.status === "offered" && <div className="inquiry-actions">
          <button className="button" onClick={() => void run(() => decision("cancel"))}>Cancel and return to Admin</button>
          <button className="button primary" onClick={() => void run(() => decision("confirm"))}>Confirm consultation</button>
        </div>}
        {role === "opm" && row.status === "consulting" && <>
          <p>Contact the client to discuss the project. Keep the inquiry open while the client considers revised options.</p>
          <div className="inquiry-actions">
            <button className="button" onClick={() => setWithdrawing(true)}>Drop project</button>
            <button className="button primary" onClick={() => void run(async () => { await decision("approve"); setDialog("intake") })}>Proceed to project intake</button>
          </div>
          {withdrawing && <form onSubmit={event => { event.preventDefault(); void run(() => decision("withdraw")) }}>
            <label>Client withdrawal reason<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <button className="button" type="button" onClick={() => setWithdrawing(false)}>Back</button>
            <button className="button primary">Record withdrawal</button>
          </form>}
        </>}

      {role === "opm" && row.status === "approved" && <div><button className="button primary" onClick={() => setDialog("intake")}>Open project intake</button></div>}
    </fieldset>}

    {dialog === "new" && <Modal title="New project inquiry" wide onClose={closeDialog} footer={<>
      <button className="button" disabled={busy} onClick={closeDialog}>Cancel</button>
      <button type="submit" form="new-inquiry-form" className="button primary" disabled={busy}>Create inquiry</button>
    </>}>
      <form id="new-inquiry-form" className="inquiry-dialog-content inquiry-create" onSubmit={event => {
        event.preventDefault()
        void run(async () => {
          const result = await post<Inquiry>(root, details)
          setRows(previous => [result, ...previous.filter(item => item.id !== result.id)])
          open(result)
          await recommend(result.id)
        })
      }}>
        <fieldset disabled={busy} className="inquiry-form-stack">
          <InquiryFields details={details} onChange={change} illustrated />
          <FormSection title="Consultation" icon="calendar"><label className="inquiry-consultation-field">Preferred consultation timing
            <select value={details.consultation} onChange={event => change("consultation", Number(event.target.value))}>
              {timing.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label></FormSection>
        </fieldset>
        {feedback}
      </form>
    </Modal>}

    {dialog === "route" && row && <Modal title="Route inquiry" onClose={closeDialog} footer={<>
      <button className="button" disabled={busy} onClick={closeDialog}>Cancel</button>
      {recommendation && <button className="button primary" disabled={busy} onClick={() => void run(() => decision("send"))}>Send consultation request</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-routing">
        <dl className="inquiry-route-summary">
          <div><dt>Project</dt><dd>{row.details.name}</dd><span className="inquiry-pill">{statusLabel(row)}</span></div>
          <div><dt>Client</dt><dd>{row.details.client_name}</dd></div>
          <div><dt>Project type</dt><dd>{row.details.project_type}</dd></div>
          <div><dt>Consultation</dt><dd>{consultationLabel(row.details)}</dd></div>
        </dl>
        <div className="inquiry-disclosure">
          <button type="button" aria-expanded={showProject} aria-controls="route-project-details" onClick={() => setShowProject(previous => !previous)}>
            {showProject ? "Hide project details" : "View project details"} <span aria-hidden="true">{showProject ? "⌃" : "⌄"}</span>
          </button>
          <div id="route-project-details" hidden={!showProject}><InquiryDetails details={row.details} /></div>
        </div>
        <section><h3>System-matched OPM</h3>
          {recommendation ? <div className="inquiry-card inquiry-match">
            <div><h4>{recommendation.full_name}</h4><p>Office Project Manager</p>
              <span className={`inquiry-pill ${recommendation.availability === "available" ? "ready" : ""}`}>{recommendation.availability || "Availability unknown"}</span>
            </div>
            <ul><li>{row.details.project_type} specialization</li>
              <li>{recommendation.experience_years ?? 0} years of relevant experience</li>
              <li>{recommendation.active_projects ?? 0} active projects</li>
            </ul>
          </div> : <p>No eligible Office Project Manager is currently available.</p>}
        </section>
        {feedback}
      </div>
    </Modal>}

    {dialog === "intake" && row?.status === "approved" && <Modal title="Project intake" subtitle={String(details.name || row.details.name || "")} wide onClose={closeDialog} footer={<>
      <button type="button" className="button" disabled={busy} onClick={step === 1 ? closeDialog : () => setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button>
      {step === 1 && <button type="submit" form="inquiry-intake-form" className="button primary" disabled={busy}>Review project size and phases</button>}
      {step === 2 && <button className="button primary" disabled={busy || !canAllocate} onClick={() => {
        if (planning?.candidates) setStep(3)
        else void run(allocate)
      }}>Continue to staffing</button>}
      {step === 3 && <button className="button primary" disabled={busy || !canSend} onClick={() => void run(submit)}>Send assignment offers</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-intake">
        <ol ref={stepperRef} className="inquiry-stepper" aria-label="Project intake steps">
          {["Intake details", "Size & phases", "Staffing"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>
            <span aria-hidden="true">{index + 1}</span>{label}
          </li>)}
        </ol>
        <form id="inquiry-intake-form" hidden={step !== 1} onSubmit={event => {
          if (planning) { event.preventDefault(); setStep(2) }
          else void intakePreview(event)
        }}>
          <fieldset disabled={busy || step !== 1} className="inquiry-form-stack">
            <InquiryFields details={details} onChange={change} />
            <FormSection title="Schedule & budget"><div className="inquiry-fields">
              <label>Target start date<input type="date" required value={start} onChange={event => { setStart(event.target.value); setPlanning(undefined); setTeam([]) }} /></label>
              <label>Overall end date<input type="date" min={start} value={end} onChange={event => { setEnd(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
              <label>Estimated budget (₱)<input type="number" min="0.01" step="0.01" required value={budget} onChange={event => { setBudget(event.target.value); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})) }} /></label>
            </div></FormSection>
            <FormSection title="Documents"><div className="inquiry-fields">
              <label>Signed Client Contract Agreement<input type="file" accept=".pdf,.png,.jpg,.jpeg" required={!contract} onChange={event => { setContract(event.target.files?.[0]); setTeam([]); setPlanning(previous => previous && ({...previous,candidates:undefined})); setUploads(previous => ({...previous,contract:undefined})) }} />{contract && <small>{contract.name}</small>}</label>
              <label>Registered plans<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => { setPlans(event.target.files?.[0]); setUploads(previous => ({...previous,plans:undefined})) }} />{plans && <small>{plans.name}</small>}</label>
            </div></FormSection>
          </fieldset>
        </form>
        {step === 2 && planning && <fieldset className="inquiry-review" disabled={busy}>
          <aside className="inquiry-summary-card">
            <h3>Inquiry summary</h3>
            <span className="inquiry-pill">{statusLabel(row)}</span>
            <dl>
              <div><dt>Client</dt><dd>{details.client_name}</dd></div>
              <div><dt>Project type</dt><dd>{details.project_type}</dd></div>
              <div><dt>Project address</dt><dd>{details.address}</dd></div>
              <div><dt>Total floor area (m²)</dt><dd>{details.floor_area_sqm}</dd></div>
              <div><dt>Number of floors</dt><dd>{details.floor_count}</dd></div>
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
  </section>
}
