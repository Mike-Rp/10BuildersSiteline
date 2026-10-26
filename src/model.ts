import type { LicenseData } from "./licenseTypes.ts"
import { experienceYears, type EngineerExperience } from "../Thesis-Backend/src/domain/engineer-experience.js"
export const PHASES = [
  "Mobilization",
  "Design",
  "Foundation",
  "Structure",
  "MEP Rough-in",
  "Finishes",
  "Closeout",
]
export const DISCIPLINES = [
  "Civil",
  "Geotechnical",
  "Structural",
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Fire Protection",
  "Acoustic",
  "Interior/Finishes",
  "Landscape",
]
export type PhaseDefinition = {
  name: string
  disciplines: string[]
}
export const PROJECT_PHASE_DEFINITIONS: Record<"Residential" | "Commercial" | "Mixed-Use", PhaseDefinition[]> =
  {
    Residential: [
      { name: "Mobilization", disciplines: ["Civil", "Geotechnical"] },
      {
        name: "Design",
        disciplines: [
          "Civil",
          "Structural",
          "Mechanical",
          "Electrical",
          "Plumbing",
        ],
      },
      {
        name: "Foundation",
        disciplines: ["Geotechnical", "Structural"],
      },
      { name: "Structure", disciplines: ["Structural"] },
      { name: "Envelope", disciplines: ["Structural", "Civil"] },
      {
        name: "MEP Rough-In",
        disciplines: ["Mechanical", "Electrical", "Plumbing"],
      },
      {
        name: "Finishes",
        disciplines: ["Interior/Finishes", "Electrical", "Plumbing"],
      },
      {
        name: "Landscape & Site Works",
        disciplines: ["Landscape", "Civil"],
      },
      { name: "Closeout", disciplines: ["Civil", "Interior/Finishes"] },
    ],
    Commercial: [
      { name: "Mobilization", disciplines: ["Civil", "Geotechnical"] },
      {
        name: "Design",
        disciplines: [
          "Civil",
          "Structural",
          "Mechanical",
          "Electrical",
          "Plumbing",
          "Acoustic",
        ],
      },
      {
        name: "Foundation",
        disciplines: ["Geotechnical", "Structural"],
      },
      { name: "Structure", disciplines: ["Structural"] },
      {
        name: "Envelope / Curtain Wall",
        disciplines: ["Structural", "Civil"],
      },
      {
        name: "MEP Rough-In",
        disciplines: [
          "Mechanical",
          "Electrical",
          "Plumbing",
          "Fire Protection",
        ],
      },
      {
        name: "Fire & Life Safety",
        disciplines: ["Fire Protection", "Electrical"],
      },
      {
        name: "Fit-Out / Finishes",
        disciplines: ["Interior/Finishes", "Acoustic", "Electrical"],
      },
      {
        name: "Closeout",
        disciplines: ["Civil", "Fire Protection", "Interior/Finishes"],
      },
    ],
    "Mixed-Use": [
      { name: "Mobilization", disciplines: ["Civil", "Geotechnical"] },
      {
        name: "Design",
        disciplines: [
          "Civil",
          "Structural",
          "Mechanical",
          "Electrical",
          "Plumbing",
          "Acoustic",
        ],
      },
      {
        name: "Foundation",
        disciplines: ["Geotechnical", "Structural"],
      },
      {
        name: "Podium Structure",
        disciplines: ["Structural", "Civil"],
      },
      { name: "Tower Structure", disciplines: ["Structural"] },
      {
        name: "Envelope / Curtain Wall",
        disciplines: ["Structural", "Civil"],
      },
      {
        name: "MEP Rough-In",
        disciplines: [
          "Mechanical",
          "Electrical",
          "Plumbing",
          "Fire Protection",
        ],
      },
      {
        name: "Fire & Life Safety",
        disciplines: ["Fire Protection", "Electrical"],
      },
      {
        name: "Retail/Commercial Fit-Out",
        disciplines: ["Interior/Finishes", "Acoustic", "Electrical"],
      },
      {
        name: "Residential Fit-Out",
        disciplines: ["Interior/Finishes", "Plumbing", "Electrical"],
      },
      {
        name: "Landscape & Site Works",
        disciplines: ["Landscape", "Civil"],
      },
      {
        name: "Closeout",
        disciplines: ["Civil", "Fire Protection", "Interior/Finishes"],
      },
    ],
  }
