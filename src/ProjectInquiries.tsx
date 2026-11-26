import ClientCorrections from "./ClientCorrections"
import ProjectClientAccount from "./ProjectClientAccount"
import InquiryClientFields from "./InquiryClientFields"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ApiError, api, downloadBlob } from "./api/client"
import { uploadFile } from "./api/actions"
import { Icon, Modal } from "./ui"
import type { Project } from "./model"
import { phaseWorkday, suggestPhaseSchedule } from "../Thesis-Backend/src/domain/phase-schedule.js"
import { phaseEngineerSummary, registeredComplete, registeredCount, teamConfirmed } from "./workflows"
import { ListPager, runList, updateListQuery, useListMemory } from "./ListControls"
import { withPage } from "./listing"
import { IntakePipelinePanel, IntakeTabs } from "./IntakeGuidance"
import type { IntakeView } from "./intake-guidance"
import StaffingPeak from "./StaffingPeak"
import { DEFAULT_SETUP_SPM_COUNT, SETUP_ENGINEER_LIMIT } from "../Thesis-Backend/src/domain/engineer-phase-coverage.js"
import { isStale, startPolling } from "./refresh-interval"
import { matchingInquiryTags, selectInquiryLead } from "../Thesis-Backend/src/domain/inquiry-lead.js"
import AssignedScopeMatch from "./AssignedScopeMatch"
import FloorAreaReview from "./FloorAreaReview"
import { inquiryAssessmentReady } from "../Thesis-Backend/src/domain/inquiry-assessment.js"
import OfficeInquiryWorkflow, { type OfficePage, type OfficeRecord } from "./OfficeInquiryWorkflow"
import { type ClientActivationStatus } from "./client-activation"
import MobileNumberInput from "./MobileNumberInput"
import GroupedNumberInput from "./GroupedNumberInput"
import { showActionResult } from "./action-feedback"
import { PROJECT_SETUP_LABEL } from "./workspace-routing"
import { isPhilippineMobile, PH_MOBILE_ERROR } from "../Thesis-Backend/src/domain/mobile-number.js"
import "./project-inquiries.css"

const projectTypes = [
  ["Residential", "home", "Houses, condominiums, apartments, and residential buildings."],
  ["Commercial", "storefront", "Offices, retail spaces, hotels, and business establishments."],
  ["Mixed-Use", "mixed-building", "Developments combining residential and commercial spaces."],
] as const
const fields = [
  ["client_name", "Client name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["name", "Project name", "text"], ["address", "Location", "text"],
  ["lot_area", "Lot area (m²)", "number"],
  ["floor_area_sqm", "Total floor area (m²)", "number"], ["floor_count", "Number of floors", "number"],
] as const
type Details = Record<string, string | number>
type RoutingEvent = { kind: "offered" | "declined" | "accepted" | "no_match"; opm?: string; at?: string }
type Inquiry = OfficeRecord & { id: string; project_id?: string | null; routing_history?: RoutingEvent[]; created_at?: string; updated_at?: string; opm_id?: string; reason?: string; project_status?: string; target_start_date?: string; target_end_date?: string; client_account_status?: ClientActivationStatus; can_delete_draft?: boolean }
type Candidate = { id: string; name: string; qualifiedTags: string[]; experienceYears?: number; licenseByScope?: Record<string, { expiry: string; cutoff: string }> }
type PhaseDates = Record<string, { start: string; end: string }>
type PlanningBackups = Record<string, string>
type Engineer = { user_id: string; assigned_disciplines: string[] }
type Phase = { stage: string; user_id: string | null; assigned_disciplines?: string[]; engineers?: Engineer[]; required_specializations?: string[]; missing_specializations?: string[] }
type CandidateBlocker = "qualifications" | "schedule" | "commitments" | "phase_disciplines" | "availability" | "license"
type AdditionalScopes = Record<string, string[]>
type Planning = { recommended_site_pms?: number | null; phases: string[]; phaseReview?: { name: string; included: boolean; required: boolean }[]; estimate: { size: string | null; end: string | null }; team?: Phase[]; candidates?: Record<string, Candidate[]>; candidateBlockers?: Record<string, CandidateBlocker>;
  additional_scope_options?: AdditionalScopes; licenseUnavailable?: Record<string, Pick<Candidate, "id" | "name" | "licenseByScope">[]>;
  staffing?: {assessment_id:string; phases:string[]; contract_file_id:string; additional_scopes?: AdditionalScopes; phase_dates?: PhaseDates} }
const timing = [[30, "30 minutes"], [60, "1 hour"], [1440, "1 day"]] as const
const classifications = ["Normal", "Priority", "Urgent"]
const statuses: Record<string,string> = {
  draft: "Ready for routing", offered: "Awaiting OPM response", returned: "Returned to Admin",
  consulting: "Awaiting client decision", approved: "Ready for project setup", withdrawn: "Client withdrew",
  dropped: "Dropped", converted: "Project setup complete",
}

const statusLabel = (row: Inquiry) => row.project_status === "spm_review" ? "Staffing in progress" : statuses[row.status]
const officeActions = {
  offered: { label: "Review inquiry", bucket: "action", context: "Office PM review required" },
  consulting: { label: "View proposal status", bucket: "waiting", context: "Client proposal response pending" },
  approved: { label: "Continue project assessment", bucket: "action", context: "Assessment in progress" },
} as const
const officeReviewStatus = "Needs your action"
const officeAction = (status: string) => Object.prototype.hasOwnProperty.call(officeActions, status)
  ? officeActions[status as keyof typeof officeActions] : undefined
const inquiryDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "Asia/Manila" })
const inquiryActivityDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })
const inquiryDay = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" })

const post = <T,>(path: string, json: unknown) => api<T>(path, { method: "POST", json })
const adminInquiryDraft = { consultation: 30, classification: "Normal", immediate_consultation: "yes" }
const inquiryPlaceholders: Record<string, string> = {
  client_name: "Lastname, FirstName", email: "name@example.com",
  name: "Maple Residence", address: "Location",
  lot_area: "e.g. 250", floor_area_sqm: "e.g. 180", floor_count: "e.g. 2",
}
type InquiryOpmCandidate = { id: string; name: string; experience_years: number; active_projects?: number; inquiry_reservations?: number }

function inquiryReference(row: Inquiry) {
  return `10BL-${row.created_at?.slice(0, 4) || row.updated_at?.slice(0, 4) || inquiryDay.format(new Date()).slice(0, 4)}-${row.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`
}

function adminInquiryStatus(row: Inquiry) {
  if (row.details.intake_draft === "yes") return "Unsubmitted draft"
  if (row.status === "draft") return row.routing_history?.at(-1)?.kind === "no_match" ? "No eligible OPM" : "Saved for later"
  return statusLabel(row) || "Status unavailable"
}

const adminInquiryActions: Record<string, string> = {
  "Unsubmitted draft": "Continue draft",
  "Saved for later": "Start automatic matching",
  "No eligible OPM": "Retry automatic matching",
  "Returned to Admin": "Retry automatic matching",
  "Client withdrew": "Mark inquiry dropped",
}

const inquiryWaiting: Record<string, string> = {
  offered: "Waiting for Office PM response",
  consulting: "Waiting for the client’s decision",
  approved: "Waiting for project setup",
}

const adminInquiryListKey = "admin:inquiry-log"
const adminInquiryListConfig = { searchText: (item: Inquiry) => String(item.details.name ?? "") }
function resetInquiryPage() {
  updateListQuery(adminInquiryListKey, query => withPage(query, 1))
}

const inquiryMilestones = ["Inquiry submitted", "Office PM review", "Client proposal", "Project assessment", PROJECT_SETUP_LABEL]

function inquiryMilestone(item: Inquiry) {
  if (item.details.intake_draft === "yes") return null
  switch (item.status) {
    case "draft": return 0
    case "offered":
    case "returned": return 1
    case "consulting": return 2
    case "approved": return item.workflow?.assessment || item.project_status === "spm_review" ? 4 : 3
    default: return null
  }
}

