import { LICENSE_ACCESS_DISABLED_MESSAGE, LICENSE_VIEW_ONLY_MESSAGE } from "../Thesis-Backend/src/domain/license-access.js"
// Expired engineer license workflow: pure rules (status calculation, reminders, the pause gate, the assignment
// warning and the local pre-check). Dates are fixed, so these never depend on when the tests run.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_REMINDER_DAYS,
  addDays,
  cleanReminderDays,
  computeLicenseStatus,
  daysBetween,
  localDay,
} from "../Thesis-Backend/src/common/utilities/license-status.utility.js"
import { LICENSE_PAUSED_CODE, LICENSE_PAUSED_MESSAGE, assertLicenseActive } from "../Thesis-Backend/src/common/utilities/license-gate.utility.js"
import { reminderKeyFor } from "../Thesis-Backend/src/services/licenses/sweep.js"
import { daysUntil, eligible, licenseExpired, licenseExpiresDuringProject, licenseGrace, licenseState } from "../src/model.ts"
import { LICENSE_COMMANDS, LICENSE_PAUSED_MESSAGE as UI_PAUSED, applyWorkflow } from "../src/workflows.ts"
import { initialState } from "./fixtures/demo-state.ts"

const TODAY = "2026-10-22"
const status = (expiry, extra = {}) => computeLicenseStatus({ expiry, today: TODAY, graceDays: 30, reminderDays: [60, 30, 14, 7, 0], ...extra })

test("license status is calculated from the expiry date against today", () => {
  // Valid beyond the first reminder day, expiring soon inside it.
  assert.equal(status(addDays(TODAY, 200)).status, "valid")
  assert.equal(status(addDays(TODAY, 61)).status, "valid")
  assert.equal(status(addDays(TODAY, 60)).status, "expiring_soon")
  assert.equal(status(addDays(TODAY, 1)).status, "expiring_soon")
  // The expiry day itself still counts as valid: nothing is restricted yet.
  const onExpiry = status(TODAY)
  assert.equal(onExpiry.status, "expiring_soon")
  assert.equal(onExpiry.restricted, false)
  assert.equal(onExpiry.daysToExpiry, 0)
  // The day after, it is expired and restricted, with the full grace period ahead.
  const expired = status(addDays(TODAY, -1))
  assert.equal(expired.status, "expired")
  assert.equal(expired.restricted, true)
  assert.equal(expired.graceEnded, false)
  assert.equal(expired.graceDaysLeft, 30)
  // The countdown counts today: the last grace day shows 1, the next day the grace period is over.
  assert.equal(status(addDays(TODAY, -30)).graceDaysLeft, 1)
  assert.equal(status(addDays(TODAY, -30)).graceEnded, false)
  const over = status(addDays(TODAY, -31))
  assert.equal(over.graceEnded, true)
  assert.equal(over.graceDaysLeft, null)
  assert.equal(over.graceEndsOn, addDays(TODAY, -1))
  // A missing license is its own state and never "restricted" (it already blocks new assignments elsewhere).
  assert.equal(status(null).status, "missing")
  assert.equal(status(null).restricted, false)
})

test("renewal under review is shown as such but never lifts the restriction", () => {
  const review = status(addDays(TODAY, -5), { renewalOpen: true })
  assert.equal(review.status, "renewal_under_review")
  assert.equal(review.restricted, true)
  assert.equal(review.base, "expired")
  const early = status(addDays(TODAY, 20), { renewalOpen: true })
  assert.equal(early.status, "renewal_under_review")
  assert.equal(early.restricted, false)
})

test("the grace period and reminder days come from the Admin settings", () => {
  assert.equal(DEFAULT_GRACE_DAYS, 30)
  assert.deepEqual(DEFAULT_REMINDER_DAYS, [60, 30, 14, 7, 0])
  const short = status(addDays(TODAY, -8), { graceDays: 7 })
  assert.equal(short.graceEnded, true)
  const wide = status(addDays(TODAY, 100), { reminderDays: [120, 0] })
  assert.equal(wide.status, "expiring_soon")
  assert.deepEqual(cleanReminderDays([7, 30, "14", 7, -1, 400, 2.5]), [30, 14, 7])
  assert.deepEqual(cleanReminderDays([]), DEFAULT_REMINDER_DAYS)
  assert.deepEqual(cleanReminderDays(undefined), DEFAULT_REMINDER_DAYS)
})

