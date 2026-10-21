// Converts Thesis-Backend API responses into the app's State.
//
// Pure functions (no fetch, no DOM) so they can be unit-tested. The backend and
// the original app model differ, so this file is where they meet:
//   * statuses: backend lifecycle_status -> app Project.status
//   * progress: the backend derives % from approved checklist items
//   * people: only the admin can list accounts; other roles get names from the
//     project (phase team, Office PM) so those accounts are built from there.
import {
  DOC_LABELS,
  emptyState,
  type Account,
  type ChecklistItem,
  type Company,
  type Doc,
  type Event,
  type Project,
  type ProjectWorkflow,
  type Role,
  type State,
} from "../model.ts"

export type Dto = Record<string, any>

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : "")
const iso = (v?: string | null) => (v ? new Date(v).toISOString() : "")

// Backend document codes, in the app's DOC_LABELS order.
export const DOC_CODES = [
  "notice_to_proceed",
  "building_permit",
  "owner_contract",
  "registered_plans",
  "environmental_certificate",
  "budget_boq",
  "subcontractor_agreement",
]
const CLIENT_VISIBLE = new Set([0, 1, 3, 4])

export const formatArea = (n: unknown) => {
  const v = Number(n)
  return Number.isFinite(v) && n !== null && n !== ""
    ? v.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : ""
}

export const accountStatus = (s?: string): Account["status"] =>
  s === "suspended"
    ? "suspended"
    : s === "invited"
      ? "invited"
      : s === "deactivated"
        ? "deactivated"
        : "active"

export function projectStatus(p: Dto): Project["status"] {
  switch (p.lifecycle_status) {
    case "active":
      return "active"
    case "archived":
      return "completed"
    case "draft":
      return "draft"
    default:
      return "pending" // suggested_allocation, confirmed, sent_to_opm, spm_review
  }
}

// ----------------------------------------------------------------- accounts

export function mapAccount(
  a: Dto,
  detail?: Dto,
  projectIdsByName: Map<string, string> = new Map(),
): Account {
  const role = a.role as Role
  const scope =
    role === "client"
      ? (a.scope as string[] || [])
          .map((name) => projectIdsByName.get(String(name).toLowerCase()))
          .filter((id): id is string => Boolean(id))
      : (detail?.scope?.disciplines as string[] ?? a.scope as string[] ?? [])
  const types =
    role === "opm"
      ? (detail?.scope?.project_types as string[] ?? a.scope as string[] ?? [])
      : []
  const license = detail?.license
  const account: Account = {
    id: a.id ?? a.user_id,
    name: a.full_name,
    role,
    email: a.email ?? "",
    phone: a.phone ?? "",
    scope,
    projectTypes: types,
    status: accountStatus(a.status),
    added: day(a.date_added),
    license: license?.license_number ?? "",
    expiry: day(license?.license_expiry),
    docs: [],
    eligibleForNewAssignment:["opm","spm"].includes(role)?Boolean(license?.upload_status==="uploaded"&&license?.upload_file_ref&&day(license.license_expiry)>=new Date().toISOString().slice(0,10)):undefined,
  }
  if(detail?.license?.upload_file_ref?.startsWith("db:")){const fileId=detail.license.upload_file_ref.replace(/^db:(\/\/)?/,"");account.docs.push({id:fileId,label:"PRC License",name:"PRC License.pdf",uploaded:true,owner:account.name,date:account.added,clientVisible:false})}
  if (detail?.certifications?.length)
    account.certifications = detail.certifications
  return account
}

// A person known only by name and id (from a project's team or Office PM).
export const stubAccount = (id: string, name: string, role: Role): Account => ({
  id,
  name,
  role,
  email: "",
  phone: "",
  scope: [],
  projectTypes: [],
  status: "active",
  added: "",
  license: "",
  expiry: "",
  docs: [],
})

// ---------------------------------------------------------------- documents

