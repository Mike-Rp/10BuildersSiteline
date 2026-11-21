import { validateSignInFields } from "./signInPolicy.ts"

export const CLIENT_ACCOUNT_PENDING = "CLIENT_ACTIVATION_REQUIRED"

const statusLabels = {
  pending_activation: "Pending Activation",
  active: "Active",
  verification_required: "Verification Required",
} as const
export type ClientActivationStatus = keyof typeof statusLabels
export function clientActivationStatus(value: unknown): ClientActivationStatus | undefined {
  if (value === "pending_activation" || value === "active" || value === "verification_required") return value
}
export const clientActivationLabel = (value: unknown) => {
  const status = clientActivationStatus(value)
  return status ? statusLabels[status] : "Status unavailable"
}

type ActivationFields = { email: string; code: string; password: string; confirmation: string }

export function activationErrors({ email, code, password, confirmation }: ActivationFields) {
  return {
    email: validateSignInFields(email, password).email,
    code: code.trim() ? undefined : "Enter your one-time activation code.",
    password: !password ? "Enter a new SiteLine password." :
      password.length < 8 || new TextEncoder().encode(password).length > 72
        ? "Use at least 8 characters and no more than 72 UTF-8 bytes." : undefined,
    confirmation: !confirmation ? "Confirm your SiteLine password." :
      password !== confirmation ? "The passwords do not match." : undefined,
  }
}