function InquiryProgress({ milestone, numbered = false }: { milestone: number; numbered?: boolean }) {
  return <ol className="inquiry-log-progress" aria-label="Inquiry progress">
    {inquiryMilestones.map((label, index) => <li key={label}
      data-complete={index < milestone} aria-current={index === milestone ? "step" : undefined}>
      <span aria-hidden="true">{index < milestone ? "✓" : numbered ? index + 1 : ""}</span>{label}
    </li>)}
  </ol>
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
    {includeClient && details.client_type && <div><dt>Client type</dt><dd>{details.client_type === "company" ? "Company / organization" : "Individual"}</dd></div>}
    {includeClient && details.designation && <div><dt>Position / designation</dt><dd>{details.designation}</dd></div>}
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
    ["Client", details.client_name], ...(details.client_type ? [["Client type", details.client_type === "company" ? "Company / organization" : "Individual"]] : []),
    ...(details.primary_contact ? [["Primary contact", details.primary_contact]] : []), ["Contact", details.phone], ["Email", details.email],
    ["Project type", details.project_type], ["Lot area", area(details.lot_area)],
    ["Total floor area", area(details.floor_area_sqm)], ["Number of floors", details.floor_count], ["Location", details.address],
    ["Estimated start", date(row.target_start_date || details.anticipated_start)],
    ["Potential completion", date(row.target_end_date)],
    ["Inquiry classification", details.classification || "—"],
    ["Assigned Office PM", row.opm_name || "Pending matching"],
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

const consultationLabel = (details: Details) => details.response_time_policy === "office_day" ? "Within one working day (Mon–Fri, 8 AM–5 PM)" : timing.find(([value]) => value === Number(details.consultation))?.[1] || "—"

function requiredAreas(entry?: Phase) {
  if (entry?.required_specializations) return entry.required_specializations
  return [...new Set([
    ...(entry?.missing_specializations || []),
    ...(entry?.engineers || []).flatMap(person => person.assigned_disciplines),
  ])].sort()
}

function staffingIssue(entry: Phase | undefined, required: string[], choices: Candidate[], blocker?: CandidateBlocker) {
  const assigned = entry?.user_id ? entry.engineers ?? [entry] : []
  if (!assigned.length) {
    if (choices.length) return "Assign an eligible Site PM."
    if (blocker === "schedule") return "Matching engineers have schedule conflicts."
    if (blocker === "commitments" || blocker === "availability") return "Matching engineers are already committed."
    if (blocker === "phase_disciplines") return "No specialization requirements are configured for this phase."
    if (blocker === "license") return "Matching engineers cannot cover the planned start under the license policy."
    return required.length ? `No available engineer has a verified match for ${required.join(", ")}.` : "No eligible engineer is available."
  }
  if (assigned.some(person => !matchingInquiryTags(
    person.assigned_disciplines, choices.find(candidate => candidate.id === person.user_id)?.qualifiedTags ?? [],
  ).length)) return "Review the lineup. An assigned engineer is unavailable or has no verified scope selected."
  if (assigned.length > SETUP_ENGINEER_LIMIT) return "Choose at most three engineers for this phase."
  return ""
}

function ContractPreview({ file, fileId, onClose, onConfirm, busy, error }: {
  file?: File; fileId?: string; onClose: () => void; onConfirm?: () => void; busy?: boolean; error?: string
}) {
  const [preview, setPreview] = useState<{ url: string; mime: string }>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let url = ""
    const localMime = /\.pdf$/i.test(file?.name ?? "") ? "application/pdf"
      : /\.png$/i.test(file?.name ?? "") ? "image/png" : /\.jpe?g$/i.test(file?.name ?? "") ? "image/jpeg" : ""
    const content = file ? Promise.resolve(file.slice(0, file.size, localMime))
      : fileId ? downloadBlob(`/files/${encodeURIComponent(fileId)}/content`) : Promise.resolve(undefined)
    void content.then(blob => {
      if (cancelled) return
      if (!blob || !["application/pdf", "image/png", "image/jpeg"].includes(blob.type)) { setFailed(true); return }
      url = URL.createObjectURL(blob)
      setPreview({ url, mime: blob.type })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [file, fileId])
  return <Modal title={onConfirm ? "Confirm signed contract" : "Signed contract preview"} subtitle={file?.name} wide onClose={onClose}
    footer={onConfirm && <>
      <button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="button primary" disabled={!preview || busy} onClick={onConfirm}>{busy ? "Saving contract…" : "Confirm this file"}</button>
    </>}>
    {onConfirm && <p>Review the file and confirm it is the signed agreement for this project.</p>}
    {error && <p role="alert">{error}</p>}
    {preview ? preview.mime === "application/pdf"
      ? <object className="pdf-preview large" data={`${preview.url}#toolbar=0&navpanes=0`} type="application/pdf" aria-label="Signed contract PDF">
          <p>This browser cannot display the PDF preview.</p>
        </object>
      : <img className="inquiry-contract-image" src={preview.url} alt="Signed client contract" />
      : <p role="status">{failed ? "The signed contract preview is unavailable." : "Loading signed contract…"}</p>}
  </Modal>
}

function proposedStaffingLead(phases: string[], team: Phase[], candidates: Record<string, Candidate[]>) {
  const firstPhase = candidates[phases[0]] ?? []
  const experience = new Map(firstPhase.map(person => [person.id, Number(person.experienceYears ?? 0)]))
  return selectInquiryLead(phases, team, experience, (stage: string, id: string) => candidates[stage]?.find(person => person.id === id)?.qualifiedTags ?? [])
}

function licenseForAssignment(candidate: Candidate | undefined, scopes: string[] = []) {
  if (!candidate?.licenseByScope || !scopes.length) return undefined
  const licenses = scopes.map(scope => candidate.licenseByScope?.[scope])
  if (licenses.some(license => !license)) return undefined
  return licenses.sort((a, b) => (a?.cutoff ?? "").localeCompare(b?.cutoff ?? ""))[0]
}

function staffingDate(value: string) {
  return inquiryDate.format(new Date(value + "T00:00:00Z"))
}

function StaffingLineup({ phases, team, candidates }: { phases: string[]; team: Phase[]; candidates: Record<string, Candidate[]> }) {
  const phaseCandidate = (stage: string, id: string) => candidates[stage]?.find(person => person.id === id)
  const lead = proposedStaffingLead(phases, team, candidates)
  const years = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2, style: "unit", unit: "year", unitDisplay: "long" })
  return <section className="inquiry-card inquiry-lineup">
    <h3>Staffing lineup</h3>
    <div className="inquiry-lineup-lead">
      {lead ? <>
        <strong>Proposed Lead SPM · {phaseCandidate(lead.stage, lead.id)?.name || "Site PM"}</strong>
        <p>{lead.stage} · {years.format(lead.years)} of relevant experience</p>
        <p><AssignedScopeMatch assigned={lead.tags} qualified={phaseCandidate(lead.stage, lead.id)?.qualifiedTags ?? []} /> {lead.tags.join(", ")}</p>
      </> : <p>Assign an eligible Site PM to the first included phase to propose a lead.</p>}
    </div>
    <div className="inquiry-lineup-table">
      <table>
        <thead><tr><th scope="col">Phase</th><th scope="col">Assigned Site PM</th><th scope="col">Relevant experience</th><th scope="col">Assigned scope match</th><th scope="col">Designation</th></tr></thead>
        <tbody>{phases.flatMap(stage => {
          const entry = team.find(item => item.stage === stage)
          const assigned = entry?.engineers ?? (entry?.user_id ? [{ user_id: entry.user_id, assigned_disciplines: entry.assigned_disciplines }] : [])
          if (!assigned.length) return <tr key={stage}><td>{stage}</td><td colSpan={4}>Unfilled</td></tr>
          const ordered = lead?.stage === stage
            ? [...assigned.filter(person => person.user_id === lead.id), ...assigned.filter(person => person.user_id !== lead.id)]
            : assigned
          return ordered.map(({ user_id: id, assigned_disciplines }) => {
            const isLead = lead?.id === id && lead.stage === stage
            const person = phaseCandidate(stage, id)
            const designation = entry?.user_id === id && lead?.stage !== stage ? "Phase coordinator" : "Phase SPM"
            const tags = matchingInquiryTags(assigned_disciplines, phaseCandidate(stage, id)?.qualifiedTags ?? [])
            return <tr key={`${stage}:${id}`} data-lead={isLead}>
              <td>{stage}</td><td>{person?.name || "Site PM"}</td>
              <td>{person?.experienceYears == null ? "—" : years.format(Number(person.experienceYears))}</td>
              <td><AssignedScopeMatch assigned={assigned_disciplines} qualified={person?.qualifiedTags ?? []} /> {tags.join(", ")}</td>
              <td>{isLead ? <strong className="inquiry-pill">Lead SPM</strong> : designation}</td>
            </tr>
          })
        })}</tbody>
      </table>
    </div>
    <p className="inquiry-muted">The Lead is the eligible engineer assigned to the first included phase with the most relevant project-type experience. Ties use account ID. The Lead accepts first and manages subcontractor allocation once the project is ready.</p>
  </section>
}