export function mapDocs(
  projectId: string,
  rows: Dto[],
  register: (id: string, url?: string) => void,
): Doc[] {
  return DOC_CODES.map((code, i) => {
    const row = rows.find((r) => r.code === code)
    const id = row?.id || `${projectId}:doc:${i}`
    const uploaded = Boolean(row?.uploaded)
    if (uploaded) register(id, row?.download_url)
    return {
      id,
      label: DOC_LABELS[i],
      name: uploaded ? (row?.original_name || `${DOC_LABELS[i]}.pdf`) : "",
      uploaded,
      clientVisible: row ? Boolean(row.client_visible) : CLIENT_VISIBLE.has(i),
      owner: i === 6 ? "Lead Site PM" : "Office PM",
      date: uploaded ? day(row?.uploaded_at) : "",
      mime: uploaded ? row?.content_type || "application/pdf" : undefined,
    }
  })
}

export function mapPhoto(
  row: Dto,
  register: (id: string, url?: string) => void,
): Doc {
  register(row.id, row.download_url)
  return {
    id: row.id,
    label: row.caption || "Site photo",
    name: `${row.caption || "site-photo"}.png`,
    uploaded: true,
    clientVisible: row.client_visible !== false,
    owner: "Site PM",
    date: day(row.taken_date || row.created_at),
    mime: "image/png",
  }
}

// ----------------------------------------------------------------- projects

export type ProjectParts = {
  checklistProgress?: Project["checklistProgress"]
    verifiedProgress?: Project["verifiedProgress"]
  list: Dto // item of GET /projects
  detail: Dto // GET /projects/:id
  documents: Dto[]
  history: Dto[]
  photos: Dto[]
  notes: Dto[]
  overview?: Dto // GET /projects/:id/phase-overview
  assignments: Dto[] // GET /projects/:id/subcontractor-assignments
  contracts: Dto[]
  pending?: Dto | null // GET /projects/:id/progress-updates/pending
  clientId: string
  register: (id: string, url?: string) => void
}

const teamStatus = (s: string): Project["team"][number]["status"] =>
  s === "confirmed" ? "confirmed" : s === "pending" ? "pending" : "declined"

