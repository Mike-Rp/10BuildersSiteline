import assert from "node:assert/strict"
import test from "node:test"
import { DOC_LABELS, initialState } from "../src/model.ts"
import {
  applyWorkflow,
  documentAccess,
  workflowFor,
} from "../src/workflows.ts"
import {
  projectDocumentIndex,
  projectDocumentIndexFor,
} from "../src/project-document-index.ts"
import {
  clientDocumentIndex,
  clientProjectViews,
} from "../src/client-access.ts"

const uploaded = (id, label, extra = {}) => ({
  id,
  label,
  name: `${label}.pdf`,
  uploaded: true,
  clientVisible: false,
  owner: "Site PM",
  date: "2026-10-16",
  ...extra,
})
const filesOf = (index) =>
  index.flatMap((category) =>
    category.folders.flatMap((folder) => folder.files.map((f) => f.doc ?? f)),
  )
const countOf = (index) =>
  index.reduce((total, category) => total + category.fileCount, 0)

// p1: Office PM a2, every phase staffed by Site PM a6, client a9.
function seededProject() {
  const state = initialState()
  const project = state.projects.find((p) => p.id === "p1")
  const workflow = workflowFor(project)
  project.workflow = workflow
  workflow.checklist.Structure = [
    {
      id: "check-1",
      label: "Column inspection",
      status: "approved",
      version: 1,
      doc: uploaded("evidence-a6", "Column inspection"),
    },
  ]
  workflow.photos.push(
    uploaded("photo-shared", "North elevation", {
      clientVisible: true,
      name: "north-elevation.jpg",
      mime: "image/jpeg",
    }),
  )
  return { state, project }
}

test("role-filtered index keeps exactly the files view_document allows, with matching counts", () => {
  const { state, project } = seededProject()
  for (const actorId of ["a2", "a6"]) {
    const actor = state.accounts.find((a) => a.id === actorId)
    const index = projectDocumentIndexFor(project, actor)
    const shown = filesOf(index)
    const allowed = filesOf(projectDocumentIndex(project)).filter(
      (doc) => !documentAccess(project, actor, doc.id).error,
    )
    assert.deepEqual(
      shown.map((d) => d.id).sort(),
      allowed.map((d) => d.id).sort(),
      actorId,
    )
    assert.equal(countOf(index), shown.length, `${actorId} counts match files`)
    for (const category of index)
      for (const folder of category.folders)
        for (const file of folder.files)
          assert.doesNotThrow(() =>
            applyWorkflow(state, actorId, {
              type: "view_document",
              projectId: project.id,
              doc: file.doc,
            }),
          )
  }
})

test("Site PMs never see Office PM registered documents in the repository", () => {
  const { state, project } = seededProject()
  const spm = state.accounts.find((a) => a.id === "a6")
  const labels = filesOf(projectDocumentIndexFor(project, spm)).map(
    (d) => d.label,
  )
  for (const label of DOC_LABELS.slice(0, 6))
    assert.ok(!labels.includes(label), `${label} hidden from Site PM`)
  assert.ok(filesOf(projectDocumentIndexFor(project, spm)).some((d) => d.id === "evidence-a6"))
})

test("actors outside the project, or an Office PM before acceptance, see no files", () => {
  const { state, project } = seededProject()
  const otherOpm = state.accounts.find((a) => a.id === "a3")
  const unassignedSpm = state.accounts.find((a) => a.id === "a5")
  assert.equal(countOf(projectDocumentIndexFor(project, otherOpm)), 0)
  assert.equal(countOf(projectDocumentIndexFor(project, unassignedSpm)), 0)
  project.opmAccepted = false
  const opm = state.accounts.find((a) => a.id === "a2")
  assert.equal(countOf(projectDocumentIndexFor(project, opm)), 0)
})

test("empty folders return no files and zero counts", () => {
  const project = initialState().projects.find((p) => p.id === "p4")
  project.docs = project.docs.map((doc) => ({ ...doc, uploaded: false }))
  const index = projectDocumentIndex(project)
  assert.equal(countOf(index), 0)
  for (const category of index)
    for (const folder of category.folders) assert.deepEqual(folder.files, [])
})

test("client repository holds only client-visible records and omits empty categories", () => {
  const { state, project } = seededProject()
  project.docs.push(uploaded("internal-budget", "Internal cost memo"))
  const [view] = clientProjectViews(state, "a9")
  const index = clientDocumentIndex(view)
  const ids = filesOf(index).map((d) => d.id)
  assert.ok(!ids.includes("internal-budget"))
  assert.ok(!ids.includes("evidence-a6"))
  assert.ok(ids.includes("photo-shared"))
  const allowed = new Set([
    ...view.documents.filter((d) => d.uploaded).map((d) => d.id),
    ...view.photos.filter((d) => d.uploaded).map((d) => d.id),
  ])
  for (const id of ids) assert.ok(allowed.has(id), `${id} is client-visible`)
  assert.equal(countOf(index), ids.length)
  for (const category of index) assert.ok(category.fileCount > 0)
  const internalNames = projectDocumentIndex(project).map((c) => c.name)
  assert.ok(index.length <= 2)
  assert.ok(!index.some((c) => c.name === "Daily Manpower Reports"))
  assert.ok(internalNames.includes("Daily Manpower Reports"))
  assert.deepEqual(clientDocumentIndex({ documents: [], photos: [] }), [])
})

test("the repository lists checklist evidence as files and leaves checklist records and workflow untouched", async () => {
  const { activeFixture, currentProject, evidence, execute } = await import(
    "./fixtures.mjs"
  )
  const { checklistFor } = await import("../src/workflows.ts")
  let state = activeFixture()
  const owner = "a4"
  const opm = "a2"
  const phase = currentProject(state).phase
  const item = checklistFor(currentProject(state))[0]
  assert.ok(item, "the current phase has checklist records")
  assert.equal(item.status, "missing")

  // Building repository views never changes checklist records or other state.
  const before = JSON.stringify(state)
  const actor = state.accounts.find((a) => a.id === owner)
  projectDocumentIndexFor(currentProject(state), actor)
  assert.equal(JSON.stringify(state), before)
  assert.equal(checklistFor(currentProject(state))[0].status, "missing")

  // The checklist workflow still runs end to end.
  const file = evidence("checklist-evidence.png")
  state = execute(state, owner, {
    type: "submit_checklist",
    phase,
    itemId: item.id,
    expectedVersion: item.version,
    doc: file,
  })
  assert.equal(checklistFor(currentProject(state))[0].status, "submitted")
  state = execute(state, opm, {
    type: "reject_checklist",
    phase,
    itemId: item.id,
    expectedVersion: item.version + 1,
  })
  state = execute(state, owner, {
    type: "submit_checklist",
    phase,
    itemId: item.id,
    expectedVersion: item.version + 2,
    doc: evidence("checklist-corrected.png"),
  })
  state = execute(state, opm, {
    type: "approve_checklist",
    phase,
    itemId: item.id,
    expectedVersion: item.version + 3,
  })
  const approved = checklistFor(currentProject(state)).find(
    (entry) => entry.id === item.id,
  )
  assert.equal(approved.status, "approved")

  // Uploaded evidence is still listed as an original file; checklist records remain.
  const index = projectDocumentIndexFor(
    currentProject(state),
    state.accounts.find((a) => a.id === owner),
  )
  const listed = filesOf(index).map((doc) => doc.id)
  assert.ok(listed.includes(approved.doc.id), "approved evidence is a listed file")
  assert.ok(
    index.every((category) => !("checklist" in category)),
    "the repository index carries no checklist section",
  )
})
