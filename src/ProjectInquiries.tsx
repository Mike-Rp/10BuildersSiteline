import { useEffect, useRef, useState, type ReactNode } from "react"
import { api } from "./api/client"
import { uploadFile } from "./api/actions"
import { Icon, Modal } from "./ui"
import { ListPager, runList, updateListQuery, useListMemory } from "./ListControls"
import { withPage } from "./listing"
import { IntakeTabs } from "./IntakeGuidance"
import type { IntakeView } from "./intake-guidance"
import { phaseCoverageQuota } from "./phase-coverage-policy"
import { matchingInquiryTags, selectInquiryLead } from "../Thesis-Backend/src/domain/inquiry-lead.js"
import OfficeInquiryWorkflow, { type OfficePage, type OfficeRecord } from "./OfficeInquiryWorkflow"
import "./project-inquiries.css"

const projectTypes = [
  ["Residential", "home", "Houses, condominiums, apartments, and residential buildings."],
  ["Commercial", "storefront", "Offices, retail spaces, hotels, and business establishments."],
  ["Mixed-Use", "mixed-building", "Developments combining residential and commercial spaces."],
] as const
const fields = [
  ["client_name", "Client name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["name", "Project name", "text"], ["address", "Project address", "text"],
  ["land_area", "Land area (m²)", "number"], ["lot_area", "Lot area (m²)", "number"],
  ["floor_area_sqm", "Total floor area (m²)", "number"], ["floor_count", "Number of floors", "number"],
] as const
type Details = Record<string, string | number>
type RoutingEvent = { kind: "offered" | "declined" | "accepted" | "no_match"; opm?: string; at?: string }
type Inquiry = OfficeRecord & { id: string; routing_history?: RoutingEvent[]; created_at?: string; updated_at?: string; opm_id?: string; reason?: string; project_status?: string; target_start_date?: string; target_end_date?: string }
type Candidate = { id: string; name: string; qualifiedTags: string[]; experienceYears?: number }
type Engineer = { user_id: string; assigned_disciplines: string[] }
type Phase = { stage: string; user_id: string | null; assigned_disciplines?: string[]; engineers?: Engineer[]; missing_specializations?: string[] }
type CandidateBlocker = "qualifications" | "schedule" | "commitments" | "phase_disciplines" | "availability"
type Planning = { phases: string[]; estimate: { size: string | null; end: string | null }; team?: Phase[]; candidates?: Record<string, Candidate[]>; candidateBlockers?: Record<string, CandidateBlocker>;
  staffing?: {assessment_id:string; phases:string[]; contract_file_id:string} }
const timing = [[30, "30 minutes"], [60, "1 hour"], [1440, "1 day"]] as const
const classifications = ["Normal", "Priority", "Urgent"]
const statuses: Record<string,string> = {
  draft: "Ready for routing", offered: "Awaiting OPM response", returned: "Returned to Admin",
  consulting: "Awaiting client decision", approved: "Ready for project intake", withdrawn: "Client withdrew",
  dropped: "Dropped", converted: "Project intake complete",
}

const statusLabel = (row: Inquiry) => row.project_status === "spm_review" ? "Staffing in progress" : statuses[row.status]
const officeActions = {
  offered: { label: "Review pending inquiry", bucket: "action" },
  consulting: { label: "View accepted inquiry", bucket: "waiting" },
  approved: { label: "Continue project assessment", bucket: "action" },
} as const
const officeAction = (status: string) => Object.prototype.hasOwnProperty.call(officeActions, status)
  ? officeActions[status as keyof typeof officeActions] : undefined
const inquiryDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "Asia/Manila" })
const inquiryDay = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" })

const post = <T,>(path: string, json: unknown) => api<T>(path, { method: "POST", json })
const adminInquiryDraft = { consultation: 30, classification: "Normal", immediate_consultation: "yes" }

function inquiryReference(row: Inquiry) {
  return `10BL-${row.created_at?.slice(0, 4) || row.updated_at?.slice(0, 4) || inquiryDay.format(new Date()).slice(0, 4)}-${row.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`
}

function adminInquiryStatus(row: Inquiry) {
  if (row.status === "draft") return row.routing_history?.at(-1)?.kind === "no_match" ? "No eligible OPM" : "Saved for later"
  return statusLabel(row) || "Status unavailable"
}

const adminInquiryActions: Record<string, string> = {
  "Saved for later": "Start automatic matching",
  "No eligible OPM": "Retry automatic matching",
  "Returned to Admin": "Retry automatic matching",
  "Client withdrew": "Mark inquiry dropped",
}

const inquiryWaiting: Record<string, string> = {
  offered: "Waiting for Office PM response",
  consulting: "Waiting for the client’s decision",
  approved: "Waiting for project intake",
}

const adminInquiryListKey = "admin:inquiry-log"
const adminInquiryListConfig = { searchText: (item: Inquiry) => String(item.details.name ?? "") }
function resetInquiryPage() {
  updateListQuery(adminInquiryListKey, query => withPage(query, 1))
}

