import assert from "node:assert/strict"
import test from "node:test"
import {
  ACCOUNT_UNAVAILABLE,
  INVALID_CREDENTIALS,
  LICENSE_EXPIRED,
  authenticate,
  sessionAccount,
} from "../src/auth.ts"
import { DUMMY_CREDENTIALS, DUMMY_USERNAMES } from "../src/dummy-data.ts"
import { initialState } from "../src/model.ts"

const withAccount = (state, id, change) => ({
  ...state,
  accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...change } : a)),
})
const emailOf = (state, id) => state.accounts.find((a) => a.id === id).email

test("every seeded account has dummy credentials and active ones sign in with their own role", () => {
  const state = initialState()
  for (const account of state.accounts) {
    assert.ok(DUMMY_CREDENTIALS[account.id], `${account.id} has a password`)
    if (account.status !== "active") {
      assert.throws(
        () =>
          authenticate(state, account.email, DUMMY_CREDENTIALS[account.id]),
        { message: ACCOUNT_UNAVAILABLE },
      )
      continue
    }
    const signedIn = authenticate(
      state,
      account.email,
      DUMMY_CREDENTIALS[account.id],
    )
    assert.equal(signedIn.id, account.id)
    assert.equal(signedIn.role, account.role)
  }
})

test("sign-in email ignores case and surrounding spaces", () => {
  const state = initialState()
  const email = `  ${emailOf(state, "a2").toUpperCase()} `
  assert.equal(authenticate(state, email, DUMMY_CREDENTIALS.a2).id, "a2")
})

test("wrong password, unknown email and another account's password are rejected the same way", () => {
  const state = initialState()
  const email = emailOf(state, "a1")
  assert.throws(() => authenticate(state, email, "wrong-password"), {
    message: INVALID_CREDENTIALS,
  })
  assert.throws(() => authenticate(state, email, DUMMY_CREDENTIALS.a2), {
    message: INVALID_CREDENTIALS,
  })
  assert.throws(
    () => authenticate(state, "nobody@10builders.com", DUMMY_CREDENTIALS.a1),
    { message: INVALID_CREDENTIALS },
  )
  assert.throws(() => authenticate(state, "", ""), {
    message: INVALID_CREDENTIALS,
  })
})

test("deactivated, suspended and invited accounts cannot sign in", () => {
  for (const status of ["deactivated", "suspended", "invited", "pending-setup"]) {
    const state = withAccount(initialState(), "a4", { status })
    assert.throws(
      () => authenticate(state, emailOf(state, "a4"), DUMMY_CREDENTIALS.a4),
      { message: ACCOUNT_UNAVAILABLE },
      status,
    )
  }
})

test("engineers past the license grace period cannot sign in", () => {
  const state = withAccount(initialState(), "a5", { expiry: "2020-01-01" })
  assert.throws(
    () => authenticate(state, emailOf(state, "a5"), DUMMY_CREDENTIALS.a5),
    { message: LICENSE_EXPIRED },
  )
})

test("a stored session is restored only for an account that may still sign in", () => {
  const state = initialState()
  assert.equal(sessionAccount(state, "a9")?.id, "a9")
  assert.equal(sessionAccount(state, null), undefined)
  assert.equal(sessionAccount(state, "missing"), undefined)
  const deactivated = withAccount(state, "a9", { status: "deactivated" })
  assert.equal(sessionAccount(deactivated, "a9"), undefined)
})

test("built-in usernames sign in as one account per role, case-insensitively", () => {
  const state = initialState()
  const expected = { Admin: "admin", OPM: "opm", SPM: "spm", CLNT: "client" }
  for (const [username, role] of Object.entries(expected)) {
    for (const typed of [username, username.toLowerCase(), ` ${username} `]) {
      const account = authenticate(state, typed, DUMMY_USERNAMES[username.toLowerCase()].password)
      assert.equal(account.role, role, typed)
      assert.equal(account.id, DUMMY_USERNAMES[username.toLowerCase()].accountId)
    }
  }
})

test("built-in usernames reject wrong passwords and inactive accounts", () => {
  const state = initialState()
  assert.throws(() => authenticate(state, "Admin", "password"), {
    message: INVALID_CREDENTIALS,
  })
  assert.throws(() => authenticate(state, "Admin", DUMMY_CREDENTIALS.a1), {
    message: INVALID_CREDENTIALS,
  })
  assert.throws(() => authenticate(state, "toString", "Password"), {
    message: INVALID_CREDENTIALS,
  })
  const deactivated = withAccount(state, DUMMY_USERNAMES.spm.accountId, {
    status: "deactivated",
  })
  assert.throws(() => authenticate(deactivated, "SPM", "Password"), {
    message: ACCOUNT_UNAVAILABLE,
  })
})
