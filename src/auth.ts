import { type Account, type State } from "./model.ts"
import { SIGN_IN_MESSAGES } from "./signInPolicy.ts"

export const INVALID_CREDENTIALS = SIGN_IN_MESSAGES.mismatch
export const ACCOUNT_UNAVAILABLE = SIGN_IN_MESSAGES.inactive
// An expired license never blocks sign-in: the engineer must still be able to view their projects and upload a
// renewed license. The backend pauses signing, submitting and approving instead (see license-gate.utility.js).

export function assertCanSignIn(
  _state: Pick<State, "rules">,
  account: Account,
): Account {
  if (account.status !== "active") throw new Error(ACCOUNT_UNAVAILABLE)
  return account
}