function StaffingCards({ stage, entry, suggested, choices, blocker, adding, setAdding, onChange, onRecheck, scopeOptions, onAddScope,
  phaseRange, leadRange, leadId, unavailable, backup, onBackup }: {
  stage: string
  entry?: Phase
  suggested?: Phase
  choices: Candidate[]
  blocker?: CandidateBlocker
  adding: boolean
  setAdding: (value: boolean) => void
  onChange: (entry: Phase) => void
  onRecheck: () => void
  scopeOptions?: string[]
  onAddScope: (scope: string) => Promise<unknown>
  phaseRange?: PhaseDates[string]
  leadRange?: PhaseDates[string]
  leadId?: string
  unavailable?: NonNullable<Planning["licenseUnavailable"]>[string]
  backup?: string
  onBackup: (id: string) => void
}) {
  const [scope, setScope] = useState("")
  const multi = !!suggested?.engineers
  const engineers = entry?.engineers ?? (entry?.user_id ? [
    { user_id: entry.user_id, assigned_disciplines: entry.assigned_disciplines || [] },
  ] : [])
  const required = requiredAreas(suggested)
  const newScopes = scopeOptions?.filter(value => !required.includes(value)) ?? []
  const owners = new Map(required.flatMap(area => {
    const names = engineers.filter(person => person.assigned_disciplines.includes(area))
      .map(person => choices.find(candidate => candidate.id === person.user_id && candidate.qualifiedTags.includes(area))?.name)
      .filter(Boolean)
    return names.length ? [[area, names.join(", ")] as const] : []
  }))
  const missing = required.filter(area => !owners.has(area))
  const withoutEligibleMatch = new Set(missing.filter(area => !choices.some(candidate => candidate.qualifiedTags.includes(area))))
  const quota = 1
  const coverage = required.length - missing.length
  const primary = engineers.find(person => person.user_id === leadId) ?? engineers[0]
  const backupRange = leadId ? leadRange : phaseRange
  const backupChoices = backupRange && primary ? choices.filter(candidate =>
    !engineers.some(person => person.user_id === candidate.id) &&
    (licenseForAssignment(candidate, primary.assigned_disciplines)?.cutoff ?? "") > backupRange.end) : []
  const update = (next: Engineer[]) => onChange({
    ...entry, stage, user_id: next[0]?.user_id || null,
    assigned_disciplines: next[0]?.assigned_disciplines,
    ...(multi ? { engineers: next } : {}),
  })
  function options(index: number) {
    const others = engineers.filter((_, current) => current !== index)
    const used = new Set(others.flatMap(person => person.assigned_disciplines))
    return choices.filter(candidate => !others.some(person => person.user_id === candidate.id))
      .map(candidate => ({ ...candidate, tags: [...candidate.qualifiedTags].sort((a,b) => Number(used.has(a)) - Number(used.has(b))).slice(0, multi ? 3 : 1) }))
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
  const atLimit = engineers.length >= (multi ? SETUP_ENGINEER_LIMIT : 1)
  const noEligibleMessage = {
    phase_disciplines: "This phase has no configured discipline requirements. Ask Admin to review its project-type setup.",
    availability: "The qualified Site PMs already have assignments. Recheck after an assignment ends.",
    qualifications: "No available Site PM meets the account, verified license, and discipline requirements for this phase. Ask Admin to review the required discipline and credentials.",
    schedule: "The matching Site PMs have conflicting assignments during the current project dates. Review the schedule or recheck after availability changes.",
    commitments: "The matching Site PMs have unfinished commitments or no available qualifying scope for this phase.",
    license: "Matching engineers cannot cover the planned start under the license policy.",
  }
  return <section className="inquiry-card inquiry-staffing">
    <div className="inquiry-staff-heading"><h3>{stage}</h3>
      {multi && <span className={`inquiry-pill ${required.length > 0 && coverage === required.length ? "ready" : "pending"}`}>Team coverage · {required.length ? Math.round(coverage / required.length * 100) : 0}% · {coverage} of {required.length} scopes covered · minimum {quota}</span>}
    </div>
    <p className="inquiry-muted">{phaseRange ? `${staffingDate(phaseRange.start)} – ${staffingDate(phaseRange.end)}` : "Phase dates needed to check license coverage."}</p>
    {!!unavailable?.length && <details className="inquiry-license-window">
      <summary>Unavailable at planned start ({unavailable.length})</summary>
      <p>Admin must verify a renewal before these engineers can cover the planned start.</p>
      <ul>{unavailable.map(candidate => <li key={candidate.id}>{candidate.name}</li>)}</ul>
    </details>}
    {missing.length > 0 && <p className="inquiry-coverage-warning"><strong>{missing.length} uncovered {missing.length === 1 ? "scope" : "scopes"} in {stage}.</strong>
      {withoutEligibleMatch.size > 0 && <> No eligible Site PM found for {Array.from(withoutEligibleMatch).join(", ")}.</>}
      {multi && coverage >= quota && <> The phase meets its minimum coverage of {quota}.</>}
      {withoutEligibleMatch.size > 0 && <><br /><button type="button" className="button" onClick={onRecheck}>Recheck eligibility</button></>}
    </p>}
    <div className={`inquiry-staff-layout${required.length ? " with-coverage" : ""}`}>
    {(required.length > 0 || newScopes.length > 0) && <aside className="inquiry-summary-card inquiry-phase-coverage">
      <h4>Phase scope coverage</h4>
      <ul>{required.map(area => {
        const owner = owners.get(area)
        return <li key={area} className={owner ? "covered" : "gap"}>
          <Icon name={owner ? "check" : "alert"} size={16} />
          <span>{area}</span><strong>{owner || (withoutEligibleMatch.has(area) ? "No eligible Site PM found" : "Unassigned")}</strong>
        </li>
      })}</ul>
      {newScopes.length > 0 && <div className="inquiry-form-stack">
        <label>Additional engineering scope<select value={newScopes.includes(scope) ? scope : ""} onChange={event => setScope(event.target.value)}>
          <option value="">Select a scope</option>
          {newScopes.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button type="button" className="button" disabled={!newScopes.includes(scope)} onClick={() => void onAddScope(scope)}>Add scope</button>
      </div>}
    </aside>}
    <div className="inquiry-form-stack">
    <div className="inquiry-staff-heading">
      <strong>Assigned engineers · {engineers.length}</strong>
      {!adding && !atLimit && choices.length > 0 && <button className="button inquiry-add-engineer" type="button" disabled={!addOptions.length}
        aria-describedby={addOptions.length ? undefined : "inquiry-add-engineer-help"}
        onClick={() => setAdding(true)}><Icon name="plus" size={16} />{engineers.length ? "Add optional engineer" : "Assign engineer"}</button>}
    </div>
    {!engineers.length && <p>Unfilled</p>}
    {atLimit && missing.some(area => !withoutEligibleMatch.has(area)) && <p className="inquiry-muted">
      This phase has reached its assignment limit. Update the current engineers’ responsibilities or replace an engineer to cover another scope.
    </p>}
    {!atLimit && !addOptions.length && <div id="inquiry-add-engineer-help" className="inquiry-candidate-help">
      <p>{choices.length
        ? "No additional Site PM is available to add in this phase."
        : blocker ? noEligibleMessage[blocker] : "No eligible Site PM is available for this phase."}</p>
      {missing.length > 0 && <p>Uncovered: <strong>{missing.join(", ")}</strong></p>}
      {!choices.length && !withoutEligibleMatch.size && <button className="button" type="button" onClick={onRecheck}>Recheck eligibility</button>}
    </div>}
    <div className="inquiry-engineers">
      {engineers.map((person, index) => {
        const assigned = choices.find(candidate => candidate.id === person.user_id)
        const replacements = options(index)
        const isLead = leadId === person.user_id
        const range = isLead ? leadRange : phaseRange
        const license = licenseForAssignment(assigned, person.assigned_disciplines)
        const unavailableAtStart = !!range && !!license && license.cutoff <= range.start
        const atRisk = !!range && !!license && license.cutoff <= range.end
        return <article className="inquiry-card" key={person.user_id}>
          <label>{index === 0 ? "Assigned Site PM" : "Additional Site PM"}<select value={person.user_id} onChange={event => assign(index, event.target.value)}>
            {!replacements.some(option => option.id === person.user_id) && <option value={person.user_id}>{assigned?.name || "Site PM"}</option>}
            {replacements.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <p className="inquiry-muted">{assigned ? `Site PM${assigned.qualifiedTags.length ? ` · ${assigned.qualifiedTags.join(", ")}` : ""}` : "This assignment is no longer eligible. Replace or remove it before sending offers."}</p>
          <p><AssignedScopeMatch assigned={person.assigned_disciplines} qualified={assigned?.qualifiedTags ?? []} /></p>
          {range && license && <div className={atRisk ? "inquiry-coverage-warning inquiry-license-window" : "inquiry-license-window"}>
            <strong>{unavailableAtStart ? "Unavailable at planned start" : atRisk ? "Renewal or backup needed" : isLead ? "Covered through closeout" : "Covered for this phase"}</strong>
            {isLead && <p>Lead coverage · {staffingDate(range.start)} – {staffingDate(range.end)}</p>}
            {atRisk && <><p>Work access cutoff · {staffingDate(license.cutoff)}</p><p>PRC license expires · {staffingDate(license.expiry)}</p></>}
            {unavailableAtStart && <p>Choose another engineer or wait for Admin to verify the renewal.</p>}
          </div>}
          {multi && <fieldset>
            <legend>Responsibilities in {stage}</legend>
            {required.map(area => {
              const checked = person.assigned_disciplines.includes(area)
              const qualified = assigned?.qualifiedTags.includes(area)
              return <label className="inquiry-check" key={area}>
                <input type="checkbox" checked={checked} disabled={!checked && (!qualified || person.assigned_disciplines.length >= 3)}
                  onChange={() => update(engineers.map(other => other === person ? {
                    ...person, assigned_disciplines: checked ? person.assigned_disciplines.filter(tag => tag !== area) : [...person.assigned_disciplines, area],
                  } : other))} />
                <span>{area}{!qualified && <small>This engineer has no verified match for this scope</small>}</span>
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
    {(backupChoices.length > 0 || backup) && <label>Planning backup for the phase coordinator
      <select value={backup ?? ""} onChange={event => onBackup(event.target.value)}>
        <option value="">No backup selected</option>
        {backup && !backupChoices.some(option => option.id === backup) && <option value={backup} disabled>Backup needs review</option>}
        {backupChoices.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select><small>Planning only. No assignment offer is sent to the backup for this phase.</small>
    </label>}
    </div>
    </div>
  </section>
}

export default function ProjectInquiries({ role, onReload, projects = [], onOpenDocuments, onOpenAssignments, embedded = false, onInquiryCountChange, bannerTarget, onShowInquiries }: {
  role: "admin" | "opm"; onReload: () => unknown; projects?: Project[]
  onOpenDocuments?: (project: Project) => void; onOpenAssignments?: (project: Project) => void
  embedded?: boolean; onInquiryCountChange?: (count: number | undefined) => void
  bannerTarget?: HTMLElement | null; onShowInquiries?: () => void
}) {
  const [rows, setRows] = useState<Inquiry[]>()
  const activeAction = useRef(false)
  const actionVersion = useRef(0)
  const lastReadAt = useRef(0)
  const [search, setSearch] = useState("")
  const [queueView, setQueueView] = useState<IntakeView>("all")
  const [queueStatus, setQueueStatus] = useState("")
  const [queueType, setQueueType] = useState("")
  const recordHeading = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState("")
  const [dialog, setDialog] = useState<"intake" | "details">()
  const [officePage, setOfficePage] = useState<OfficePage>()
  const [finalizedClient, setFinalizedClient] = useState<{ projectId: string; name: string; refreshFailed?: boolean }>()
  const [showOfficeApproval, setShowOfficeApproval] = useState(false)
  const [adminPage, setAdminPage] = useState<"list" | "new" | "submitted" | "tracking">("list")
  const [adminFormStep, setAdminFormStep] = useState(0)
  const [draftId, setDraftId] = useState("")
  const [draftToDelete, setDraftToDelete] = useState<Inquiry>()
  const [draftBaseline, setDraftBaseline] = useState(JSON.stringify(adminInquiryDraft))
  const [leaveInquiry, setLeaveInquiry] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
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
  const [phaseDates, setPhaseDates] = useState<PhaseDates>({})
  const [planningBackups, setPlanningBackups] = useState<PlanningBackups>({})
  const [team, setTeam] = useState<Phase[]>([])
  const [pendingContract, setPendingContract] = useState<{ file: File; id: string; uploaded?: boolean }>()
  const contractInput = useRef<HTMLInputElement>(null)
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [opmPreview, setOpmPreview] = useState<{ type: string; candidates?: InquiryOpmCandidate[]; error?: string }>()
  const [opmPreviewVersion, setOpmPreviewVersion] = useState(0)
  const row = rows?.find(item => item.id === selected)
  const intakeLocked = row?.status === "approved" && inquiryAssessmentReady(row.details, row.workflow)
  const displayedOfficePage = officePage && intakeLocked ? "assessment"
    : officePage === "assessment" && !intakeLocked ? "review" : officePage
  const canViewContract = displayedOfficePage === "review" || displayedOfficePage === "assessment"
  const contractFileId = row?.workflow?.signed_contract?.id ?? row?.workflow?.staffing?.contract_file_id ?? planning?.staffing?.contract_file_id
  const contractLocked = Boolean(contractFileId && (intakeLocked || row?.workflow?.contract_locked || row?.workflow?.assessment || row?.workflow?.staffing))
  const start = row?.workflow?.review?.start
  const end = row?.workflow?.review?.end
  const projectRange = start && end ? { start, end } : undefined
  const budget = row?.workflow?.budget
  const technical = row?.workflow?.assessment?.technical ?? row?.workflow?.review?.technical
  const arrangement = row?.workflow?.assessment?.arrangement ?? row?.workflow?.review?.arrangement
  const phaseScheduleInput = {
    type: String(row?.details.project_type ?? ""), complexity: row?.workflow?.assessment?.complexity,
    arrangement, start, area: row?.details.floor_area_sqm,
  }
  const suggestions = suggestPhaseSchedule({ ...phaseScheduleInput, phases })
  const dependencies = suggestPhaseSchedule({ ...phaseScheduleInput, phases, dates: phaseDates })
  const scheduledDates = { ...dependencies, ...phaseDates }
  const phaseCompletion = phases.map(stage => scheduledDates[stage]?.end).filter(Boolean).sort().at(-1)
  const phaseScheduleIssue = phases.find(stage => {
    const range = scheduledDates[stage]
    return !range?.start || !range.end || range.end < range.start ||
      range.start < (dependencies[stage]?.start ?? start ?? "") ||
      Boolean(end && range.end > end) ||
      phaseWorkday(range.start) !== range.start || phaseWorkday(range.end) !== range.end
  })
  const staffingInput = {
    ...row?.details, target_start_date: start, target_end_date: end,
    estimated_budget: budget, assessment_id: row?.workflow?.assessment?.id,
  }
  const root = "/projects/inquiries"
  const previewType = role === "admin" && adminPage === "new" ? String(details.project_type ?? "") : ""
  useEffect(() => {
    setOpmPreview(undefined)
    if (!previewType) return
    const abort = new AbortController()
    void api<InquiryOpmCandidate[]>(`${root}/opm-candidates?project_type=${encodeURIComponent(previewType)}`, { signal: abort.signal })
      .then(candidates => { if (!abort.signal.aborted) setOpmPreview({ type: previewType, candidates }) })
      .catch(error => { if (!abort.signal.aborted) setOpmPreview({ type: previewType, error: error.message }) })
    return () => abort.abort()
  }, [previewType, opmPreviewVersion])
  const adminDraftDirty = adminPage === "new" && JSON.stringify(details) !== draftBaseline
  useEffect(() => {
    if (role !== "admin" || !adminDraftDirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [role, adminDraftDirty])
  const change = (key: string, value: string | number) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setPlanning(undefined)
    setTeam([])
  }
  const refresh = async () => {
    setRows(await api<Inquiry[]>(root))
    lastReadAt.current = Date.now()
  }
  function reloadCorrections() {
    void refresh().catch(error => setError(error instanceof Error ? error.message : String(error)))
    void onReload()
  }
  useEffect(() => {
    if (!row?.workflow?.review?.requires_review) return
    setPlanning(undefined)
    setTeam([])
    setPhases([])
    setDialog(current => current === "intake" ? undefined : current)
  }, [row?.id, row?.workflow?.review?.requires_review])
  useEffect(() => {
    if (adminPage !== "list") recordHeading.current?.focus()
  }, [adminPage])
  useEffect(() => {
    if (adminPage === "new") formRef.current?.closest(".modal-body")?.scrollTo?.(0, 0)
  }, [adminPage, adminFormStep])
  useEffect(() => {
    if (dialog === "intake") stepperRef.current?.closest(".modal-body")?.scrollTo?.(0, 0)
  }, [dialog, step])
  useEffect(() => {
    let mounted = true
    let loading = false
    async function load(initial = false) {
      if (loading || activeAction.current) return
      loading = true
      const version = actionVersion.current
      try {
        const data = await api<Inquiry[]>(root)
        if (mounted && version === actionVersion.current) {
          setRows(data)
          lastReadAt.current = Date.now()
        }
      } catch (e) {
        if (initial && mounted && version === actionVersion.current) setError(e instanceof Error ? e.message : String(e))
      } finally {
        loading = false
      }
    }
    void load(true)
    if (role !== "opm") return () => { mounted = false }
    const stop = startPolling(load)
    const onFocus = () => {
      if (document.visibilityState !== "hidden" && isStale(lastReadAt.current)) void load()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      mounted = false
      stop()
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [role])
  async function run(action: () => Promise<unknown>) {
    if (activeAction.current) return
    activeAction.current = true
    actionVersion.current++
    setBusy(true)
    setError("")
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { activeAction.current = false; setBusy(false) }
  }
  function open(item?: Inquiry) {
    if (role === "admin" && item?.details.intake_draft === "yes") {
      setSelected(item.id); setDetails({ ...item.details }); setDraftId(item.id)
      setDraftBaseline(JSON.stringify(item.details)); setAdminFormStep(0); setLeaveInquiry(false); setError(""); setAdminPage("new")
      return
    }
    setSelected(item?.id || "")
    setDetails(item ? { ...item.details } : { consultation: 30 })
    setPlanning(undefined)
    setTeam([])
    setPhases([])
    setPendingContract(undefined)
    setContractPreviewOpen(false)
    setError("")
    setStep(2)
    setAddingEngineer(false)
    setDialog(undefined)
  }
  function closeDialog() {
    if (busy) return
    setContractPreviewOpen(false)
    setPendingContract(undefined)
    setDialog(undefined)
    setError("")
  }
  function updateInquiry(updated: Inquiry) {
    setRows(previous => previous?.map(item => item.id === updated.id ? { ...item, ...updated } : item))
  }
  function navigateOffice(page?: OfficePage, justApproved = false) {
    setError("")
    setShowOfficeApproval(justApproved)
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
      if (action === "approve") navigateOffice("review", true)
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
    if ((action === "review" || action === "budget") && inquiryAssessmentReady(updated.details, updated.workflow)) navigateOffice("assessment")
  }
  function openOfficeInquiry(item: Inquiry) {
    open(item)
    if (item.status === "offered") navigateOffice("pending")
    else if (item.status === "consulting") navigateOffice("proposal")
    else if (item.status === "approved") navigateOffice(inquiryAssessmentReady(item.details, item.workflow) ? "assessment" : "review")
    else setDialog("details")
  }
  async function startStaffing() {
    if (!planning) {
      const result = await post<Planning>(`${root}/${selected}/planning`, staffingInput)
      setPlanning(result)
      setPhases(result.phases)
      setPhaseDates(result.staffing?.phase_dates ?? {})
      setPlanningBackups({})
    }
    setStep(2)
    setDialog("intake")
  }
  function selectedPhaseDates() {
    return Object.fromEntries(phases.flatMap(stage => {
      const dates = scheduledDates[stage]
      return dates ? [[stage, { start: dates.start, end: dates.end }]] : []
    }))
  }
  async function allocate() {
    if (!contractFileId) throw new Error("Attach the signed client contract agreement before staffing.")
    const additional = planning?.staffing?.additional_scopes
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...staffingInput, phases, phase_dates: selectedPhaseDates(), confirm_schedule: true, contract_file_id: contractFileId,
      ...(additional ? { additional_scopes: Object.fromEntries(Object.entries(additional).filter(([stage]) => phases.includes(stage))) } : {}),
    })
    setPlanning(result)
    setTeam(current => (result.team || []).map(phase => {
      const selected = current.find(prior => prior.stage === phase.stage)
      if (selected) return selected
      if (!phase.engineers?.length) return phase
      const engineers = phase.engineers.slice(0, DEFAULT_SETUP_SPM_COUNT)
      return { ...phase, ...engineers[0], engineers }
    }))
    setStaffingPhase(phases.includes(staffingPhase) ? staffingPhase : phases[0] || "")
    setAddingEngineer(false)
    setStep(3)
  }
  async function addStaffingScope(scope: string) {
    if (!planning?.additional_scope_options?.[staffingPhase]?.includes(scope)) return
    const previous = planning.staffing?.additional_scopes ?? {}
    const additional_scopes = { ...previous, [staffingPhase]: [...new Set([...(previous[staffingPhase] ?? []), scope])] }
    const result = await post<Planning>(`${root}/${selected}/planning`, { ...staffingInput, phases, phase_dates: selectedPhaseDates(), confirm_schedule: true, contract_file_id: contractFileId, additional_scopes })
    if (!result.staffing?.additional_scopes?.[staffingPhase]?.includes(scope) || !result.candidates?.[staffingPhase] ||
      !requiredAreas(result.team?.find(phase => phase.stage === staffingPhase)).includes(scope)) {
      throw new Error("The server did not confirm the additional phase scope.")
    }
    setPlanning(result)
  }
  async function confirmContract() {
    if (!pendingContract) return
    const id = pendingContract.id
    if (!pendingContract.uploaded) {
      await uploadFile(id, pendingContract.file)
      setPendingContract({ ...pendingContract, uploaded: true })
    }
    const updated = await post<Inquiry>(`${root}/${selected}/workflow`, {
      action: "contract", version: row?.workflow?.review?.version ?? 0,
      request_id: id, contract_file_id: id, expected_contract_file_id: contractFileId ?? null,
    })
    updateInquiry(updated)
    setPendingContract(undefined)
    setPlanning(undefined)
    setTeam([])
    showActionResult(`${pendingContract.file.name} was uploaded and saved to this inquiry.`, false, "Signed contract uploaded")
  }
  async function submit() {
    if (!contractFileId) throw new Error("Attach the signed client contract agreement before staffing.")
    const result = await post<{ project: { id: string; name: string }; client_account_status?: ClientActivationStatus }>("/projects/intake", {
      ...staffingInput, inquiry_id: selected, suggested_opm_id: row?.opm_id, contract_file_id: contractFileId,
      phases, phase_team: phases.map(stage => team.find(item => item.stage === stage)),
      phase_dates: selectedPhaseDates(), planning_backups: Object.fromEntries(phases.filter(stage => planningBackups[stage]).map(stage => [stage, planningBackups[stage]])),
      ...(planning?.staffing?.additional_scopes ? { additional_scopes: planning.staffing.additional_scopes } : {}),
    })
    setFinalizedClient({ projectId: result.project.id, name: result.project.name })
    setDialog(undefined)
    navigateOffice()
    try { await Promise.all([refresh(), onReload()]) }
    catch { setFinalizedClient(current => current && { ...current, refreshFailed: true }) }
  }
  const canAllocate = !!contractFileId && !!row?.workflow?.assessment && phases.length > 0 && !phaseScheduleIssue
  const staffingLead = step === 3 ? proposedStaffingLead(phases, team, planning?.candidates ?? {}) : null
  const staffingIssues = step === 3 ? phases.flatMap(stage => {
    const entry = team.find(item => item.stage === stage)
    const choices = planning?.candidates?.[stage] ?? []
    const assigned = entry?.engineers ?? (entry?.user_id ? [entry] : [])
    const missingExtra = planning?.staffing?.additional_scopes?.[stage]?.filter(scope =>
      !assigned.some(person => person.assigned_disciplines?.includes(scope) && choices.some(candidate =>
        candidate.id === person.user_id && candidate.qualifiedTags.includes(scope)))) ?? []
    const reason = staffingIssue(entry,
      requiredAreas(planning?.team?.find(item => item.stage === stage)),
      choices, planning?.candidateBlockers?.[stage])
    if (reason) return [{ stage, reason }]
    const lead = staffingLead?.stage === stage ? staffingLead : undefined
    const unavailable = assigned.some(person => {
      const range = person.user_id === lead?.id ? projectRange : scheduledDates[stage]
      const candidate = choices.find(option => option.id === person.user_id)
      const license = licenseForAssignment(candidate, person.assigned_disciplines)
      return range && candidate?.licenseByScope && (!license || license.cutoff <= range.start)
    })
    if (unavailable) return [{ stage, reason: "A selected engineer’s license cannot cover the planned start. Choose another engineer or recheck after renewal." }]
    if (planningBackups[stage]) {
      const primary = assigned.find(person => person.user_id === lead?.id) ?? assigned[0]
      const range = lead ? projectRange : scheduledDates[stage]
      const backup = choices.find(candidate => candidate.id === planningBackups[stage])
      if (!range || !backup || assigned.some(person => person.user_id === backup.id) ||
          (licenseForAssignment(backup, primary?.assigned_disciplines)?.cutoff ?? "") <= range.end)
        return [{ stage, reason: "Review or remove the planning backup before sending offers." }]
    }
    return missingExtra.length ? [{ stage, reason: `Assign verified coverage for ${missingExtra.join(", ")}.` }] : []
  }) : []
  const staffingIssueByPhase = new Map(staffingIssues.map(({ stage, reason }) => [stage, reason]))
  const selectedStaffingIssue = staffingIssueByPhase.get(staffingPhase)
  const canSend = canAllocate && !staffingIssues.length
  const feedback = <>
    {busy && <p role="status">Saving or loading inquiry…</p>}
    {error && <p role="alert">{error}</p>}
  </>
  const admin = role === "admin"
  const pendingInquiries = admin ? [] : (rows ?? []).filter(item => item.status === "offered")
  const newestInquiry = pendingInquiries[0]
  const pendingBanner = newestInquiry && !officePage && <section className="opm-new-inquiries" aria-labelledby="opm-new-inquiries-title">
    <span className="inquiry-list-icon" aria-hidden="true"><Icon name="bell" /></span>
    <div className="opm-new-inquiries-copy">
      <h2 id="opm-new-inquiries-title" aria-live="polite">{pendingInquiries.length === 1 ? "New project inquiry" : `${pendingInquiries.length} new project inquiries`}</h2>
      <p>{newestInquiry.details.name || "Untitled project"} · Awaiting your response</p>
    </div>
    <div className="opm-new-inquiries-actions">
      {pendingInquiries.length > 1 && <button type="button" className="button" disabled={busy} onClick={() => {
        setSearch("")
        setQueueView("action")
        setQueueStatus(officeReviewStatus)
        setQueueType("")
        onShowInquiries?.()
      }}>View all new inquiries</button>}
      <button type="button" className="button primary" disabled={busy} onClick={() => {
        onShowInquiries?.()
        openOfficeInquiry(newestInquiry)
      }}>{pendingInquiries.length === 1 ? "Review inquiry" : "Review newest inquiry"}</button>
    </div>
  </section>
  const query = search.trim().toLowerCase()
  const projectsById = new Map(projects.map(project => [project.id, project]))
  const setupByInquiry = new Map((rows ?? []).flatMap(item => {
    if (admin || item.project_status !== "spm_review") return []
    const project = item.project_id ? projectsById.get(item.project_id) : undefined
    const confirmed = project && teamConfirmed(project)
    const needsReassignment = project?.team.some(phase => !phase.accountId || phaseEngineerSummary(phase).status === "declined")
    const needsDocuments = !!project && !registeredComplete(project)
    const status = confirmed ? "Site PM assignments accepted" : needsReassignment
      ? "Site PM assignment needs review" : "Awaiting Site PM acceptance"
    const bucket: IntakeView | undefined = needsDocuments || needsReassignment ? "action" : confirmed ? undefined : "waiting"
    return [[item.id, { project, status, bucket, needsDocuments, complete: confirmed && !needsDocuments }] as const]
  }))
  const officeRows = rows?.filter(item => {
    const setup = setupByInquiry.get(item.id)
    return setup ? !setup.complete : item.status !== "converted"
  })
  const inquiryCount = officeRows?.length
  useEffect(() => {
    onInquiryCountChange?.(inquiryCount)
  }, [inquiryCount, onInquiryCountChange])
  const officeStatus = (item: Inquiry) => setupByInquiry.get(item.id)?.status ??
    (item.status === "offered" ? officeReviewStatus : item.status === "consulting" ? "Waiting for client" : statusLabel(item))
  const officeBucket = (item: Inquiry) => setupByInquiry.get(item.id)?.bucket ?? officeAction(item.status)?.bucket
  const matchesSearch = (item: Inquiry) => !query ||
    [item.details.name, item.details.client_name, admin ? adminInquiryStatus(item) : officeStatus(item),
      inquiryReference(item)]
      .some(value => String(value ?? "").toLowerCase().includes(query))
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
    setAdminInquiryFilter("all")
    setAdminInquiryStatusFilter("")
    resetInquiryPage()
  }
  function changeAdminInquiryFilter(filter: typeof adminInquiryFilter) {
    setAdminInquiryStatusFilter("")
    setAdminInquiryTab("current")
    setAdminInquiryFilter(filter)
    resetInquiryPage()
  }
  const queueRows = officeRows?.filter(item => matchesSearch(item) &&
    (queueView === "all" || officeBucket(item) === queueView) &&
    (!queueStatus || officeStatus(item) === queueStatus) &&
    (!queueType || item.details.project_type === queueType)
  )
  const queueCounts = (officeRows ?? []).reduce((counts, item) => {
    counts.all++
    const bucket = officeBucket(item)
    if (bucket) counts[bucket]++
    return counts
  }, { all: 0, action: 0, waiting: 0 })
  const statusOptions = [...new Set([...(officeRows ?? []).map(officeStatus), queueStatus].filter(Boolean))]
  function renderAdminInquiryForm() {
    const regular = details.immediate_consultation === "no"
    const matching = opmPreview?.type === previewType ? opmPreview : undefined
    const candidates = matching?.candidates
    const lotArea = Number(details.lot_area)
    const floorCount = Number(details.floor_count)
    const maxFloorArea = lotArea * floorCount
    const floorLimit = lotArea >= 0.01 && Number.isInteger(floorCount) && floorCount > 0 &&
      floorCount <= 32767 && Number.isFinite(maxFloorArea) ? maxFloorArea : undefined
    const formatArea = (area: number) => area.toLocaleString("en-PH", { maximumSignificantDigits: 15 })
    const input = (key: string, label: string, type = "text", required = true, maxLength?: number) => {
      const value = String(details[key] ?? "")
      if (key === "phone") {
        const invalid = Boolean(value && !isPhilippineMobile(value))
        return <label><span>{label} <span className="inquiry-required">*</span></span>
          <MobileNumberInput required value={value} onValueChange={number => change(key, number)}
            aria-invalid={invalid || undefined} aria-describedby={invalid ? "inquiry-phone-notice" : undefined} />
          <small id="inquiry-phone-notice" className="inquiry-input-notice" aria-live="polite">{invalid ? PH_MOBILE_ERROR : ""}</small>
        </label>
      }
      if (key === "lot_area" || key === "floor_area_sqm") {
        const total = key === "floor_area_sqm"
        const outsideRange = total && value !== "" && (Number(value) < 0.01 ||
          (floorLimit !== undefined && Number(value) > floorLimit))
        return <label><span>{label}{required && <span className="inquiry-required"> *</span>}</span>
          <GroupedNumberInput required={required} min={0.01} max={total ? floorLimit : undefined} value={value}
            aria-describedby={total ? "inquiry-floor-area-range" : undefined} aria-invalid={outsideRange || undefined}
            placeholder={inquiryPlaceholders[key]} onValueChange={next => change(key, next)} />
          {total && <small id="inquiry-floor-area-range" className={outsideRange ? "inquiry-input-notice" : "inquiry-muted"} aria-live="polite">
            Add the area of every floor. {floorLimit === undefined
              ? "Enter the lot area and number of floors to see the allowed range."
              : `Allowed range is 0.01 to ${formatArea(floorLimit)} m². Maximum = ${formatArea(lotArea)} m² × ${floorCount} ${floorCount === 1 ? "floor" : "floors"}.`}
          </small>}
        </label>
      }
      const pattern = key === "email" ? "[^\\s@]+@[^\\s@]+\\.[^\\s@]+" : undefined
      const hint = "Enter a valid personal or business email address."
      const invalid = Boolean(value && pattern && !new RegExp(`^(?:${pattern})$`).test(value))
      const noticeId = `inquiry-${key}-notice`
      return (
      <label><span>{label}{required && <span className="inquiry-required"> *</span>}</span>
        <input type={type} value={value} required={required} maxLength={maxLength}
          pattern={pattern} title={pattern ? hint : undefined}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? noticeId : undefined}
          min={type === "number" ? key === "floor_count" ? 1 : 0.01 : undefined}
          max={key === "floor_count" ? 32767 : undefined}
          step={type === "number" ? key === "floor_count" ? 1 : "any" : undefined}
          placeholder={inquiryPlaceholders[key]} onChange={event => change(key, event.target.value)} />
        {pattern && <small id={noticeId} className="inquiry-input-notice" aria-live="polite">{invalid ? hint : ""}</small>}
      </label>
      )
    }
    function close() {
      if (busy) return
      if (adminDraftDirty) { setLeaveInquiry(true); return }
      setError("")
      setAdminPage("list")
    }
    function next() {
      if (!formRef.current?.reportValidity()) return
      if (adminFormStep === 0 && (details.client_record === "existing" ? !details.existing_client_id : !details.client_type)) {
        setError(details.client_record === "existing" ? "Select an existing client." : "Choose the client record and client type."); return
      }
      if (adminFormStep === 1 && !isPhilippineMobile(String(details.phone ?? ""))) { setError(PH_MOBILE_ERROR); return }
      setError(""); setAdminFormStep(value => Math.min(value + 1, 3))
    }
    async function saveDraft() {
      await run(async () => {
        const saved = await post<Inquiry>(`${root}/draft`, { id: draftId || undefined, details })
        setRows(previous => [saved, ...(previous ?? []).filter(item => item.id !== saved.id)])
        setDraftId(saved.id); setDraftBaseline(JSON.stringify(details)); setLeaveInquiry(false); setAdminPage("list")
        showActionResult("Inquiry draft saved. Resume it from the inquiry list.")
      })
    }
    const clientValid = Boolean(details.client_record && details.client_type && (details.client_record !== "existing" || details.existing_client_id))
    const stepLabels = ["Client path", "Client details", "Project details", "Review"]
    return <>
    <Modal title="Submit a project inquiry" wide onClose={close} footer={<>
      <button type="button" className="button" disabled={busy} onClick={close}>Back to inquiries</button>
      {adminFormStep > 0 && <button type="button" className="button" disabled={busy} onClick={() => { setError(""); setAdminFormStep(value => value - 1) }}>Previous step</button>}
      {adminFormStep < 3 ? <button type="button" className="button primary" disabled={busy || (adminFormStep === 0 && !clientValid)} onClick={next}>Next: {stepLabels[adminFormStep + 1]}</button>
        : <button type="submit" form="admin-inquiry-form" className="button primary admin-inquiry-submit" disabled={busy || !candidates}>Submit Project Inquiry</button>}
    </>}>
      <ol className="admin-inquiry-wizard" aria-label="Inquiry form progress">{stepLabels.map((label, index) => <li key={label} aria-current={index === adminFormStep ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
      <form ref={formRef} id="admin-inquiry-form" className="admin-inquiry-submission" onSubmit={event => {
        event.preventDefault()
        if (busy) return
        if (adminFormStep < 3) { next(); return }
        if (!candidates) return
        void run(async () => {
          let result: Inquiry
          try {
            result = await post<Inquiry>(root, { ...details, draft_id: draftId || undefined, expected_opm_id: candidates[0]?.id ?? null })
          } catch (error) {
            if (error instanceof ApiError && error.code === "INQUIRY_RECOMMENDATION_CHANGED") {
              setOpmPreview(undefined)
              setOpmPreviewVersion(version => version + 1)
            }
            throw error
          }
          setRows(previous => [result, ...(previous ?? []).filter(item => item.id !== result.id)])
          setSelected(result.id)
          setSearch("")
          setLeaveInquiry(false)
          setDraftId("")
          setDraftBaseline(JSON.stringify(details))
          setAdminPage("submitted")
          void onReload()
        })
      }}>
        <fieldset disabled={busy} className="inquiry-form-stack">
          {adminFormStep < 2 && <FormSection title={adminFormStep === 0 ? "Client path" : "Client information"} icon="users" description={adminFormStep === 0 ? "Choose a new or existing client, then the appropriate client type." : "Verify that all client information is accurate and that all required fields are complete before proceeding."}>
            <InquiryClientFields page={adminFormStep === 0 ? "path" : "details"} details={details} onChange={setDetails} disabled={busy} />
          </FormSection>}
          {adminFormStep === 2 && <>
          <FormSection title="Project information" icon="building" description="Measurements use square meters (m²).">
            <div className="admin-inquiry-project-identity">
              {input("name", "Project name", "text", true, 150)}
              {input("address", "Location", "text", true, 500)}
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
                  {details.project_type === type && <span className="project-type-check" aria-hidden="true"><Icon name="check" size={15} /></span>}
                </label>)}
              </div>
            </fieldset>
            <div className="admin-inquiry-form-grid admin-inquiry-measurements">
              {input("lot_area", "Lot area (m²)", "number")}
              {input("floor_count", "Number of floors", "number")}
              {input("floor_area_sqm", "Total floor area (m²)", "number")}
              <FloorAreaReview area={Number(details.floor_area_sqm)} floors={floorCount} />
            </div>
          </FormSection>
          <FormSection title="OPM consultation request" icon="users" description="Classify the inquiry and record whether the client wants immediate contact.">
            <div className="admin-inquiry-consultation">
              <fieldset className="admin-inquiry-preference">
                <legend>Does the client wish to speak with an OPM right away? <span className="inquiry-required">*</span></legend>
                {(["yes", "no"] as const).map(value => <label key={value}>
                  <input type="radio" name="immediate-consultation" required checked={details.immediate_consultation === value} onChange={() => {
                    setDetails(previous => ({ ...previous, immediate_consultation: value, consultation: value === "no" ? 1440 : 30,
                      classification: value === "no" ? "Normal" : previous.classification }))
                  }} />
                  {value === "yes" ? "Yes" : "No"}
                </label>)}
              </fieldset>
              <fieldset className="admin-inquiry-classification" disabled={regular}>
                <legend>Inquiry classification <span className="inquiry-required">*</span></legend>
                <div className="admin-inquiry-classification-options">
                  {classifications.map(value => (
                    <label key={value}>
                      <input className="sr-only" type="radio" name="inquiry-classification" value={value} required
                        checked={details.classification === value} onChange={() => change("classification", value)} />
                      <span>{value}</span>
                      {details.classification === value && <span className="inquiry-classification-check" aria-hidden="true">
                        <Icon name="check" size={13} />
                      </span>}
                    </label>
                  ))}
                </div>
              </fieldset>
              {regular && <p className="inquiry-muted">Normal · Response within one working day (9 office hours). Monday–Friday, 8:00 AM–5:00 PM; no lunch break.</p>}
            </div>
            <section className="admin-inquiry-opm-preview" aria-label="Top Office PM matches" aria-live="polite">
              <h4>Top Office PM matches</h4>
              {!previewType ? <p>Select a project type to see matching Office PMs.</p>
                : matching?.error ? <div><p>{matching.error}</p><button type="button" className="button" onClick={() => {
                  setOpmPreview(undefined)
                  setOpmPreviewVersion(version => version + 1)
                }}>Retry Office PM match</button></div>
                : !candidates ? <p>Checking available Office PMs…</p>
                : !candidates.length ? <p>No qualified OPM currently has capacity. You can save the inquiry and retry matching later.</p>
                : <><p>{regular ? "Recommendations only. Routing happens after submission." : "The system routes the inquiry to the best available match."}</p>
                <ul>{candidates.slice(0, 3).map((person, index) => <li key={person.id}>
                  <div><strong>{person.name}</strong><small>{Number(person.experience_years).toLocaleString(undefined, { maximumFractionDigits: 2 })} years of relevant experience · {person.active_projects ?? 0} active + {person.inquiry_reservations ?? 0} reserved / 2</small></div>
                  {index === 0 && <span className="inquiry-pill ready">Best match</span>}
                </li>)}</ul></>}
            </section>
          </FormSection>
          </>}
          {adminFormStep === 3 && <FormSection title="Review inquiry" icon="building" description="Confirm the client and project details before submission.">
            <InquiryDetails details={details} includeClient />
            <p>{regular ? "The inquiry will be saved for routing after submission." : candidates ? candidates.length ? `The inquiry will be sent to ${candidates[0].name}.` : "No eligible Office PM is available; the inquiry will be saved for matching later." : "Checking available Office PMs…"}</p>
            {matching?.error && <div role="alert"><p>{matching.error}</p><button type="button" className="button" onClick={() => setOpmPreviewVersion(version => version + 1)}>Retry Office PM match</button></div>}
          </FormSection>}
        </fieldset>
        {feedback}
      </form>
    </Modal>
    {leaveInquiry && <Modal title="Save this inquiry as a draft?" onClose={() => setLeaveInquiry(false)} footer={<>
      <button type="button" className="button primary" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
      <button type="button" className="button" disabled={busy} onClick={() => { setLeaveInquiry(false); setError(""); setAdminPage("list"); setDraftId(""); setDetails(adminInquiryDraft) }}>Discard changes</button>
      <button type="button" className="button" disabled={busy} onClick={() => setLeaveInquiry(false)}>Keep editing</button>
    </>}><p>Your changes can be saved so you can continue this inquiry later.</p>{feedback}</Modal>}
    </>
  }
  if (admin && row && (adminPage === "submitted" || adminPage === "tracking")) {
    const submitted = adminPage === "submitted"
    const status = adminInquiryStatus(row)
    return <section className="project-inquiries admin-inquiries admin-inquiry-page">
      <div>
        <button type="button" className="button" disabled={busy} onClick={() => { setError(""); setAdminPage("list") }}>
          <span aria-hidden="true">←</span> Back to inquiries
        </button>
      </div>
      <header className="inquiries-page-heading">
        <div><h1 ref={recordHeading} tabIndex={-1}>{submitted ? "Inquiry submitted" : "Inquiry tracking"}</h1>
          <p>{submitted
            ? row.status === "offered" ? "The system generated a reference and sent the consultation request."
              : status === "No eligible OPM" ? "The inquiry was saved. No qualified OPM currently has capacity."
                : "The inquiry was saved for later consultation."
            : "Monitor matching and acceptance for this inquiry."}</p>
        </div>
        {submitted ? <button className="button" onClick={() => setAdminPage("tracking")}>View inquiry status</button>
          : <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>}
      </header>
      {submitted && <div className="admin-inquiry-success" role="status">
        <span className="admin-history-icon"><Icon name="check" /></span>
        <div><strong>Saved successfully</strong><h2>{row.details.name}</h2><p>Reference {inquiryReference(row)}</p></div>
        <span className={`inquiry-pill ${status === "No eligible OPM" ? "pending" : "ready"}`}>{status}</span>
      </div>}
      <div className="inquiry-card admin-inquiry-record">
        <section className="inquiry-card admin-inquiry-tracking-summary">
          {!submitted && <header><div><p>{inquiryReference(row)}</p><h2>{row.details.name}</h2></div><span className="inquiry-pill">{status}</span></header>}
          <AdminInquirySummary row={row} />
          {row.details.response_due_at && <p>Response due: {new Date(String(row.details.response_due_at)).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time)</p>}
          {!submitted && row.project_id && <ProjectClientAccount projectId={row.project_id} onSaved={onReload} />}
          {!submitted && row.reason && <p>Withdrawal reason: {row.reason}</p>}
          {!submitted && row.details.client_decision_date && <p>Client decision confirmed on {row.details.client_decision_date}</p>}
          {!submitted && row.details.client_decision_note && <p className="inquiry-overview">Internal decision note: {row.details.client_decision_note}</p>}
        </section>
        <div className={`admin-inquiry-record-followup${submitted ? "" : " admin-inquiry-record-columns"}`}>
          {!submitted && <AdminInquiryHistory row={row} />}
          <div className="admin-inquiry-record-corrections">
            <ClientCorrections key={row.id} id={row.id} details={row.details} admin reload={reloadCorrections} />
            <ClientCorrections key={`type:${row.id}`} id={row.id} details={row.details} admin projectType reload={reloadCorrections} />
          </div>
        </div>
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
    {pendingBanner && bannerTarget && createPortal(pendingBanner, bannerTarget)}
    {displayedOfficePage && row && !admin
      ? <OfficeInquiryWorkflow key={`${row.id}:${displayedOfficePage}:${row.details.project_type}`} row={row} page={displayedOfficePage} reference={inquiryReference(row)}
          consultation={consultationLabel(row.details)} busy={busy} error={dialog ? "" : error}
          pendingCount={pendingInquiries.length} justApproved={showOfficeApproval}
          navigate={navigateOffice} back={() => navigateOffice()} startStaffing={() => void run(startStaffing)}
          hasSignedContract={!!contractFileId}
          projectTypeCorrection={<ClientCorrections id={row.id} details={row.details} admin={false} projectType contractLocked={contractLocked} reload={reloadCorrections} />}
          signedContract={<FormSection title="Signed client contract" icon="doc" description="Upload the signed agreement between the Office PM and client before staffing.">
            {!contractLocked && <input ref={contractInput} type="file" aria-label="Signed client contract file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              if (!file.size || !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
                setError("Choose a nonempty PDF, PNG, or JPEG signed contract.")
                return
              }
              setError("")
              setPendingContract({ file, id: crypto.randomUUID() })
            }} />}
            {!contractLocked && <button type="button" className="button primary" disabled={busy} onClick={() => contractInput.current?.click()}>
              <Icon name="upload" size={17} />{contractFileId ? "Replace signed contract" : "Upload signed contract"}
            </button>}
            {contractFileId && <div className="inquiry-sent-notice inquiry-contract-preview">
              <span className="inquiry-list-icon"><Icon name="doc" /></span>
              <div><strong>{row.workflow?.signed_contract?.name || "Signed Client Contract Agreement"}</strong><small>{contractLocked ? "Locked agreement" : "Contract confirmed"}</small></div>
              <button type="button" className="button" disabled={busy} onClick={() => { setError(""); setContractPreviewOpen(true) }}>View contract</button>
            </div>}
          </FormSection>}
          decide={(action, input) => void run(() => decision(action, input))}
          save={(action, input) => void run(() => saveWorkflow(action, input))} />
      : <>
    {admin && <header className="inquiries-page-heading">
      <div>{embedded ? <h2>Project inquiries</h2> : <h1>Project inquiries</h1>}
        <p>Review saved inquiries or start a new project request.</p>
      </div>
      <button className="button" disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      <button className="button primary" disabled={busy} onClick={() => { open(); setDetails(adminInquiryDraft); setDraftId(""); setDraftBaseline(JSON.stringify(adminInquiryDraft)); setAdminFormStep(0); setLeaveInquiry(false); setAdminPage("new") }}><Icon name="plus" size={17} />New project inquiry</button>
    </header>}
    {!embedded && pendingBanner}
    {!admin && <section className="opm-inquiry-queue" aria-label="Project inquiry queue">
      <IntakePipelinePanel title="Inquiry queue" label="Inquiry pipeline" heading={embedded ? "h2" : "h1"}
        actions={<button type="button" className="button icon-button" aria-label="Refresh inquiries" title="Refresh inquiries"
            disabled={busy} onClick={() => void run(async () => {
            await refresh()
            await onReload()
          })}><Icon name="refresh" size={18} /></button>}>
        <div className="confirmation-intake-filters">
          <IntakeTabs value={queueView} counts={queueCounts} onChange={setQueueView} allLabel="All inquiries"
            help="Needs your action includes inquiry reviews, staffing actions, and missing documents. Waiting for others includes pending client decisions and Site PM responses when you have no remaining action." />
        </div>
        <div className="opm-inquiry-filters">
          <div className="inquiry-list-search">
            <Icon name="search" size={17} />
            <input type="search" aria-label="Search inquiries" placeholder="Search by project, client, or ID" value={search} onChange={event => setSearch(event.target.value)} />
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
      </IntakePipelinePanel>
      {queueRows && <p className="opm-inquiry-count" role="status">{queueRows.length} {queueRows.length === 1 ? "project inquiry" : "project inquiries"}</p>}
      {queueRows?.length ? <ul className="opm-inquiry-cards" aria-label="Assigned project inquiries">
          {queueRows.map(item => {
            const action = officeAction(item.status)
            const needsReview = item.status === "approved" && !item.workflow?.budget && !item.workflow?.assessment
            const label = needsReview ? "Review project information" : action?.label ?? "View inquiry"
            const setup = setupByInquiry.get(item.id)
            const project = setup?.project
            const uploaded = project ? registeredCount(project) : null
            const name = String(item.details.name || "Untitled project")
            const initials = name.trim().split(/\s+/u).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toLocaleUpperCase()
            const activity = item.updated_at ?? item.created_at
            const milestone = setup ? 4 : inquiryMilestone(item)
            const needsAction = officeBucket(item) === "action"
            const actionContext = setup ? "Required documents" : needsReview ? "Project information needs review"
              : item.status === "approved" && item.workflow?.assessment ? "Assessment completed" : action?.context
            const ready = item.status === "approved" && !setup
            return <li key={item.id} className="opm-inquiry-card" data-attention={needsAction} data-ready={ready}>
              <header className="opm-inquiry-card-header">
                <div className="opm-inquiry-identity">
                  <span className="opm-inquiry-initials" aria-hidden="true">{initials}</span>
                  <div><h3>{name}</h3><p>{item.details.project_type || "Project type unavailable"} · {inquiryReference(item)}{setup && " · Project setup"}</p></div>
                </div>
                <span className="inquiry-list-status" data-status={setup ? "setup" : item.status}>{officeStatus(item) || "Status unavailable"}</span>
              </header>
              <div className="opm-inquiry-card-body">
                <dl className="opm-inquiry-facts">
                  <div><dt>Client</dt><dd>{item.details.client_name || "Not provided"}</dd></div>
                  <div><dt>Last activity</dt><dd>{activity && Number.isFinite(Date.parse(activity))
                    ? <time dateTime={activity}>{inquiryActivityDate.format(new Date(activity))}</time> : "Not recorded"}</dd></div>
                  <div><dt>Project location</dt><dd>{item.details.address || "Not provided"}</dd></div>
                </dl>
                {milestone !== null && <InquiryProgress milestone={milestone} numbered />}
                <div className="opm-inquiry-action">
                  {actionContext && <div className="opm-inquiry-action-context">
                    <span className="opm-inquiry-action-icon"><Icon name={ready ? "check" : needsAction ? "clock" : "doc"} size={19} /></span>
                    <div>
                      <span className="opm-inquiry-action-label">Next action</span>
                      <strong>{actionContext}</strong>
                      {setup && <div className="opm-inquiry-document-progress">
                        {uploaded !== null ? <>
                          <span>{uploaded} of 6 uploaded</span>
                          <progress aria-label="Required documents uploaded" value={uploaded} max={6} />
                        </> : <span>Status unavailable</span>}
                      </div>}
                    </div>
                  </div>}
                  <div className="opm-inquiry-action-buttons">{setup ? <>
                    {setup.needsDocuments && project && <button type="button" className="button primary" disabled={busy}
                      onClick={() => onOpenDocuments?.(project)}>Upload required documents</button>}
                    <button type="button" className={needsAction && !setup.needsDocuments ? "button primary" : "button"} disabled={busy || !project}
                      onClick={() => project && onOpenAssignments?.(project)}>View assignment status <Icon name="chevron" size={16} /></button>
                  </> : <button type="button" className={needsAction ? "button primary" : "button"} disabled={busy} onClick={() => openOfficeInquiry(item)}
                      aria-label={`${label} for ${name}`}>
                      {label} <Icon name="chevron" size={16} />
                    </button>}</div>
                </div>
              </div>
            </li>
          })}
      </ul> : <div className="opm-inquiry-empty">
        <Icon name="folder" size={24} />
        <p>{officeRows?.length ? "No inquiries match the current filters." : officeRows ? "No open inquiries." : error ? "Inquiries could not be loaded." : "Loading inquiries…"}</p>
        {!!officeRows?.length && <button className="button" type="button" onClick={() => { setSearch(""); setQueueStatus(""); setQueueType(""); setQueueView("all") }}>Clear filters</button>}
      </div>}
    </section>}
    {admin && <section className="inquiry-list-panel" aria-labelledby="existing-inquiries-heading">
      <div className="inquiry-list-heading">
        <div>
          <h2 id="existing-inquiries-heading">Project Inquiry Log</h2>
          {rows && <p>{adminCurrent.length} current inquiries · {adminHistory.length} closed inquiries</p>}
        </div>
      </div>
      <div className="intake-tabs inquiry-log-tabs" role="group" aria-label="Inquiry records">
        <button type="button" aria-pressed={adminInquiryTab === "current" && adminInquiryFilter === "all"} onClick={() => changeAdminInquiryTab("current")}>Current inquiries ({adminCurrent.length})</button>
        <button type="button" aria-pressed={adminInquiryTab === "history"} onClick={() => changeAdminInquiryTab("history")}>Inquiry history ({adminHistory.length})</button>
        <button type="button" aria-pressed={adminInquiryTab === "current" && adminInquiryFilter === "action"} onClick={() => changeAdminInquiryFilter("action")}>Needs your action ({adminActionCount})</button>
        <button type="button" aria-pressed={adminInquiryTab === "current" && adminInquiryFilter === "waiting"} onClick={() => changeAdminInquiryFilter("waiting")}>Waiting for others ({adminWaitingCount})</button>
      </div>
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
      {(search || adminInquiryStatusFilter || adminInquiryTypeFilter) && <div className="inquiry-log-clear">
        <button type="button" className="button text-button" onClick={() => {
          setSearch("")
          setAdminInquiryStatusFilter("")
          setAdminInquiryTypeFilter("")
          resetInquiryPage()
        }}>Clear filters</button>
      </div>}
      {rows && <p className="list-count inquiry-log-count" role="status">{adminList.count} {adminList.count === 1 ? "inquiry" : "inquiries"}</p>}
      {adminVisibleRows.length ? <ul className="inquiry-log-cards">
        {adminList.view.items.map(item => {
          const name = item.details.name || "Untitled project"
          const status = adminInquiryStatus(item)
          const updated = item.updated_at && Number.isFinite(Date.parse(item.updated_at)) ? item.updated_at : undefined
          const updatedLabel = updated ? inquiryDate.format(new Date(updated)) : ""
          const nextAction = adminInquiryActions[status]
          const waiting = item.status === "offered" && item.opm_name
            ? `Waiting for ${item.opm_name} (Office PM) to respond`
            : inquiryWaiting[item.status]
          const milestone = inquiryMilestone(item)
          return <li key={item.id} className="inquiry-log-card">
            <div className="inquiry-log-card-header">
              <div className="inquiry-list-name"><h3>{name}</h3>
                <small>{[item.details.client_name, item.details.project_type, inquiryReference(item)].filter(Boolean).join(" · ")}</small>
              </div>
              <span className="inquiry-list-status" data-status={item.status}>{status}</span>
            </div>
            {milestone !== null && <InquiryProgress milestone={milestone} />}
            <div className="inquiry-log-footer">
              <div>
                {adminInquiryTab === "current" && (nextAction || waiting) && <p>{nextAction || waiting}</p>}
                {updated && <small>Updated <time dateTime={updated}>{updatedLabel}</time></small>}
              </div>
              <div className="inquiry-actions">
                {item.can_delete_draft && <button type="button" className="button danger-ghost" disabled={busy}
                  onClick={() => { setError(""); setDraftToDelete(item) }}>Delete draft</button>}
                <button type="button" className="button primary" disabled={busy} aria-label={`View inquiry for ${name}`}
                  onClick={() => { open(item); if (item.details.intake_draft !== "yes") setAdminPage("tracking") }}>
                  {item.details.intake_draft === "yes" ? "Continue draft" : "View inquiry"} <Icon name="chevron" size={16} />
                </button>
              </div>
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
    {admin && draftToDelete && <Modal title="Delete inquiry draft?" onClose={() => { if (!busy) setDraftToDelete(undefined) }} footer={<>
      <button type="button" className="button" disabled={busy} onClick={() => setDraftToDelete(undefined)}>Cancel</button>
      <button type="button" className="button danger" disabled={busy} onClick={() => void run(async () => {
        await api(`${root}/draft/${draftToDelete.id}`, { method: "DELETE" })
        setRows(previous => previous?.filter(item => item.id !== draftToDelete.id))
        setDraftToDelete(undefined)
        showActionResult("Inquiry draft deleted.")
      })}>Delete permanently</button>
    </>}>
      <p>Delete the draft for <strong>{draftToDelete.details.name || "Untitled project"}</strong>? You can’t undo this.</p>
      {error && <p role="alert">{error}</p>}
    </Modal>}
    {dialog === "details" && role === "opm" && row && <Modal title={String(row.details.name || "Inquiry details")} wide onClose={closeDialog}>
      <div className="inquiry-dialog-content">
        <div><span className="inquiry-pill">{statusLabel(row) || "Status unavailable"}</span></div>
        <InquiryDetails details={row.details} includeClient />
        {row.project_id && <ProjectClientAccount projectId={row.project_id} onSaved={onReload} />}
        <p>Preferred consultation timing: {consultationLabel(row.details)}</p>
        {row.reason && <p>Withdrawal reason: {row.reason}</p>}
        {row.details.client_decision_date && <p>Client decision confirmed on {row.details.client_decision_date}</p>}
        {row.details.client_decision_note && <p className="inquiry-overview">Internal decision note: {row.details.client_decision_note}</p>}
      </div>
    </Modal>}
    {finalizedClient && <Modal title="Project finalized" subtitle={finalizedClient.name} onClose={() => setFinalizedClient(undefined)}
      footer={<button type="button" className="button primary" onClick={() => setFinalizedClient(undefined)}>Done</button>}>
      <ProjectClientAccount projectId={finalizedClient.projectId} onSaved={onReload} />
      {finalizedClient.refreshFailed && <p>Refresh the inquiry list to see the finalized project.</p>}
    </Modal>}

    {dialog === "intake" && row?.status === "approved" && <Modal title={PROJECT_SETUP_LABEL} subtitle={String(row.details.name)} wide onClose={closeDialog} footer={<>
      <span className="inquiry-intake-progress">Step {step} of 3</span>
      <button type="button" className="button" disabled={busy} onClick={step === 2 ? closeDialog : () => setStep(2)}>{step === 2 ? "Back to assessment" : "Back"}</button>
      {step === 2 && <button className="button primary" disabled={busy || !canAllocate} onClick={() => {
        if (planning?.candidates) setStep(3)
        else void run(allocate)
      }}>Confirm and continue to staffing</button>}
      {step === 3 && <button className="button primary inquiry-send-offers" disabled={busy || !canSend}
        aria-describedby={staffingIssues.length ? "inquiry-staffing-phases" : undefined}
        onClick={() => void run(submit)}>Send assignment offers</button>}
    </>}>
      <div className="inquiry-dialog-content inquiry-intake">
        <ol ref={stepperRef} className="inquiry-stepper" aria-label={`${PROJECT_SETUP_LABEL} steps`}>
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
              <div><dt>Location</dt><dd>{row.details.address}</dd></div>
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
            <p className="inquiry-muted">{planning.phaseReview
              ? "Generated from the building uses and features confirmed in Project Details."
              : `All phases are required for ${String(row.details.project_type)} projects.`}</p>
            <table className="inquiry-phase-lineup">
              <thead><tr><th scope="col">Phase</th><th scope="col">Status</th></tr></thead>
              <tbody>{(planning.phaseReview ?? planning.phases.map(name => ({ name, required: true, included: true }))).map(phase =>
                <tr key={phase.name}>
                  <th scope="row">{phase.name}</th>
                  <td>{phase.included ? phase.required
                    ? <><Icon name="lock" size={14} /> Required</> : "Included" : "Out of scope"}</td>
                </tr>)}</tbody>
            </table>
            {!!phases.length && <details className="inquiry-license-window" open>
              <summary>Planned phase dates</summary>
              <p><strong>{arrangement}</strong> · {Object.keys(phaseDates).length ? "Review dates" : "System suggested"}</p>
              <p className="inquiry-muted">Review the suggested dates before staffing. Estimates use a Monday–Friday construction calendar.</p>
              <p className="inquiry-coverage-warning" role="note"><strong>Scheduling reminder:</strong> Mobilization must start first, on or after the reviewed project start date. Design and subsequent phases must follow their required predecessors, even when phases overlap.</p>
              {phaseCompletion && <p>Scheduled completion · {phaseCompletion}</p>}
              {phaseCompletion && end && phaseCompletion > end && <p className="error">
                The phase schedule exceeds the reviewed completion date of {end}.
              </p>}
              <button type="button" className="button" onClick={() => {
                setPhaseDates({})
                setTeam([])
                setPlanning({ ...planning, candidates: undefined })
              }}>Reset to suggested dates</button>
              {phaseScheduleIssue && <p className="error" role="status">
                Warning: Review {phaseScheduleIssue}. Use working dates within the project window and start no earlier than {dependencies[phaseScheduleIssue]?.start ?? start}. Mobilization must come first. Correct the dates or reset to suggested dates before continuing to Staffing.
              </p>}
              {phases.map(stage => <fieldset className="inquiry-phase-dates" key={stage}>
                <legend>{stage}</legend>
                {(["start", "end"] as const).map(field => <label key={field}>{field === "start" ? "Phase start" : "Phase end"}
                  <input type="date" min={field === "start" ? dependencies[stage]?.start ?? start : scheduledDates[stage]?.start ?? start} max={end}
                    aria-invalid={phaseScheduleIssue === stage || undefined} value={scheduledDates[stage]?.[field] ?? ""}
                    onChange={event => {
                      const value = event.target.value
                      setPhaseDates(previous => ({ ...previous, [stage]: { ...(scheduledDates[stage] ?? { start: "", end: "" }), [field]: value } }))
                      setTeam([])
                      setPlanning({ ...planning, candidates: undefined })
                    }} />
                </label>)}
                <p className="inquiry-muted">Estimated duration · {suggestions[stage]?.days} working days</p>
                {dependencies[stage]?.overlapWith && <p className="inquiry-muted">
                  May overlap with {dependencies[stage].overlapWith} if its work zone is released by {dependencies[stage].start}.
                </p>}
              </fieldset>)}
            </details>}
          </div>
        </fieldset>}
        {step === 3 && planning?.candidates && <fieldset className="inquiry-form-stack" disabled={busy}>
          <div><h3>Assign engineers by phase</h3><p className="inquiry-muted">{row.details.name} · {row.details.project_type}</p>
            {technical && <p>Technical requirements · {technical}</p>}
            {arrangement && <p>Phase arrangement · {arrangement}</p>}
          </div>
          <p><strong>One suggested Site PM per phase.</strong> Review the selection and add optional engineers manually when needed.</p>
          <p className="inquiry-muted">Each engineer must match 100% of their assigned responsibilities using verified tags. Team coverage shows how much of the whole phase is covered; add qualified engineers manually for remaining scopes.</p>
          <div id="inquiry-staffing-phases" className="inquiry-phase-nav" role="group" aria-label="Staffing phase">
            {phases.map(stage => {
              const reason = staffingIssueByPhase.get(stage)
              const unavailable = reason && !planning.candidates?.[stage]?.length
              return <button key={stage} type="button" className="button" aria-pressed={staffingPhase === stage}
                data-staffing-issue={!!reason} onClick={() => {
                  setStaffingPhase(stage)
                  setAddingEngineer(false)
                }}>
                {stage}
                {reason && <span className="inquiry-phase-warning"><Icon name="alert" size={14} />
                  {unavailable ? "No eligible engineer available" : "Needs staffing"}
                </span>}
              </button>
            })}
          </div>
          {selectedStaffingIssue && <p className="inquiry-coverage-warning" role="status"><strong>{staffingPhase}</strong> · {selectedStaffingIssue}</p>}
          <StaffingCards key={staffingPhase} stage={staffingPhase} entry={team.find(entry => entry.stage === staffingPhase)}
            suggested={planning.team?.find(entry => entry.stage === staffingPhase)}
            choices={planning.candidates[staffingPhase] || []} adding={addingEngineer} setAdding={setAddingEngineer}
            phaseRange={planning.staffing?.phase_dates?.[staffingPhase]} leadRange={projectRange}
            leadId={staffingLead?.stage === staffingPhase ? staffingLead.id : undefined}
            unavailable={planning.licenseUnavailable?.[staffingPhase]} backup={planningBackups[staffingPhase]}
            onBackup={id => setPlanningBackups(previous => ({ ...previous, [staffingPhase]: id }))}
            blocker={planning.candidateBlockers?.[staffingPhase]} onRecheck={() => void run(() => allocate())}
            scopeOptions={planning.additional_scope_options?.[staffingPhase]} onAddScope={scope => run(() => addStaffingScope(scope))}
            onChange={entry => setTeam(previous => [...previous.filter(item => item.stage !== entry.stage), entry])} />
          <StaffingPeak phases={phases} team={team} arrangement={arrangement} />
          <StaffingLineup phases={phases} team={team} candidates={planning.candidates} />
        </fieldset>}
        {feedback}
      </div>
    </Modal>}
    {canViewContract && pendingContract && <ContractPreview file={pendingContract.file} busy={busy} error={error}
      onClose={() => { if (!busy) { setPendingContract(undefined); setError("") } }}
      onConfirm={() => void run(confirmContract)} />}
    {canViewContract && contractPreviewOpen && contractFileId && <ContractPreview fileId={contractFileId} onClose={() => setContractPreviewOpen(false)} />}
    {admin && adminPage === "new" && renderAdminInquiryForm()}
    {!dialog && !officePage && adminPage !== "new" && feedback}
  </section>
}