test("calendar helpers use whole local days", () => {
  assert.equal(daysBetween("2026-10-22", "2026-10-23"), 1)
  assert.equal(daysBetween("2026-03-01", "2026-02-28"), -1)
  assert.equal(addDays("2026-12-31", 1), "2027-01-01")
  assert.equal(addDays("2028-02-28", 1), "2028-02-29")
  assert.match(localDay(new Date(2026, 0, 5, 23, 59)), /^2026-01-05$/)
})

test("the reminder due on a given day is one key, so it can be recorded and sent once", () => {
  const key = (offset, extra) => reminderKeyFor(status(addDays(TODAY, offset), extra), [60, 30, 14, 7, 0])
  assert.equal(key(200), null)
  assert.equal(key(61), null)
  assert.equal(key(60), "60")
  // Between reminder days it stays in the same band, so a missed run is caught up exactly once.
  assert.equal(key(45), "60")
  assert.equal(key(30), "30")
  assert.equal(key(10), "14")
  assert.equal(key(7), "7")
  assert.equal(key(1), "7")
  assert.equal(key(0), "0")
  // Past expiry: weekly during the grace period, then one final key.
  assert.equal(key(-1), "grace-w0")
  assert.equal(key(-7), "grace-w0")
  assert.equal(key(-8), "grace-w1")
  assert.equal(key(-30), "grace-w4")
  assert.equal(key(-31), "grace-ended")
  assert.equal(key(-300), "grace-ended")
  assert.equal(reminderKeyFor(status(null), [60]), null)
})

test("the backend gate pauses an expired Office PM or Site PM and nobody else", async () => {
  const dbWith = (expiry) => ({ query: async () => ({ rows: expiry === undefined ? [] : [{ license_expiry: expiry }] }) })
  for (const role of ["opm", "spm"]) {
    await assert.rejects(
      assertLicenseActive({ id: "u", role }, dbWith("2026-10-21"), TODAY),
      (error) => error.status === 403 && error.message === LICENSE_PAUSED_MESSAGE && error.errorCode === LICENSE_PAUSED_CODE,
    )
    // Valid through the expiry day itself, and with no license on file (that case is blocked from new assignments only).
    await assert.rejects(assertLicenseActive({ id: "u", role }, dbWith("2026-10-22"), TODAY), {status:403})
    await assertLicenseActive({ id: "u", role }, dbWith(undefined), TODAY)
    await assertLicenseActive({ id: "u", role }, dbWith("2030-01-01"), TODAY)
  }
  for (const role of ["admin", "client"]) await assertLicenseActive({ id: "u", role }, dbWith("2000-01-01"), TODAY)
  assert.equal(LICENSE_PAUSED_MESSAGE, "Paused until your license renewal is verified")
  assert.equal(UI_PAUSED, LICENSE_PAUSED_MESSAGE, "the screen and the backend show the same message")
})

test("the assignment warning appears only when the license ends before the project does", () => {
  assert.equal(licenseExpiresDuringProject("2026-11-11", "2027-02-19"), true)
  assert.equal(licenseExpiresDuringProject("2027-02-19", "2027-02-19"), false)
  assert.equal(licenseExpiresDuringProject("2028-01-01", "2027-02-19"), false)
  assert.equal(licenseExpiresDuringProject("", "2027-02-19"), false)
  assert.equal(licenseExpiresDuringProject("2026-11-11", ""), false)
  assert.equal(licenseExpiresDuringProject(undefined, undefined), false)
})

const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

