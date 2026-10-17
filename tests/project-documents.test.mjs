import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "../src/model.ts"
import { projectDocumentIndex } from "../src/project-document-index.ts"
import { workflowFor } from "../src/workflows.ts"

const uploaded = (id, label) => ({
  id,
  label,
  name: `${label}.pdf`,
  uploaded: true,
  clientVisible: false,
  owner: "Site PM",
  date: "2026-10-16",
})

test("project document index references canonical uploads and never duplicates files", () => {
  const project = initialState().projects.find((item) => item.id === "p1")
  const evidence = uploaded("shared-evidence", "Column inspection")
  const workflow = workflowFor(project)
  project.workflow = workflow
  workflow.checklist.Structure = [
    {
      id: "structure-check",
      label: "Column inspection",
      status: "approved",
      version: 1,
      doc: evidence,
    },
  ]
  project.history.push({
    date: "2026-10-16",
    text: "Evidence reviewed",
    progress: 62,
    phase: "Structure",
    evidence,
  })

  const index = projectDocumentIndex(project)
  const files = index.flatMap((category) =>
    category.folders.flatMap((folder) => folder.files),
  )
  const indexed = files.filter((file) => file.doc.id === evidence.id)

  assert.equal(indexed.length, 1)
  assert.equal(indexed[0].doc, evidence)
  assert.match(indexed[0].source, /Activity Checklists/)
  assert.equal(project.history.at(-1).evidence, evidence)
})

test("project document index groups source records into the four repository categories", () => {
  const project = initialState().projects.find((item) => item.id === "p1")
  const manpower = uploaded("manpower-1", "Daily Manpower Report")
  const progress = uploaded("progress-1", "Weekly Progress Report")
  const photo = uploaded("photo-1", "North elevation photo")
  const workflow = workflowFor(project)
  project.workflow = workflow
  workflow.checklist.Structure = [
    {
      id: "manpower-check",
      label: "Daily Manpower Report",
      status: "submitted",
      version: 1,
      doc: manpower,
    },
  ]
  workflow.pendingUpdate = {
    id: "update-1",
    version: 1,
    authorId: "a6",
    submittedAt: "2026-10-16",
    note: "Weekly update",
    issues: [],
    priorPhase: "Structure",
    priorProgress: 60,
    requestedPhase: "Structure",
    requestedProgress: 62,
    evidence: progress,
  }
  workflow.photos.push(photo)

  const index = projectDocumentIndex(project)

  assert.deepEqual(
    index.map((category) => category.name),
    [
      "Construction Phases",
      "Progress & Site Reports",
      "Daily Manpower Reports",
      "Project Agreements & Supporting Documents",
    ],
  )
  assert.ok(
    index
      .find((category) => category.id === "manpower")
      .folders.some((folder) =>
        folder.files.some((file) => file.doc === manpower),
      ),
  )
  assert.ok(
    index
      .find((category) => category.id === "progress")
      .folders.flatMap((folder) => folder.files)
      .some((file) => file.doc === progress),
  )
  assert.ok(
    index
      .find((category) => category.id === "progress")
      .folders.flatMap((folder) => folder.files)
      .some((file) => file.doc === photo),
  )
})
