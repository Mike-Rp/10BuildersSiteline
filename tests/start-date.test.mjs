import assert from "node:assert/strict"
import test from "node:test"
import {
  DATE_ERRORS,
  addDays,
  latestProjectDate,
  localToday,
  projectDateErrors,
  startsInLabel,
} from "../src/model.ts"

// Local "now" late evening in a UTC+8 zone would be the previous day in UTC.
const lateLocal = new Date(2026, 9, 18, 23, 30)
const NOW = new Date(2026, 9, 18, 12, 0)

test("today is the LOCAL calendar date, not the UTC date", () => {
  assert.equal(localToday(lateLocal), "2026-10-18")
  assert.equal(localToday(NOW), "2026-10-18")
})

test("start date must be today or later and within 10 years", () => {
  assert.deepEqual(projectDateErrors("", "", NOW), {})
  assert.deepEqual(projectDateErrors("2026-10-18", "", NOW), {})
  assert.deepEqual(projectDateErrors("2027-03-01", "", NOW), {})
  assert.equal(
    projectDateErrors("2026-10-17", "", NOW).start,
    DATE_ERRORS.startPast,
  )
  assert.equal(
    projectDateErrors("2025-01-01", "", NOW).start,
    DATE_ERRORS.startPast,
  )
  assert.equal(latestProjectDate(NOW), "2036-10-18")
  assert.deepEqual(projectDateErrors("2036-10-18", "", NOW), {})
  assert.equal(
    projectDateErrors("2036-10-19", "", NOW).start,
    DATE_ERRORS.tooFar,
  )
})

test("invalid, incomplete and 5-digit-year dates are rejected", () => {
  for (const bad of ["2027-02-30", "2027-13-01", "garbage", "12345-01-01"]) {
    assert.equal(projectDateErrors(bad, "", NOW).start, DATE_ERRORS.invalid)
    assert.equal(
      projectDateErrors("2026-10-18", bad, NOW).end,
      DATE_ERRORS.invalid,
    )
  }
})

test("end date must be at least one day after the start date", () => {
  assert.deepEqual(projectDateErrors("2026-10-18", "2026-10-19", NOW), {})
  assert.equal(
    projectDateErrors("2026-10-18", "2026-10-18", NOW).end,
    DATE_ERRORS.endNotAfter,
  )
  assert.equal(
    projectDateErrors("2026-11-01", "2026-10-20", NOW).end,
    DATE_ERRORS.endNotAfter,
  )
  assert.equal(
    projectDateErrors("2026-10-18", "2036-10-19", NOW).end,
    DATE_ERRORS.tooFar,
  )
})

test("helpers: addDays and starts-in label", () => {
  assert.equal(addDays("2026-10-18", 1), "2026-10-19")
  assert.equal(addDays("2026-12-31", 1), "2027-01-01")
  assert.equal(startsInLabel("2026-10-18", NOW), "Starts today")
  assert.equal(startsInLabel("2026-10-19", NOW), "Starts in 1 day")
  assert.equal(startsInLabel("2026-10-28", NOW), "Starts in 10 days")
})
