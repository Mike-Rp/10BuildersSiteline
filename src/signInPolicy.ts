// Sign-in messages, field validation and the temporary local lockout.
// Pure (no React/DOM) so it can be tested. The lockout is browser-local until a real backend exists.
export const SIGN_IN_MESSAGES = {
  emailRequired: "Enter your email.",
  emailInvalid: "Enter a valid email, like name@company.com.",
  passwordRequired: "Enter your password.",
  capsLock: "Caps Lock is on.",
  // Same text for an unknown email and a wrong password: never reveal whether an email exists.
  mismatch: "That email and password don't match. Check both and try again.",
  // Only shown after the password has been verified.
  inactive: "This account is inactive. Contact your administrator.",
}

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MS = 5 * 60 * 1000

export const lockedMessage = (minutes: number) =>
  `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Built-in demo usernames (for example "Admin") have no "@".
const USERNAME = /^[A-Za-z0-9._-]+$/

export function validateSignInFields(email: string, password: string) {
  const errors: { email?: string; password?: string } = {}
  const value = email.trim()
  if (!value) errors.email = SIGN_IN_MESSAGES.emailRequired
  else if (value.includes("@") ? !EMAIL.test(value) : !USERNAME.test(value))
    errors.email = SIGN_IN_MESSAGES.emailInvalid
  if (!password) errors.password = SIGN_IN_MESSAGES.passwordRequired
  return errors
}

export const isCredentialMismatch = (message: string) =>
  message === SIGN_IN_MESSAGES.mismatch

type Attempts = Record<string, { count: number; lockedUntil?: number }>
export type AttemptStore = { read(): Attempts; write(value: Attempts): void }

const key = (email: string) => email.trim().toLowerCase()

/** The lockout message while this email is blocked, otherwise undefined. */
export function checkLockout(
  store: AttemptStore,
  email: string,
  now = Date.now(),
) {
  const all = store.read()
  const entry = all[key(email)]
  if (!entry?.lockedUntil) return undefined
  if (entry.lockedUntil <= now) {
    delete all[key(email)]
    store.write(all)
    return undefined
  }
  return lockedMessage(Math.ceil((entry.lockedUntil - now) / 60_000))
}

/** Counts a credential mismatch. The 5th failure starts the lockout. */
export function recordFailedAttempt(
  store: AttemptStore,
  email: string,
  now = Date.now(),
) {
  const all = store.read()
  const entry = all[key(email)] || { count: 0 }
  entry.count += 1
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.count = 0
    entry.lockedUntil = now + LOCKOUT_MS
  }
  all[key(email)] = entry
  store.write(all)
}

export function clearAttempts(store: AttemptStore, email: string) {
  const all = store.read()
  if (all[key(email)]) {
    delete all[key(email)]
    store.write(all)
  }
}

/**
 * Runs a sign-in attempt behind the lockout: refuses while locked (even with the
 * right password), counts credential mismatches, and resets the count on success.
 * Inactive-account errors are not counted because they only appear after the
 * password was verified.
 */
export async function guardedSignIn<T>(
  store: AttemptStore,
  email: string,
  attempt: () => T | Promise<T>,
  now = Date.now(),
): Promise<T> {
  const locked = checkLockout(store, email, now)
  if (locked) throw new Error(locked)
  try {
    const result = await attempt()
    clearAttempts(store, email)
    return result
  } catch (error) {
    if (error instanceof Error && isCredentialMismatch(error.message))
      recordFailedAttempt(store, email, now)
    throw error
  }
}

const STORAGE_KEY = "siteline-signin-attempts"
/** Browser-local store (falls back to memory when storage is blocked). */
export function localAttemptStore(): AttemptStore {
  let memory: Attempts = {}
  return {
    read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? (JSON.parse(raw) as Attempts) : {}
      } catch {
        return memory
      }
    },
    write(value) {
      memory = value
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* kept in memory for this tab */
      }
    },
  }
}
