import assert from "node:assert/strict"
import test from "node:test"
import { latestStartDate, localToday, startDateError } from "../src/model.ts"

const shift = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

test("start date accepts today and future dates only", () => {
  assert.equal(startDateError(""), "")
  assert.equal(startDateError(localToday()), "")
  assert.equal(startDateError(shift(30)), "")
  assert.match(startDateError(shift(-1)), /past/)
  assert.match(startDateError("2020-01-01"), /past/)
})

test("start date rejects impossible calendar dates and absurd years", () => {
  assert.match(startDateError("2027-02-30"), /valid date/)
  assert.match(startDateError("2027-13-01"), /valid date/)
  assert.match(startDateError("garbage"), /valid date/)
  assert.match(startDateError("99999-01-01"), /valid date/)
  assert.match(startDateError("9999-01-01"), /years/)
  assert.equal(startDateError(latestStartDate()), "")
})
