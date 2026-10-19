import { licenseState, type Account, type State } from "./model.ts"
import { SIGN_IN_MESSAGES } from "./signInPolicy.ts"

export const INVALID_CREDENTIALS = SIGN_IN_MESSAGES.mismatch
export const ACCOUNT_UNAVAILABLE = SIGN_IN_MESSAGES.inactive
export const LICENSE_EXPIRED =
  "Your professional license grace period has ended. Contact your Administrator."

export function assertCanSignIn(
  state: Pick<State, "rules">,
  account: Account,
): Account {
  if (account.status !== "active") throw new Error(ACCOUNT_UNAVAILABLE)
  if (licenseState(account, state.rules.grace) === "Grace expired")
    throw new Error(LICENSE_EXPIRED)
  return account
}
