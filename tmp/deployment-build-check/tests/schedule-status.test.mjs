import assert from "node:assert/strict"
import test from "node:test"
import { execFileSync } from "node:child_process"
import { delayedProjects, localScheduleDate, projectScheduleStatus } from "../src/domain/schedule-status.ts"

const today = "2026-10-27"
test("schedule statuses use project completion and the loaded target end date, never percentage", () => {
  assert.deepEqual(projectScheduleStatus({ status: "active", end: "2026-10-26" }, today), { status: "Delayed", daysOverdue: 1, targetEndDate: "2026-10-26" })
  assert.equal(projectScheduleStatus({ status: "active", end: today, progress: 0 }, today).status, "On schedule")
  assert.equal(projectScheduleStatus({ status: "active", end: "2026-11-01", progress: 0 }, today).status, "On schedule")
  assert.equal(projectScheduleStatus({ status: "active", end: "2026-10-26", progress: 100 }, today).status, "Delayed")
  for (const end of ["2026-10-01", today, "2026-11-01", undefined]) {
    const result = projectScheduleStatus({ status: "completed", end }, today)
    assert.equal(result.status, "Completed")
    assert.equal(result.daysOverdue, 0)
  }
})

test("missing and malformed target dates have no invented deadline", () => {
  for (const end of [undefined, null, "", "not a date", "2026-02-30", "2026-2-03", "2026-10-26T00:00:00Z"]) {
    assert.deepEqual(projectScheduleStatus({ status: "active", end }, today), { status: "No target date", daysOverdue: 0, targetEndDate: null })
  }
  assert.throws(() => projectScheduleStatus({ status: "active", end: today }, "2026-02-30"), RangeError)
})

test("overdue days count calendar boundaries, including leap days and year changes", () => {
  assert.equal(projectScheduleStatus({ status: "active", end: "2024-02-28" }, "2024-03-01").daysOverdue, 2)
  assert.equal(projectScheduleStatus({ status: "active", end: "2025-12-31" }, "2026-01-02").daysOverdue, 2)
  assert.equal(projectScheduleStatus({ status: "active", end: "2026-10-01" }, today).daysOverdue, 26)
  assert.equal(localScheduleDate(new Date(2026, 9, 27, 0, 5)), today)
  assert.equal(projectScheduleStatus({ status: "active", end: "2026-10-26" }, new Date(2026, 9, 27, 23, 59)).daysOverdue, 1)
})

test("fixed local today is correct on both sides of UTC midnight and across DST", () => {
  const moduleUrl = new URL("../src/domain/schedule-status.ts", import.meta.url).href
  const run = (zone, instant, end) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
    `import {localScheduleDate,projectScheduleStatus} from ${JSON.stringify(moduleUrl)}; const now=new Date(${JSON.stringify(instant)}); console.log(JSON.stringify({today:localScheduleDate(now),...projectScheduleStatus({status:"active",end:${JSON.stringify(end)}},now)}))`],
    { env: { ...process.env, TZ: zone }, encoding: "utf8" }))
  assert.deepEqual(run("Asia/Taipei", "2026-10-26T16:05:00Z", "2026-10-26"), { today, status: "Delayed", daysOverdue: 1, targetEndDate: "2026-10-26" })
  assert.equal(run("America/Los_Angeles", "2026-10-27T06:55:00Z", "2026-10-26").status, "On schedule")
  assert.equal(run("America/New_York", "2026-03-09T04:01:00Z", "2026-03-07").daysOverdue, 2)
  assert.equal(run("America/New_York", "2026-11-02T05:01:00Z", "2026-10-31").daysOverdue, 2)
})

test("delayed attention counts contain only active delayed projects without mutating or saving data", () => {
  const projects = [
    { id: "late", status: "active", end: "2026-10-01" },
    { id: "done", status: "completed", end: "2026-10-01" },
    { id: "today", status: "active", end: today },
    { id: "missing", status: "active" },
    { id: "draft", status: "draft", end: "2026-10-01" },
  ]
  const before = structuredClone(projects)
  assert.deepEqual(delayedProjects(projects, today).map(project => project.id), ["late"])
  assert.deepEqual(projects, before)
})