export function mapProject(parts: ProjectParts): Project {
  const { list, detail, register } = parts
  const id = list.id as string
  const status = projectStatus(list)
  const team: Project["team"] = (detail.phase_team || []).map((t: Dto) => ({
    phase: t.stage,
    accountId: t.spm_user_id || "",
    status: teamStatus(t.status),
    requiredDisciplines: t.required_disciplines,
    sequence: t.sort_order,
  }))
  const docs = mapDocs(id, parts.documents, register)
  const history: Project["history"] = parts.history
    .slice()
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .map((h) => ({
      date: day(h.recorded_at),
      text: h.note || "",
      progress: Number(h.pct ?? 0),
      clientVisible: !h.is_issue,
      phase: h.stage_code,
      issue: Boolean(h.is_issue),
    }))
  const clientAgreement = parts.contracts.find(
    (c) => c.contract_type === "client_subcon_agreement",
  )

  const checklist: ProjectWorkflow["checklist"] = {}
  const items: Dto[] = parts.overview?.checklist?.items || []
  if (items.length && list.current_stage)
    checklist[list.current_stage] = items.map(
      (i): ChecklistItem => ({
        id: String(i.id),
        evidenceId: i.evidence_id == null ? undefined : String(i.evidence_id),
        reworkReason:i.rework_reason||undefined,
        label: i.title,
        required: i.required,
        weight: i.weight,
        status:
          i.status === "rework_required" ? "rework_required" : i.status === "approved"
            ? "approved"
            : i.status === "pending" || i.status === "submitted"
              ? "submitted"
              : "missing",
        version: 0,
        submittedAt: i.submitted_at ? iso(i.submitted_at) : undefined,
        reviewedAt: i.reviewed_at ? iso(i.reviewed_at) : undefined,
        note: i.submission_note || undefined,
        submittedBy: i.submitted_by || undefined,
        doc:i.file_id?{id:i.file_id,label:i.title,name:i.original_name||"Checklist evidence.pdf",uploaded:true,clientVisible:false,owner:"Site PM",date:day(i.submitted_at),mime:i.content_type}:undefined,
      }),
    )

  const workflow: ProjectWorkflow = {
    version: 1,
    responses: [],
    selections: parts.assignments.map((a) => ({
      companyId: a.subcontractor_id,
      status: a.status === "released" ? "archived" : "accepted",
    })),
    checklist,
    notes: parts.notes.map((n) => ({
      id: n.id,
      authorId: n.author_id || "",
      text: n.note_text,
      date: iso(n.noted_at),
    })),
    photos: parts.photos.map((p) => mapPhoto(p, register)),
  }
  for(const item of items)if(item.file_id)register(item.file_id,"/api/v1/projects/"+id+"/phase-files/"+item.file_id+"")
  const pending = parts.overview && "pending_update" in parts.overview ? parts.overview.pending_update : parts.pending
  if (pending?.id)
    workflow.pendingUpdate = {
      id: String(pending.id),
      version: 1,
      authorId: pending.submitted_by || "",
      submittedAt: iso(pending.submitted_at),
      note: pending.note || "",
      issues: pending.issue_categories || [],
      priorPhase: pending.prior_stage || list.current_stage,
      priorProgress: Number(pending.prior_pct ?? 0),
      requestedPhase: pending.requested_stage || parts.overview?.stages?.find((s:Dto)=>s.id===pending.selected_stage_id)?.code || list.current_stage,
      requestedProgress: Number(pending.requested_pct ?? 0),
    }

  const rework=parts.overview?.issues?.find((i:Dto)=>i.status==="pending")
  if(rework)workflow.pendingRework={id:rework.id,version:1,authorId:rework.submitted_by||"",submittedAt:iso(rework.submitted_at),
    note:rework.reason,issues:rework.issue_categories||[],priorPhase:list.current_stage,priorProgress:Number(list.current_pct||0),
    requestedPhase:list.current_stage,requestedProgress:Number(list.current_pct||0)}
  const project: Project = {
    ...(parts.checklistProgress ? { checklistProgress: parts.checklistProgress } : {}),
    ...(parts.verifiedProgress ? { verifiedProgress: parts.verifiedProgress } : {}),
    id,
    name: list.name,
    type: list.project_type,
    area: formatArea(list.floor_area_sqm),
    floors:
      list.floor_count === null || list.floor_count === undefined
        ? ""
        : String(list.floor_count),
    start: day(list.target_start_date),
    end: day(list.target_end_date) || undefined,
    clientId: parts.clientId,
    status,
    opmId: list.suggested_opm_id || "",
    team,
    phase: list.current_stage || team[0]?.phase || "Mobilization",
    // The backend derives % from approved checklist items; an archived project is finished.
    progress:
      list.lifecycle_status === "archived"
        ? 100
        : Number(list.current_pct ?? 0),
    opmAccepted: ["spm_review", "active", "archived"].includes(
      list.lifecycle_status,
    ),
    docs,
    created: day(list.created_at),
    location: list.location || "",
    note: "",
    excludedOpms: [],
    history,
    workflow,
  }
  Object.assign(project,detail.workspace||{})
  if(detail.workspace?.activation)workflow.activation=detail.workspace.activation
  for(const d of detail.workspace?.extraDocs||[]){project.docs.push(d);register(d.id,"/api/v1/files/"+d.id+"/content")}
  if(detail.selections?.length)workflow.selections=detail.selections.map((s:Dto)=>({companyId:s.subcontractor_id,status:s.status,contactAt:s.contacted_at,responseAt:s.responded_at}))
  if (clientAgreement?.subcontractor_name)
    project.clientSubcon = clientAgreement.subcontractor_name
  if (list.lifecycle_status === "archived")
    project.workflow!.completedAt = iso(list.archived_at || list.updated_at)
  return project
}

// ---------------------------------------------------------------- companies

