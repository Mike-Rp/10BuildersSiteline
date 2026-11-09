// How often open screens re-read data from the database. Every read is Supabase egress, so the default is slow
// and an Administrator can shorten it for a short period, such as a live demonstration.
// Pure module: no React or DOM imports, so it can be tested directly.

export const DEFAULT_REFRESH_SECONDS = 300
export const MIN_REFRESH_SECONDS = 15
export const MAX_REFRESH_SECONDS = 3600

export const REFRESH_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 15, label: "15 seconds (live demonstration)" },
  { seconds: 60, label: "1 minute" },
  { seconds: 120, label: "2 minutes" },
  { seconds: 300, label: "5 minutes (recommended)" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
]

/** A usable interval in whole seconds. Anything missing, invalid or out of range falls back safely. */
export function clampRefreshSeconds(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_REFRESH_SECONDS
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return DEFAULT_REFRESH_SECONDS
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(seconds)))
}

export function isValidRefreshSeconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_REFRESH_SECONDS && (value as number) <= MAX_REFRESH_SECONDS
}

let seconds = DEFAULT_REFRESH_SECONDS
/** Called whenever workspace rules load, so every timer follows the Administrator's current setting. */
export function applyRefreshSetting(rules?: { refreshSeconds?: number } | null) {
  seconds = clampRefreshSeconds(rules?.refreshSeconds)
}
export const refreshSeconds = () => seconds
export const refreshMs = () => seconds * 1000

const pageVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden"

/**
 * Runs `task` repeatedly, waiting the current interval after each run finishes. The interval is read again before
 * every wait, so a changed setting applies from the next cycle. Nothing runs while the page is hidden.
 * Returns a function that stops it.
 */
export function startPolling(task: () => unknown, isVisible: () => boolean = pageVisible): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    if (stopped) return
    if (isVisible()) {
      try { await task() } catch { /* a failed read is retried on the next cycle */ }
    }
    if (!stopped) timer = setTimeout(tick, refreshMs())
  }
  timer = setTimeout(tick, refreshMs())
  return () => { stopped = true; if (timer) clearTimeout(timer) }
}

/** True when the last successful read is at least one full interval old, e.g. when returning to a stale tab. */
export function isStale(lastReadAt: number, now = Date.now()) {
  return now - lastReadAt >= refreshMs()
}
