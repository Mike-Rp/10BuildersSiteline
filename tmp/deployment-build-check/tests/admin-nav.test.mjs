import assert from "node:assert/strict"
import test from "node:test"
import {
  ADMIN_NAV,
  DIRECTORY_TABS,
  DOCUMENT_TABS,
  adminBreadcrumb,
  resolveAdminTarget,
  normalizeWorkspacePage,
} from "../src/adminNav.ts"

const labels = ADMIN_NAV.map((n) => n.label)
const OLD = [
  "Project documents",
  "Engineer documents",
  "Engineer directory",
  "Subcon directory",
]

test("the four RESOURCES items are merged into Documents and Directory", () => {
  for (const old of OLD) assert.ok(!labels.includes(old), old)
  const docs = ADMIN_NAV.find((n) => n.label === "Documents")
  const directory = ADMIN_NAV.find((n) => n.label === "Directory")
  assert.equal(docs.group, "RESOURCES")
  assert.equal(docs.icon, "folder")
  assert.equal(directory.icon, "users")
  assert.equal(labels.indexOf("Directory"), labels.indexOf("Documents") + 1)
})

test("tab sets and defaults", () => {
  assert.deepEqual(
    DOCUMENT_TABS.map(([, label]) => label),
    ["Project documents", "Engineer documents"],
  )
  assert.deepEqual(
    DIRECTORY_TABS.map(([, label]) => label),
    ["Engineers", "Subcontractors"],
  )
  assert.equal(DOCUMENT_TABS[0][0], "project")
  assert.equal(DIRECTORY_TABS[0][0], "engineers")
})

test("every old page link opens the matching new page and tab", () => {
  assert.deepEqual(resolveAdminTarget("Project documents"), {
    page: "Documents",
    documentsTab: "project",
  })
  assert.deepEqual(resolveAdminTarget("Engineer documents"), {
    page: "Documents",
    documentsTab: "engineer",
  })
  assert.deepEqual(resolveAdminTarget("Engineer directory"), {
    page: "Directory",
    directoryTab: "engineers",
  })
  assert.deepEqual(resolveAdminTarget("Subcon directory"), {
    page: "Directory",
    directoryTab: "subcontractors",
  })
})

test("pending-request links open Directory > Subcontractors > Pending requests", () => {
  assert.deepEqual(resolveAdminTarget("Approvals"), {
    page: "Directory",
    directoryTab: "subcontractors",
    subconTab: "pending",
  })
})

test("sidebar labels are not remapped, so the last-used tab is remembered", () => {
  assert.equal(resolveAdminTarget("Documents"), undefined)
  assert.equal(resolveAdminTarget("Directory"), undefined)
  assert.equal(resolveAdminTarget("Dashboard"), undefined)
})

test("breadcrumb shows the tab", () => {
  assert.deepEqual(adminBreadcrumb("Directory", "project", "subcontractors"), [
    "Directory",
    "Subcontractors",
  ])
  assert.deepEqual(adminBreadcrumb("Documents", "engineer", "engineers"), [
    "Documents",
    "Engineer documents",
  ])
  assert.deepEqual(adminBreadcrumb("Team", "project", "engineers"), ["Team"])
})

test("standalone schedule navigation is retired and old targets open Active Sites", () => {
  assert.ok(!labels.includes("Schedule performance"))
  assert.equal(normalizeWorkspacePage("Schedule performance"), "Active sites")
  assert.equal(normalizeWorkspacePage("Schedule Performance"), "Active sites")
  assert.equal(normalizeWorkspacePage("Documents"), "Documents")
})

test("Admin has a dedicated activity log navigation tab", () => {
  assert.equal(labels.filter(label => label === "Activity log").length, 1)
  assert.equal(ADMIN_NAV.find(item => item.label === "Activity log").icon, "activity")
  assert.deepEqual(adminBreadcrumb("Activity log", "project", "engineers"), ["Activity log"])
})