// Selectable project types; legacy database rows may still exist.
export const PROJECT_TYPES = ["Residential", "Commercial", "Mixed-Use"]
export const ROLE_NAMES = {
  admin: "Administrator",
  opm: "Office PM",
  spm: "Site PM",
  client: "Client",
}
export type Role = keyof typeof ROLE_NAMES
export type Doc = {
  id: string
  label: string
  name: string
  url?: string
  subjectId?: string
  uploaded: boolean
  clientVisible: boolean
  owner: string
  date: string
  size?: number
  mime?: string
  manpowerCount?: number
}
export type Account = {
  id: string
  name: string
  role: Role
  email: string
  phone: string
  contactPerson?: string
  certifications?: string[]
  scope: string[]
  projectTypes: string[]
  experienceByType?: EngineerExperience
  status: "active" | "invited" | "suspended" | "deactivated" | "pending-setup"
  added: string
  lastName?: string
  license: string
  expiry: string
  renewed?: boolean
  renewalUnderReview?: boolean
  cooldown?: number
  suspendedAt?: string
  eligibleForNewAssignment?: boolean
  assignmentHold?: boolean
  resignation?: ResignationRecord
  resignationHistory?: ResignationRecord[]
  docs: Doc[]
}
export type ResignationRecord = {
  status: "notice" | "deactivated"
  noticeDays: number
  submittedAt: string
  effectiveDate: string
  confirmedById: string
  confirmedBy: string
  confirmedAt: string
  letter: Doc
  deactivatedAt?: string
}
export type ClientSubconIssue = {
  id: string
  text: string
  byId: string
  by: string
  at: string
  status: "open" | "resolved"
  resolvedAt?: string
  resolvedBy?: string
  resolution?: string
}
export type ClientSubconReview = {
  acknowledgedById?: string
  acknowledgedBy?: string
  acknowledgedAt?: string
  issues: ClientSubconIssue[]
}
export type Project = {
  handoffReadiness?: { state: "blocked" | "incomplete" | "unknown" | "inactive" | "final" | "ready"; stageId: string; reason?: string; reasonCode?: string }
  handoffBlocker?: string
  checklistProgress?: PhaseProgress[]
  verifiedProgress?: import("./project-progress").VerifiedProgress
  id: string
  name: string
  type: string
  area: string
  floors: string
  start: string
  end?: string
  clientId: string
  clientAccounts?: { id: string; name: string; email: string; phone: string; contactPerson?: string }[]
  status: "active" | "pending" | "changes_requested" | "draft" | "completed" | "declined" | "expired"
  opmId: string
  team: {
    phase: string
    accountId: string
    status: "pending" | "confirmed" | "declined"
    requiredDisciplines?: string[]
    sequence?: number
  }[]
  phase: string
  progress: number
  opmAccepted: boolean
  docs: Doc[]
  created: string
  location: string
  note: string
  excludedOpms: string[]
  clientSubcon?: string
  clientSubconEmail?: string
  clientSubconReview?: ClientSubconReview
  workflow?: ProjectWorkflow
  history: {
    id?: string
    date: string
    text: string
    progress: number
    clientVisible?: boolean
    phase?: string
    issue?: boolean
    authorId?: string
    evidence?: Doc
  }[]
}
export type PhaseProgress = {
  id: string
  name: string
  configured: boolean
  approved: number
  required: number
  status?: import("../Thesis-Backend/src/domain/construction-phase-progress.js").ConstructionPhaseStatus
  locked?: boolean
}
export type Company = {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  status: "pending" | "approved" | "rejected" | "archived"
  submittedBy: string
  projectId: string
  availability: "available" | "limited" | "committed"
  manpowerCount: number
  activeProjectIds: string[]
  manpowerDocuments: Doc[]
  documents: Doc[]
  note: string
  committedUntil?: string
  version: number
  submittedById?: string
  archivedAt?: string
  archivedBy?: string
}
export type ChecklistItem = {
  id: string
  evidenceId?: string
  label: string
  required?: boolean
  weight?: number
  status: "missing" | "submitted" | "approved" | "rework_required"
  reworkReason?: string
  version: number
  doc?: Doc
  // The Site PM's note when uploading the evidence.
  submissionNote?: string
  // The Office PM's reason when rejecting it. Kept apart from the submission note.
  reviewNote?: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  escalated?: boolean
  submittedBy?: string
  submittedByName?: string
}
export type ProgressSubmission = {
  id: string
  version: number
  authorId: string
  submittedAt: string
  note: string
  issues: string[]
  priorPhase: string
  priorProgress: number
  requestedPhase: string
  requestedProgress: number
  // The first attachment, kept for code that handles a single file.
  evidence?: Doc
  // Every file attached to the report (a report can have several).
  attachments?: Doc[]
  escalated?: boolean
}
// All files of a progress report or rework submission, whichever field carries them.
export function submissionDocs(submission?: Pick<ProgressSubmission, "attachments" | "evidence">): Doc[] {
  if (!submission) return []
  if (submission.attachments?.length) return submission.attachments
  return submission.evidence ? [submission.evidence] : []
}
export function fileSizeLabel(bytes?: number) {
  if (!bytes || bytes < 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
export type SubcontractorSelection = {
  companyId: string
  status: "selected" | "contacted" | "accepted" | "declined" | "replaced" | "archived"
  contactAt?: string
  contactLog?: string[]
  responseAt?: string
  replacedAt?: string
  replacedBy?: string
  archivedAt?: string
  archivedBy?: string
}
export type AssignmentResponse = {
  id: string
  accountId: string
  phase: string
  status: "accepted" | "declined" | "expired"
  date: string
  note: string
}
export type ProjectWorkflow = {
  version: number
  completedAt?: string
  acceptedAt?: string
  documentsCompletedAt?: string
  activation?: {
    byId: string
    by: string
    at: string
  }
  deadline?: {
    accountId: string
    soft: string
    hard: string
    expired?: boolean
  }
  responses: AssignmentResponse[]
  selections: SubcontractorSelection[]
  checklist: Record<string, ChecklistItem[]>
  pendingUpdate?: ProgressSubmission
  pendingRework?: ProgressSubmission
  updateRequested?: {
    by: string
    date: string
  }
  progressBase?: number
  progressStart?: number
  progressAnchor?: number
  handoff?: {
    from: string
    to: string
    fromId: string
    toId: string
    date: string
  }
  notes: {
    id: string
    authorId: string
    text: string
    date: string
  }[]
  photos: Doc[]
  documentArchive?: Doc[]
  changesHistory?: {
    date: string
    note: string
    opmId: string
  }[]
}
export type Event = {
  accountId?: string
  id: string
  title: string
  detail: string
  type: string
  date: string
  read: boolean
  target: string
  actorId?: string
  projectId?: string
  recipientIds?: string[]
  readBy?: string[]
}
export type Rules = {
  grace: number
  cap: number
  response: number
  idle: number
  reminderDays?: number[]
}
export type State = {
  backendPhases?: Record<string,PhaseDefinition[]>
  referenceDisciplines?: string[]
  accounts: Account[]
  projects: Project[]
  companies: Company[]
  events: Event[]
  rules: Rules
  muted: string[]
  userPreferences?: Record<string, string[]>
  portalReads?: Record<string, string[]>
  license?: LicenseData
}
export const uid = () => crypto.randomUUID()
export const today = () => new Date().toISOString().slice(0, 10)
export const initials = (s: string) =>
  s.split(" ")
    .filter((x) => x.length > 1)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
export const dateLabel = (d: string) =>
  new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  )
const DAY_MS = 86_400_000
const dayValue = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z")
export const plannedDays = (start?: string, end?: string) =>
  start && end ? Math.round((dayValue(end) - dayValue(start)) / DAY_MS) : null
export const endAfterStart = (start: string, end: string) =>
  !!start && !!end && dayValue(end) > dayValue(start)

// Project dates are based on the user's LOCAL calendar day (not UTC).
const pad2 = (n: number) => String(n).padStart(2, "0")
export const localToday = (now: Date = new Date()) =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
export const addDays = (iso: string, days: number) =>
  new Date(dayValue(iso) + days * DAY_MS).toISOString().slice(0, 10)
export const MAX_PROJECT_YEARS_AHEAD = 10
export const latestProjectDate = (now: Date = new Date()) => {
  const [y, m, d] = localToday(now).split("-").map(Number)
  const lastDay = new Date(Date.UTC(y + MAX_PROJECT_YEARS_AHEAD, m, 0)).getUTCDate()
  return `${y + MAX_PROJECT_YEARS_AHEAD}-${pad2(m)}-${pad2(Math.min(d, lastDay))}`
}
const isRealDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  )
}
export const DATE_ERRORS = {
  invalid: "Enter a valid date.",
  startPast: "Start date can't be before today.",
  endNotAfter: "End date must be after the start date.",
  tooFar: "Date is too far in the future.",
}
/** Validates target start/end for a NEW project. Empty values are not errors here (required-ness is checked separately). */
export function projectDateErrors(
  start: string,
  end: string,
  now: Date = new Date(),
): { start?: string; end?: string } {
  const out: { start?: string; end?: string } = {}
  const t = localToday(now)
  const max = latestProjectDate(now)
  const startOk = !!start && isRealDate(start)
  if (start) {
    if (!startOk) out.start = DATE_ERRORS.invalid
    else if (start < t) out.start = DATE_ERRORS.startPast
    else if (start > max) out.start = DATE_ERRORS.tooFar
  }
  if (end) {
    if (!isRealDate(end)) out.end = DATE_ERRORS.invalid
    else if (end > max) out.end = DATE_ERRORS.tooFar
    else if (startOk && !out.start && !endAfterStart(start, end))
      out.end = DATE_ERRORS.endNotAfter
    else if (!startOk && end <= t) out.end = DATE_ERRORS.endNotAfter
  }
  return out
}
export const startsInLabel = (start: string, now: Date = new Date()) => {
  const n = plannedDays(localToday(now), start)
  if (n === null || n < 0) return ""
  return n === 0 ? "Starts today" : `Starts in ${n} ${n === 1 ? "day" : "days"}`
}
export function timelineStatus(p: {
  start: string
  end?: string
  progress: number
}) {
  const total = plannedDays(p.start, p.end)
  if (!total || total <= 0) return null
  const now = dayValue(today())
  const elapsedDays = Math.round((now - dayValue(p.start)) / DAY_MS)
  const remaining = total - elapsedDays
  const elapsedPct = Math.min(
    100,
    Math.max(0, Math.round((elapsedDays / total) * 100)),
  )
  let tone: "" | "green" | "amber" | "red" = ""
  let label = "On schedule"
  if (elapsedDays < 0) label = "Not yet started"
  else if (p.progress >= 100) {
    tone = "green"
    label = "Completed"
  } else if (remaining < 0) {
    tone = "red"
    label = `${-remaining} days past target end`
  } else if (p.progress < elapsedPct - 10) {
    tone = "amber"
    label = "Behind planned timeline"
  } else tone = "green"
  return { total, elapsedDays, remaining, elapsedPct, tone, label }
}
export const DOC_LABELS = [
  "Notice to Proceed",
  "Approved Building Permit",
  "Signed Owner-Contractor Agreement",
  "Structural & Architectural Plans (Registered)",
  "Environmental Compliance Certificate",
  "Project Budget & Bill of Quantities",
  "Site PM–Subcontractor Agreement",
]
export function projectDocs(uploaded = false): Doc[] {
  return DOC_LABELS.map((label, i) => ({
    id: uid(),
    label,
    name: uploaded ? `${label}.pdf` : "",
    uploaded,
    clientVisible: [0, 1, 3, 4].includes(i),
    owner: i === 6 ? "Lead Site PM" : "Office PM",
    date: uploaded ? "2026-07-24" : "",
  }))
}
export const DOCUMENT_UPLOAD_LIMIT_MB = 10
export const MANPOWER_UPLOAD_LIMIT_MB = 15
export function uploadRequirements(spreadsheet = false) {
  return spreadsheet
    ? `XLSX or XLS · Maximum ${MANPOWER_UPLOAD_LIMIT_MB} MB per file`
    : `PDF, JPG, JPEG or PNG · Maximum ${DOCUMENT_UPLOAD_LIMIT_MB} MB per file`
}
export function validateFile(file: File, spreadsheet = false) {
  const extensions = spreadsheet
    ? ["xlsx", "xls"]
    : ["pdf", "jpg", "jpeg", "png"]
  const max = spreadsheet ? MANPOWER_UPLOAD_LIMIT_MB : DOCUMENT_UPLOAD_LIMIT_MB
  if (!file.size) return "Choose a non-empty file."
  if (!extensions.includes(file.name.split(".").pop()?.toLowerCase() || ""))
    return `Use ${extensions.join(", ").toUpperCase()} files only.`
  if (file.size > max * 1024 * 1024)
    return `The file must be ${max} MB or smaller.`
  return ""
}
// Whole days from the viewer's LOCAL today to a YYYY-MM-DD date (negative once it has passed).
export function daysUntil(day: string) {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number)
  const now = new Date()
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}
// Step 1: an engineer is being assigned and their license ends before the project does.
export function licenseExpiresDuringProject(expiry?: string, projectEnd?: string) {
  return Boolean(expiry && projectEnd) && expiry!.slice(0, 10) < projectEnd!.slice(0, 10)
}
export function licenseExpired(a: { expiry: string }) {
  return Boolean(a.expiry) && daysUntil(a.expiry) < 0
}
// The grace period starts the day after expiry. The first expired day shows the full period, the last day shows 1.
export function licenseGrace(a: { expiry: string }, grace = 30) {
  if (!licenseExpired(a)) return { expired: false, ended: false, daysLeft: null as number | null }
  const days = daysUntil(a.expiry)
  const ended = days < -grace
  return { expired: true, ended, daysLeft: ended ? null : grace + days + 1 }
}
export function licenseState(
  a: {
    expiry: string
    renewed?: boolean
    renewalUnderReview?: boolean
  },
  grace = 7,
  window = 60,
) {
  if (a.renewed) return "Renewed"
  if (a.renewalUnderReview) return "Renewal under review"
  if (!a.expiry) return "Not on file"
  const days = daysUntil(a.expiry)
  return days < -grace
    ? "Grace expired"
    : days < 0
      ? "Expired"
      : days <= window
        ? "Expiring soon"
        : "Valid"
}
export function requiredTags(type: string, phase: string) {
  const generated = PROJECT_PHASE_DEFINITIONS[
    (type as keyof typeof PROJECT_PHASE_DEFINITIONS)
  ]?.find((item) => item.name === phase)
  if (generated) return [...generated.disciplines]
  const commercial: Record<string, string[]> = {
    Mobilization: ["Civil", "Geotechnical"],
    Design: ["Structural", "Civil", "Mechanical", "Electrical", "Plumbing"],
    Foundation: ["Structural", "Geotechnical"],
    Structure: ["Structural"],
    "MEP Rough-in": ["Mechanical", "Electrical", "Plumbing", "Fire Protection"],
    Finishes: ["Mechanical"],
    Closeout: DISCIPLINES,
  }
  const residential: Record<string, string[]> = {
    ...commercial,
    Mobilization: ["Civil"],
    Design: ["Structural", "Civil"],
    "MEP Rough-in": ["Mechanical", "Electrical", "Plumbing"],
    Finishes: [],
  }
  const mixed: Record<string, string[]> = {
    ...commercial,
    Design: [...commercial.Design, "Acoustic"],
    "MEP Rough-in": [...commercial["MEP Rough-in"], "Acoustic"],
    Finishes: ["Mechanical", "Fire Protection"],
  }
  return (
    (type === "Residential"
      ? residential
      : type === "Mixed-Use"
        ? mixed
        : commercial)[phase] || []
  )
}
export function phaseDefinitions(type: string): PhaseDefinition[] {
  const definitions =
    PROJECT_PHASE_DEFINITIONS[
      (type as keyof typeof PROJECT_PHASE_DEFINITIONS)
    ] || PHASES.map((name) => ({ name, disciplines: requiredTags(type, name) }))
  return definitions.map((item) => ({
    name: item.name,
    disciplines: [...item.disciplines],
  }))
}
export function projectPhaseNames(p: Pick<Project, "team">) {
  return p.team
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.sequence ?? a.index) - (b.row.sequence ?? b.index))
    .map(({ row }) => row.phase)
}
export function projectPhaseDisciplines(
  p: Pick<Project, "type" | "team">,
  phase: string,
) {
  return (
    p.team.find((row) => row.phase === phase)?.requiredDisciplines ||
    requiredTags(p.type, phase)
  )
}
export function workload(state: State, id: string, excluding = "") {
  return state.projects.filter(
    (p) =>
      p.id !== excluding &&
      p.status === "active" &&
      (p.opmId === id || p.team.some((t) => t.accountId === id)),
  ).length
}
export function eligible(state: State, a: Account, role: Role, excluding = "") {
  return (
    a.role === role &&
    a.status === "active" &&
    !a.assignmentHold &&
    a.eligibleForNewAssignment !== false &&
    !licenseExpired(a) &&
    workload(state, a.id, excluding) < state.rules.cap &&
    !(a.cooldown && a.cooldown > Date.now())
  )
}
export function opmCandidates(
  state: State,
  type: string,
  excluding = "",
  excluded: string[] = [],
) {
  return state.accounts
    .filter(
      (a) => eligible(state, a, "opm", excluding) && !excluded.includes(a.id),
    )
    .sort(
      (a, b) =>
        Number(b.projectTypes.includes(type)) -
          Number(a.projectTypes.includes(type)) ||
        experienceYears(b.experienceByType, type) - experienceYears(a.experienceByType, type) ||
        workload(state, a.id, excluding) - workload(state, b.id, excluding) ||
        a.name.localeCompare(b.name),
    )
}
export function spmCandidates(
  state: State,
  type: string,
  phase: string,
  excluding = "",
) {
  const tags = state.backendPhases?.[type]?.find(p=>p.name===phase)?.disciplines || requiredTags(type, phase)
  const activeLeads = state.projects
    .filter((p) => p.id !== excluding && p.status === "active")
    .map((p) => p.team.find((row) => row.phase === "Mobilization")?.accountId)
  return state.accounts
    .filter(
      (a) =>
        eligible(state, a, "spm", excluding) && !activeLeads.includes(a.id),
    )
    .map((a) => ({
      account: a,
      matched: tags.filter((t) => a.scope.includes(t)).length,
      total: tags.length,
    }))
    .filter((candidate) => !tags.length || candidate.matched > 0)
    .sort(
      (a, b) =>
        b.matched - a.matched ||
        experienceYears(b.account.experienceByType, type) - experienceYears(a.account.experienceByType, type) ||
        workload(state, a.account.id, excluding) -
          workload(state, b.account.id, excluding) ||
        a.account.name.localeCompare(b.account.name),
    )
}
export function headcount(type: string, area: string, floors: string) {
  const sqm = Number(area.replace(/,/g, ""))
  const levels = Number(floors)
  const multiplier =
    sqm >= 30000 || levels >= 25 ? 3 : sqm >= 10000 || levels >= 10 ? 2 : 1
  const base = phaseDefinitions(type)
    .filter((phase) => phase.name !== "Closeout")
    .reduce((sum, phase) => sum + phase.disciplines.length, 0)
  return {
    base,
    total: base * multiplier,
    tier: ["Small", "Medium", "Large"][multiplier - 1],
    multiplier,
  }
}
export const WORK_EMAIL_DOMAIN = "10builders.com"
const emailPart = (name: string) =>
  name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")

