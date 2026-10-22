import { phaseProgress, projectProgress } from "./project-progress.ts"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import {
  DOC_LABELS,
  PHASES,
  PROJECT_PHASE_DEFINITIONS,
  licenseState,
  projectPhaseNames,
  spmCandidates,
  today,
  uid,
  validateFile,
  type Account,
  type ClientSubconReview,
  type ChecklistItem,
  type Company,
  type Doc,
  type Project,
  type ProjectWorkflow,
  type State,
} from "./model.ts"

export const CHECKLISTS: Record<string, string[]> = {
  Mobilization: [
    "Work Permits / Site Mobilization Clearance",
    "Approved Drawings and Specifications (site layout)",
    "Activity/Work Inspection Checklist (site setup)",
  ],
  Design: [
    "Approved Drawings and Specifications",
    "Quality Control/QA-QC Checklist (design review)",
    "Previous Activity Acceptance/Clearance (Mobilization)",
  ],
  Foundation: [
    "Activity/Work Inspection Checklist (excavation & formwork)",
    "Inspection and Testing Records (soil compaction / rebar)",
    "Method Statement (concrete pour)",
    "Previous Activity Acceptance/Clearance (Design)",
  ],
  Structure: [
    "Activity/Work Inspection Checklist (rebar & formwork per level)",
    "Inspection and Testing Records (concrete cylinder tests)",
    "Method Statement (structural pour/lifting)",
    "Quality Control/QA-QC Checklist",
    "Previous Activity Acceptance/Clearance (Foundation)",
  ],
  "MEP Rough-in": [
    "Activity/Work Inspection Checklist (rough-in)",
    "Inspection and Testing Records (pressure/insulation resistance tests)",
    "Work Permits or Clearances (electrical/fire)",
    "Previous Activity Acceptance/Clearance (Structure)",
  ],
  Finishes: [
    "Activity/Work Inspection Checklist",
    "Quality Control/QA-QC Checklist",
    "Previous Activity Acceptance/Clearance (MEP Rough-in)",
  ],
  Closeout: [
    "Inspection and Testing Records (final systems testing)",
    "Work Permits or Clearances (occupancy/certificate of completion)",
    "Approved Drawings and Specifications (as-built)",
    "Previous Activity Acceptance/Clearance (Finishes)",
  ],
}
// Standard defaults only; saved project checklists remain authoritative.
for (const definitions of Object.values(PROJECT_PHASE_DEFINITIONS)) {
  definitions.forEach((phase,index) => { CHECKLISTS[phase.name] = standardActivities(index,definitions.length).map(item => item.title) })
}
export const ISSUES = [
  "Failed inspection",
  "Material defect / damage",
  "Rework required",
  "Design / plan change",
  "Weather delay",
  "Subcontractor manpower shortage",
  "Safety incident",
  "Other",
]
export const STAGE_FLOORS: Record<string, number> = {
  Mobilization: 0,
  Design: 15,
  Foundation: 30,
  Structure: 50,
  "MEP Rough-in": 68,
  Finishes: 85,
  Closeout: 100,
}
export function projectStageFloor(p: Project, phase = p.phase) {
  const phases = projectPhaseNames(p)
  const legacy =
    phases.length === PHASES.length &&
    phases.every((name, index) => name === PHASES[index])
  if (legacy) return STAGE_FLOORS[phase] || 0
  const index = phases.indexOf(phase)
  return index < 0 || phases.length < 2
    ? 0
    : Math.round((index / (phases.length - 1)) * 100)
}
export const REVIEW_MS = 3 * 86400000
export type WorkflowCommand = {
  type: "accept_opm" | "request_changes" | "upload_registered" | "accept_assignment" | "decline_assignment" | "reassign_phase" | "select_company" | "replace_company" | "archive_company" | "contact_company" | "respond_company" | "upload_agreement" | "submit_progress" | "request_update" | "approve_update" | "approve_rework" | "decline_rework" | "submit_checklist" | "approve_checklist" | "reject_checklist" | "add_note" | "add_photo" | "request_company" | "archive_company_request" | "view_document" | "activate_project" | "acknowledge_client_subcon" | "report_client_subcon_issue"
  projectId?: string
  phase?: string
  doc?: Doc
  docIndex?: number
  note?: string
  issues?: string[]
  evidence?: Doc
  companyId?: string
  replacementCompanyId?: string
  accepted?: boolean
  accountId?: string
  itemId?: string
  evidenceId?: string
  expectedReviewToken?: string
  requestId?: string
  affectedActivityIds?: string[]
  selectedActivityIds?: string[]
  expectedVersion?: number
  company?: Company
}
export function workflowFor(p: Project): ProjectWorkflow {
  return (
    p.workflow || {
      version: 0,
      responses: [],
      selections: [],
      checklist: {},
      notes: [],
      photos: [],
    }
  )
}
export function leadId(p: Project) {
  return p.team.find((t) => t.phase === "Mobilization")?.accountId || ""
}
export function phaseOwner(p: Project, phase = p.phase) {
  return p.team.find((t) => t.phase === phase)?.accountId || ""
}
export function isAssigned(p: Project, id: string) {
  return p.team.some((t) => t.accountId === id)
}
export function registeredComplete(p: Project) {
  return DOC_LABELS.slice(0, 6).every((label) =>
    p.docs.some((d) => d.label === label && d.uploaded),
  )
}
export function registeredCount(p: Project) {
  return DOC_LABELS.slice(0, 6).filter((label) =>
    p.docs.some((d) => d.label === label && d.uploaded),
  ).length
}
export function leadConfirmed(p: Project) {
  return (
    !!leadId(p) &&
    p.team.find((t) => t.phase === "Mobilization")?.status === "confirmed"
  )
}
export function teamConfirmed(p: Project) {
  return (
    p.team.length > 0 &&
    p.team.every((row) => !!row.accountId && row.status === "confirmed")
  )
}
export function allocationReady(p: Project) {
  return p.opmAccepted && registeredComplete(p) && teamConfirmed(p)
}
// What the Office PM should do next on an intake project, from existing
// project state only. Only "action" means the Office PM can act right now.
export type OfficePmStage = {
  kind: "action" | "waiting" | "complete" | "idle"
  reason?: "confirm" | "documents" | "reassign"
  message: string
}
export function officePmStage(p: Project): OfficePmStage {
  if (p.status === "completed")
    return { kind: "complete", message: "Project completed" }
  if (p.status === "active")
    return { kind: "complete", message: "Project already active" }
  if (p.status === "changes_requested")
    return { kind: "waiting", message: "Waiting for Administrator resubmission" }
  if (p.status !== "pending") return { kind: "idle", message: "" }
  if (!p.opmAccepted)
    return {
      kind: "action",
      reason: "confirm",
      message: "Office PM confirmation required",
    }
  if (!registeredComplete(p))
    return {
      kind: "action",
      reason: "documents",
      message: `${registeredCount(p)}/6 required documents uploaded`,
    }
  if (p.team.some((row) => row.status === "declined"))
    return {
      kind: "action",
      reason: "reassign",
      message: "Reassign declined Site PM phases",
    }
  if (!leadConfirmed(p))
    return { kind: "waiting", message: "Waiting for Lead Site PM response" }
  if (!teamConfirmed(p))
    return { kind: "waiting", message: "Waiting for Site PM responses" }
  return {
    kind: "waiting",
    message: p.clientSubcon
      ? "Waiting for client subcontractor review and activation"
      : "Waiting for subcontractor allocation",
  }
}
export const CLIENT_SUBCON_DOC = "Client & Subcontractor Agreement"
export function clientSubconReview(p: Project): ClientSubconReview {
  return p.clientSubconReview || { issues: [] }
}
export function openClientSubconIssue(p: Project) {
  return clientSubconReview(p).issues.find((i) => i.status === "open")
}
export function clientSubconAgreement(p: Project) {
  return p.docs.find((d) => d.label === CLIENT_SUBCON_DOC && d.uploaded)
}
export function clientSubconAcknowledged(p: Project) {
  return (
    !!p.clientSubcon &&
    !!clientSubconReview(p).acknowledgedAt &&
    !openClientSubconIssue(p)
  )
}
export function consentComplete(state: State, p: Project) {
  if (p.clientSubcon) return clientSubconAcknowledged(p)
  // Only the contacted/accepted company counts; un-actioned "selected" rows are suggestions.
  const selections = activeSubcontractors(p).filter(
    (s) => s.status !== "selected",
  )
  return (
    selections.length > 0 &&
    selections.every(
      (s) =>
        s.status === "accepted" &&
        state.companies.some(
          (c) => c.id === s.companyId && c.status === "approved",
        ),
    )
  )
}
export function activeSubcontractors(p: Project) {
  return workflowFor(p).selections.filter(
    (s) =>
      s.status !== "declined" &&
      s.status !== "replaced" &&
      s.status !== "archived",
  )
}
/** The project's single subcontractor in progress (contacted) or confirmed (accepted), if any. */
export function projectSubcontractor(p: Project) {
  return workflowFor(p).selections.find(
    (s) => s.status === "contacted" || s.status === "accepted",
  )
}
export const SUBCON_IN_PROGRESS =
  "This project already has a subcontractor in progress."
