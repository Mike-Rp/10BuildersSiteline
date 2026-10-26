// Isolated frontend prototype. Never pass this state to API or workflow services.
import type { Account, Project, State } from "./model.ts"

export const EXTENSION_STORAGE_KEY = "siteline-extension-demo-v1"
export const DEMO_TODAY = "2026-10-27"
export const REQUEST_STATUSES = [
  "Draft",
  "Pending OPM Review",
  "Returned for Revision",
  "Pending Client Approval",
  "Approved",
  "Rejected",
  "Withdrawn",
] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]
export type DemoActor = Pick<Account, "id" | "name" | "role">
export type Evidence = {
  id: string
  name: string
  type: string
  size: number
}
export type Report = {
  reason: string
  activities: string
  proposed: string
  evidence: Evidence[]
}
export type ReportSnapshot = Report & {
  original: string
  baseline: string
  progress: number | null
}
export type ReviewEntry = {
  at: string
  actor: string
  status: RequestStatus
  remarks: string
  report?: ReportSnapshot
}
export type ExtensionRequest = ReportSnapshot & {
  id: string
  projectId: string
  status: RequestStatus
  submittedAt?: string
  history: ReviewEntry[]
}
export type DemoProject = {
  id: Project["id"]
  name: string
  spmId: string
  opmId: string
  clientId: string
  original: string
  approved: string
  progress: number | null
  lifecycle: "Not Yet Started" | "Ongoing" | "Completed" | "Archived"
  deadlines: {
    date: string
    at: string
    requestId: string
    approvedBy: string
  }[]
  scenario: string
}
export type DemoNotice = {
  id: string
  projectId: string
  requestId: string
  to: string[]
  text: string
  at: string
  readBy: string[]
}
export type ExtensionState = {
  version: 1
  projects: DemoProject[]
  requests: ExtensionRequest[]
  notices: DemoNotice[]
}
export const DEMO_ACCOUNTS: DemoActor[] = [
  { id: "a5", name: "Rafael D. Mercado", role: "spm" },
  { id: "a2", name: "Renz D. Villaverde", role: "opm" },
  { id: "a9", name: "Ferdinand Uy", role: "client" },
  { id: "a1", name: "Patricia N. Domingo", role: "admin" },
  { id: "a6", name: "Mikaela Bautista", role: "spm" },
  { id: "a11", name: "Isabel Reyes", role: "client" },
]
const evidence = (): Evidence[] => [
  {
    id: "seed-evidence",
    name: "rainfall-and-site-log.pdf",
    type: "application/pdf",
    size: 245760,
  },
]
const snapshot = (p: DemoProject, proposed: string): ReportSnapshot => ({
  original: p.original,
  baseline: p.approved,
  progress: p.progress,
  proposed,
  reason:
    "Heavy rainfall and delayed delivery of specified electrical fittings interrupted scheduled site work.",
  activities:
    "Complete electrical fit-off, waterproofing inspections, finishing works and turnover preparation.",
  evidence: evidence(),
})
export function initialExtensionState(): ExtensionState {
  // Existing fixture identifiers are reused only inside this separate demo store.
  const projects: DemoProject[] = [
    {
      id: "p1",
      name: "Santos Residence",
      spmId: "a5",
      opmId: "a2",
      clientId: "a9",
      original: "2026-10-26",
      approved: "2026-10-26",
      progress: 85,
      lifecycle: "Ongoing",
      deadlines: [],
      scenario: "A · Submit → endorse → approve; request November 25, 2026.",
    },
    {
      id: "p2",
      name: "Demo Reyes Townhouse",
      spmId: "a5",
      opmId: "a2",
      clientId: "a9",
      original: "2026-10-22",
      approved: "2026-10-22",
      progress: 63,
      lifecycle: "Ongoing",
      deadlines: [],
      scenario:
        "B · Submitted with evidence. Return for revision, revise and resubmit.",
    },
    {
      id: "p3",
      name: "Demo Rivera Retail Fit-out",
      spmId: "a5",
      opmId: "a2",
      clientId: "a9",
      original: "2026-10-24",
      approved: "2026-10-24",
      progress: 72,
      lifecycle: "Ongoing",
      deadlines: [],
      scenario:
        "C · Endorsed and awaiting Client decision. Reject with a reason.",
    },
    {
      id: "p4",
      name: "Demo Cruz Duplex",
      spmId: "a5",
      opmId: "a2",
      clientId: "a9",
      original: "2026-09-30",
      approved: "2026-10-20",
      progress: 92,
      lifecycle: "Ongoing",
      deadlines: [
        {
          date: "2026-10-20",
          at: "2026-09-29T09:00:00Z",
          requestId: "seed-first",
          approvedBy: "Ferdinand Uy",
        },
      ],
      scenario: "D · First extension has elapsed. Request a second extension.",
    },
    {
      id: "p5",
      name: "Demo Reyes Annex",
      spmId: "a6",
      opmId: "a2",
      clientId: "a11",
      original: "2026-11-10",
      approved: "2026-11-10",
      progress: null,
      lifecycle: "Ongoing",
      deadlines: [],
      scenario:
        "Assignment isolation and unavailable progress. Mikaela / Isabel only.",
    },
  ]
  const first = {
    ...snapshot(projects[3], "2026-10-20"),
    baseline: "2026-09-30",
  }
  const requests: ExtensionRequest[] = [
    {
      ...snapshot(projects[1], "2026-11-18"),
      id: "seed-revision",
      projectId: "p2",
      status: "Pending OPM Review",
      submittedAt: "2026-10-26T08:30:00Z",
      history: [
        {
          at: "2026-10-26T08:30:00Z",
          actor: "Rafael D. Mercado",
          status: "Pending OPM Review",
          remarks: "Report submitted with site evidence.",
          report: snapshot(projects[1], "2026-11-18"),
        },
      ],
    },
    {
      ...snapshot(projects[2], "2026-11-20"),
      id: "seed-client",
      projectId: "p3",
      status: "Pending Client Approval",
      submittedAt: "2026-10-25T08:00:00Z",
      history: [
        {
          at: "2026-10-25T08:00:00Z",
          actor: "Rafael D. Mercado",
          status: "Pending OPM Review",
          remarks: "Delay report submitted.",
          report: snapshot(projects[2], "2026-11-20"),
        },
        {
          at: "2026-10-26T09:00:00Z",
          actor: "Renz D. Villaverde",
          status: "Pending Client Approval",
          remarks:
            "Site records reviewed; please consider the requested extension.",
        },
      ],
    },
    {
      ...first,
      id: "seed-first",
      projectId: "p4",
      status: "Approved",
      submittedAt: "2026-09-27T08:00:00Z",
      history: [
        {
          at: "2026-09-27T08:00:00Z",
          actor: "Rafael D. Mercado",
          status: "Pending OPM Review",
          remarks: "First extension submitted.",
          report: first,
        },
        {
          at: "2026-09-28T08:00:00Z",
          actor: "Renz D. Villaverde",
          status: "Pending Client Approval",
          remarks: "Endorsed following site review.",
        },
        {
          at: "2026-09-29T09:00:00Z",
          actor: "Ferdinand Uy",
          status: "Approved",
          remarks: "First extension approved.",
        },
      ],
    },
  ]
  return {
    version: 1,
    projects,
    requests,
    notices: [
      {
        id: "seed-notice-opm",
        projectId: "p2",
        requestId: "seed-revision",
        to: ["a2"],
        text: "Demo Reyes Townhouse: Pending OPM Review",
        at: "2026-10-26T08:30:00Z",
        readBy: [],
      },
      {
        id: "seed-notice-client",
        projectId: "p3",
        requestId: "seed-client",
        to: ["a9"],
        text: "Demo Rivera Retail Fit-out: Pending Client Approval",
        at: "2026-10-26T09:00:00Z",
        readBy: [],
      },
    ],
  }
}
export const canSeeProject = (actor: DemoActor, p: DemoProject) =>
  actor.role === "admin" ||
  (actor.role === "spm" && actor.id === p.spmId) ||
  (actor.role === "opm" && actor.id === p.opmId) ||
  (actor.role === "client" && actor.id === p.clientId)