const inquiryMilestones = ["Inquiry submitted", "Office PM review", "Client proposal", "Project assessment", "Project intake"]

function inquiryMilestone(item: Inquiry) {
  switch (item.status) {
    case "draft": return 0
    case "offered":
    case "returned": return 1
    case "consulting": return 2
    case "approved": return item.workflow?.assessment || item.project_status === "spm_review" ? 4 : 3
    default: return null
  }
}

function FormSection({ title, icon, description, children }: { title: string; icon?: string; description?: string; children: ReactNode }) {
  return <section className="inquiry-form-section">
    {icon ? <header className="inquiry-section-heading">
      <span className="inquiry-list-icon"><Icon name={icon} /></span>
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
    </header> : <h3>{title}</h3>}
    <div>{children}</div>
  </section>
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

function AdminInquirySummary({ row }: { row: Inquiry }) {
  const { details } = row
  const area = (value: string | number) => value ? `${Number(value).toLocaleString("en-PH")} m²` : "Not provided"
  const date = (value?: string | number) => typeof value === "string" && Number.isFinite(Date.parse(value))
    ? inquiryDate.format(new Date(value)) : "To be determined by Office PM"
  const values = [
    ["Client", details.client_name], ["Contact", details.phone], ["Email", details.email],
    ["Project type", details.project_type], ["Land area", area(details.land_area)], ["Lot area", area(details.lot_area)],
    ["Total floor area", area(details.floor_area_sqm)], ["Number of floors", details.floor_count], ["Location", details.address],
    ["Estimated start", date(row.target_start_date || details.anticipated_start)],
    ["Potential completion", date(row.target_end_date)],
    ["Inquiry classification", details.classification || "—"],
  ]
  return <dl className="admin-inquiry-summary-grid">
    {values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>
}

function AdminInquiryHistory({ row }: { row: Inquiry }) {
  const history = row.routing_history ?? []
  const labels: Record<RoutingEvent["kind"], (name?: string) => string> = {
    offered: name => `Consultation request sent to ${name || "the matched OPM"}`,
    declined: name => `${name || "The assigned OPM"} declined the request`,
    accepted: name => `${name || "The assigned OPM"} accepted the request`,
    no_match: () => "No eligible OPM found",
  }
  return <section className="inquiry-card admin-inquiry-history">
    <h2>Automated assignment history</h2>
    <ol>
      <li><span className="admin-history-icon"><Icon name="check" size={17} /></span><div><strong>Inquiry submitted</strong>
        {row.created_at && <time dateTime={row.created_at}>{inquiryDate.format(new Date(row.created_at))}</time>}
      </div></li>
      {history.map((event, index) => <li key={index}>
        <span className={`admin-history-icon ${event.kind === "accepted" ? "" : "pending"}`}><Icon name={event.kind === "accepted" ? "check" : "clock"} size={17} /></span>
        <div><strong>{labels[event.kind](event.opm)}</strong>
          {event.at && <time dateTime={event.at}>{inquiryDate.format(new Date(event.at))}</time>}
        </div>
      </li>)}
      {!history.length && row.opm_name && <li><span className="admin-history-icon pending"><Icon name="clock" size={17} /></span>
        <div><strong>{row.opm_name}</strong><p>{adminInquiryStatus(row)}</p></div>
      </li>}
    </ol>
  </section>
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
  const eligibleTagsFor = (stage: string, id: string) => candidates[stage]?.find(person => person.id === id)?.qualifiedTags ?? []
  const lead = selectInquiryLead(phases, team, experience, eligibleTagsFor)
  const years = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2, style: "unit", unit: "year", unitDisplay: "long" })
  return <section className="inquiry-card inquiry-lineup">
    <h3>Staffing lineup</h3>
    <div className="inquiry-lineup-lead">
      {lead ? <>
        <strong>Proposed Lead SPM · {people.get(lead.id)?.name || "Site PM"}</strong>
        <p>{lead.stage} · {years.format(lead.years)} of relevant experience</p>
        <p><span className="inquiry-pill ready">Phase requirement matched</span> {lead.tags.join(", ")}</p>
      </> : <p>Assign an eligible Site PM with a matching phase qualification to propose a Lead.</p>}
    </div>
    <div className="inquiry-lineup-table">
      <table>
        <thead><tr><th scope="col">Phase</th><th scope="col">Assigned Site PM</th><th scope="col">Relevant experience</th><th scope="col">Phase qualification</th><th scope="col">Designation</th></tr></thead>
        <tbody>{phases.flatMap(stage => {
          const entry = team.find(item => item.stage === stage)
          const assigned = entry?.engineers ?? (entry?.user_id ? [{ user_id: entry.user_id, assigned_disciplines: entry.assigned_disciplines }] : [])
          if (!assigned.length) return <tr key={stage}><td>{stage}</td><td colSpan={4}>Unfilled</td></tr>
          return assigned.map(({ user_id: id, assigned_disciplines }) => {
            const isLead = lead?.id === id && lead.stage === stage
            const designation = entry?.user_id === id && lead?.stage !== stage ? "Phase coordinator" : "Phase SPM"
            const tags = matchingInquiryTags(assigned_disciplines, eligibleTagsFor(stage, id))
            return <tr key={`${stage}:${id}`} data-lead={isLead}>
              <td>{stage}</td><td>{people.get(id)?.name || "Site PM"}</td>
              <td>{years.format(experience.get(id) ?? 0)}</td>
              <td>{tags.length ? <><span className="inquiry-pill ready">Matched</span> {tags.join(", ")}</> : <span className="inquiry-pill pending">Matching tag needed</span>}</td>
              <td>{isLead ? <strong className="inquiry-pill">Lead SPM</strong> : designation}</td>
            </tr>
          })
        })}</tbody>
      </table>
    </div>
    <p className="inquiry-muted">Qualified assignments are ranked by relevant project-type experience. Ties use phase order, then account ID. The Lead accepts first and manages subcontractor allocation once the project is ready.</p>
  </section>
}

