type Result = { title: string; message: string; error: boolean }
type Feedback = { uploads: number; result?: Result }
let state: Feedback = { uploads: 0 }
const listeners = new Set<() => void>()
const publish = (next: Feedback) => { state = next; listeners.forEach(listener => listener()) }
export const feedbackSnapshot = () => state
export const subscribeFeedback = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function showActionResult(message: string, error = false, title = error ? "Action needs attention" : "Request completed") {
  // Completed actions update the workspace without interrupting it with a popup.
  if (message && error) publish({ ...state, result: { title, message, error } })
}
export function dismissActionResult() { publish({ ...state, result: undefined }) }
export function beginFileUpload() {
  publish({ ...state, uploads: state.uploads + 1, result: undefined })
  let finished = false
  return () => {
    if (finished) return
    finished = true
    publish({ ...state, uploads: Math.max(0, state.uploads - 1) })
  }
}
export function isInteractiveWrite(path: string, method = "GET") {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) &&
    !/^\/auth(?:\/|$)/.test(path) &&
    !/notification|preferences|reconcile-phase-handoffs|readiness/.test(path)
}
