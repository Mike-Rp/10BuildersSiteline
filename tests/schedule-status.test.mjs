import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"
import { adminDashboardOverview } from "../src/admin-dashboard.ts"
import {
  delayedBannerText,
  delayedProjects,
  isDelayed,
  localToday,
  overdueText,
  scheduleStatus,
} from "../src/schedule-status.ts"

const TODAY = "2026-10-26"
const status = (project, today = TODAY) => scheduleStatus({ status: "active", ...project }, today)

test("each status: on schedule, delayed, completed and no target date", () => {
  assert.deepEqual(status({ end: "2027-01-15" }), { state: "on_schedule", label: "On schedule", targetEnd: "2027-01-15" })
  assert.deepEqual(status({ end: "2026-10-20" }), { state: "delayed", label: "Delayed", targetEnd: "2026-10-20", daysOverdue: 6 })
  assert.deepEqual(status({ status: "completed", end: "2026-10-20" }), { state: "completed", label: "Completed", targetEnd: "2026-10-20" })
  assert.deepEqual(status({}), { state: "no_target", label: "No target date" })
})

test("days overdue counts calendar days and the target day itself is still on schedule", () => {
  assert.equal(status({ end: TODAY }).state, "on_schedule", "due today is not late yet")
  const oneDay = status({ end: "2026-10-25" })
  assert.deepEqual([oneDay.state, oneDay.daysOverdue], ["delayed", 1])
  assert.equal(status({ end: "2026-09-26" }).daysOverdue, 30)
  assert.equal(status({ end: "2025-10-26" }).daysOverdue, 365)
  // Across a month and a leap day, and not shifted by a daylight-saving change.
  assert.equal(status({ end: "2028-02-27" }, "2028-03-01").daysOverdue, 3)
  assert.equal(status({ end: "2026-03-07" }, "2026-03-10").daysOverdue, 3)
  assert.equal(overdueText(1), "1 day overdue")
  assert.equal(overdueText(7), "7 days overdue")
})

test("today is the user's LOCAL date, never the UTC date", () => {
  // Built from local components, so the result must match whatever time zone the machine is in.
  assert.equal(localToday(new Date(2026, 9, 26, 23, 59, 59)), "2026-10-26")
  assert.equal(localToday(new Date(2026, 9, 26, 0, 0, 1)), "2026-10-26")
  assert.equal(localToday(new Date(2026, 0, 5, 12)), "2026-01-05")
  assert.equal(localToday(new Date(2026, 11, 31, 23, 30)), "2026-12-31")
  // The same project flips to Delayed exactly when the local date passes the target date.
  const project = { status: "active", end: "2026-10-26" }
  assert.equal(scheduleStatus(project, localToday(new Date(2026, 9, 26, 23, 59))).state, "on_schedule")
  assert.equal(scheduleStatus(project, localToday(new Date(2026, 9, 27, 0, 0, 1))).state, "delayed")
  // The default uses the real local date.
  assert.equal(scheduleStatus({ status: "active", end: "2999-01-01" }).state, "on_schedule")
  assert.equal(scheduleStatus({ status: "active", end: "2000-01-01" }).state, "delayed")
})

test("a missing, blank or impossible target end date is reported as no target date", () => {
  for (const end of [undefined, "", "not a date", "2026-13-40", "2026-02-30", "26-10-26", "2026-10-26T00:00:00Z"])
    assert.equal(status({ end }).state, "no_target", String(end))
  assert.equal(isDelayed({ status: "active" }, TODAY), false)
})

test("completed projects are never shown as Delayed", () => {
  for (const end of ["2020-01-01", "2026-10-25", TODAY, "2027-01-01", undefined, "garbage"]) {
    const completed = { status: "completed", end }
    assert.equal(scheduleStatus(completed, TODAY).state, "completed", String(end))
    assert.equal(isDelayed(completed, TODAY), false)
  }
  // Records that are not live yet are never counted as delayed either.
  for (const state of ["draft", "pending", "changes_requested", "declined", "expired"])
    assert.equal(isDelayed({ status: state, end: "2020-01-01" }, TODAY), false, state)
  const list = [
    { id: "late", status: "active", end: "2026-10-01" },
    { id: "done", status: "completed", end: "2026-10-01" },
    { id: "fine", status: "active", end: "2027-01-01" },
    { id: "none", status: "active" },
    { id: "draft", status: "draft", end: "2026-10-01" },
  ]
  assert.deepEqual(delayedProjects(list, TODAY).map((p) => p.id), ["late"])
})

test("the Site PM banner reads as specified", () => {
  assert.equal(
    delayedBannerText(status({ end: "2026-10-19" })),
    "This project passed its target completion date on Oct 19, 2026 (7 days overdue).",
  )
  assert.equal(
    delayedBannerText(status({ end: "2026-10-25" })),
    "This project passed its target completion date on Oct 25, 2026 (1 day overdue).",
  )
})

test("the Needs attention queue gets one 'Delayed projects (N)' row only when something is delayed", () => {
  const state = {
    ...emptyState(),
    projects: [
      { id: "a", name: "Late A", status: "active", end: "2026-10-01" },
      { id: "b", name: "Late B", status: "active", end: "2026-10-20" },
      { id: "c", name: "Done", status: "completed", end: "2026-01-01" },
      { id: "d", name: "Fine", status: "active", end: "2027-06-01" },
    ],
  }
  const row = adminDashboardOverview(state, TODAY).items.find((i) => i.key === "delayed-projects")
  assert.equal(row.title, "Delayed projects (2)")
  assert.equal(row.kind, "schedule")
  assert.equal(adminDashboardOverview(state, TODAY).items.filter((i) => i.key === "delayed-projects").length, 1)
  state.projects[0].end = state.projects[1].end = "2027-01-01"
  assert.equal(adminDashboardOverview(state, TODAY).items.some((i) => i.key === "delayed-projects"), false)
})