function StaffingCards({ stage, entry, suggested, choices, blocker, adding, setAdding, onChange, onRecheck }: {
  stage: string
  entry?: Phase
  suggested?: Phase
  choices: Candidate[]
  blocker?: CandidateBlocker
  adding: boolean
  setAdding: (value: boolean) => void
  onChange: (entry: Phase) => void
  onRecheck: () => void
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
  const addOptions = options(engineers.length)
  const atLimit = engineers.length >= (multi ? 3 : 1)
  const noEligibleMessage = {
    phase_disciplines: "This phase has no configured discipline requirements. Ask Admin to review its project-type setup.",
    availability: "The qualified Site PMs already have assignments. Recheck after an assignment ends.",
    qualifications: "No available Site PM meets the account, verified license, and discipline requirements for this phase. Ask Admin to review the required discipline and credentials.",
    schedule: "The matching Site PMs have conflicting assignments during the current project dates. Review the schedule or recheck after availability changes.",
    commitments: "The matching Site PMs have unfinished commitments or no available qualifying scope for this phase.",
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
      {!adding && !atLimit && <button className="button inquiry-add-engineer" type="button" disabled={!addOptions.length}
        aria-describedby={addOptions.length ? undefined : "inquiry-add-engineer-help"}
        onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add engineer</button>}
    </div>
    {!engineers.length && <p>Unfilled</p>}
    {!atLimit && !addOptions.length && <div id="inquiry-add-engineer-help" className="inquiry-candidate-help">
      <p>{choices.length
        ? "No additional Site PM is eligible for an uncovered responsibility in this phase."
        : blocker ? noEligibleMessage[blocker] : "No eligible Site PM is available for this phase."}</p>
      {missing.length > 0 && <p>Uncovered: <strong>{missing.join(", ")}</strong></p>}
      {!choices.length && <button className="button" type="button" onClick={onRecheck}>Recheck eligibility</button>}
    </div>}
    <div className="inquiry-engineers">
      {engineers.map((person, index) => {
        const assigned = choices.find(candidate => candidate.id === person.user_id)
        const replacements = options(index)
        return <article className="inquiry-card" key={person.user_id}>
          <label>Assigned Site PM<select value={person.user_id} onChange={event => assign(index, event.target.value)}>
            {!replacements.some(option => option.id === person.user_id) && <option value={person.user_id}>{assigned?.name || "Site PM"}</option>}
            {replacements.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <p className="inquiry-muted">{assigned ? `Site PM${assigned.qualifiedTags.length ? ` · ${assigned.qualifiedTags.join(", ")}` : ""}` : "This assignment is no longer eligible. Replace or remove it before sending offers."}</p>
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
        <select autoFocus value="" onChange={event => assign(engineers.length, event.target.value)}>
          <option value="">Select an eligible SPM</option>
          {addOptions.map(option => <option key={option.id} value={option.id}>{option.name} · {option.tags.join(", ")}</option>)}
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
  const [dialog, setDialog] = useState<"intake" | "details">()
  const [officePage, setOfficePage] = useState<OfficePage>()
  const [adminPage, setAdminPage] = useState<"list" | "new" | "submitted" | "tracking">("list")
  const [adminInquiryTab, setAdminInquiryTab] = useState<"current" | "history">("current")
  const [adminInquiryFilter, setAdminInquiryFilter] = useState<"all" | "action" | "waiting">("all")
  const [adminInquiryStatusFilter, setAdminInquiryStatusFilter] = useState("")
  const [adminInquiryTypeFilter, setAdminInquiryTypeFilter] = useState("")
  useListMemory()
  const [step, setStep] = useState(2)
  const [staffingPhase, setStaffingPhase] = useState("")
  const [addingEngineer, setAddingEngineer] = useState(false)
  const stepperRef = useRef<HTMLOListElement>(null)
  const [details, setDetails] = useState<Details>({ consultation: 30 })
  const [planning, setPlanning] = useState<Planning>()
  const [phases, setPhases] = useState<string[]>([])
  const [team, setTeam] = useState<Phase[]>([])
  const [contract, setContract] = useState<File>()
  const [contractPreview, setContractPreview] = useState("")
  const [contractFileId, setContractFileId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const row = rows?.find(item => item.id === selected)
  const start = row?.workflow?.review?.start
  const end = row?.workflow?.review?.end
  const budget = row?.workflow?.budget
  const staffingInput = {
    ...row?.details, target_start_date: start, target_end_date: end,
    estimated_budget: budget, assessment_id: row?.workflow?.assessment?.id,
  }
  const root = "/projects/inquiries"
  const change = (key: string, value: string | number) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setPlanning(undefined)
    setTeam([])
  }
  const refresh = async () => setRows(await api<Inquiry[]>(root))
  useEffect(() => {
    if (adminPage !== "list") recordHeading.current?.focus()
  }, [adminPage])
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
    setPlanning(undefined)
    setTeam([])
    setPhases([])
    setContract(undefined)
    setContractFileId(undefined)
    setError("")
    setStep(2)
    setAddingEngineer(false)
    setDialog(undefined)
  }
  function closeDialog() {
    if (busy) return
    setDialog(undefined)
    setError("")
  }
  function updateInquiry(updated: Inquiry) {
    setRows(previous => previous?.map(item => item.id === updated.id ? { ...item, ...updated } : item))
  }
  function navigateOffice(page?: OfficePage) {
    setError("")
    setOfficePage(page)
  }
  async function decision(action: string, input?: Record<string, string>) {
    const updated = await post<Inquiry>(`${root}/${selected}/decision`, { action, ...input })
    if (action === "cancel") {
      setRows(previous => previous?.filter(item => item.id !== selected))
      navigateOffice()
    } else {
      updateInquiry(updated)
      if (action === "confirm") navigateOffice("received")
      if (action === "approve") navigateOffice("review")
      if (action === "withdraw") {
        navigateOffice()
        setDialog("details")
      }
    }
    void onReload()
  }
  async function saveWorkflow(action: string, input: Record<string, unknown>) {
    const updated = await post<Inquiry>(`${root}/${selected}/workflow`, { action, version: row?.workflow?.review?.version ?? 0, ...input })
    updateInquiry(updated)
    if (updated.workflow?.assessment?.id !== row?.workflow?.assessment?.id || action === "review") {
      setPlanning(undefined)
      setPhases([])
      setTeam([])
    }
  }
  function openOfficeInquiry(item: Inquiry) {
    open(item)
    if (item.status === "offered") navigateOffice("pending")
    else if (item.status === "consulting") navigateOffice("accepted")
    else if (item.status === "approved") navigateOffice(item.workflow?.assessment ? "assessment" : "review")
    else setDialog("details")
  }
  async function startStaffing() {
    if (!planning) {
      const result = await post<Planning>(`${root}/${selected}/planning`, staffingInput)
      setPlanning(result)
      setPhases(result.staffing?.phases ?? result.phases)
      setContractFileId(result.staffing?.contract_file_id)
    }
    setStep(2)
    setDialog("intake")
  }
  async function allocate(recheck = false) {
    const fileId = await uploadIntakeContract()
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...staffingInput, phases, contract_file_id: fileId })
    setPlanning(result)
    if (!recheck) setTeam(result.team || [])
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
      ...staffingInput, inquiry_id: selected, suggested_opm_id: row?.opm_id, contract_file_id: fileId,
      phases, phase_team: phases.map(stage => team.find(item => item.stage === stage)),
    })
    await refresh()
    setDialog(undefined)
    navigateOffice()
    void onReload()
  }
  const canAllocate = !!(contract || contractFileId) && !!row?.workflow?.assessment && phases.length > 0
  const canSend = canAllocate && phases.every(stage => {
    const entry = team.find(item => item.stage === stage)
    if (!entry?.user_id) return false
    const choices = planning?.candidates?.[stage] ?? []
    const assigned = entry.engineers ?? [entry]
    if (assigned.some(person => !matchingInquiryTags(
      person.assigned_disciplines, choices.find(candidate => candidate.id === person.user_id)?.qualifiedTags ?? [],
    ).length)) return false
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
    [item.details.name, item.details.client_name, admin ? adminInquiryStatus(item) : statusLabel(item),
      admin ? inquiryReference(item) : ""]
      .some(value => String(value ?? "").toLowerCase().includes(query))
  const visibleRows = rows?.filter(matchesSearch)
  const adminHistory = (rows ?? []).filter(item => ["converted", "dropped"].includes(item.status))
  const adminCurrent = (rows ?? []).filter(item => !["converted", "dropped"].includes(item.status))
  const adminActionCount = adminCurrent.filter(item => adminInquiryActions[adminInquiryStatus(item)]).length
  const adminWaitingCount = adminCurrent.filter(item => inquiryWaiting[item.status]).length
  const adminTabRows = adminInquiryTab === "history" ? adminHistory : adminCurrent
  const adminStatuses = [...new Set([...adminTabRows.map(adminInquiryStatus), adminInquiryStatusFilter].filter(Boolean))].sort()
  const adminVisibleRows = adminTabRows.filter(item =>
    adminInquiryTab === "history" ||
    adminInquiryFilter === "all" ||
    (adminInquiryFilter === "action" ? adminInquiryActions[adminInquiryStatus(item)] : inquiryWaiting[item.status])
  ).filter(item => matchesSearch(item) &&
    (!adminInquiryStatusFilter || adminInquiryStatus(item) === adminInquiryStatusFilter) &&
    (!adminInquiryTypeFilter || item.details.project_type === adminInquiryTypeFilter))
  const adminList = runList(adminInquiryListKey, adminVisibleRows, adminInquiryListConfig)
  function changeAdminInquiryTab(tab: typeof adminInquiryTab) {
    setAdminInquiryTab(tab)
    setAdminInquiryStatusFilter("")
    resetInquiryPage()
  }
  function changeAdminInquiryFilter(filter: typeof adminInquiryFilter) {
    setAdminInquiryFilter(filter)
    resetInquiryPage()
  }
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
  function renderAdminInquiryForm() {
    const input = (key: string, label: string, type = "text", required = true, maxLength?: number) =>
      <label><span>{label}{required && <span className="inquiry-required"> *</span>}</span>
        <input type={type} value={details[key] ?? ""} required={required} maxLength={maxLength}
          inputMode={key === "phone" ? "numeric" : undefined}
          pattern={key === "phone" ? "09[0-9]{0,9}" : key === "email" ? "[^@]+@[gG][mM][aA][iI][lL]\\.[cC][oO][mM]" : undefined}
          title={key === "phone" ? "Enter up to 11 digits starting with 09." : key === "email" ? "Use an @gmail.com address." : undefined}
          min={type === "number" ? key === "floor_count" ? 1 : 0.01 : undefined}
          max={key === "floor_count" ? 32767 : undefined}
          step={type === "number" ? key === "floor_count" ? 1 : "any" : undefined}
          placeholder={required ? undefined : "Optional"} onChange={event => change(key, event.target.value)} />
      </label>
    function close() {
      if (busy) return
      setError("")
      setAdminPage("list")
    }
    return <Modal title="Submit a project inquiry" wide onClose={close} footer={<>
      <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
      <button type="submit" form="admin-inquiry-form" className="button primary" disabled={busy}>Submit Project Inquiry</button>
    </>}>
      <form id="admin-inquiry-form" className="admin-inquiry-submission" onSubmit={event => {
        event.preventDefault()
        if (busy) return
        void run(async () => {
          const result = await post<Inquiry>(root, details)
          setRows(previous => [result, ...(previous ?? []).filter(item => item.id !== result.id)])
          setSelected(result.id)
          setSearch("")
          setAdminPage("submitted")
          void onReload()
        })
      }}>
        <fieldset disabled={busy} className="inquiry-form-stack">
          <FormSection title="Client information" icon="users" description="Required contact details for the project inquiry.">
            <div className="admin-inquiry-form-grid">
              {input("client_name", "Client name", "text", true, 150)}
              {input("phone", "Contact number", "tel", true, 11)}
              {input("email", "Email address", "email", true, 150)}
            </div>
          </FormSection>
          <FormSection title="Project information" icon="building" description="Measurements use square meters (m²).">
            <div className="admin-inquiry-project-identity">
              {input("name", "Project name", "text", true, 150)}
              {input("address", "Project address / location", "text", true, 500)}
            </div>
            <fieldset className="admin-inquiry-project-types">
              <legend>Project type <span className="inquiry-required">*</span></legend>
              <div className="project-type-options">
                {projectTypes.map(([type, icon, description]) => <label key={type}
                  className={`button project-type-card${details.project_type === type ? " selected" : ""}`}>
                  <input className="sr-only" type="radio" name="inquiry-project-type" value={type} required
                    checked={details.project_type === type} onChange={() => change("project_type", type)} />
                  <span className="project-type-icon"><Icon name={icon} size={24} /></span>
                  <span className="project-type-copy"><strong>{type}</strong><span>{description}</span></span>
                </label>)}
              </div>
            </fieldset>
            <div className="admin-inquiry-form-grid admin-inquiry-measurements">
              {input("land_area", "Land area (m²)", "number", false)}
              {input("lot_area", "Lot area (m²)", "number")}
              {input("floor_area_sqm", "Total floor area (m²)", "number")}
              {input("floor_count", "Number of floors", "number")}
            </div>
          </FormSection>
          <FormSection title="OPM consultation request" icon="users" description="Classify the inquiry and record whether the client wants immediate contact.">
            <div className="admin-inquiry-consultation">
              <fieldset className="admin-inquiry-preference">
                <legend>Does the client wish to speak with an OPM right away? <span className="inquiry-required">*</span></legend>
                {(["yes", "no"] as const).map(value => <label key={value}>
                  <input type="radio" name="immediate-consultation" required checked={details.immediate_consultation === value} onChange={() => change("immediate_consultation", value)} />
                  {value === "yes" ? "Yes" : "No"}
                </label>)}
              </fieldset>
              <label><span>Inquiry classification<span className="inquiry-required"> *</span></span>
                <select required value={details.classification} onChange={event => change("classification", event.target.value)}>
                  {classifications.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
          </FormSection>
        </fieldset>
        {feedback}
      </form>
    </Modal>
  }
  if (admin && row && (adminPage === "submitted" || adminPage === "tracking")) {
    const submitted = adminPage === "submitted"
    const status = adminInquiryStatus(row)
    return <section className="project-inquiries admin-inquiries admin-inquiry-page">
      <header className="inquiries-page-heading">
        <div><h1 ref={recordHeading} tabIndex={-1}>{submitted ? "Inquiry submitted" : "Inquiry tracking"}</h1>
          <p>{submitted
            ? row.status === "offered" ? "The system generated a reference and sent the consultation request."
              : status === "No eligible OPM" ? "The inquiry was saved. No eligible Office PM was available for matching."
                : "The inquiry was saved for later consultation."
            : "Monitor matching and acceptance for this inquiry."}</p>
        </div>
        {submitted ? <button className="button" onClick={() => setAdminPage("tracking")}>View inquiry status</button> : <>
          <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
          <button className="button" disabled={busy} onClick={() => { setError(""); setAdminPage("list") }}>Back to inquiries</button>
        </>}
      </header>
      {submitted && <div className="admin-inquiry-success" role="status">
        <span className="admin-history-icon"><Icon name="check" /></span>
        <div><strong>Saved successfully</strong><h2>{row.details.name}</h2><p>Reference {inquiryReference(row)}</p></div>
        <span className={`inquiry-pill ${status === "No eligible OPM" ? "pending" : "ready"}`}>{status}</span>
      </div>}
      <div className={submitted ? "" : "admin-inquiry-tracking-grid"}>
        <section className="inquiry-card admin-inquiry-tracking-summary">
          {!submitted && <header><div><p>{inquiryReference(row)}</p><h2>{row.details.name}</h2></div><span className="inquiry-pill">{status}</span></header>}
          <AdminInquirySummary row={row} />
          {!submitted && row.reason && <p>Withdrawal reason: {row.reason}</p>}
          {!submitted && row.details.client_decision_date && <p>Client decision confirmed on {row.details.client_decision_date}</p>}
          {!submitted && row.details.client_decision_note && <p className="inquiry-overview">Internal decision note: {row.details.client_decision_note}</p>}
        </section>
        {!submitted && <AdminInquiryHistory row={row} />}
      </div>
      {!submitted && ["draft", "returned"].includes(row.status) && <div>
        <button className="button primary" disabled={busy} onClick={() => void run(async () => {
          const updated = await post<Inquiry>(`${root}/${row.id}/match`, {})
          setRows(previous => [ { ...row, ...updated }, ...(previous ?? []).filter(item => item.id !== row.id) ])
          void onReload()
        })}>{status === "Saved for later" ? "Start automatic matching" : "Retry automatic matching"}</button>
      </div>}
      {!submitted && row.status === "withdrawn" && <div><button className="button" disabled={busy} onClick={() => void run(() => decision("drop"))}>Mark inquiry dropped</button></div>}
      {feedback}
    </section>
  }
  return <section className={`project-inquiries ${admin ? "admin-inquiries" : "opm-inquiries"}`}>
    {officePage && row && !admin
      ? <OfficeInquiryWorkflow key={`${row.id}:${officePage}`} row={row} page={officePage} reference={inquiryReference(row)}
          consultation={consultationLabel(row.details)} busy={busy} error={dialog ? "" : error}
          pendingCount={rows?.filter(item => item.status === "offered").length ?? 0}
          navigate={navigateOffice} back={() => navigateOffice()} startStaffing={() => void run(startStaffing)}
          decide={(action, input) => void run(() => decision(action, input))}
          save={(action, input) => void run(() => saveWorkflow(action, input))} />
      : <>
    <header className="inquiries-page-heading">
      <div><h1>Project inquiries</h1>
        {admin && <p>Review saved inquiries or start a new project request.</p>}
      </div>
      <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      {admin && <button className="button primary" disabled={busy} onClick={() => { open(); setDetails(adminInquiryDraft); setAdminPage("new") }}><Icon name="plus" size={17} />New project inquiry</button>}
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
          <tbody>{queueRows.map(item => {
            const label = item.status === "approved" && !item.workflow?.budget
              ? "Review project information" : officeAction(item.status)?.label ?? "View inquiry"
            return <tr key={item.id}>
            <th scope="row">{item.details.name || "Untitled project"}<small>{item.details.project_type || "Project type unavailable"}</small></th>
            <td><span className="inquiry-list-status" data-status={item.status}>{statusLabel(item) || "Status unavailable"}</span></td>
            <td><button type="button" className="button" disabled={busy} onClick={() => openOfficeInquiry(item)}
              aria-label={`${label} for ${item.details.name || "Untitled project"}`}>
              {label} <Icon name="chevron" size={16} />
            </button></td>
          </tr>})}</tbody>
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
          <h2 id="existing-inquiries-heading">Project Inquiry Log</h2>
          {rows && <p>{adminCurrent.length} current inquiries · {adminHistory.length} closed inquiries</p>}
        </div>
      </div>
      <div className="intake-tabs" role="group" aria-label="Inquiry records">
        <button type="button" aria-pressed={adminInquiryTab === "current"} onClick={() => changeAdminInquiryTab("current")}>Current inquiries ({adminCurrent.length})</button>
        <button type="button" aria-pressed={adminInquiryTab === "history"} onClick={() => changeAdminInquiryTab("history")}>Inquiry history ({adminHistory.length})</button>
      </div>
      {adminInquiryTab === "current" && <IntakeTabs value={adminInquiryFilter}
        counts={{ all: adminCurrent.length, action: adminActionCount, waiting: adminWaitingCount }}
        onChange={changeAdminInquiryFilter} allLabel="All inquiries"
        help="Needs your action shows inquiries you can route, retry, or close. Waiting for others shows inquiries awaiting an Office PM, client decision, or project intake." />}
      <div className="inquiry-log-filters">
        <div className="inquiry-list-search">
          <Icon name="search" size={17} />
          <input type="search" aria-label="Search inquiries" placeholder="Search inquiries" value={search} onChange={event => {
            setSearch(event.target.value)
            resetInquiryPage()
          }} />
        </div>
        <label>Status<select value={adminInquiryStatusFilter} onChange={event => {
          setAdminInquiryStatusFilter(event.target.value)
          resetInquiryPage()
        }}>
          <option value="">All statuses</option>
          {adminStatuses.map(status => <option key={status}>{status}</option>)}
        </select></label>
        <label>Project type<select value={adminInquiryTypeFilter} onChange={event => {
          setAdminInquiryTypeFilter(event.target.value)
          resetInquiryPage()
        }}>
          <option value="">All types</option>
          {projectTypes.map(([type]) => <option key={type}>{type}</option>)}
        </select></label>
      </div>
      {rows && <p className="list-count inquiry-log-count" role="status">{adminList.count} {adminList.count === 1 ? "inquiry" : "inquiries"}</p>}
      {adminVisibleRows.length ? <ul className="inquiry-log-cards">
        {adminList.view.items.map(item => {
          const name = item.details.name || "Untitled project"
          const status = adminInquiryStatus(item)
          const updated = item.updated_at && Number.isFinite(Date.parse(item.updated_at)) ? item.updated_at : undefined
          const updatedLabel = updated ? inquiryDate.format(new Date(updated)) : ""
          const nextAction = adminInquiryActions[status]
          const waiting = inquiryWaiting[item.status]
          const milestone = inquiryMilestone(item)
          return <li key={item.id} className="inquiry-log-card">
            <div className="inquiry-log-card-header">
              <div className="inquiry-list-name"><h3>{name}</h3>
                <small>{[item.details.client_name, item.details.project_type, inquiryReference(item)].filter(Boolean).join(" · ")}</small>
              </div>
              <span className="inquiry-list-status" data-status={item.status}>{status}</span>
            </div>
            {milestone !== null && <ol className="inquiry-log-progress" aria-label="Inquiry progress">
              {inquiryMilestones.map((label, index) => <li key={label}
                data-complete={index < milestone} aria-current={index === milestone ? "step" : undefined}>
                <span aria-hidden="true">{index < milestone ? "✓" : ""}</span>{label}
              </li>)}
            </ol>}
            <div className="inquiry-log-footer">
              <div>
                {adminInquiryTab === "current" && (nextAction || waiting) && <p>{nextAction || waiting}</p>}
                {updated && <small>Updated <time dateTime={updated}>{updatedLabel}</time></small>}
              </div>
              <button type="button" className="button primary" disabled={busy} aria-label={`View inquiry for ${name}`}
                onClick={() => { open(item); setAdminPage("tracking") }}>
                View inquiry <Icon name="chevron" size={16} />
              </button>
            </div>
          </li>
        })}
      </ul> : <p className="inquiry-list-empty">
        {rows ? query || adminInquiryStatusFilter || adminInquiryTypeFilter ? "No inquiries match your filters." : adminInquiryTab === "history"
          ? "No inquiries in history yet." : "No inquiries in this view." :
          error ? "Inquiries could not be loaded." : "Loading inquiries…"}
      </p>}
      <div className="inquiry-log-pagination"><ListPager list={adminList} unit="inquiries" /></div>
    </section>}
    </>}
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

    {dialog === "intake" && row?.status === "approved" && <Modal title="Project intake" subtitle={String(row.details.name)} wide onClose={closeDialog} footer={<>
      <span className="inquiry-intake-progress">Step {step} of 3</span>
      <button type="button" className="button" disabled={busy} onClick={step === 2 ? closeDialog : () => setStep(2)}>{step === 2 ? "Back to assessment" : "Back"}</button>
      {step === 2 && <button className="button primary" disabled={busy || !canAllocate} onClick={() => {
        if (planning?.candidates) setStep(3)
        else void run(allocate)
      }}>Continue to staffing</button>}
      {step === 3 && <button className="button primary inquiry-send-offers" disabled={busy || !canSend} onClick={() => void run(submit)}>Send assignment offers</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-intake">
        <ol ref={stepperRef} className="inquiry-stepper" aria-label="Project intake steps">
          {["Assessment", "Construction phases", "Staffing"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-complete={step > index + 1}>
            <span aria-hidden="true">{step > index + 1 ? <Icon name="check" size={14} /> : index + 1}</span>{label}
          </li>)}
        </ol>
        {step === 2 && planning && <fieldset className="inquiry-review" disabled={busy}>
          <aside className="inquiry-summary-card">
            <h3>Inquiry summary</h3>
            {row.details.overview && <p>{row.details.overview}</p>}
            <span className="inquiry-pill">{statusLabel(row)}</span>
            <dl>
              <div><dt>Client</dt><dd>{row.details.client_name}</dd></div>
              <div><dt>Project type</dt><dd>{row.details.project_type}</dd></div>
              <div><dt>Project address</dt><dd>{row.details.address}</dd></div>
              <div><dt>Total floor area (m²)</dt><dd>{row.details.floor_area_sqm}</dd></div>
              <div><dt>Number of floors</dt><dd>{row.details.floor_count}</dd></div>
              <div><dt>Target start</dt><dd>{start || "—"}</dd></div>
            </dl>
            <details><summary>View full inquiry</summary>
              <InquiryDetails details={row.details} includeClient />
              <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
            </details>
          </aside>
          <div className="inquiry-review-main">
            <div className="inquiry-fields inquiry-estimates">
              <div className="inquiry-card"><h3>Assessed project size</h3><p>{planning.estimate.size}</p></div>
              <div className="inquiry-card"><h3>Reviewed completion date</h3><p>{end}</p></div>
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
            <FormSection title="Signed contract" icon="doc" description="Attach the executed agreement.">
              <label>Signed Client Contract Agreement<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => {
                setContract(event.target.files?.[0])
                setContractFileId(undefined)
                setPlanning({ ...planning, candidates: undefined })
                setTeam([])
              }} /></label>
              {!contract && contractFileId && <p>Signed client contract agreement attached.</p>}
              {contract && <div className="inquiry-sent-notice inquiry-contract-preview">
                <span className="inquiry-list-icon"><Icon name="doc" /></span>
                <div><strong>{contract.name}</strong><small>Contract attached</small></div>
                {contractPreview && <a className="button" href={contractPreview} target="_blank" rel="noopener noreferrer">View contract</a>}
              </div>}
            </FormSection>
            {!canAllocate && <p className="inquiry-muted">Attach the signed contract and select at least one phase to continue.</p>}
          </div>
        </fieldset>}
        {step === 3 && planning?.candidates && <fieldset className="inquiry-form-stack" disabled={busy}>
          <div><h3>Build the project team</h3><p className="inquiry-muted">Review staffing by phase and assign qualified engineers to cover responsibilities.</p></div>
          <StaffingLineup phases={phases} team={team} candidates={planning.candidates} />
          <div className="inquiry-phase-nav" role="group" aria-label="Staffing phase">
            {phases.map(stage => <button key={stage} type="button" className="button" aria-pressed={staffingPhase === stage} onClick={() => {
              setStaffingPhase(stage)
              setAddingEngineer(false)
            }}>{stage}</button>)}
          </div>
          <StaffingCards stage={staffingPhase} entry={team.find(entry => entry.stage === staffingPhase)}
            suggested={planning.team?.find(entry => entry.stage === staffingPhase)}
            choices={planning.candidates[staffingPhase] || []} adding={addingEngineer} setAdding={setAddingEngineer}
            blocker={planning.candidateBlockers?.[staffingPhase]} onRecheck={() => void run(() => allocate(true))}
            onChange={entry => setTeam(previous => [...previous.filter(item => item.stage !== entry.stage), entry])} />
          {!canSend && <p className="inquiry-muted">Fill every selected phase and meet its minimum coverage before sending assignment offers.</p>}
        </fieldset>}
        {feedback}
      </div>
    </Modal>}
    {admin && adminPage === "new" && renderAdminInquiryForm()}
    {!dialog && !officePage && adminPage !== "new" && feedback}
  </section>
}
