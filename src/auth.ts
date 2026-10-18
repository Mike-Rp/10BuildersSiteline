import { licenseState, type Account, type State } from "./model.ts"

export const INVALID_CREDENTIALS =
  "The email or password you entered is incorrect."
export const ACCOUNT_UNAVAILABLE =
  "This account is not active. Contact your Administrator."
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
