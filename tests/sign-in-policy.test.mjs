import assert from "node:assert/strict"
import test from "node:test"
import { authenticate } from "./fixtures/local-auth.ts"
import { DUMMY_CREDENTIALS } from "./fixtures/dummy-data.ts"
import { initialState } from "./fixtures/demo-state.ts"
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  SIGN_IN_MESSAGES,
  checkLockout,
  clearAttempts,
  guardedSignIn,
  lockedMessage,
  recordFailedAttempt,
  validateSignInFields,
} from "../src/signInPolicy.ts"

const memoryStore = () => {
  let data = {}
  return { read: () => data, write: (v) => (data = v) }
}
const withAccount = (state, id, change) => ({
  ...state,
  accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...change } : a)),
})
const T0 = Date.parse("2026-10-19T08:00:00Z")

test("empty fields get specific messages", () => {
  assert.deepEqual(validateSignInFields("", ""), {
    email: "Enter your email.",
    password: "Enter your password.",
  })
  assert.deepEqual(validateSignInFields("   ", "secret"), {
    email: "Enter your email.",
  })
  assert.deepEqual(validateSignInFields("a@b.com", ""), {
    password: "Enter your password.",
  })
})

test("only well formed emails pass: sign-in is by email, so usernames are rejected", () => {
  for (const bad of ["name@", "@company.com", "name@company", "a b@c.com", "john smith", "Admin", "SPM", "karlo.espiritu"])
    assert.equal(
      validateSignInFields(bad, "x").email,
      "Enter a valid email, like name@company.com.",
      bad,
    )
  for (const ok of ["name@company.com", "  Karlo.Espiritu@10builders.com "])
    assert.equal(validateSignInFields(ok, "x").email, undefined, ok)
})

test("unknown email and wrong password show the same message, so emails cannot be enumerated", () => {
  const state = initialState()
  const known = state.accounts.find((a) => a.id === "a1").email
  const messageOf = (email, password) => {
    try {
      authenticate(state, email, password)
    } catch (error) {
      return error.message
    }
  }
  const wrongPassword = messageOf(known, "wrong-password")
  const unknownEmail = messageOf("nobody@10builders.com", "wrong-password")
  assert.equal(wrongPassword, SIGN_IN_MESSAGES.mismatch)
  assert.equal(unknownEmail, SIGN_IN_MESSAGES.mismatch)
  assert.equal(
    SIGN_IN_MESSAGES.mismatch,
    "That email and password don't match. Check both and try again.",
  )
})

test("an inactive account is revealed only after the correct password", () => {
  for (const status of ["deactivated", "suspended", "invited", "pending-setup"]) {
    const state = withAccount(initialState(), "a4", { status })
    const email = state.accounts.find((a) => a.id === "a4").email
    assert.throws(() => authenticate(state, email, DUMMY_CREDENTIALS.a4), {
      message: "This account is inactive. Contact your administrator.",
    })
    // A stranger with a wrong password learns nothing about the account's status.
    assert.throws(() => authenticate(state, email, "wrong-password"), {
      message: SIGN_IN_MESSAGES.mismatch,
    })
  }
})

test("5 failed attempts lock the email for 5 minutes", () => {
  const store = memoryStore()
  for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
    recordFailedAttempt(store, "karlo@10builders.com", T0)
    assert.equal(checkLockout(store, "karlo@10builders.com", T0), undefined)
  }
  recordFailedAttempt(store, "karlo@10builders.com", T0)
  assert.equal(
    checkLockout(store, "karlo@10builders.com", T0),
    "Too many attempts. Try again in 5 minutes.",
  )
  assert.equal(lockedMessage(5), "Too many attempts. Try again in 5 minutes.")
  assert.equal(
    checkLockout(store, "karlo@10builders.com", T0 + 2 * 60_000),
    "Too many attempts. Try again in 3 minutes.",
  )
  assert.equal(checkLockout(store, "karlo@10builders.com", T0 + LOCKOUT_MS), undefined)
  // After the lock expires the count starts again.
  recordFailedAttempt(store, "karlo@10builders.com", T0 + LOCKOUT_MS)
  assert.equal(checkLockout(store, "karlo@10builders.com", T0 + LOCKOUT_MS), undefined)
})

test("lockout is per email (case-insensitive) and cleared by a success", () => {
  const store = memoryStore()
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++)
    recordFailedAttempt(store, "A@B.com", T0)
  assert.ok(checkLockout(store, " a@b.com ", T0))
  assert.equal(checkLockout(store, "other@b.com", T0), undefined)
  clearAttempts(store, "a@b.com")
  assert.equal(checkLockout(store, "a@b.com", T0), undefined)
})

test("guarded sign-in locks after 5 mismatches, even for the correct password, and resets on success", async () => {
  const state = initialState()
  const email = state.accounts.find((a) => a.id === "a1").email
  const store = memoryStore()
  const attempt = (password) => () => authenticate(state, email, password)
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++)
    await assert.rejects(
      guardedSignIn(store, email, attempt("wrong"), T0),
      { message: SIGN_IN_MESSAGES.mismatch },
    )
  await assert.rejects(
    guardedSignIn(store, email, attempt(DUMMY_CREDENTIALS.a1), T0 + 1000),
    { message: "Too many attempts. Try again in 5 minutes." },
  )
  // Lock over: the correct password works again and clears the counter.
  const account = await guardedSignIn(
    store,
    email,
    attempt(DUMMY_CREDENTIALS.a1),
    T0 + LOCKOUT_MS,
  )
  assert.equal(account.id, "a1")
  for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++)
    await assert.rejects(guardedSignIn(store, email, attempt("wrong"), T0 + LOCKOUT_MS))
  assert.equal(checkLockout(store, email, T0 + LOCKOUT_MS), undefined)
})

test("a device choice does not count as an incorrect password", async () => {
  const store = memoryStore()
  for (let i = 0; i < MAX_FAILED_ATTEMPTS + 2; i++) {
    await assert.rejects(guardedSignIn(store, "office@example.test", () => {
      throw new Error("Your account is already logged in on another device.")
    }, T0), /another device/)
  }
  assert.equal(checkLockout(store, "office@example.test", T0), undefined)
})

test("inactive-account errors do not count towards the lockout", async () => {
  const state = withAccount(initialState(), "a4", { status: "suspended" })
  const email = state.accounts.find((a) => a.id === "a4").email
  const store = memoryStore()
  for (let i = 0; i < MAX_FAILED_ATTEMPTS + 2; i++)
    await assert.rejects(
      guardedSignIn(store, email, () => authenticate(state, email, DUMMY_CREDENTIALS.a4), T0),
      { message: SIGN_IN_MESSAGES.inactive },
    )
  assert.equal(checkLockout(store, email, T0), undefined)
})
