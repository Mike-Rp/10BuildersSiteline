// Progress-report attachments on the Office PM review screen: helpers, the repository index and the screen.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { fileSizeLabel, submissionDocs } from "../src/model.ts"
import { projectDocumentIndex } from "../src/project-document-index.ts"
import { initialState } from "./fixtures/demo-state.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")
const doc = (id, name) => ({ id, label: "Progress report attachment", name, uploaded: true, clientVisible: false, owner: "Site PM", date: "2026-10-16", size: 100, mime: "image/png" })

test("submissionDocs returns every attachment, or the single evidence file, or nothing", () => {
  const a = doc("a", "one.png"), b = doc("b", "two.pdf")
  assert.deepEqual(submissionDocs({ attachments: [a, b], evidence: a }).map((d) => d.id), ["a", "b"])
  assert.deepEqual(submissionDocs({ evidence: a }).map((d) => d.id), ["a"], "older single-file submissions still show")
  assert.deepEqual(submissionDocs({ attachments: [] }), [])
  assert.deepEqual(submissionDocs(undefined), [])
})

test("file sizes are shown plainly", () => {
  assert.equal(fileSizeLabel(undefined), "")
  assert.equal(fileSizeLabel(0), "")
  assert.equal(fileSizeLabel(512), "512 B")
  assert.equal(fileSizeLabel(2048), "2 KB")
  assert.equal(fileSizeLabel(1572864), "1.5 MB")
})

test("the project repository lists every attachment of a pending report", () => {
  const project = structuredClone(initialState().projects.find((p) => p.status === "active"))
  project.workflow = { version: 1, responses: [], selections: [], checklist: {}, notes: [], photos: [],
    pendingUpdate: { id: "u1", version: 1, authorId: "x", submittedAt: "2026-10-16T00:00:00Z", note: "n", issues: [], priorPhase: project.phase, priorProgress: 0,
      requestedPhase: project.phase, requestedProgress: 0, attachments: [doc("a1", "one.png"), doc("a2", "two.pdf"), doc("a3", "three.jpg")], evidence: doc("a1", "one.png") } }
  const files = projectDocumentIndex(project).flatMap((c) => c.folders.flatMap((f) => f.files))
  const ids = files.map((x) => x.doc.id)
  for (const id of ["a1", "a2", "a3"]) assert.equal(ids.filter((x) => x === id).length, 1, id + " is listed once")
})

test("the review screen lists every attachment with a view button, and says so when there are none", () => {
  const screen = read("../src/RoleWorkspace.tsx")
  assert.match(screen, /submissionDocs\(submission\)\.map\(\(doc\) =>/, "one entry per attachment")
  assert.match(screen, /onClick=\{\(\) => showDoc\(p, doc\)\}/, "each opens through the existing authorised viewer")
  assert.match(screen, /No attachments with this report\./)
  assert.match(screen, /submissionDocs\(work\.pendingUpdate\)\.some\(\(d\) => d\.id === docId\)/, "review status covers every attachment")
  assert.doesNotMatch(screen, /submission\.evidence!/, "no longer limited to a single evidence file")
})