export const SUBCON_LOCKED =
  "A subcontractor has already accepted this project. Allocation is locked."
function assertCanStartSubcontractor(p: Project, companyId: string) {
  const current = projectSubcontractor(p)
  assert(current?.status !== "accepted", SUBCON_LOCKED)
  assert(!current || current.companyId === companyId, SUBCON_IN_PROGRESS)
  const existing = workflowFor(p).selections.find(
    (s) => s.companyId === companyId,
  )
  assert(
    existing?.status !== "declined",
    "This company declined this project and cannot be contacted again.",
  )
}
export function subcontractorRecommendation(
  state: State,
  p: Project,
  company: Company,
) {
  const committed =
    !!company.committedUntil &&
    Date.parse(company.committedUntil) > Date.parse(p.start)
  const otherProjects = company.activeProjectIds.filter(
    (id) =>
      id !== p.id &&
      state.projects.some(
        (project) => project.id === id && project.status === "active",
      ),
  )
  const availableManpower =
    company.availability === "committed"
      ? 0
      : company.availability === "limited"
        ? Math.floor(company.manpowerCount / 2)
        : company.manpowerCount
  return {
    company,
    committed,
    availableManpower,
    otherProjects: otherProjects.length,
  }
}
export function subcontractorRecommendations(state: State, p: Project) {
  return state.companies
    .filter((company) => company.status === "approved")
    .map((company) => subcontractorRecommendation(state, p, company))
    .sort(
      (a, b) =>
        Number(a.committed) - Number(b.committed) ||
        a.otherProjects - b.otherProjects ||
        b.availableManpower - a.availableManpower ||
        a.company.name.localeCompare(b.company.name),
    )
}
export function activationChecks(state: State, p: Project) {
  const client = state.accounts.find(
    (a) => a.id === p.clientId && a.role === "client",
  )
  const agreement = p.docs.some((d) => d.label === DOC_LABELS[6] && d.uploaded)
  const clientReady =
    !!client && ["active", "invited", "pending-setup"].includes(client.status)
  const own = !!p.clientSubcon
  return [
    {
      id: "office",
      label: own
        ? "Office PM assignment accepted"
        : "Assigned Office PM accepted",
      passed: p.opmAccepted,
    },
    {
      id: "documents",
      label: own
        ? "All six Office PM documents uploaded"
        : "All six required Office PM documents",
      passed: registeredComplete(p),
    },
    {
      id: "team",
      label: own
        ? "All required Site PMs accepted"
        : "Every required Site PM accepted",
      passed: teamConfirmed(p),
    },
    {
      id: "subcontractors",
      label: p.clientSubcon
        ? "Client-provided subcontractor assignment acknowledged"
        : "All selected subcontractors approved and accepted",
      passed: consentComplete(state, p),
    },
    ...(own
      ? []
      : [
          {
            id: "agreement",
            label: "Signed Site PM–Subcontractor Agreement",
            passed: agreement,
          },
        ]),
    {
      id: "client",
      label: own
        ? "Client account ready for activation"
        : p.status === "active"
          ? "Client active and project access linked"
          : "Client record ready for final activation",
      passed:
        p.status === "active"
          ? !!client &&
            client.status === "active" &&
            client.scope.includes(p.id)
          : clientReady,
    },
  ]
}
export function assignmentBlock(p: Project, actorId: string) {
  if (!isAssigned(p, actorId)) return "This project is not assigned to you."
  if (!p.opmAccepted) return "Waiting for the assigned Office PM to accept."
  if (!registeredComplete(p))
    return `Waiting for Office PM documents: ${registeredCount(p)} of 6 uploaded.`
  if (actorId !== leadId(p) && !leadConfirmed(p))
    return "The Lead Site PM must accept Mobilization first."
  if (
    ["changes_requested", "declined", "completed", "expired"].includes(p.status)
  )
    return "This assignment is no longer open."
  return ""
}
export function checklistFor(p: Project, phase = p.phase): ChecklistItem[] {
  const sequence = projectPhaseNames(p)
  const position = sequence.indexOf(phase)
  const templatePhase =
    {
      "Podium Structure": "Structure",
      "Tower Structure": "Structure",
      Envelope: "Structure",
      "Envelope / Curtain Wall": "Structure",
      "MEP Rough-In": "MEP Rough-in",
      "Fire & Life Safety": "MEP Rough-in",
      "Fit-Out / Finishes": "Finishes",
      "Retail/Commercial Fit-Out": "Finishes",
      "Residential Fit-Out": "Finishes",
      "Landscape & Site Works": "Finishes",
    }[phase] || phase
  return (
    workflowFor(p).checklist[phase]?.filter(item => item.required !== false) ||
    (position >= 0 ? standardActivities(position,sequence.length).map(item => item.title) : CHECKLISTS[templatePhase] || []).map((label, i) => ({
      id: `${phase}-${i}`,
      label,
      required: true,
      weight: 10,
      status: "missing",
      version: 0,
    }))
  )
}
export function businessDeadline(start: string | number, days: number) {
  const d = new Date(start)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (![0, 6].includes(d.getDay())) added++
  }
  return d.toISOString()
}
export function ownedProjects(state: State, actor: Account) {
  return state.projects.filter((p) =>
    actor.role === "opm"
      ? p.opmId === actor.id
      : actor.role === "spm"
        ? isAssigned(p, actor.id)
        : actor.role === "admin",
  )
}
export function visibleEvents(state: State, actor: Account) {
  const projects = ownedProjects(state, actor)
  return state.events.filter(
    (e) =>
      actor.role === "admin" ||
      (e.recipientIds
        ? e.recipientIds.includes(actor.id) || e.actorId === actor.id
        : e.projectId
          ? projects.some((p) => p.id === e.projectId)
          : projects.some((p) => e.detail.includes(p.name)) ||
            e.detail.includes(actor.name)),
  )
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function requireDoc(doc?: Doc): asserts doc is Doc {
  assert(
    doc?.uploaded && doc.name && typeof doc.size === "number",
    "Choose a valid document and confirm its upload.",
  )
  assert(
    !validateFile({ name: doc.name, size: doc.size } as File),
    "Documents must be PDF, JPG, JPEG or PNG, up to 10 MB.",
  )
}
function requireManpowerDoc(doc?: Doc): asserts doc is Doc {
  assert(
    doc &&
      doc.uploaded &&
      /\.(xlsx|xls)$/i.test(doc.name) &&
      (!doc.size || doc.size <= 15 * 1024 * 1024),
    "Manpower lists must be XLSX or XLS, up to 15 MB.",
  )
}
export function activeAssignmentsForAccount(state: State, accountId: string) {
  return state.projects.filter(
    (project) =>
      project.status === "active" &&
      (project.opmId === accountId ||
        project.team.some((row) => row.accountId === accountId)),
  )
}
export function beginAccountResignation(
  state: State,
  adminId: string,
  accountId: string,
  letter: Doc,
  noticeDays: number,
  now = Date.now(),
): State {
  const admin = state.accounts.find((account) => account.id === adminId)
  const employee = state.accounts.find((account) => account.id === accountId)
  assert(
    admin?.role === "admin" && admin.status === "active",
    "Only an active Administrator can confirm resignation.",
  )
  assert(employee, "Employee account not found.")
  assert(
    employee.id !== admin.id,
    "Administrators cannot deactivate themselves.",
  )
  assert(
    employee.role !== "client",
    "Client accounts do not use employee resignation.",
  )
  assert(
    employee.status === "active",
    "Only active employee accounts are eligible.",
  )
  assert(!employee.assignmentHold, "Assignment Hold is already active.")
  assert(
    activeAssignmentsForAccount(state, employee.id).length === 0,
    "Routine resignation is unavailable while active project assignments remain.",
  )
  assert(
    Number.isInteger(noticeDays) && noticeDays >= 0 && noticeDays <= 180,
    "Enter a whole notice period from 0 to 180 days.",
  )
  requireDoc(letter)
  const next = structuredClone(state)
  const target = next.accounts.find((account) => account.id === accountId)!
  const confirmedAt = new Date(now).toISOString()
  const effectiveDate = new Date(now + noticeDays * 86400000).toISOString()
  const retainedLetter = {
    ...letter,
    label: "Resignation Letter",
    owner: admin.name,
    clientVisible: false,
  }
  if (target.resignation)
    target.resignationHistory = [
      ...(target.resignationHistory || []),
      target.resignation,
    ]
  target.assignmentHold = true
  target.resignation = {
    status: noticeDays === 0 ? "deactivated" : "notice",
    noticeDays,
    submittedAt: confirmedAt,
    effectiveDate,
    confirmedById: admin.id,
    confirmedBy: admin.name,
    confirmedAt,
    letter: retainedLetter,
    deactivatedAt: noticeDays === 0 ? confirmedAt : undefined,
  }
  target.docs.push(retainedLetter)
  if (noticeDays === 0) {
    target.status = "deactivated"
    target.suspendedAt = confirmedAt.slice(0, 10)
  }
  next.events.unshift({
    id: uid(),
    title:
      noticeDays === 0
        ? "Employee account deactivated"
        : "Assignment Hold activated",
    detail: `${target.name} · ${
      noticeDays === 0
        ? "deactivated immediately"
        : `${noticeDays}-day notice · effective ${effectiveDate.slice(0, 10)}`
    }`,
    type: "account",
    date: confirmedAt,
    read: false,
    actorId: admin.id,
    recipientIds: [admin.id, target.id],
    target: "Team",
    readBy: [],
  })
  return next
}
function ensure(p: Project) {
  if (!p.workflow) p.workflow = structuredClone(workflowFor(p))
  return p.workflow
}
function event(
  state: State,
  p: Project,
  actorId: string,
  title: string,
  detail: string,
  type = "request",
  target = "Assignments",
  recipients?: string[],
  now = Date.now(),
) {
  state.events.unshift({
    id: uid(),
    title,
    detail: `${p.name} · ${detail}`,
    type,
    date: new Date(now).toISOString(),
    read: false,
    actorId,
    projectId: p.id,
    recipientIds: [
      ...new Set(
        recipients || [
          p.opmId,
          ...p.team.map((t) => t.accountId),
          ...state.accounts.filter((a) => a.role === "admin").map((a) => a.id),
        ],
      ),
    ].filter(Boolean),
    target,
    readBy: [],
  })
}
function startDeadline(p: Project, actorId: string, days: number, now: number) {
  ensure(p).deadline = {
    accountId: actorId,
    soft: businessDeadline(now, 1),
    hard: businessDeadline(now, days),
  }
}
function pendingNextPerson(p: Project) {
  const lead = p.team.find((t) => t.phase === "Mobilization")
  if (lead && lead.status !== "confirmed") return lead.accountId
  return (
    p.team.find((t) => t.status === "pending" && t.accountId)?.accountId || ""
  )
}
function assertCurrentOwner(p: Project, actor: Account) {
  assert(
    actor.role === "spm" && p.status === "active",
    "Only the assigned Site PM can submit on an active site.",
  )
  assert(
    phaseOwner(p) === actor.id &&
      p.team.find((t) => t.phase === p.phase)?.status === "confirmed",
    "Only the confirmed owner of the current phase may submit this work.",
  )
}
function assertLead(p: Project, actor: Account) {
  assert(
    actor.role === "spm" && leadId(p) === actor.id,
    "Only this project's Lead Site PM can coordinate subcontractors.",
  )
  assert(
    allocationReady(p),
    "All six Office PM documents and every Site PM acceptance are required first.",
  )
}
function localVerifiedPhases(p: Project) {
  const stored = workflowFor(p).checklist
  return projectPhaseNames(p).map(name => ({
    id: name, configured: Array.isArray(stored[name]) && stored[name].length > 0,
    activities: (stored[name] || []).map(item => ({
      id: name + ":" + item.id, required: item.required !== false, weight: item.weight ?? 10,
      status: item.status, approvalValid: !!item.reviewedAt && !!item.reviewedBy && !!item.doc?.uploaded,
    })),
  }))
}
function localPhaseComplete(p: Project) {
  const phase = localVerifiedPhases(p).find(row => row.id === p.phase)
  return !!phase && phaseProgress(phase).percentage === 100 &&
    p.team.some(row => row.phase === p.phase && !!row.accountId && row.status === "confirmed")
}
function localReviewHold(p: Project) {
  const work = workflowFor(p)
  return !!work.pendingRework || !!work.pendingUpdate || Object.values(work.checklist)
    .some(items => items.some(item => item.status === "submitted" || item.status === "rework_required"))
}
function updatePercentage(p: Project) {
  const totals = projectProgress(localVerifiedPhases(p), projectPhaseNames(p))
  // Historical caches cannot pass a lifecycle gate when scope is unavailable.
  if (totals.percentage !== null) p.progress = totals.percentage
}
export function completionReady(p: Project) {
  const closeoutOwner = p.team.find((row) => row.phase === "Closeout")
  return (
    p.status === "active" &&
    p.phase === "Closeout" &&
    !!closeoutOwner?.accountId &&
    closeoutOwner.status === "confirmed" &&
    !localReviewHold(p) &&
    projectProgress(localVerifiedPhases(p), projectPhaseNames(p)).percentage === 100 &&
    projectPhaseNames(p).every(phase => p.team.some(row => row.phase === phase && !!row.accountId && row.status === "confirmed"))
  )
}
function advanceIfReady(state: State, p: Project, now: number, allowHandoff = true) {
  if (
    p.status !== "active" ||
    localReviewHold(p) ||
    !localPhaseComplete(p)
  )
    return
  const phases = projectPhaseNames(p)
  const index = phases.indexOf(p.phase)
  if (index < 0) return
  if (index === phases.length - 1) {
    const work = ensure(p)
    if (!completionReady(p)) return
    p.progress = 100
    p.status = "completed"
    work.completedAt = new Date(now).toISOString()
    work.deadline = undefined
    p.history.push({
      date: new Date(now).toISOString().slice(0, 10),
      text: "Construction completed. All required Closeout evidence is approved and outstanding progress and rework reviews are resolved.",
      phase: "Closeout",
      progress: 100,
      clientVisible: true,
    })
    event(
      state,
      p,
      "system",
      "Project completed",
      "All required Closeout deliverables signed off. Project retained as a read-only completion record.",
      "approval",
      "Archive",
      undefined,
      now,
    )
    return
  }
  if (!allowHandoff) return
  const next = p.team.find((t) => t.phase === phases[index + 1])
  if (!next?.accountId || next.status !== "confirmed") return
  const from = p.phase
  const fromId = phaseOwner(p)
  p.phase = next.phase
  ensure(p).handoff = {
    from,
    to: next.phase,
    fromId,
    toId: next.accountId,
    date: new Date(now).toISOString(),
  }
  p.history.push({
    date: new Date(now).toISOString().slice(0, 10),
    text: `${from} checklist fully approved. Handoff to ${next.phase}.`,
    progress: p.progress,
    phase: next.phase,
    clientVisible: true,
  })
  event(
    state,
    p,
    "system",
    "Next phase is now active",
    `${from} → ${next.phase}`,
    "notice",
    "Active sites",
    [next.accountId, p.opmId, fromId],
    now,
  )
}
// The canonical document view rule for Office PM and Site PM. view_document
// enforces it; repository screens use it to show only files the actor can open.
// It assumes the actor is already in the project's scope (see applyWorkflow).
export function documentAccess(
  p: Project,
  actor: Pick<Account, "id" | "role">,
  docId: string | undefined,
): { doc?: Doc; error: string } {
  const work = workflowFor(p)
  const available = [
    ...p.docs,
    ...work.photos,
    ...p.history.flatMap((entry) =>
      entry.evidence ? [entry.evidence] : [],
    ),
    ...Object.values(work.checklist).flatMap((items) =>
      items.flatMap((item) => (item.doc ? [item.doc] : [])),
    ),
    ...(work.pendingUpdate?.evidence ? [work.pendingUpdate.evidence] : []),
    ...(work.pendingRework?.evidence ? [work.pendingRework.evidence] : []),
  ]
  const doc = available.find((d) => d.id === docId)
  if (!doc || !doc.uploaded)
    return { error: "This document is not in your assigned project." }
  if (actor.role === "opm") {
    if (!p.opmAccepted)
      return {
        doc,
        error: "Accept the project before viewing its internal documents.",
      }
  } else {
    const ownEvidence = Object.entries(work.checklist).some(
      ([phase, items]) =>
        p.team.some((t) => t.phase === phase && t.accountId === actor.id) &&
        items.some((item) => item.doc?.id === doc.id),
    )
    const canView =
      doc.label === DOC_LABELS[6] ||
      work.photos.some((d) => d.id === doc.id) ||
      ownEvidence ||
      (work.pendingUpdate?.authorId === actor.id &&
        work.pendingUpdate.evidence?.id === doc.id) ||
      (work.pendingRework?.authorId === actor.id &&
        work.pendingRework.evidence?.id === doc.id) ||
      p.history.some(
        (entry) =>
          entry.authorId === actor.id && entry.evidence?.id === doc.id,
      ) ||
      (leadId(p) === actor.id &&
        doc.label === "Client & Subcontractor Agreement")
    if (!canView)
      return {
        doc,
        error:
          "This internal document is not accessible in the Site PM workspace.",
      }
  }
  return { doc, error: "" }
}
export function applyWorkflow(
  state: State,
  actorId: string,
  command: WorkflowCommand,
  now = Date.now(),
): State {
  const actor = state.accounts.find((a) => a.id === actorId)
  assert(
    actor &&
      actor.status === "active" &&
      licenseState(actor, state.rules.grace) !== "Grace expired",
    "This account is not eligible for an active session.",
  )
  assert(
    actor.role === "opm" || actor.role === "spm",
    "This action requires an Office PM or Site PM session.",
  )
  const next = structuredClone(state)
  const p = next.projects.find((p) => p.id === command.projectId)
  assert(p, "Project record not found.")
  assert(
    actor.role === "opm" ? p.opmId === actor.id : isAssigned(p, actor.id),
    "This project is outside your assigned scope.",
  )
  assert(
    p.status !== "completed" || command.type === "view_document",
    "Completed project records are read-only.",
  )
  const work = ensure(p)
  const date = new Date(now).toISOString()
  const day = date.slice(0, 10)
  const opm = () =>
    assert(
      actor.role === "opm" && p.opmId === actor.id,
      "Only the assigned Office PM can perform this action.",
    )
  const record = (
    title: string,
    detail = actor.name,
    type = "request",
    target = "Assignments",
  ) => event(next, p, actor.id, title, detail, type, target, undefined, now)
  switch (command.type) {
    case "view_document": {
      const { doc, error } = documentAccess(p, actor, command.doc?.id)
      assert(doc && !error, error)
      record(
        "Document viewed (watermarked)",
        doc.label,
        "view",
        actor.role === "opm" ? "Documents" : "Document repository",
      )
      break
    }
    case "accept_opm":
      opm()
      assert(
        p.status === "pending" && !p.opmAccepted,
        "This intake is no longer awaiting Office PM confirmation.",
      )
      p.opmAccepted = true
      work.acceptedAt = date
      p.note = "Office PM accepted. Required document upload is in progress."
      record("Office PM accepted project", actor.name, "approval", "Documents")
      break
    case "request_changes":
      opm()
      assert(
        p.status === "pending" && !p.opmAccepted,
        "Only a pending, unaccepted intake can be returned for changes.",
      )
      p.status = "changes_requested"
      p.note =
        command.note?.trim() ||
        "Office PM requested staffing or intake changes."
      if (!p.excludedOpms.includes(actor.id)) p.excludedOpms.push(actor.id)
      next.accounts.find((a) => a.id === actor.id)!.cooldown = now + 86400000
      work.changesHistory = [
        ...(work.changesHistory || []),
        { date, note: p.note, opmId: actor.id },
      ]
      record("Office PM requested changes", p.note, "request", "Project intake")
      break
    case "upload_registered": {
      opm()
      assert(
        p.status === "pending" && p.opmAccepted,
        "Accept this project before uploading registered documents.",
      )
      assert(
        Number.isInteger(command.docIndex) &&
          command.docIndex! >= 0 &&
          command.docIndex! < 6,
        "Only the six registered Office PM documents can be uploaded here.",
      )
      requireDoc(command.doc)
      const label = DOC_LABELS[command.docIndex!]
      assert(
        !p.docs.some((d) => d.label === label && d.uploaded),
        "This required document is already uploaded and locked.",
      )
      const doc = {
        ...command.doc,
        label,
        owner: actor.name,
        clientVisible: [0, 1, 3, 4].includes(command.docIndex!),
      }
      const index = p.docs.findIndex((d) => d.label === label)
      if (index >= 0) p.docs[index] = doc
      else p.docs.push(doc)
      record("Registered document uploaded", label, "progress", "Documents")
      if (registeredComplete(p)) {
        work.documentsCompletedAt = date
        startDeadline(p, leadId(p), next.rules.response, now)
        record(
          "All six Office PM documents uploaded",
          "Lead Site PM may now accept.",
          "approval",
          "Assignments",
        )
      }
      break
    }
    case "accept_assignment": {
      assert(actor.role === "spm", "Site PM role required.")
      assert(!assignmentBlock(p, actor.id), assignmentBlock(p, actor.id))
      const rows = p.team.filter(
        (t) => t.accountId === actor.id && t.status === "pending",
      )
      assert(rows.length, "There are no pending assignments for this account.")
      rows.forEach((t) => {
        t.status = "confirmed"
        work.responses.push({
          id: uid(),
          accountId: actor.id,
          phase: t.phase,
          status: "accepted",
          date,
          note: "Assignment accepted by assigned Site PM.",
        })
      })
      record(
        actor.id === leadId(p)
          ? "Lead Site PM accepted assignment"
          : "Site PM accepted assigned phases",
        actor.name,
        "approval",
      )
      const nextPerson = pendingNextPerson(p)
      if (nextPerson) startDeadline(p, nextPerson, next.rules.response, now)
      else work.deadline = undefined
      if (teamConfirmed(p)) {
        // The system only ranks suggestions; the Lead Site PM contacts a company.
        p.note =
          "All Site PMs accepted. Lead Site PM subcontractor coordination is available."
        record(
          "All assigned Site PMs confirmed",
          "Subcontractor allocation unlocked for the project Lead.",
          "approval",
        )
      }
      advanceIfReady(next, p, now)
      break
    }
    case "decline_assignment": {
      assert(actor.role === "spm", "Site PM role required.")
      assert(!assignmentBlock(p, actor.id), assignmentBlock(p, actor.id))
      const row = p.team.find(
        (t) =>
          t.phase === command.phase &&
          t.accountId === actor.id &&
          t.status === "pending",
      )
      assert(row, "Only your pending phase assignment can be declined.")
      const isLead = row.phase === "Mobilization"
      assert(
        !isLead || command.note?.trim(),
        "A reason is required when declining the Lead Site PM assignment.",
      )
      work.responses.push({
        id: uid(),
        accountId: actor.id,
        phase: row.phase,
        status: "declined",
        date,
        note: command.note?.trim() || "Phase assignment declined.",
      })
      row.status = "declined"
      row.accountId = ""
      p.note = `${actor.name} declined ${row.phase}. Office PM reassignment is required.`
      if (isLead) resetIntake(p)
      else work.deadline = undefined
      record("Site PM declined assignment", p.note, "request", "SPM responses")
      break
    }
    case "reassign_phase": {
      opm()
      const row = p.team.find((t) => t.phase === command.phase)
      assert(
        row && row.status !== "confirmed",
        "Confirmed phase assignments are locked.",
      )
      assert(
        spmCandidates(next, p.type, row.phase, p.id).some(
          (c) => c.account.id === command.accountId,
        ),
        "Select an eligible Site PM with available capacity.",
      )
      row.accountId = command.accountId!
      row.status = "pending"
      if (registeredComplete(p))
        startDeadline(p, pendingNextPerson(p), next.rules.response, now)
      record(
        "Phase assignment reassigned",
        `${row.phase} · awaiting the new Site PM's acceptance.`,
      )
      break
    }
    case "select_company": {
      assertLead(p, actor)
      assert(
        !p.clientSubcon,
        "This project uses the client-provided subcontractor assigned by Admin. Allocation is not available.",
      )
      assert(
        p.status === "pending",
        "Project subcontractor intake is already locked.",
      )
      const c = next.companies.find(
        (c) => c.id === command.companyId && c.status === "approved",
      )
      assert(c, "Select an approved company from the directory.")
      assertCanStartSubcontractor(p, c.id)
      const existing = work.selections.find((s) => s.companyId === c.id)
      assert(
        !existing ||
          existing.status === "replaced" ||
          existing.status === "archived",
        "This company is already on the team.",
      )
      if (existing)
        work.selections = work.selections.map((selection) =>
          selection.companyId === c.id
            ? { companyId: c.id, status: "selected" }
            : selection,
        )
      else work.selections.push({ companyId: c.id, status: "selected" })
      record("Subcontractor selected", c.name)
      break
    }
    case "replace_company": {
      assertLead(p, actor)
      assert(
        !p.clientSubcon,
        "This project uses the client-provided subcontractor assigned by Admin. Allocation is not available.",
      )
      assert(
        p.status === "pending",
        "Active subcontractor agreements are locked.",
      )
      const previous = work.selections.find(
        (selection) => selection.companyId === command.companyId,
      )
      assert(
        previous && previous.status !== "accepted",
        "Accepted subcontractors cannot be swapped or replaced.",
      )
      assert(
        previous.status !== "replaced",
        "This subcontractor has already been replaced.",
      )
      assert(projectSubcontractor(p)?.status !== "accepted", SUBCON_LOCKED)
      assert(!projectSubcontractor(p), SUBCON_IN_PROGRESS)
      assert(
        command.replacementCompanyId &&
          command.replacementCompanyId !== previous.companyId,
        "Choose a different replacement company.",
      )
      const replacement = next.companies.find(
        (company) =>
          company.id === command.replacementCompanyId &&
          company.status === "approved",
      )
      assert(
        replacement,
        "The replacement must be an approved directory company.",
      )
      assert(
        !activeSubcontractors(p).some(
          (selection) => selection.companyId === replacement.id,
        ),
        "The replacement company is already on the team.",
      )
      assert(
        !work.selections.some(
          (selection) =>
            selection.companyId === replacement.id &&
            selection.status === "declined",
        ),
        "This company declined this project and cannot be contacted again.",
      )
      if (command.expectedVersion !== undefined)
        assert(
          command.expectedVersion === work.version,
          "The proposed team changed. Review the latest team before replacing.",
        )
      if (previous.status !== "declined") previous.status = "replaced"
      previous.replacedAt = date
      previous.replacedBy = replacement.id
      const priorReplacement = work.selections.find(
        (selection) => selection.companyId === replacement.id,
      )
      if (priorReplacement)
        work.selections = work.selections.map((selection) =>
          selection.companyId === replacement.id
            ? { companyId: replacement.id, status: "selected" }
            : selection,
        )
      else
        work.selections.push({ companyId: replacement.id, status: "selected" })
      record(
        "Subcontractor replaced",
        `${next.companies.find((company) => company.id === previous.companyId)?.name || previous.companyId} → ${replacement.name} · a new contact attempt and response are required.`,
      )
      break
    }
    case "archive_company": {
      assertLead(p, actor)
      assert(
        !p.clientSubcon,
        "This project uses the client-provided subcontractor assigned by Admin. Allocation is not available.",
      )
      assert(
        p.status === "pending",
        "Active subcontractor agreements are locked.",
      )
      const selection = work.selections.find(
        (s) => s.companyId === command.companyId,
      )
      assert(
        selection && selection.status !== "accepted",
        "Accepted subcontractors cannot be archived or replaced.",
      )
      assert(selection.status !== "contacted", SUBCON_IN_PROGRESS)
      selection.status = "archived"
      selection.archivedAt = date
      selection.archivedBy = actor.id
      record(
        "Subcontractor archived from proposed team",
        next.companies.find((company) => company.id === command.companyId)
          ?.name || command.companyId,
      )
      break
    }
    case "acknowledge_client_subcon": {
      assertLead(p, actor)
      assert(
        p.clientSubcon,
        "This project has no client-provided subcontractor to acknowledge.",
      )
      assert(p.status === "pending", "This project is already active.")
      const review = (p.clientSubconReview ||= { issues: [] })
      assert(
        !review.acknowledgedAt,
        "This assignment is already acknowledged and locked.",
      )
      assert(
        !review.issues.some((i) => i.status === "open"),
        "Acknowledgment is on hold until Admin resolves the reported issue.",
      )
      assert(
        clientSubconAgreement(p),
        "The Admin-uploaded agreement is missing. Report the issue to Admin.",
      )
      review.acknowledgedById = actor.id
      review.acknowledgedBy = actor.name
      review.acknowledgedAt = date
      record(
        "Client subcontractor assignment acknowledged",
        `${p.clientSubcon} · reviewed by ${actor.name}. Review only, not subcontractor acceptance.`,
        "approval",
      )
      break
    }
    case "report_client_subcon_issue": {
      assertLead(p, actor)
      assert(
        p.clientSubcon,
        "This project has no client-provided subcontractor to review.",
      )
      assert(p.status === "pending", "This project is already active.")
      const review = (p.clientSubconReview ||= { issues: [] })
      assert(
        !review.acknowledgedAt,
        "This assignment is already acknowledged and locked.",
      )
      assert(
        !review.issues.some((i) => i.status === "open"),
        "An issue is already open with Admin. Wait for its resolution.",
      )
      const text = (command.note || "").trim()
      assert(
        text.length >= 10,
        "Describe the company detail or agreement discrepancy (at least 10 characters).",
      )
      review.issues.push({
        id: uid(),
        text,
        byId: actor.id,
        by: actor.name,
        at: date,
        status: "open",
      })
      event(
        next,
        p,
        actor.id,
        "Client subcontractor issue reported",
        `${actor.name}: ${text}`,
        "request",
        "Projects",
        [
          ...next.accounts.filter((a) => a.role === "admin").map((a) => a.id),
          actor.id,
        ],
        now,
      )
      break
    }
    case "contact_company":
    case "respond_company": {
      assertLead(p, actor)
      assert(
        !p.clientSubcon,
        "This project uses the client-provided subcontractor assigned by Admin. Allocation is not available.",
      )
      assert(p.status === "pending", "This project is already active.")
      const selection = work.selections.find(
        (s) => s.companyId === command.companyId,
      )
      const company = next.companies.find(
        (c) => c.id === command.companyId && c.status === "approved",
      )
      if (command.type === "contact_company") {
        // One step: create the project's selection (if new) and log the attempt.
        const target = next.companies.find(
          (c) => c.id === command.companyId && c.status === "approved",
        )
        assert(target, "Select an approved subcontractor first.")
        const known = work.selections.find((s) => s.companyId === target.id)
        assert(
          !known || known.status !== "accepted",
          "Accepted subcontractors are locked.",
        )
        assert(
          known?.status !== "replaced",
          "Select a replacement or add this company again before making contact.",
        )
        assertCanStartSubcontractor(p, target.id)
        const row =
          known ||
          work.selections[
            work.selections.push({ companyId: target.id, status: "selected" }) -
              1
          ]
        row.status = "contacted"
        row.contactAt = date
        row.contactLog = [...(row.contactLog || []), date]
        record(
          "Subcontractor contact attempt recorded",
          `${target.name} · no email or external invitation sent.`,
        )
        break
      }
      assert(selection && company, "Select an approved subcontractor first.")
      assert(
        selection.status !== "accepted",
        "Accepted subcontractors are locked.",
      )
      assert(
        selection.status !== "replaced" && selection.status !== "declined",
        "Select a replacement or add this company again before making contact.",
      )
      assert(
        typeof command.accepted === "boolean",
        "Manually choose Accept or Decline.",
      )
      assert(
        selection.status === "contacted",
        "Record a contact attempt before recording the actual response.",
      )
      selection.status = command.accepted ? "accepted" : "declined"
      selection.responseAt = date
      if (command.accepted && !company.activeProjectIds.includes(p.id))
        company.activeProjectIds.push(p.id)
      record(
        command.accepted
          ? "Subcontractor acceptance recorded"
          : "Subcontractor declined",
        `${company.name} · response manually recorded by Lead Site PM.`,
        command.accepted ? "approval" : "request",
      )
      break
    }
    case "activate_project": {
      assertLead(p, actor)
      assert(
        p.clientSubcon,
        "Only projects with a client-provided subcontractor use this activation.",
      )
      assert(
        p.status === "pending" && !work.activation,
        "This project is already activated.",
      )
      assert(
        activationChecks(next, p).every((check) => check.passed),
        "Project activation prerequisites are incomplete. No activation was applied.",
      )
      const client = next.accounts.find(
        (a) => a.id === p.clientId && a.role === "client",
      )
      assert(client, "The assigned client record is missing.")
      p.status = "active"
      p.phase = "Mobilization"
      p.progress = 0
      p.note = "Setup complete. Project activated."
      work.deadline = undefined
      for (const phase of projectPhaseNames(p)) work.checklist[phase] ||= checklistFor(p, phase)
      work.progressBase = 0
      work.progressStart = 0
      work.progressAnchor = 0
      work.activation = { byId: actor.id, by: actor.name, at: date }
      client.status = "active"
      if (!client.scope.includes(p.id)) client.scope.push(p.id)
      assert(
        activationChecks(next, p).every((check) => check.passed),
        "Project activation prerequisites are incomplete. No activation was applied.",
      )
      p.history.push({
        date: day,
        text: "Internal intake complete. Project activated in Mobilization.",
        progress: 0,
        phase: p.phase,
        clientVisible: true,
      })
      record(
        "Project activated",
        `Activated by ${actor.name}; client project access enabled.`,
        "approval",
        "Active sites",
      )
      break
    }
    case "upload_agreement": {
      assertLead(p, actor)
      assert(
        !p.clientSubcon,
        "Client-provided subcontractor projects are activated with Activate Project. No second agreement upload is needed.",
      )
      requireDoc(command.doc)
      assert(
        p.status === "pending" && consentComplete(next, p),
        "All required selected subcontractors must be approved and accepted before the signed agreement.",
      )
      assert(
        !p.docs.some((d) => d.label === DOC_LABELS[6] && d.uploaded),
        "The signed agreement is already on file.",
      )
      const client = next.accounts.find(
        (a) => a.id === p.clientId && a.role === "client",
      )
      assert(
        client &&
          ["active", "invited", "pending-setup"].includes(client.status),
        "The assigned client record is missing or suspended. Ask Admin to resolve it before activation.",
      )
      const doc = {
        ...command.doc,
        label: DOC_LABELS[6],
        owner: actor.name,
        clientVisible: false,
      }
      p.docs = p.docs.filter((d) => d.label !== DOC_LABELS[6])
      p.docs.push(doc)
      p.status = "active"
      p.phase = "Mobilization"
      p.progress = 0
      p.note = "Setup complete. Project activated."
      work.deadline = undefined
      for (const phase of projectPhaseNames(p)) work.checklist[phase] ||= checklistFor(p, phase)
      work.progressBase = 0
      work.progressStart = 0
      work.progressAnchor = 0
      client.status = "active"
      if (!client.scope.includes(p.id)) client.scope.push(p.id)
      assert(
        activationChecks(next, p).every((check) => check.passed),
        "Project activation prerequisites are incomplete. No activation was applied.",
      )
      work.activation = { byId: actor.id, by: actor.name, at: date }
      p.history.push({
        date: day,
        text: "Internal intake complete. Project activated in Mobilization.",
        progress: 0,
        phase: p.phase,
        clientVisible: true,
      })
      record(
        "Project activated",
        "Signed agreement confirmed; client project access enabled.",
        "approval",
        "Active sites",
      )
      break
    }
    case "submit_progress": {
      assertCurrentOwner(p, actor)
      const issues = command.issues || []
      assert(
        issues.every((issue) => ISSUES.includes(issue)),
        "Choose valid issue categories.",
      )
      assert(
        !issues.includes("Other") || command.note?.trim(),
        'Explain the "Other" issue before submitting.',
      )
      assert(
        !work.pendingRework,
        "A rework flag is already awaiting Office PM review.",
      )
      if (command.evidence) requireDoc(command.evidence)
      assert(
        issues.length || !work.pendingUpdate,
        "A progress note is already pending. Checklist evidence can still be submitted.",
      )
      const submission = {
        id: uid(),
        version: 1,
        authorId: actor.id,
        submittedAt: date,
        note: command.note?.trim() || "",
        issues,
        priorPhase: p.phase,
        priorProgress: p.progress,
        requestedPhase: p.phase,
        requestedProgress: p.progress,
        evidence: command.evidence
          ? { ...command.evidence, owner: actor.name, clientVisible: false }
          : undefined,
      }
      if (issues.length) work.pendingRework = submission
      else work.pendingUpdate = submission
      work.updateRequested = undefined
      p.history.push({
        date: day,
        text: `${
          issues.length ? `Issue: ${issues.join(", ")}. ` : ""
        }${submission.note || "Field update"} — pending Office PM review.`,
        progress: p.progress,
        phase: p.phase,
        clientVisible: false,
        issue: issues.length > 0,
        authorId: actor.id,
        evidence: submission.evidence,
      })
      record(
        issues.length
          ? "Site issue submitted for rework review"
          : "Progress update submitted for review",
        submission.note || issues.join(", "),
        issues.length ? "request" : "progress",
        "Rework & approvals",
      )
      break
    }
    case "request_update":
      opm()
      assert(
        p.status === "active",
        "Progress reminders apply only to active sites.",
      )
      work.updateRequested = { by: actor.id, date }
      record("Site update requested", actor.name, "request", "Active sites")
      break
    case "approve_update":
      opm()
      assert(
        work.pendingUpdate &&
          work.pendingUpdate.version === command.expectedVersion,
        "This progress submission changed. Refresh the queue.",
      )
      resolveUpdate(p, `Approved by ${actor.name}.`, day)
      record(
        "Progress update approved",
        actor.name,
        "approval",
        "Rework & approvals",
      )
      advanceIfReady(next, p, now, false)
      break
    case "approve_rework":
    case "decline_rework": {
      opm()
      assert(
        work.pendingRework &&
          work.pendingRework.version === command.expectedVersion,
        "This rework submission changed or was already resolved.",
      )
      const approved = command.type === "approve_rework"
      const reviewedIssue = work.pendingRework
      assert(!approved, "Use the connected targeted rework review with an activity selection and trusted impact preview.")
      p.history.push({
        date: day,
        text: approved
          ? "Targeted rework confirmed."
          : "Rework flag declined by Office PM; progress unchanged.",
        progress: p.progress,
        phase: p.phase,
        clientVisible: true,
        issue: approved,
        authorId: reviewedIssue.authorId,
        evidence: reviewedIssue.evidence,
      })
      work.pendingRework = undefined
      record(
        approved ? "Rework approved" : "Rework declined",
        `${p.phase} · ${p.progress}%`,
        approved ? "approval" : "request",
        "Rework & approvals",
      )
      advanceIfReady(next, p, now)
      break
    }
    case "submit_checklist":
    case "approve_checklist":
    case "reject_checklist": {
      assert(
        command.phase === p.phase && p.status === "active",
        "Only the current phase checklist can be changed.",
      )
      work.checklist[p.phase] ||= checklistFor(p)
      const item = work.checklist[p.phase].find((i) => i.id === command.itemId)
      assert(
        item && item.version === command.expectedVersion,
        "This checklist item changed. Review its current state.",
      )
      if (command.type === "submit_checklist") {
        assertCurrentOwner(p, actor)
        requireDoc(command.doc)
        assert(
          item.status === "missing" && !work.pendingRework,
          "Only missing evidence can be submitted; rework must be resolved first.",
        )
        item.doc = { ...command.doc, owner: actor.name, clientVisible: false }
        item.status = "submitted"
        item.submittedAt = date
        item.submittedBy = actor.id
        item.note = ""
        item.escalated = false
        p.history.push({
          date: day,
          phase: p.phase,
          progress: p.progress,
          text: `Activity evidence submitted for Office PM review: ${item.label}`,
          clientVisible: false,
          authorId: actor.id,
          evidence: item.doc,
        })
        record(
          "Activity evidence submitted for QA/QC",
          item.label,
          "progress",
          "Rework & approvals",
        )
      } else {
        opm()
        assert(
          item.status === "submitted" && item.doc?.uploaded,
          "Review requires submitted evidence.",
        )
        if (command.type === "approve_checklist") {
          item.status = "approved"
          item.reviewedAt = date
          item.reviewedBy = actor.id
          item.escalated = false
          updatePercentage(p)
          p.history.push({
            date: day,
            text: `Office PM approved activity evidence: ${item.label}`,
            progress: p.progress,
            phase: p.phase,
            clientVisible: true,
            authorId: item.submittedBy,
            evidence: item.doc,
          })
          record(
            "QA/QC evidence approved",
            item.label,
            "approval",
            "Rework & approvals",
          )
        } else {
          item.status = "missing"
          item.note = "Rejected by Office PM — resubmit with corrections."
          item.submittedAt = undefined
          item.escalated = false
          p.history.push({
            date: day,
            phase: p.phase,
            progress: p.progress,
            text: `Office PM rejected activity evidence: ${item.label}. Corrections required.`,
            clientVisible: false,
            authorId: item.submittedBy,
            evidence: item.doc,
          })
          record(
            "QA/QC evidence rejected",
            item.label,
            "request",
            "Active sites",
          )
        }
      }
      item.version++
      advanceIfReady(next, p, now)
      break
    }
    case "add_note":
      assertCurrentOwner(p, actor)
      assert(command.note && command.note.trim(), "Enter a site diary note.")
      work.notes.push({
        id: uid(),
        authorId: actor.id,
        text: command.note.trim(),
        date,
      })
      record(
        "Site diary note added",
        "Internal project note.",
        "account",
        "Active sites",
      )
      break
    case "add_photo":
      assertCurrentOwner(p, actor)
      requireDoc(command.doc)
      assert(
        /\.(png|jpe?g)$/i.test(command.doc.name),
        "Site gallery uploads must be JPG, JPEG or PNG.",
      )
      work.photos.push({
        ...command.doc,
        owner: actor.name,
        clientVisible: true,
      })
      record(
        "Site photo uploaded",
        command.doc.name,
        "progress",
        "Active sites",
      )
      break
    case "request_company": {
      assert(actor.role === "spm", "Only Site PMs can request new companies.")
      assertLead(p, actor)
      assert(
        p.status === "active" || p.status === "pending",
        "Company suggestions require an active project or open intake, not an archived record.",
      )
      const c = command.company ? structuredClone(command.company) : undefined
      assert(c && c.name.trim(), "Company name is required.")
      assert(
        !next.companies.some((x) => x.id === c.id),
        "This company request has already been submitted.",
      )
      c.documents.forEach(requireDoc)
      c.manpowerDocuments ||= []
      c.manpowerDocuments.forEach(requireManpowerDoc)
      c.activeProjectIds ||= []
      c.manpowerCount = Math.max(0, c.manpowerCount || 0)
      c.availability ||= "limited"
      next.companies.push({
        ...c,
        status: "pending",
        submittedBy: actor.name,
        submittedById: actor.id,
        projectId: p.id,
        version: 1,
      })
      work.selections.push({ companyId: c.id, status: "selected" })
      record(
        "Subcontractor company suggestion submitted",
        c.name,
        "request",
        "Subcon directory",
      )
      break
    }
    case "archive_company_request": {
      const c = next.companies.find((c) => c.id === command.companyId)
      assert(
        actor.role === "spm" &&
          c?.status === "pending" &&
          (c.submittedById === actor.id || c.submittedBy === actor.name),
        "Only your unresolved company request can be archived.",
      )
      c.status = "archived"
      c.archivedAt = date
      c.archivedBy = actor.id
      c.version++
      const selection = work.selections.find((s) => s.companyId === c.id)
      if (selection) {
        selection.status = "archived"
        selection.archivedAt = date
        selection.archivedBy = actor.id
      }
      record("Pending subcontractor request archived", c.name)
      break
    }
    default:
      throw new Error("Unsupported workflow action.")
  }
  work.version++
  return next
}
function resetIntake(p: Project) {
  const work = ensure(p)
  work.documentArchive = [
    ...(work.documentArchive || []),
    ...p.docs.filter((d) => DOC_LABELS.includes(d.label) && d.uploaded),
  ]
  p.docs = p.docs.map((d) =>
    DOC_LABELS.includes(d.label)
      ? { ...d, uploaded: false, name: "", date: "" }
      : d,
  )
  p.opmAccepted = false
  p.status = "pending"
  p.team = p.team.map((t) => ({
    ...t,
    status: t.accountId ? "pending" : "declined",
  }))
  work.deadline = undefined
  work.documentsCompletedAt = undefined
  work.selections = []
}
function resolveUpdate(p: Project, resolution: string, day: string) {
  const work = ensure(p)
  const pending = work.pendingUpdate
  if (!pending) return
  p.history.push({
    date: day,
    text: `${pending.note || "Field update"} — ${resolution}`,
    progress: p.progress,
    phase: p.phase,
    clientVisible: true,
    authorId: pending.authorId,
    evidence: pending.evidence,
  })
  work.pendingUpdate = undefined
}
export function processWorkflowTimers(state: State, now = Date.now()): State {
  let next: State | undefined
  const draft = () => (next ||= structuredClone(state))
  for (const original of state.projects) {
    const originalWork = original.workflow
    if (!originalWork) continue
    const deadline = originalWork.deadline
    if (
      deadline &&
      !deadline.expired &&
      Date.parse(deadline.hard) <= now &&
      original.team.some(
        (t) => t.accountId === deadline.accountId && t.status === "pending",
      )
    ) {
      const s = draft()
      const p = s.projects.find((p) => p.id === original.id)!
      const work = ensure(p)
      const person = s.accounts.find((a) => a.id === deadline.accountId)
      const rows = p.team.filter(
        (t) => t.accountId === deadline.accountId && t.status === "pending",
      )
      rows.forEach((t) => {
        work.responses.push({
          id: uid(),
          accountId: t.accountId,
          phase: t.phase,
          status: "expired",
          date: new Date(now).toISOString(),
          note: "No response within the configured business-day window.",
        })
        t.status = "declined"
        t.accountId = ""
      })
      if (rows.some((t) => t.phase === "Mobilization")) resetIntake(p)
      work.deadline = undefined
      p.note = `${person?.name || "Site PM"} did not respond. Reassignment required.`
      event(
        s,
        p,
        "system",
        "Site PM assignment expired",
        p.note,
        "request",
        "SPM responses",
        [
          p.opmId,
          ...s.accounts.filter((a) => a.role === "admin").map((a) => a.id),
        ],
        now,
      )
    }
    const pending = originalWork.pendingUpdate
    if (
      pending &&
      !pending.escalated &&
      now - Date.parse(pending.submittedAt) >= REVIEW_MS
    ) {
      const s = draft()
      const p = s.projects.find((p) => p.id === original.id)!
      const work = ensure(p)
      const material =
        pending.requestedPhase !== pending.priorPhase ||
        pending.requestedProgress !== pending.priorProgress
      if (material) work.pendingUpdate!.escalated = true
      else
        resolveUpdate(
          p,
          "Auto-approved after three days; no stage or percentage change.",
          new Date(now).toISOString().slice(0, 10),
        )
      event(
        s,
        p,
        "system",
        material
          ? "Material progress update escalated"
          : "Informational progress update auto-approved",
        material
          ? "Manual Office PM review remains required. No numeric progress applied."
          : "Three-day review window elapsed; no stage/percentage change.",
        "approval",
        "Rework & approvals",
        undefined,
        now,
      )
      // Informational timer resolution must not advance or complete a project.
    }
    for (const item of checklistFor(original).filter(
      (i) =>
        i.status === "submitted" &&
        !i.escalated &&
        i.submittedAt &&
        now - Date.parse(i.submittedAt) >= REVIEW_MS,
    )) {
      const s = draft()
      const p = s.projects.find((p) => p.id === original.id)!
      const stored = ensure(p).checklist[p.phase]?.find((i) => i.id === item.id)
      if (stored) stored.escalated = true
      event(
        s,
        p,
        "system",
        "QA/QC review escalated to Admin",
        `${item.label} · evidence remains pending; never auto-approved.`,
        "notice",
        "Rework & approvals",
        undefined,
        now,
      )
    }
  }
  for (const original of state.accounts) {
    if (
      original.status === "active" &&
      original.assignmentHold &&
      original.resignation?.status === "notice" &&
      Date.parse(original.resignation.effectiveDate) <= now
    ) {
      const s = draft()
      const account = s.accounts.find((item) => item.id === original.id)!
      const deactivatedAt = new Date(now).toISOString()
      account.status = "deactivated"
      account.suspendedAt = deactivatedAt.slice(0, 10)
      account.resignation = {
        ...account.resignation!,
        status: "deactivated",
        deactivatedAt,
      }
      s.events.unshift({
        id: uid(),
        title: "Employee account deactivated",
        detail: `${account.name} · resignation effective date reached`,
        type: "account",
        date: deactivatedAt,
        read: false,
        actorId: "system",
        recipientIds: [
          account.id,
          ...s.accounts
            .filter((item) => item.role === "admin")
            .map((item) => item.id),
        ],
        target: "Team",
        readBy: [],
      })
    }
  }
  return next || state
}
export function resolveClientSubconIssue(
  state: State,
  adminId: string,
  projectId: string,
  issueId: string,
  resolution: string,
  now = Date.now(),
): State {
  const admin = state.accounts.find((a) => a.id === adminId)
  assert(
    admin?.role === "admin" && admin.status === "active",
    "Only an Administrator can resolve this issue.",
  )
  const next = structuredClone(state)
  const p = next.projects.find((x) => x.id === projectId)
  assert(p?.clientSubcon, "Project record not found.")
  const issue = p.clientSubconReview?.issues.find((i) => i.id === issueId)
  assert(issue && issue.status === "open", "This issue is already resolved.")
  const text = resolution.trim()
  assert(text.length >= 10, "Describe how the issue was resolved.")
  issue.status = "resolved"
  issue.resolvedAt = new Date(now).toISOString()
  issue.resolvedBy = admin.name
  issue.resolution = text
  event(
    next,
    p,
    admin.id,
    "Client subcontractor issue resolved",
    `${admin.name}: ${text}. Acknowledgment can continue.`,
    "approval",
    "Assignments",
    [admin.id, issue.byId],
    now,
  )
  return next
}