export const schedulePerformance = (p: DemoProject) =>
  p.lifecycle === "Completed"
    ? "Completed"
    : p.lifecycle === "Ongoing" && p.approved < DEMO_TODAY
      ? "Delayed"
      : "On Schedule"
export const isOpenRequest = (r: ExtensionRequest) =>
  !["Approved", "Rejected", "Withdrawn"].includes(r.status)
export const progressLabel = (progress: number | null) =>
  progress !== null &&
  Number.isFinite(progress) &&
  progress >= 0 &&
  progress <= 100
    ? `${progress}%`
    : "Progress Unavailable"
const realDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s
export function reportErrors(
  report: Report,
  p: DemoProject,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!report.reason.trim()) errors.reason = "Explain the reason for delay."
  if (!report.activities.trim())
    errors.activities = "Describe remaining construction activities."
  if (!realDate(report.proposed) || report.proposed <= p.approved)
    errors.proposed =
      "Choose a valid date later than the current approved completion date."
  return errors
}
export type ExtensionCommand = {
  type: "save" | "submit"
  projectId: string
  requestId?: string
  report: Report
} | {
  type: "endorse" | "return" | "reject" | "approve" | "withdraw"
  requestId: string
  remarks: string
} | {
  type: "read"
  noticeIds: string[]
}
export function applyExtensionCommand(
  state: ExtensionState,
  actor: DemoActor,
  command: ExtensionCommand,
  at = new Date().toISOString(),
): ExtensionState {
  if (!DEMO_ACCOUNTS.some((a) => a.id === actor.id && a.role === actor.role))
    throw Error("Select a valid demo account.")
  if (command.type === "read")
    return {
      ...state,
      notices: state.notices.map((n) =>
        command.noticeIds.includes(n.id) && n.to.includes(actor.id)
          ? { ...n, readBy: [...new Set([...n.readBy, actor.id])] }
          : n,
      ),
    }
  const next: ExtensionState = structuredClone(state)
  let request: ExtensionRequest | undefined
  let project: DemoProject | undefined
  let remarks = ""
  if (command.type === "save" || command.type === "submit") {
    project = next.projects.find((p) => p.id === command.projectId)
    if (
      !project ||
      actor.role !== "spm" ||
      project.spmId !== actor.id ||
      project.lifecycle !== "Ongoing"
    )
      throw Error(
        "Only the assigned SPM can submit a report for an ongoing demo project.",
      )
    request = command.requestId
      ? next.requests.find((r) => r.id === command.requestId)
      : undefined
    if (
      command.requestId &&
      (!request ||
        request.projectId !== project.id ||
        !["Draft", "Returned for Revision"].includes(request.status))
    )
      throw Error(
        "This report can no longer be edited. Reopen its latest version.",
      )
    if (
      next.requests.some(
        (r) =>
          r.projectId === project!.id &&
          isOpenRequest(r) &&
          r.id !== request?.id,
      )
    )
      throw Error("This project already has an open extension request.")
    if (
      command.type === "submit" &&
      Object.keys(reportErrors(command.report, project)).length
    )
      throw Error(
        "Complete all required fields with a revised date later than the current deadline.",
      )
    const fields = {
      ...structuredClone(command.report),
      original: project.original,
      baseline: project.approved,
      progress: project.progress,
    }
    if (!request) {
      request = {
        ...fields,
        id: crypto.randomUUID(),
        projectId: project.id,
        status: "Draft",
        history: [],
      }
      next.requests.push(request)
    } else Object.assign(request, fields)
    request.status = command.type === "save" ? "Draft" : "Pending OPM Review"
    if (command.type === "submit") request.submittedAt = at
    remarks =
      command.type === "save"
        ? "Draft saved locally."
        : "Delay report submitted to OPM."
    request.history.push({
      at,
      actor: actor.name,
      status: request.status,
      remarks,
      report: structuredClone(fields),
    })
  } else {
    request = next.requests.find((r) => r.id === command.requestId)
    project = next.projects.find((p) => p.id === request?.projectId)
    if (!request || !project || !canSeeProject(actor, project))
      throw Error("This demo report is not available to your account.")
    const opm =
      actor.role === "opm" &&
      project.opmId === actor.id &&
      request.status === "Pending OPM Review"
    const client =
      actor.role === "client" &&
      project.clientId === actor.id &&
      request.status === "Pending Client Approval"
    const spm =
      actor.role === "spm" &&
      project.spmId === actor.id &&
      ["Draft", "Returned for Revision", "Pending OPM Review"].includes(
        request.status,
      )
    if (
      !(
        (command.type === "endorse" && opm) ||
        (command.type === "return" && opm) ||
        (command.type === "reject" && (opm || client)) ||
        (command.type === "approve" && client) ||
        (command.type === "withdraw" && spm)
      )
    )
      throw Error(
        "This action is not permitted for your role or the current report status.",
      )
    remarks = command.remarks.trim()
    if (["return", "reject"].includes(command.type) && !remarks)
      throw Error("A written reason is required.")
    if (command.type === "approve") {
      if (
        request.baseline !== project.approved ||
        Object.keys(reportErrors(request, project)).length
      )
        throw Error(
          "The deadline or report has changed. Ask the SPM to submit an updated request.",
        )
      project.approved = request.proposed
      project.deadlines.push({
        date: request.proposed,
        at,
        requestId: request.id,
        approvedBy: actor.name,
      })
    }
    const statuses = {
      endorse: "Pending Client Approval",
      return: "Returned for Revision",
      reject: "Rejected",
      approve: "Approved",
      withdraw: "Withdrawn",
    } as const
    request.status = statuses[command.type]
    request.history.push({
      at,
      actor: actor.name,
      status: request.status,
      remarks: remarks || `${request.status} by ${actor.name}.`,
    })
  }
  if (request.status !== "Draft") {
    const to =
      request.status === "Pending OPM Review"
        ? [project.opmId]
        : request.status === "Pending Client Approval"
          ? [project.clientId, project.spmId]
          : [project.spmId, project.opmId, project.clientId, "a1"]
    next.notices.unshift({
      id: crypto.randomUUID(),
      requestId: request.id,
      projectId: project.id,
      to,
      text: `${project.name}: ${request.status}. ${remarks}`,
      at,
      readBy: [],
    })
  }
  return next
}

