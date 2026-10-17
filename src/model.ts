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
export const PROJECT_TYPES = [
  "Residential",
  "Commercial",
  "Mixed-Use",
  "Infrastructure",
  "Industrial",
  "Renovation",
]
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
  status: "active" | "invited" | "suspended" | "deactivated" | "pending-setup"
  added: string
  license: string
  expiry: string
  renewed?: boolean
  cooldown?: number
  suspendedAt?: string
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
  id: string
  name: string
  type: string
  area: string
  floors: string
  start: string
  end?: string
  clientId: string
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
  label: string
  status: "missing" | "submitted" | "approved"
  version: number
  doc?: Doc
  note?: string
  submittedAt?: string
  reviewedAt?: string
  escalated?: boolean
  submittedBy?: string
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
  evidence?: Doc
  escalated?: boolean
}
export type SubcontractorSelection = {
  companyId: string
  status: "selected" | "contacted" | "accepted" | "declined" | "replaced" | "archived"
  contactAt?: string
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
}
export type State = {
  accounts: Account[]
  projects: Project[]
  companies: Company[]
  events: Event[]
  rules: Rules
  muted: string[]
  userPreferences?: Record<string, string[]>
  portalReads?: Record<string, string[]>
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
export function validateFile(file: File, spreadsheet = false) {
  const extensions = spreadsheet
    ? ["xlsx", "xls"]
    : ["pdf", "jpg", "jpeg", "png"]
  const max = spreadsheet ? 15 : 10
  if (!extensions.includes(file.name.split(".").pop()?.toLowerCase() || ""))
    return `Use ${extensions.join(", ").toUpperCase()} files only.`
  if (file.size > max * 1024 * 1024)
    return `The file must be ${max} MB or smaller.`
  return ""
}
export function licenseState(
  a: {
    expiry: string
    renewed?: boolean
  },
  grace = 7,
) {
  if (a.renewed) return "Renewed"
  if (!a.expiry) return "Not on file"
  const days = Math.ceil((new Date(a.expiry).getTime() - Date.now()) / 86400000)
  return days < -grace
    ? "Grace expired"
    : days < 0
      ? "Expired"
      : days <= 90
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
    licenseState(a, state.rules.grace) !== "Grace expired" &&
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
  const tags = requiredTags(type, phase)
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
      a.scope.some((t) => !DISCIPLINES.includes(t)))
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
export function scheduleSeries(seed = 1, progress = 62) {
  let n = seed
  const random = () => {
    n = (n * 16807) % 2147483647
    return n / 2147483647
  }
  let actual = 0
  let previousPlanned = 0
  return Array.from({ length: 13 }, (_, i) => {
    const planned = 50 - 50 * Math.cos((Math.PI * i) / 16)
    const candidate = Math.max(
      0,
      Math.min(100, planned - (i / 16) * 5 + (random() - 0.5) * 1.8),
    )
    const prev = actual
    actual = Math.max(actual, candidate)
    const row = {
      planned,
      actual,
      plannedDaily: planned - previousPlanned,
      actualDaily: actual - prev,
    }
    previousPlanned = planned
    return row
  }).map((row) => ({ ...row, sampleProgress: progress }))
}
const SEED_PHONES: Record<string, string> = {
  a1: "0917 331 4420",
  a2: "0917 482 1036",
  a3: "0918 225 7741",
  a4: "0917 609 3352",
  a5: "0919 714 2268",
  a6: "0918 390 5517",
  a7: "0917 856 0943",
  a8: "0919 263 8105",
  a9: "0917 540 6629",
}
function account(
  id: string,
  name: string,
  role: Role,
  scope: string[] = [],
  types: string[] = [],
): Account {
  return {
    id,
    name,
    role,
    scope,
    projectTypes: types,
    email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ").at(-1)?.toLowerCase()}@10builders.com`,
    phone: SEED_PHONES[id] || "0917 331 4420",
    status: "active",
    added: "2026-02-14",
    license:
      role === "opm" || role === "spm"
        ? `PRC Registered Engineer No. 00${id.replace(/\D/g, "")}1234`
        : "",
    expiry: role === "opm" || role === "spm" ? "2027-08-18" : "",
    docs: [],
  }
}
export function initialState(): State {
  const accounts = [
    account("a1", "Patricia N. Domingo", "admin"),
    account("a2", "Renz D. Villaverde", "opm", [], [
      "Residential",
      "Mixed-Use",
    ]),
    account("a3", "Lea M. Fernandez", "opm", [], ["Commercial", "Mixed-Use"]),
    account("a4", "Karlo M. Espiritu", "spm", [
      "Structural",
      "Civil",
      "Landscape",
    ]),
    account("a5", "Rafael D. Mercado", "spm", [
      "Mechanical",
      "Electrical",
      "Plumbing",
    ]),
    account("a6", "Mikaela Bautista", "spm", [
      "Civil",
      "Geotechnical",
      "Structural",
    ]),
    account("a7", "Diego A. Salvador", "spm", [
      "Structural",
      "Fire Protection",
      "Acoustic",
    ]),
    account("a8", "Bea R. Concepcion", "spm", [
      "Civil",
      "Electrical",
      "Interior/Finishes",
    ]),
    account("a9", "Ferdinand Uy", "client", ["p1", "p4"]),
  ]
  accounts[8].email = "f.uy@aldenheights-hoa.com"
  accounts[7].expiry = new Date(Date.now() + 35 * 86400000)
    .toISOString()
    .slice(0, 10)
  accounts.push({
    ...account("a10", "Jomar T. Reyes", "spm", ["Civil"]),
    status: "suspended",
    suspendedAt: new Date(Date.now() - 87 * 86400000)
      .toISOString()
      .slice(0, 10),
  })
  const seedProject = (
    id: string,
    name: string,
    type: string,
    phase: string,
    progress: number,
    opmId: string,
    spmId: string,
    status: Project["status"] = "active",
  ): Project => ({
    id,
    name,
    type,
    phase,
    progress,
    opmId,
    clientId: "a9",
    area: "9,120",
    floors: "6",
    start: "2026-03-10",
    end: "2027-04-30",
    location: "Metro Manila, Philippines",
    status,
    opmAccepted: status === "active" || status === "completed",
    team: PHASES.map((p) => ({
      phase: p,
      accountId: spmId,
      status:
        status === "active" || status === "completed" ? "confirmed" : "pending",
    })),
    docs: projectDocs(status === "active" || status === "completed"),
    created: "2026-07-20",
    note: "",
    excludedOpms: [],
    history: [
      {
        date: "2026-07-28",
        text: "Latest site progress reviewed by Office PM.",
        progress,
      },
    ],
  })
  const projects = [
    seedProject(
      "p1",
      "Rosaria Business Park",
      "Commercial",
      "Structure",
      62,
      "a2",
      "a6",
    ),
    seedProject(
      "p2",
      "Meralco Ave. Fit-out",
      "Renovation",
      "Finishes",
      91,
      "a3",
      "a8",
    ),
    seedProject(
      "p3",
      "Brookfield Warehouse Ext.",
      "Commercial",
      "Design",
      12,
      "a3",
      "a7",
    ),
    seedProject(
      "p4",
      "Alden Heights Residences — Tower B",
      "Residential",
      "Mobilization",
      0,
      "a2",
      "a4",
      "pending",
    ),
    seedProject(
      "p5",
      "Sto. Niño Bridge Widening",
      "Infrastructure",
      "Mobilization",
      0,
      "a2",
      "a7",
      "changes_requested",
    ),
    seedProject(
      "p6",
      "Cavite Cold Storage Facility",
      "Industrial",
      "Closeout",
      100,
      "a2",
      "a7",
      "completed",
    ),
    seedProject(
      "p7",
      "Biñan Elevated Walkway",
      "Infrastructure",
      "Mobilization",
      0,
      "a3",
      "a6",
      "declined",
    ),
  ]
  projects[3].area = "18,400"
  projects[3].floors = "22"
  projects[3].start = "2026-09-01"
  projects[3].end = "2027-12-31"
  projects[3].team = PHASES.map((phase, i) => ({
    phase,
    accountId: i === 0 ? "a4" : "a5",
    status: "pending",
  }))
  projects[4].note =
    "Office PM requested revised staffing. Select a replacement Office PM to resubmit."
  projects[4].excludedOpms = ["a2"]
  const companies: Company[] = [
    {
      id: "c1",
      name: "Meridian Rebar & Formworks",
      contact: "Ramil D. Escueta",
      phone: "0917-224-5510",
      email: "projects@meridianrebar.ph",
      status: "approved",
      submittedBy: "Karlo M. Espiritu",
      projectId: "p1",
      availability: "available",
      manpowerCount: 3,
      activeProjectIds: ["p1"],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c2",
      name: "Cordova Electrical Systems",
      contact: "Alexis M. Cordova",
      phone: "0917-555-2091",
      email: "info@cordovaelectrical.ph",
      status: "approved",
      submittedBy: "",
      projectId: "p2",
      availability: "committed",
      manpowerCount: 2,
      activeProjectIds: ["p1", "p2"],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c3",
      name: "Isla Glass & Curtain Wall",
      contact: "Peter John Isla",
      phone: "0917-660-2214",
      email: "contact@islaglass.ph",
      status: "approved",
      submittedBy: "",
      projectId: "",
      availability: "available",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c4",
      name: "Tagaytay Steel Works",
      contact: "Manuel D. Santos",
      phone: "0918-440-3312",
      email: "office@tagaytaysteel.ph",
      status: "pending",
      submittedBy: "Karlo M. Espiritu",
      projectId: "p4",
      availability: "limited",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "New company submitted from the site. Supporting documents not yet on file.",
      version: 1,
    },
    {
      id: "c5",
      name: "Del Pilar Fire Protection",
      contact: "Arnold P. Del Pilar",
      phone: "0918-556-9012",
      email: "inquiries@delpilarfire.ph",
      status: "pending",
      submittedBy: "Rafael D. Mercado",
      projectId: "p3",
      availability: "limited",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "Company registration awaiting administrative review.",
      version: 1,
    },
  ]
  return {
    accounts,
    projects,
    companies,
    rules: { grace: 7, cap: 2, response: 3, idle: 15 },
    muted: [],
    events: [
      {
        id: uid(),
        title: "New subcontractor awaiting approval",
        detail: "Tagaytay Steel Works · submitted by Karlo M. Espiritu",
        type: "request",
        date: new Date().toISOString(),
        read: false,
        target: "Approvals",
      },
      {
        id: uid(),
        title: "Project documents updated",
        detail: "Rosaria Business Park · Office PM registered documents",
        type: "progress",
        date: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        target: "Project documents",
      },
      {
        id: uid(),
        title: "Project intake sent for confirmation",
        detail: "Alden Heights Residences — Tower B · Renz D. Villaverde",
        type: "request",
        date: new Date(Date.now() - 7200000).toISOString(),
        read: true,
        target: "Project intake",
      },
      {
        id: uid(),
        title: "Site progress reviewed",
        detail: "Meralco Ave. Fit-out · Finishes at 91%",
        type: "approval",
        date: new Date(Date.now() - 10800000).toISOString(),
        read: true,
        target: "Active sites",
      },
    ],
  }
}
