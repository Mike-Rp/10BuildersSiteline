export class RequestTimeoutError extends Error {
  constructor() {
    super("The server is taking too long to respond. Please try again.")
    this.name = "RequestTimeoutError"
  }
}

// The race bounds response-body reads as well as the initial fetch. Aborting
// also stops the underlying network request; callers may supply cancellation.
export async function withRequestDeadline<T>(
  perform: (signal: AbortSignal) => Promise<T>,
  { signal, timeoutMs = 30_000 }: { signal?: AbortSignal | null; timeoutMs?: number } = {},
): Promise<T> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  let timedOut = false
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => rejectAbort(timedOut ? new RequestTimeoutError() : controller.signal.reason)
  controller.signal.addEventListener("abort", onAbort, { once: true })
  signal?.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  if (typeof timer !== "number") timer.unref?.()
  try {
    return await Promise.race([perform(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", cancel)
    controller.signal.removeEventListener("abort", onAbort)
  }
}