test("the screen's license labels follow the same rules, including renewal under review", () => {
  assert.equal(licenseState({ expiry: inDays(200) }, 30), "Valid")
  assert.equal(licenseState({ expiry: inDays(20) }, 30), "Expiring soon")
  assert.equal(licenseState({ expiry: inDays(-3) }, 30), "Expired")
  assert.equal(licenseState({ expiry: inDays(-40) }, 30), "Grace expired")
  assert.equal(licenseState({ expiry: inDays(-3), renewalUnderReview: true }, 30), "Renewal under review")
  assert.equal(licenseState({ expiry: "" }, 30), "Not on file")
  assert.equal(daysUntil(inDays(0)), 0)
  assert.equal(licenseExpired({ expiry: inDays(0) }), false)
  assert.equal(licenseExpired({ expiry: inDays(-1) }), true)
  assert.deepEqual(licenseGrace({ expiry: inDays(-1) }, 30), { expired: true, ended: false, daysLeft: 30 })
  assert.deepEqual(licenseGrace({ expiry: inDays(-13) }, 30), { expired: true, ended: false, daysLeft: 18 })
  assert.equal(licenseGrace({ expiry: inDays(-31) }, 30).ended, true)
  assert.equal(licenseGrace({ expiry: inDays(5) }, 30).expired, false)
})

test("an expired license puts the engineer on hold for new assignments straight away", () => {
  const state = initialState()
  const account = state.accounts.find((a) => a.role === "spm" && a.status === "active")
  const valid = { ...account, expiry: inDays(300), assignmentHold: false, cooldown: undefined, eligibleForNewAssignment: true }
  const withAccount = (change) => ({ ...state, accounts: state.accounts.map((a) => (a.id === account.id ? { ...valid, ...change } : a)) })
  const base = withAccount({})
  assert.equal(eligible(base, base.accounts.find((a) => a.id === account.id), "spm"), true)
  for (const expiry of [inDays(-1), inDays(-10), inDays(-100)]) {
    const next = withAccount({ expiry })
    assert.equal(eligible(next, next.accounts.find((a) => a.id === account.id), "spm"), false, `expired ${expiry}`)
  }
})

test("expired engineers cannot mutate or view workspace records after the company viewing period", () => {
  const state = initialState()
  const spm = state.accounts.find((a) => a.id === "a4")
  const opm = state.accounts.find((a) => a.id === "a2")
  const expired = (account) => ({ ...state, accounts: state.accounts.map((a) => (a.id === account.id ? { ...a, expiry: inDays(-3) } : a)) })
  for (const [account, commands] of [
    [spm, ["accept_assignment", "submit_progress", "submit_checklist", "contact_company", "respond_company", "upload_agreement", "activate_project", "request_company"]],
    [opm, ["accept_opm", "upload_registered", "approve_update", "approve_checklist", "reject_checklist", "approve_rework", "decline_rework"]],
  ]) {
    for (const type of commands) {
      assert.ok(LICENSE_COMMANDS.has(type), `${type} is a license command`)
      assert.throws(
        () => applyWorkflow(expired(account), account.id, { type, projectId: "p1" }),
        { message: LICENSE_ACCESS_DISABLED_MESSAGE },
        `${account.id} ${type}`,
      )
    }
  }
  const viewOnly = {...state, accounts: state.accounts.map(a => a.id === spm.id ? {...a,expiry:inDays(28)} : a)}
  assert.throws(() => applyWorkflow(viewOnly,spm.id,{type:"add_note",projectId:"p1"}),{message:LICENSE_VIEW_ONLY_MESSAGE})

})

test("every command the backend pauses is also paused by the screen", () => {
  const routes = fs.readFileSync(new URL("../Thesis-Backend/src/services/workspace/routes.js", import.meta.url), "utf8")
  const list = routes.match(/const LICENSE_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(list, "backend command list found")
  const names = [...list[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  assert.ok(names.length >= 10)
  for (const name of names) assert.ok(LICENSE_COMMANDS.has(name), `${name} is paused by the backend but not by the screen`)
})

 test("new assignments exclude licenses expiring within 30 days for both engineer roles", () => {
  const state = initialState()
  for (const role of ["opm", "spm"]) {
    const account = state.accounts.find(a => a.role === role)
    for (const days of [-1, 0, 1, 29, 30, 31, 60]) {
      const candidate = { ...account, status: "active", expiry: inDays(days), assignmentHold: false, eligibleForNewAssignment: true, cooldown: undefined }
      const fixture = { ...state, projects: [], accounts: [candidate] }
      assert.equal(eligible(fixture, candidate, role), days > 30, `${role}: ${days} days`)
    }
  }
})