// lastname.firstname, then lastname.firstname.middleinitial, then a number on the
// last form that is still free. `accounts` must include deactivated accounts:
// a company email is never reused.
export function suggestWorkEmail(
  names: { first: string; middle?: string; last: string },
  accounts: Pick<Account, "email">[],
) {
  const first = emailPart(names.first), last = emailPart(names.last)
  if (!first || !last) return ""
  const initial = emailPart(names.middle || "").charAt(0)
  const taken = new Set(accounts.map((a) => a.email.trim().toLowerCase()))
  const address = (local: string) => `${local}@${WORK_EMAIL_DOMAIN}`
  const base = `${last}.${first}`
  if (!taken.has(address(base))) return address(base)
  const withInitial = initial ? `${base}.${initial}` : base
  if (initial && !taken.has(address(withInitial))) return address(withInitial)
  for (let n = 2; ; n++) if (!taken.has(address(withInitial + n))) return address(withInitial + n)
}

export function accountError(
  a: Pick<Account, "id" | "name" | "email" | "role" | "scope" | "projectTypes">,
  state: State,
) {
  if (!a.name.trim() || !a.email.trim())
    return "Full name and email are required."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
    return "Enter a valid email address."
  if (
    state.accounts.some(
      (x) => x.id !== a.id && x.email.toLowerCase() === a.email.toLowerCase(),
    )
  )
    return "This email is already assigned to another account."
  if (
    a.role === "spm" &&
    (!a.scope.length ||
      a.scope.length > 3 ||
      a.scope.some((t) => !(state.referenceDisciplines || DISCIPLINES).includes(t)))
  )
    return "Choose one to three valid discipline tags."
  if (
    a.role === "opm" &&
    (!a.projectTypes.length ||
      a.projectTypes.length > 2 ||
      a.projectTypes.some(
        (t) => !["Residential", "Commercial", "Mixed-Use"].includes(t),
      ))
  )
    return "Choose one or two project specializations."
  if (a.role === "client" && !a.scope.length)
    return "Link at least one project to the client account."
  return ""
}
export function clientForEmail(
  state: Pick<State, "accounts">,
  email: string,
  excludingId = "",
) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return undefined
  return state.accounts.find(
    (account) =>
      account.id !== excludingId &&
      account.role === "client" &&
      account.email.toLowerCase() === normalized,
  )
}
export function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@"
  return Array.from(
    crypto.getRandomValues(new Uint32Array(12)),
    (n) => chars[n % chars.length],
  ).join("")
}
export function emptyState(): State {
  return {
    accounts: [],
    projects: [],
    companies: [],
    events: [],
    rules: { grace: 30, cap: 2, response: 3, idle: 15 },
    muted: [],
  }
}
