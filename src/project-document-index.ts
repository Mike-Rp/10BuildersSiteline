import {
  DOC_LABELS,
  projectPhaseNames,
  type Doc,
  type Project,
} from "./model.ts"
import { workflowFor } from "./workflows.ts"

export type ProjectDocumentFile = {
  doc: Doc
  source: string
}

export type ProjectDocumentFolder = {
  id: string
  name: string
  description: string
  files: ProjectDocumentFile[]
}

export type ProjectDocumentCategory = {
  id: string
  name: string
  description: string
  folders: ProjectDocumentFolder[]
  fileCount: number
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export function projectDocumentIndex(
  project: Project,
): ProjectDocumentCategory[] {
  const workflow = workflowFor(project)
  const phases = projectPhaseNames(project)
  const seen = new Set<string>()
  const categories = [
    {
      id: "phases",
      name: "Construction Phases",
      description: "Activity checklist evidence organized by project phase.",
      folders: phases.map((phase) => ({
        id: slug(phase),
        name: phase,
        description: "Original evidence from Activity Checklists.",
        files: [] as ProjectDocumentFile[],
      })),
    },
    {
      id: "progress",
      name: "Progress & Site Reports",
      description:
        "Original monitoring submissions, reviewed evidence, and site photos.",
      folders: [
        {
          id: "progress-updates",
          name: "Progress Updates",
          description: "Original uploads from Project Monitoring and Reports.",
          files: [] as ProjectDocumentFile[],
        },
        {
          id: "review-history",
          name: "Reviewed Site Reports",
          description: "Evidence retained with project review history.",
          files: [] as ProjectDocumentFile[],
        },
        {
          id: "site-photos",
          name: "Site Photos",
          description: "Original uploads from the Project Monitoring gallery.",
          files: [] as ProjectDocumentFile[],
        },
      ],
    },
    {
      id: "manpower",
      name: "Daily Manpower Reports",
      description:
        "Daily labor and crew records grouped by construction phase.",
      folders: phases.map((phase) => ({
        id: slug(phase),
        name: phase,
        description: "Original daily manpower reports for this phase.",
        files: [] as ProjectDocumentFile[],
      })),
    },
    {
      id: "agreements",
      name: "Project Agreements & Supporting Documents",
      description:
        "Original intake records, signed agreements, and project appointments.",
      folders: [
        {
          id: "intake",
          name: "Project Intake",
          description: "Original registered documents from Project Intake.",
          files: [] as ProjectDocumentFile[],
        },
        {
          id: "agreements",
          name: "Project Agreements",
          description:
            "Client, owner, contractor, and subcontractor agreements.",
          files: [] as ProjectDocumentFile[],
        },
        {
          id: "engagements",
          name: "Engineer Engagements",
          description: "Project-specific engineer appointment agreements.",
          files: [] as ProjectDocumentFile[],
        },
        {
          id: "supporting",
          name: "Supporting Documents",
          description:
            "Retained supporting records and prior document versions.",
          files: [] as ProjectDocumentFile[],
        },
      ],
    },
  ] satisfies Omit<ProjectDocumentCategory, "fileCount">[]

  const category = (id: string) => categories.find((item) => item.id === id)!
  const folder = (categoryId: string, folderId: string) =>
    category(categoryId).folders.find((item) => item.id === folderId)!
  const isManpower = (doc: Doc) =>
    /manpower|labor|labour|attendance|crew report/i.test(
      `${doc.label} ${doc.name}`,
    )
  const add = (
    doc: Doc | undefined,
    categoryId: string,
    folderId: string,
    source: string,
    phase?: string,
  ) => {
    if (!doc?.uploaded || seen.has(doc.id)) return
    seen.add(doc.id)
    if (isManpower(doc)) {
      const phaseFolder =
        category("manpower").folders.find(
          (item) => item.id === slug(phase || project.phase),
        ) || category("manpower").folders[0]
      phaseFolder?.files.push({ doc, source })
      return
    }
    folder(categoryId, folderId).files.push({ doc, source })
  }

  for (const [phase, items] of Object.entries(workflow.checklist))
    for (const item of items)
      add(
        item.doc,
        "phases",
        slug(phase),
        `Activity Checklists · ${item.label}`,
        phase,
      )

  if (workflow.pendingUpdate)
    add(
      workflow.pendingUpdate.evidence,
      "progress",
      "progress-updates",
      "Project Monitoring · Progress update",
      workflow.pendingUpdate.requestedPhase,
    )
  if (workflow.pendingRework)
    add(
      workflow.pendingRework.evidence,
      "progress",
      "progress-updates",
      "Project Monitoring · Rework report",
      workflow.pendingRework.requestedPhase,
    )

  for (const entry of project.history)
    add(
      entry.evidence,
      "progress",
      "review-history",
      "Reports · Project review history",
      entry.phase,
    )
  for (const doc of workflow.photos)
    add(
      doc,
      "progress",
      "site-photos",
      "Project Monitoring · Site gallery",
      project.phase,
    )

  for (const doc of project.docs) {
    const agreement = /agreement|contract/i.test(`${doc.label} ${doc.name}`)
    const engagement =
      !!doc.subjectId || /engagement|appointment/i.test(doc.label)
    const registered = DOC_LABELS.includes(doc.label)
    add(
      doc,
      "agreements",
      engagement
        ? "engagements"
        : agreement
          ? "agreements"
          : registered
            ? "intake"
            : "supporting",
      registered
        ? "Project Intake · Registered documents"
        : "Project Documents · Original upload",
    )
  }
  for (const doc of workflow.documentArchive || [])
    add(doc, "agreements", "supporting", "Project Intake · Retained original")

  return categories.map((item) => ({
    ...item,
    fileCount: item.folders.reduce(
      (total, current) => total + current.files.length,
      0,
    ),
  }))
}
