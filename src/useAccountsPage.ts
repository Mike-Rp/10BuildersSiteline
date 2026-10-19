import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError, apiEnvelope } from "./api/client.ts"
import type { ListStatus } from "./ListControls"
import { createLatestGuard, parseAccountsPage } from "./listSource.ts"

/**
 * Loads one page of /accounts for the Engineer Directory. Requests for the same
 * query string are not repeated, a newer request cancels and supersedes an older
 * one (so a slow old response can never overwrite a newer page), and a page past
 * the end is clamped to the last real page.
 */
export function useAccountsPage({
  queryString,
  enabled,
  refreshKey,
  onClamp,
}: {
  queryString: string | undefined
  enabled: boolean
  // Changes when the accounts themselves changed (for example a status change).
  refreshKey: unknown
  onClamp: (lastPage: number) => void
}) {
  const guard = useRef(createLatestGuard())
  const [ids, setIds] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<ListStatus["state"]>("ready")
  // The query string the shown rows belong to (so another query never shows old rows as current).
  const [loadedFor, setLoadedFor] = useState<string>()
  const [message, setMessage] = useState("")
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!enabled || queryString === undefined) return
    const ticket = guard.current.begin()
    const controller = new AbortController()
    setStatus("loading")
    apiEnvelope(`/accounts?${queryString}`, { signal: controller.signal })
      .then((body) => {
        if (!guard.current.isCurrent(ticket)) return
        const page = parseAccountsPage(body)
        const requested = Number(new URLSearchParams(queryString).get("page")) || 1
        if (page.total > 0 && requested > page.pageCount) {
          // The list got shorter (filter or status change): go to the last real page.
          onClamp(page.pageCount)
          return
        }
        setIds(page.ids)
        setTotal(page.total)
        setLoadedFor(queryString)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (!guard.current.isCurrent(ticket)) return
        if (error instanceof DOMException && error.name === "AbortError") return
        setMessage(
          error instanceof ApiError
            ? error.message
            : "The directory could not be loaded.",
        )
        setStatus("error")
      })
    return () => {
      // A cancelled request must never report an error or update the screen.
      controller.abort()
      guard.current.begin()
    }
    // onClamp is stable enough for this list; the query string identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, enabled, refreshKey, attempt])

  const pending =
    enabled && queryString !== undefined && loadedFor !== queryString && status !== "error"
  return { ids, total, status: pending ? ("loading" as const) : status, message, retry }
}