// Project projection for the EXISTING role layouts; never used by backend actions.
export function extensionWorkspace(state: ExtensionState): State {
  const accounts: Account[] = DEMO_ACCOUNTS.map((a) => ({
    ...a,
    email: `${a.id}@extension-demo.invalid`,
    phone: "Demo account",
    scope: state.projects.filter((p) => p.clientId === a.id).map((p) => p.id),
    projectTypes: ["Residential"],
    status: "active",
    added: "2026-01-01",
    license: "Demo only",
    expiry: "2027-12-31",
    docs: [],
  }))
  const projects: Project[] = state.projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: "Residential",
    area: "180",
    floors: "2",
    start: "2026-03-01",
    end: p.approved,
    clientId: p.clientId,
    opmId: p.opmId,
    status: "active",
    team: ["Mobilization", "Finishes"].map((phase) => ({
      phase,
      accountId: p.spmId,
      status: "confirmed",
    })),
    phase: "Finishes",
    progress: p.progress ?? Number.NaN,
    opmAccepted: true,
    docs: [],
    created: "2026-03-01",
    location: "Metro Manila · DEMO",
    note: "Isolated extension prototype",
    excludedOpms: [],
    history: [],
  }))
  return {
    accounts,
    projects,
    companies: [],
    events: [],
    rules: { grace: 30, cap: 10, response: 3, idle: 15 },
    muted: [],
  }
}
