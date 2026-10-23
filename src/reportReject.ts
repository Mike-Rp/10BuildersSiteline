// Rejecting an ordinary progress report: reason rules, outcome handling and the duplicate-click guard.
// A report decision is separate from checklist evidence approval and rework decisions: it never awards or
// deducts checklist credit and never advances a phase. Pure (no React/DOM) so it can be tested.

export const REJECT_REASON_REQUIRED = "Enter the reason for rejecting this report. The Site PM will see it."

export function validateRejectReason(text: string) {
  const reason = text.trim()
  return reason ? ({ ok: true, reason } as const) : ({ ok: false, error: REJECT_REASON_REQUIRED } as const)
}

/** The server says the report was already approved, rejected or changed by someone else. */
export const isAlreadyResolved = (message: string) =>
  /already|no pending|no longer|not found|changed|resolved|refresh/i.test(message)

export type RejectOutcome =
  | { status: "done" }
  | { status: "invalid"; message: string }
  | { status: "stale"; message: string }
  | { status: "error"; message: string }

type Run = (reason: string) => Promise<{ ok: boolean; error?: string }>

/**
 * Returns the function the dialog calls on "Reject report". While a request is in flight further calls return
 * the same promise, so a double click sends one request.
 */
export function createReportRejecter(run: Run) {
  let pending: Promise<RejectOutcome> | undefined
  return (text: string): Promise<RejectOutcome> => {
    if (pending) return pending
    const check = validateRejectReason(text)
    if (!check.ok) return Promise.resolve({ status: "invalid", message: check.error })
    pending = run(check.reason)
      .then((result): RejectOutcome => {
        if (result.ok) return { status: "done" }
        const message = result.error || "The report could not be rejected. Try again."
        return isAlreadyResolved(message)
          ? { status: "stale", message: "This report was already resolved or changed. The queue has been refreshed." }
          : { status: "error", message }
      })
      .catch((error): RejectOutcome => ({ status: "error", message: error instanceof Error ? error.message : "The report could not be rejected. Try again." }))
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}
