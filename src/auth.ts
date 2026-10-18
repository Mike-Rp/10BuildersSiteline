import { DUMMY_CREDENTIALS, DUMMY_USERNAMES } from "./dummy-data.ts"
import { licenseState, type Account, type State } from "./model.ts"
import { SIGN_IN_MESSAGES } from "./signInPolicy.ts"

// Local sign-in until a real authentication service exists. The role always
// comes from the matched account record; callers cannot choose it.
// Unknown email and wrong password share one message; the inactive message is
// only reachable after the password has been verified.
export const INVALID_CREDENTIALS = SIGN_IN_MESSAGES.mismatch
export const ACCOUNT_UNAVAILABLE = SIGN_IN_MESSAGES.inactive
export const LICENSE_EXPIRED =
  "Your professional license grace period has ended. Contact your Administrator."

export function authenticate(
  state: Pick<State, "accounts" | "rules">,
  email: string,
  password: string,
  credentials: Readonly<Record<string, string>> = DUMMY_CREDENTIALS,
  usernames: Readonly<
    Record<string, { accountId: string; password: string }>
  > = DUMMY_USERNAMES,
): Account {
  const normalized = email.trim().toLowerCase()
  const shortcut = Object.prototype.hasOwnProperty.call(usernames, normalized)
    ? usernames[normalized]
    : undefined
  if (shortcut) {
    const account = state.accounts.find((a) => a.id === shortcut.accountId)
    if (!account || shortcut.password !== password)
      throw new Error(INVALID_CREDENTIALS)
    return assertCanSignIn(state, account)
  }
  const account = state.accounts.find(
    (candidate) => candidate.email.trim().toLowerCase() === normalized,
  )
  const expected = account ? credentials[account.id] : undefined
  if (!normalized || !account || !expected || expected !== password)
    throw new Error(INVALID_CREDENTIALS)
  return assertCanSignIn(state, account)
}

// Re-checks a stored session (for example after a page reload).
export function sessionAccount(
  state: Pick<State, "accounts" | "rules">,
  accountId: string | null | undefined,
): Account | undefined {
  const account = state.accounts.find((candidate) => candidate.id === accountId)
  if (!account) return undefined
  try {
    return assertCanSignIn(state, account)
  } catch {
    return undefined
  }
}

export function assertCanSignIn(
  state: Pick<State, "rules">,
  account: Account,
): Account {
  if (account.status !== "active") throw new Error(ACCOUNT_UNAVAILABLE)
  if (licenseState(account, state.rules.grace) === "Grace expired")
    throw new Error(LICENSE_EXPIRED)
  return account
}
