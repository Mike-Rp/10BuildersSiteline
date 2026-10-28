const messages = [
  "Welcome back",
  "Good to see you",
  "Let’s get started",
  "Here’s to a productive day",
]
type Rotation = { remaining: number[]; last?: number }
type GreetingStore = Pick<Storage, "getItem" | "setItem">
export type LoginGreeting = { message: string }
const memory = new Map<string, Rotation>()

/** Choose all four greetings in shuffled order before starting another round. */
export function nextDashboardGreeting(accountId: string, name: string, options: {
  random?: () => number; storage?: GreetingStore
} = {}): LoginGreeting {
  const key = `siteline-dashboard-greetings:v2:${accountId}`
  const random = options.random || Math.random
  let storage = options.storage
  let rotation = memory.get(key)
  try {
    storage ||= localStorage
    const saved = JSON.parse(storage.getItem(key) || "null")
    if (saved && Array.isArray(saved.remaining) && saved.remaining.length <= messages.length &&
      saved.remaining.every((i: unknown) => Number.isInteger(i) && Number(i) >= 0 && Number(i) < messages.length) &&
      new Set(saved.remaining).size === saved.remaining.length &&
      Number.isInteger(saved.last) && saved.last >= 0 && saved.last < messages.length) rotation = saved
  } catch { /* Keep rotating in memory when browser storage is unavailable. */ }
  const remaining = [...(rotation?.remaining || [])]
  if (!remaining.length) {
    remaining.push(...messages.map((_, index) => index))
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
    }
    if (remaining[0] === rotation?.last) [remaining[0], remaining[1]] = [remaining[1], remaining[0]]
  }
  const index = remaining.shift()!
  rotation = { remaining, last: index }
  memory.set(key, rotation)
  try { storage?.setItem(key, JSON.stringify(rotation)) } catch { /* The in-memory rotation remains available. */ }
  const displayName = name.trim()
  return { message: `${messages[index]}${displayName ? `, ${displayName}` : ""}.` }
}

/** Keep the selected greeting through refreshes; only a new login rotates it. */
export function sessionDashboardGreeting(accountId: string, name: string, options: {
  fresh?: boolean; storage?: GreetingStore
} = {}): LoginGreeting {
  const key = `siteline-dashboard-session-greeting:${accountId}`
  let storage = options.storage
  try {
    storage ||= sessionStorage
    if (!options.fresh) {
      const message = storage.getItem(key)
      const displayName = name.trim()
      if (messages.some(prefix => message === `${prefix}${displayName ? `, ${displayName}` : ""}.`)) return { message: message! }
    }
  } catch { /* A greeting still appears when browser storage is unavailable. */ }
  const greeting = nextDashboardGreeting(accountId, name)
  try { storage?.setItem(key, greeting.message) } catch { /* Keep the greeting in React state. */ }
  return greeting
}
