import {
  DOC_LABELS,
  PHASES,
  projectPhaseNames,
  type Account,
  type Doc,
  type Project,
  type State,
} from "./model.ts"
import { checklistFor, leadId, workflowFor } from "./workflows.ts"

export const CLIENT_DOCUMENT_LABELS = [
  DOC_LABELS[0],
  DOC_LABELS[1],
  DOC_LABELS[3],
  DOC_LABELS[4],
]
export type ClientDocument = {
  id: string
  label: string
  name: string
  date: string
  uploaded: boolean
}
export type ClientProjectView = {
  id: string
  name: string
  type: string
  area: string
  floors: string
  location: string
  start: string
  end?: string
  phase: string
  phases: string[]
  progress: number
  overallProgress?: number | null
  status: "active" | "completed"
  completedAt?: string
  contacts: {
    name: string
    role: string
  }[]
  documents: ClientDocument[]
  photos: ClientDocument[]
  history: {
    id: string
    date: string
    phase: string
    progress: number
    text: string
  }[]
  checklist: {
    label: string
    status: "not_submitted" | "under_review" | "approved"
  }[]
}
function clientAccount(state: State, accountId: string): Account {
  const account = state.accounts.find((a) => a.id === accountId)
  if (!account || account.role !== "client" || account.status !== "active")
    throw new Error("An active Client account is required.")
  return account
}
function clientProject(
  state: State,
  accountId: string,
  projectId: string,
): Project {
  const account = clientAccount(state, accountId)
  const p = state.projects.find((project) => project.id === projectId)
  if (
    !p ||
    p.clientId !== account.id ||
    !account.scope.includes(p.id) ||
    !["active", "completed"].includes(p.status)
  )
    throw new Error(
      "This project is not activated and authorized for your Client account.",
    )
  return p
}
function safeDoc(doc: Doc): Doc {
  return {
    id: doc.id,
    label: doc.label,
    name: doc.name,
    date: doc.date,
    uploaded: doc.uploaded,
    clientVisible: true,
    owner: "Authorized project record",
    size: doc.size,
    mime: doc.mime,
  }
}
export function resolveClientDocument(
  state: State,
  accountId: string,
  projectId: string,
  documentId: string,
): Doc {
  const p = clientProject(state, accountId, projectId)
  const doc = p.docs.find((item) => item.id === documentId)
  if (
    !doc ||
    !doc.uploaded ||
    !doc.clientVisible ||
    !CLIENT_DOCUMENT_LABELS.includes(doc.label)
  )
    throw new Error(
      "This document is internal, unavailable, or not authorized for Client access.",
    )
  return safeDoc(doc)
}
export function resolveClientPhoto(
  state: State,
  accountId: string,
  projectId: string,
  documentId: string,
): Doc {
  const p = clientProject(state, accountId, projectId)
  const doc = workflowFor(p).photos.find((item) => item.id === documentId)
  if (!doc?.uploaded || !doc.clientVisible || !/\.(png|jpe?g)$/i.test(doc.name))
    throw new Error("This photograph has not been shared with the Client.")
  return safeDoc(doc)
}
function metadata(doc: Doc): ClientDocument {
  return {
    id: doc.id,
    label: doc.label,
    name: doc.uploaded ? doc.name : "",
    date: doc.uploaded ? doc.date : "",
    uploaded: doc.uploaded,
  }
}
export function clientProjectViews(
  state: State,
  accountId: string,
): ClientProjectView[] {
  let account: Account
  try {
    account = clientAccount(state, accountId)
  } catch {
    return []
  }
  return state.projects
    .filter(
      (p) =>
        p.clientId === account.id &&
        account.scope.includes(p.id) &&
        ["active", "completed"].includes(p.status),
    )
    .map((p) => {
      const work = workflowFor(p)
      const office = state.accounts.find((a) => a.id === p.opmId)
      const lead = state.accounts.find((a) => a.id === leadId(p))
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        area: p.area,
        floors: p.floors,
        location: p.location,
        start: p.start,
        end: p.end,
        phase: p.phase,
        phases: projectPhaseNames(p),
        progress: p.progress,
        overallProgress: p.overallProgress ?? p.verifiedProgress?.project.percentage ?? null,
        status: p.status as "active" | "completed",
        completedAt: work.completedAt,
        contacts: [
          {
            name: office?.name || "Office PM not on file",
            role: "Office Project Manager",
          },
          {
            name: lead?.name || "Site lead not on file",
            role: "Site Project Manager",
          },
        ],
        documents: CLIENT_DOCUMENT_LABELS.flatMap((label) => {
          const doc = p.docs.find(
            (item) => item.label === label && item.clientVisible,
          )
          return doc ? [metadata(doc)] : []
        }),
        photos: work.photos
          .filter(
            (doc) =>
              doc.uploaded &&
              doc.clientVisible &&
              /\.(png|jpe?g)$/i.test(doc.name),
          )
          .map(metadata),
        history: p.history.flatMap((entry, index) =>
          entry.clientVisible === false
            ? []
            : [
                {
                  id: `client-history:${p.id}:${entry.id ?? index}`,
                  date: entry.date,
                  phase: entry.phase || "Recorded progress",
                  progress: entry.progress,
                  text: entry.text,
                },
              ],
        ),
        checklist: (p.status === "completed" && !p.workflow?.checklist[p.phase]
          ? []
          : checklistFor(p)
        ).map((item) => ({
          label: item.label,
          status:
            item.status === "approved"
              ? "approved"
              : item.status === "submitted"
                ? "under_review"
                : "not_submitted",
        })),
      }
    })
}
export function clientProgressReport(
  state: State,
  accountId: string,
  projectId: string,
) {
  clientProject(state, accountId, projectId)
  const project = clientProjectViews(state, accountId).find(
    (p) => p.id === projectId,
  )!
  return [
    "BuildAxis — PROJECT PROGRESS REPORT",
    "Text export — not a certified PDF.",
    "",
    `Project: ${project.name}`,
    `Type: ${project.type}`,
    `Current phase: ${project.phase}`,
    `Recorded progress: ${project.progress}%`,
    `Status: ${project.status}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Only approved or baseline Client-visible history is included.",
    "Pending submissions, internal site diary, personnel rosters and private documents are excluded.",
    "",
    "APPROVED PROJECT HISTORY",
    "",
    ...project.history
      .slice()
      .reverse()
      .map(
        (entry) =>
          `${entry.date} — ${entry.phase} — ${entry.progress}%\n${entry.text}\n`,
      ),
  ].join("\n")
}
export function phaseTimeline(
  phase: string,
  completed = false,
  phases = PHASES,
) {
  const index = phases.indexOf(phase)
  return phases.map((name, i) => ({
    name,
    state:
      completed || i < index
        ? "completed" as const
        : i === index
          ? "current" as const
          : "upcoming" as const,
  }))
}

export type ClientDocumentFolder = {
  id: string
  name: string
  description: string
  kind: "document" | "photo"
  files: ClientDocument[]
}
export type ClientDocumentCategory = {
  id: string
  name: string
  description: string
  folders: ClientDocumentFolder[]
  fileCount: number
}

// Repository levels for the Client portal. Built only from the client-scoped
// project view, so internal documents, folders and counts never appear.
// Categories without client-visible files are left out.
export function clientDocumentIndex(
  view: Pick<ClientProjectView, "documents" | "photos">,
): ClientDocumentCategory[] {
  const categories = [
    {
      id: "agreements",
      name: "Project Agreements & Supporting Documents",
      description: "Project records shared with you by the project team.",
      folders: [
        {
          id: "intake",
          name: "Project Intake",
          description: "Registered project documents made available to you.",
          kind: "document" as const,
          files: view.documents.filter((doc) => doc.uploaded),
        },
      ],
    },
    {
      id: "progress",
      name: "Progress & Site Reports",
      description: "Site photographs shared with you by the project team.",
      folders: [
        {
          id: "site-photos",
          name: "Site Photos",
          description: "Photographs explicitly made available to you.",
          kind: "photo" as const,
          files: view.photos.filter((doc) => doc.uploaded),
        },
      ],
    },
  ]
  return categories
    .map((category) => ({
      ...category,
      fileCount: category.folders.reduce(
        (total, folder) => total + folder.files.length,
        0,
      ),
    }))
    .filter((category) => category.fileCount > 0)
}
