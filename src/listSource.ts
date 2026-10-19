// Server-side paging for lists whose backend endpoint already filters and counts.
// Pure (no React/DOM) so request building, response parsing and the stale-response
// guard can be tested. The first user is the Admin Engineer Directory (/accounts).
import { filterIsOn, type ListQuery } from "./listing.ts"

// Backend role ids (roles table): admin 1, opm 2, spm 3, client 4. Engineers are everyone but clients.
const ENGINEER_ROLE_IDS = { admin: 1, opm: 2, spm: 3 } as const
const SERVER_STATUSES = ["active", "invited", "suspended"]

/**
 * The /accounts query string for an Engineer Directory query, or undefined when the
 * query uses something the server cannot filter (a license status, or the app-level
 * "deactivated" status). In that case the list is filtered in the browser instead.
 */
export function engineerQueryString(query: ListQuery): string | undefined {
  const { search, filters, page, pageSize } = query
  if (filterIsOn(filters.license)) return undefined
  const status = filterIsOn(filters.status) ? filters.status : undefined
  if (status && !SERVER_STATUSES.includes(status)) return undefined
  const role = filterIsOn(filters.role) ? filters.role : undefined
  const params = new URLSearchParams()
  params.set("page", String(page))
  params.set("pageSize", String(pageSize))
  if (role) {
    if (!(role in ENGINEER_ROLE_IDS)) return undefined
    params.set("role_ids", String(ENGINEER_ROLE_IDS[role as keyof typeof ENGINEER_ROLE_IDS]))
  } else {
    params.set("role_ids", Object.values(ENGINEER_ROLE_IDS).join(","))
  }
  if (status) params.set("status", status)
  if (search.trim()) params.set("q", search.trim())
  // The backend orders by name then id, so rows never repeat or skip between pages.
  params.set("sortBy", "name")
  return params.toString()
}

export type RemotePage = {
  ids: string[]
  total: number
  page: number
  pageCount: number
}

export function parseAccountsPage(body: unknown): RemotePage {
  const json = body as {
    data?: { id?: unknown }[]
    count?: unknown
    pagination?: { total?: unknown; page?: unknown; total_pages?: unknown }
  }
  const rows = Array.isArray(json?.data) ? json.data : []
  const total = Number(json?.pagination?.total ?? json?.count ?? rows.length)
  return {
    ids: rows.map((row) => String(row.id)),
    total: Number.isFinite(total) ? total : rows.length,
    page: Number(json?.pagination?.page ?? 1) || 1,
    pageCount: Math.max(1, Number(json?.pagination?.total_pages ?? 1) || 1),
  }
}

/** Only the most recent request may update the screen; older responses are ignored. */
export function createLatestGuard() {
  let latest = 0
  return {
    begin: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
  }
}
