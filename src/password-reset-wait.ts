// How long a password reset request has been waiting, and how urgent that is.
export const AMBER_AFTER_HOURS = 4
export const RED_AFTER_HOURS = 24
export type WaitLevel = "normal" | "amber" | "red"

export function waitHours(requestedAt: string, now = Date.now()) {
  return Math.max(0, (now - Date.parse(requestedAt)) / 3600000)
}

export function waitLevel(requestedAt: string, now = Date.now()): WaitLevel {
  const hours = waitHours(requestedAt, now)
  return hours >= RED_AFTER_HOURS ? "red" : hours >= AMBER_AFTER_HOURS ? "amber" : "normal"
}

export function waitLabel(requestedAt: string, now = Date.now()) {
  const hours = Math.floor(waitHours(requestedAt, now))
  if (hours < 1) return "Waiting less than an hour"
  if (hours < 48) return `Waiting ${hours} ${hours === 1 ? "hour" : "hours"}`
  return `Waiting ${Math.floor(hours / 24)} days`
}

export const overdueCount = (requests: { status?: string; requested_at: string }[], now = Date.now()) =>
  requests.filter(r => r.status !== "completed" && waitLevel(r.requested_at, now) !== "normal").length
