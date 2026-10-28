import assert from "node:assert/strict"
import test from "node:test"
import {
  EXPLORER_PAGE_SIZES,
  explorerCounters,
  pushRecent,
  sortProjects,
  statusLabel,
  visibleRecents,
} from "../src/explorerHelpers.ts"
import {
  applyList,
  defaultListQuery,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
} from "../src/listing.ts"
import { initialState } from "./fixtures/demo-state.ts"
import {
  projectDocumentIndex,
  projectDocumentIndexFor,
} from "../src/project-document-index.ts"
import { clientDocumentIndex, clientProjectViews } from "../src/client-access.ts"

const project = (n, extra = {}) => ({
  id: `p${String(n).padStart(3, "0")}`,
  name: n % 2 ? `Tower ${n}` : `Villa ${n}`,
  type: ["Residential", "Commercial", "Mixed-Use"][n % 3],
  phase: ["Design", "Structure", "Finishes"][n % 3],
  status: n % 4 ? "active" : "completed",
  fileCount: n % 5 === 0 ? 0 : n,
  searchText: `permit-${n}.pdf`,
  ...extra,
})
const projects = Array.from({ length: 30 }, (_, i) => project(i + 1))
const config = {
  searchText: (p) => `${p.name} ${p.type} ${p.phase} ${p.searchText}`,
  filters: [
    { id: "type", label: "Type", test: (p, v) => p.type === v },
    { id: "status", label: "Status", test: (p, v) => statusLabel(p.status) === v },
  ],
}

test("summary counters: accessible projects, original files, empty repositories", () => {
  const c = explorerCounters(projects)
  assert.equal(c.projects, 30)
  assert.equal(c.files, projects.reduce((n, p) => n + p.fileCount, 0))
  assert.equal(c.empty, projects.filter((p) => p.fileCount === 0).length)
  assert.deepEqual(explorerCounters([]), { projects: 0, files: 0, empty: 0 })
})

test("card pages are 6 / 12 / 24 and the default is 6", () => {
  assert.deepEqual(EXPLORER_PAGE_SIZES, [6, 12, 24])
  const { view } = applyList(projects, { ...defaultListQuery(), pageSize: 6 }, config)
  assert.deepEqual([view.items.length, view.pageCount], [6, 5])
  assert.equal(applyList(projects, withPageSize(defaultListQuery(), 24), config).view.pageCount, 2)
})

test("search and filters run before pagination; counts and pages follow the filtered result", () => {
  let q = withPageSize(defaultListQuery(), 6)
  q = withPage(q, 3)
  q = withFilter(q, "type", "Residential")
  assert.equal(q.page, 1, "a filter change returns to page 1")
  const filtered = applyList(projects, q, config)
  assert.ok(filtered.matched.every((p) => p.type === "Residential"))
  assert.equal(filtered.view.total, projects.filter((p) => p.type === "Residential").length)
  assert.ok(filtered.view.total < 30)
  // Searching a document name finds the project that holds it.
  const found = applyList(projects, withSearch(withPageSize(defaultListQuery(), 6), " PERMIT-7.pdf "), config)
  assert.deepEqual(found.matched.map((p) => p.id), ["p007"])
  // Filters combine; the status label (not the raw code) is what is selected.
  const both = applyList(projects, withFilter(withFilter(defaultListQuery(), "type", "Commercial"), "status", "Completed"), config)
  assert.ok(both.matched.every((p) => p.type === "Commercial" && p.status === "completed"))
})

test("sorting is deterministic: pages never repeat or skip a project", () => {
  const tied = Array.from({ length: 40 }, (_, i) => project(i + 1, { name: "Same Name", fileCount: 3, phase: "Design" }))
  for (const sort of ["name", "name-desc", "files-desc", "files-asc", "phase"]) {
    const ordered = sortProjects([...tied].reverse(), sort)
    assert.deepEqual(ordered.map((p) => p.id), sortProjects(tied, sort).map((p) => p.id), `${sort}: input order never matters`)
    const ids = []
    for (let page = 1; page <= 7; page++)
      ids.push(...applyList(ordered, withPage({ ...defaultListQuery(), pageSize: 6 }, page), { searchText: () => "" }).view.items.map((p) => p.id))
    assert.equal(ids.length, 40, `${sort}: nothing skipped`)
    assert.equal(new Set(ids).size, 40, `${sort}: nothing repeated`)
  }
  assert.deepEqual(sortProjects(projects, "files-desc")[0].fileCount, Math.max(...projects.map((p) => p.fileCount)))
  assert.equal(sortProjects(projects, "name")[0].name, [...projects].sort((a, b) => a.name.localeCompare(b.name))[0].name)
})

test("recently accessed keeps at most two, newest first, no duplicates", () => {
  let recent = []
  for (const id of ["a", "b", "a", "c"]) recent = pushRecent(recent, id)
  assert.deepEqual(recent, ["c", "a"])
  assert.deepEqual(pushRecent(["x", "y"], "y"), ["y", "x"])
})

test("recently accessed never shows a project the person cannot open", () => {
  const accessible = [project(1), project(2)]
  const shown = visibleRecents(["p999", "p002", "p001"], accessible)
  assert.deepEqual(shown.map((p) => p.id), ["p002", "p001"])
  assert.deepEqual(visibleRecents(["p999"], accessible), [])
  assert.equal(visibleRecents(["p001", "p002"], accessible, 2).length <= 2, true)
})

test("status text is readable", () => {
  assert.equal(statusLabel("changes_requested"), "Changes requested")
  assert.equal(statusLabel("active"), "Active")
  assert.equal(statusLabel(""), "")
})

const filesOf = (index) => index.reduce((n, c) => n + c.fileCount, 0)

test("repository file counts reflect only what each role may open, and the four folders are kept", () => {
  const state = initialState()
  const actor = (id) => state.accounts.find((a) => a.id === id)
  const folders = [
    "Construction Phases",
    "Progress & Site Reports",
    "Daily Manpower Reports",
    "Project Agreements & Supporting Documents",
  ]
  let sawFewerForSitePm = false
  for (const p of state.projects) {
    assert.deepEqual(projectDocumentIndex(p).map((c) => c.name), folders)
    const all = filesOf(projectDocumentIndex(p)) // the Administrator view is the unscoped index
    for (const id of ["a2", "a4", "a5"]) {
      const scoped = filesOf(projectDocumentIndexFor(p, actor(id)))
      assert.ok(scoped <= all, `${id} on ${p.id} cannot see more than the Administrator`)
      if (actor(id).role === "spm" && scoped < all) sawFewerForSitePm = true
    }
  }
  assert.ok(sawFewerForSitePm, "Site PMs do not get the Office PM's registered documents")
  // Clients: only their own projects, and only client-visible uploaded documents.
  const client = actor("a9")
  const views = clientProjectViews(state, client.id)
  const own = new Set(views.map((v) => v.id))
  assert.ok(own.size > 0 && own.size < state.projects.length)
  for (const view of views) {
    const shown = clientDocumentIndex(view).flatMap((c) => c.folders.flatMap((f) => f.files))
    const source = state.projects.find((p) => p.id === view.id)
    for (const file of shown) {
      const doc = source.docs.find((d) => d.id === file.id)
      if (doc) assert.ok(doc.uploaded && doc.clientVisible, "a client file must be explicitly client-visible")
    }
  }
})
