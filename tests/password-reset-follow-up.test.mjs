import assert from "node:assert/strict"
import test from "node:test"
import { activeClaim, claimFields, reminderDue, CLAIM_HOLD_MS } from "../Thesis-Backend/src/services/accounts/reset-follow-up.utility.js"
import { overdueCount, waitLabel, waitLevel } from "../src/password-reset-wait.ts"

const hour = 3600000, t0 = Date.parse("2026-11-05T00:00:00Z")
const at = hours => new Date(t0 - hours * hour).toISOString()

test("waiting time turns amber after 4 hours and red after 24", () => {
  assert.equal(waitLevel(at(1), t0), "normal")
  assert.equal(waitLevel(at(4), t0), "amber")
  assert.equal(waitLevel(at(23), t0), "amber")
  assert.equal(waitLevel(at(24), t0), "red")
  assert.equal(waitLabel(at(0.2), t0), "Waiting less than an hour")
  assert.equal(waitLabel(at(1), t0), "Waiting 1 hour")
  assert.equal(waitLabel(at(5), t0), "Waiting 5 hours")
  assert.equal(waitLabel(at(72), t0), "Waiting 3 days")
  assert.equal(overdueCount([{ requested_at: at(1) }, { requested_at: at(6) }, { requested_at: at(30), status: "completed" }], t0), 1)
})

test("a claim holds for two hours, only for its own request, and never beyond", () => {
  const meta = claimedAt => ({ passwordResetRequestedAt: "R1", passwordResetClaim: { by: "a1", byName: "Admin One", requestedAt: "R1", claimedAt } })
  const fresh = new Date(t0 - hour).toISOString()
  assert.equal(activeClaim(meta(fresh), t0).by, "a1")
  assert.equal(claimFields(meta(fresh), "a1", t0).claimed_by_me, true)
  assert.equal(claimFields(meta(fresh), "a2", t0).claimed_by_me, false)
  assert.equal(activeClaim(meta(new Date(t0 - CLAIM_HOLD_MS - 1).toISOString()), t0), null, "an old claim releases itself")
  assert.equal(activeClaim({ ...meta(fresh), passwordResetRequestedAt: "R2" }, t0), null, "a claim on an earlier request does not carry over")
})

test("reminders start at 4 hours and repeat at most every 12 hours", () => {
  assert.equal(reminderDue({ passwordResetRequestedAt: at(3) }, t0), false)
  assert.equal(reminderDue({ passwordResetRequestedAt: at(4) }, t0), true)
  assert.equal(reminderDue({ passwordResetRequestedAt: at(10), passwordResetRemindedAt: at(6) }, t0), false)
  assert.equal(reminderDue({ passwordResetRequestedAt: at(30), passwordResetRemindedAt: at(13) }, t0), true)
  assert.equal(reminderDue({}, t0), false)
})
