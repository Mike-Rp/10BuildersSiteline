import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"
import { adminWorkspaceIndex } from "../src/admin-workspace-search.ts"
import { resolveAdminSearchDestination } from "../src/admin-search-destination.ts"

test("search destinations follow project lifecycle, account type and company status", () => {
  const state = initialState(), project = state.projects[0], account = state.accounts[0], company = state.companies[0]
  const result = (category, id) => ({ category, id })
  for (const [status, page, tab] of [["active", "Active sites"], ["draft", "Project intake"], ["pending", "Project intake"], ["changes_requested", "Project intake"], ["completed", "Archive", "closed"], ["declined", "Archive", "declined"], ["expired", "Archive", "expired"]]) {
    project.status = status
    const destination = resolveAdminSearchDestination(state, result("projects", project.id))
    assert.equal(destination.page, page); assert.equal(destination.archiveTab, tab)
    assert.equal(destination.dialog, page === "Project intake" ? "intake-record" : "project")
  }
  for (const role of ["admin", "opm", "spm", "client"]) {
    account.role = role; account.status = "active"
    assert.equal(resolveAdminSearchDestination(state, result("people", account.id)).page, role === "client" ? "Team" : "Directory")
  }
  account.status = "deactivated"
  assert.equal(resolveAdminSearchDestination(state, result("people", account.id)).listKey, "admin:archive-deactivated")
  for (const status of ["approved", "pending", "rejected", "archived"]) {
    company.status = status
    const destination = resolveAdminSearchDestination(state, result("companies", company.id))
    assert.equal(destination.page, "Directory"); assert.equal(destination.directoryTab, "subcontractors")
    assert.equal(destination.subconTab, status === "approved" ? "registered" : status)
  }
  assert.equal(resolveAdminSearchDestination(state, result("projects", "deleted")), undefined)
})

test("document navigation keeps the source record and exact project folder", () => {
  const state = initialState()
  const doc = id => ({ id, name: `${id}.pdf`, label: "Signed agreement", owner: "Admin", uploaded: true, clientVisible: false, date: "2026-11-10" })
  state.projects[0].docs.push(doc("project-search-doc"))
  state.accounts[0].docs.push(doc("person-search-doc"))
  state.accounts[0].role = "spm"; state.accounts[0].status = "active"
  state.companies[0].documents.push(doc("company-search-doc"))
  const index = adminWorkspaceIndex(state, {})
  const resolve = id => resolveAdminSearchDestination(state, index.find(result => result.id === id && result.category === "documents"))
  const project = resolve("project-search-doc")
  assert.equal(project.page, "Documents"); assert.equal(project.documentsTab, "project")
  assert.equal(project.repositoryPath.projectId, state.projects[0].id)
  assert.ok(project.repositoryPath.categoryId); assert.ok(project.repositoryPath.folderId)
  assert.equal(resolve("person-search-doc").listKey, "admin:engineer-docs")
  assert.equal(resolve("company-search-doc").directoryTab, "subcontractors")
  state.projects[0].docs = state.projects[0].docs.filter(doc => doc.id !== "project-search-doc")
  assert.equal(resolve("project-search-doc"), undefined, "a removed document does not open from a stale search result")
})