export function mapCompany(
  s: Dto,
  projectIdsByName: Map<string, string> = new Map(),
): Company {
  const assigned: unknown[] = s.assigned_projects || []
  const activeProjectIds = assigned
    .map((a) =>
      typeof a === "string"
        ? projectIdsByName.get(a.toLowerCase()) || a
        : (a as Dto)?.id ||
          projectIdsByName.get(String((a as Dto)?.name || "").toLowerCase()),
    )
    .filter((x): x is string => Boolean(x))
  const person = s.contact_person
  return {
    id: s.id,
    name: s.company_name,
    contact: typeof person === "string" ? person : person?.name || "",
    phone: s.contact_phone || "",
    email: s.contact_email || "",
    status:
      s.directory_status === "archived"
        ? "archived"
        : s.directory_status === "declined"
        ? "rejected"
        : s.directory_status === "pending"
          ? "pending"
          : "approved",
    submittedBy: "",
    projectId: "",
    availability: ["available", "limited", "committed"].includes(s.availability)
      ? s.availability
      : "available",
    manpowerCount: Number(s.crew_count ?? 0),
    activeProjectIds,
    manpowerDocuments: [],
    documents: [],
    note: "",
    committedUntil: s.committed_until ? day(s.committed_until) : undefined,
    version: 1,
  }
}

// ------------------------------------------------------------------- events

export function mapEvent(n: Dto, recipientId?: string): Event {
  const event: Event = {
    id: String(n.id),
    title: n.title,
    detail: n.detail || "",
    type: n.type || "system",
    date: iso(n.occurred_at),
    read: Boolean(n.is_read),
    target: "Dashboard",
  }
  if (n.related_project_id) event.projectId = n.related_project_id
  if (recipientId) event.recipientIds = [recipientId]
  return event
}

// -------------------------------------------------------------------- state

export type LoadedData = {
  me: {
    id: string
    role: Role
  }
  accounts: Account[]
  projects: Project[]
  companies: Company[]
  events: Event[]
}

export function buildState(data: LoadedData): State {
  const defaults = emptyState()
  return {
    accounts: data.accounts,
    projects: data.projects,
    companies: data.companies,
    events: data.events.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    rules: defaults.rules,
    muted: [],
  }
}

// People other roles can only learn about from projects: the signed-in user,
// each phase's Site PM, the Office PM and the client.
export function peopleFromProjects(
  me: Account,
  list: Dto[],
  details: Map<string, Dto>,
  existing: Account[] = [],
): {
  accounts: Account[]
  clientIds: Map<string, string>
} {
  const byId = new Map<string, Account>(existing.map((a) => [a.id, a]))
  const clientIds = new Map<string, string>()
  const add = (a: Account) => {
    if (!byId.has(a.id)) byId.set(a.id, a)
  }
  add(me)
  for (const p of list) {
    const detail = details.get(p.id) || {}
    for (const t of (detail.phase_team || []).filter((t: Dto) => t.spm_user_id))
      add(stubAccount(t.spm_user_id, t.spm_name, "spm"))
    if (detail.opm_assignment?.target_user_id)
      add(
        stubAccount(
          detail.opm_assignment.target_user_id,
          detail.opm_assignment.name,
          "opm",
        ),
      )
    else if (p.suggested_opm_id && !byId.has(p.suggested_opm_id))
      add(stubAccount(p.suggested_opm_id, "Office PM", "opm"))
    const clientName: string = p.client_name || ""
    const known = [...byId.values()].find(
      (a) =>
        a.role === "client" &&
        a.name.toLowerCase() === clientName.toLowerCase(),
    )
    if (known) clientIds.set(p.id, known.id)
    else if (me.role === "client") clientIds.set(p.id, me.id)
    else if (clientName) {
      const stub = stubAccount(
        `client:${clientName.toLowerCase()}`,
        clientName,
        "client",
      )
      add(stub)
      clientIds.set(p.id, stub.id)
    }
  }
  return { accounts: [...byId.values()], clientIds }
}
