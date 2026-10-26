import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"
import { adminDashboardOverview } from "../src/admin-dashboard.ts"
import { adminBannerItem, adminPriorityItems, deadlineUrgency, sortUrgentItems, staffUrgentItems } from "../src/urgent-actions.ts"
import { REVIEW_MS } from "../src/workflows.ts"

const hour = 3600000
const now = Date.now()
const date = age => new Date(now - age * hour).toISOString()
function fixture() {
  const state = initialState()
  state.companies = []
  state.projects = []
  const office = state.accounts.find(a => a.id === "a2")
  const site = state.accounts.find(a => a.id === "a5")
  const base = initialState().projects.find(p => p.status === "active")
  const project = (id, changes = {}) => ({ ...structuredClone(base), id, name: `Project ${id}`, opmId: office.id, phase: "Structure", status: "active", team: [{ phase: "Mobilization", accountId: site.id, status: "confirmed" }, { phase: "Structure", accountId: site.id, status: "confirmed" }],
    workflow: { version: 1, checklist: { Structure: [] }, responses: [], selections: [], notes: [], photos: [] }, ...changes })
  return { state, office, site, project }
}

test("review urgency uses the established three-day window; missing dates never invent overdue work", () => {
  assert.equal(REVIEW_MS, 72 * hour)
  assert.equal(deadlineUrgency(undefined, now), "attention")
  assert.equal(deadlineUrgency(NaN, now), "attention")
  assert.equal(deadlineUrgency(now, now), "overdue")
  assert.equal(deadlineUrgency(now + 24 * hour, now), "soon")
  assert.equal(deadlineUrgency(now + 24 * hour + 1, now), "attention")
  const { state, office, project } = fixture()
  const qa = project("qa")
  qa.workflow.checklist.Structure = [
    { id: "late", status: "submitted", submittedAt: date(73) },
    { id: "soon", status: "submitted", submittedAt: date(60) },
    { id: "undated", status: "submitted" },
    { id: "approved", status: "approved", submittedAt: date(100) },
  ]
  const progress = project("progress")
  progress.workflow.pendingUpdate = { submittedAt: date(73), authorId: "a5" }
  const rework = project("rework")
  rework.workflow.pendingRework = { submittedAt: date(100), authorId: "a5" }
  state.projects = [qa, progress, rework, project("foreign", { opmId: "other-office" }), project("done", { status: "completed" })]
  const snapshot = structuredClone(state)
  const items = staffUrgentItems(state, office, "Dashboard", now)
  assert.equal(items.length, 3)
  const item = items.find(item => item.target === "qa")
  assert.equal(item.overdue, 1)
  assert.equal(item.dueSoon, 1)
  assert.equal(item.due, now - hour)
  assert.match(item.detail, /3 checklist activities/)
  assert.equal(items.find(item => item.target === "progress").urgency, "overdue")
  assert.equal(items.find(item => item.target === "rework").due, undefined)
  assert.equal(items.find(item => item.target === "rework").urgency, "attention")
  assert.deepEqual(state, snapshot)
  for (const page of ["Rework & approvals", "Deadlines", "Active sites"]) assert.equal(staffUrgentItems(state, office, page, now).length, 3)
  assert.equal(staffUrgentItems(state, office, "Preferences", now).length, 0)
  qa.workflow.checklist.Structure.forEach(item => { item.status = "approved" })
  assert.ok(!staffUrgentItems(state, office, "Dashboard", now).some(item => item.target === "qa"))
})

test("assignment alerts respect ownership, response gates, stored soft/hard deadlines and resolution", () => {
  const { state, office, site, project } = fixture()
  const pending = project("response", { status: "pending" })
  pending.team[1].status = "pending"
  pending.workflow.deadline = { accountId: site.id, soft: date(-12), hard: date(-36) }
  state.projects = [pending]
  const items = staffUrgentItems(state, site, "Assignments", now)
  assert.equal(items.length, 1)
  assert.equal(items[0].urgency, "soon")
  assert.equal(items[0].target, "assignment")
  assert.equal(staffUrgentItems(state, office, "Confirmation queue", now)[0].target, "responses")
  assert.deepEqual(staffUrgentItems(state, { ...site, id: "foreign-site" }, "Dashboard", now), [])
  pending.workflow.deadline.hard = date(1)
  assert.match(staffUrgentItems(state, site, "Dashboard", now)[0].status, /Hard response deadline passed/)
  pending.team[1].status = "confirmed"
  assert.deepEqual(staffUrgentItems(state, site, "Dashboard", now), [])
  pending.team[1].status = "pending"
  pending.workflow.deadline.expired = true
  assert.deepEqual(staffUrgentItems(state, office, "Dashboard", now), [])
  assert.deepEqual(staffUrgentItems(state, { ...site, status: "suspended" }, "Dashboard", now), [])
  assert.deepEqual(staffUrgentItems(state, { ...site, role: "client" }, "Dashboard", now), [])
})

test("Admin priorities reuse current license, blocked-handoff and review records, and scope them to their modules", () => {
  const { state, project } = fixture()
  state.accounts = [{ ...state.accounts.find(a => a.id === "a5"), expiry: new Date(now - 2 * 86400000).toISOString().slice(0,10) }]
  const blocked = project("blocked", { handoffReadiness: { state: "blocked", stageId: "1", reasonCode: "next_assignment", reason: "Confirm the next Site PM." } })
  const qa = project("qa")
  qa.workflow.checklist.Structure = [{ id: "evidence", status: "submitted", submittedAt: date(73) }]
  state.projects = [blocked, qa]
  const overview = adminDashboardOverview(state, now)
  assert.equal(overview.items.find(item => item.id === "qa").urgency, "overdue")
  assert.equal(overview.items.find(item => item.id === "a5").urgency, "overdue")
  assert.equal(adminPriorityItems(overview.items, "Team").length, 1)
  assert.equal(adminPriorityItems(overview.items, "Active sites").length, 2)
  assert.equal(adminPriorityItems(overview.items, "Activity log").length, 0)
  assert.ok(!adminPriorityItems(overview.items, "Dashboard", false).some(item => item.blocker))
  assert.equal(adminBannerItem(overview.items.find(item => item.id === "a5")).dateOnly, true)
  const items = overview.items.map(adminBannerItem)
  assert.ok(sortUrgentItems(items).find(item => item.urgency === "blocked"))
  assert.equal(new Set(items.map(item => item.key)).size, items.length)
})
