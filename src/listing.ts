// Filtering + pagination for list views. Pure (no React/DOM) so it can be tested.
// Callers pass items that are ALREADY limited to what the signed-in role may see:
// filtering and paging only change which of those records are shown.
export const PAGE_SIZES = [10, 25, 50] as const
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0]

export type ListQuery = {
  search: string
  // Filter id -> selected value. "" or "all" means the filter is off.
  filters: Record<string, string>
  page: number
  pageSize: number
}

export type FilterDef<T> = {
  id: string
  label: string
  kind?: "select" | "date"
  // Only for kind "select". The "off" choice reads allLabel (default "All").
  options?: { value: string; label: string }[]
  allLabel?: string
  // Receives the selected value (never "" / "all").
  test: (item: T, value: string) => boolean
}

export type ListConfig<T> = {
  // Main text of an item that the search box matches against.
  searchText: (item: T) => string
  filters?: FilterDef<T>[]
}

export type PageSlice<T> = {
  items: T[]
  page: number
  pageCount: number
  pageSize: number
  total: number
  // 1-based, inclusive; both 0 when there are no items.
  from: number
  to: number
}

export const defaultListQuery = (): ListQuery => ({
  search: "",
  filters: {},
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
})

export const normalizeSearch = (value: string) => value.trim().toLowerCase()
export const matchesSearch = (text: string, search: string) => {
  const term = normalizeSearch(search)
  return !term || text.toLowerCase().includes(term)
}
export const filterIsOn = (value: string | undefined) =>
  !!value && value !== "all"

export function filterItems<T>(
  items: T[],
  query: Pick<ListQuery, "search" | "filters">,
  config: ListConfig<T>,
): T[] {
  const active = (config.filters || []).filter((def) =>
    filterIsOn(query.filters[def.id]),
  )
  return items.filter(
    (item) =>
      matchesSearch(config.searchText(item), query.search) &&
      active.every((def) => def.test(item, query.filters[def.id])),
  )
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): PageSlice<T> {
  const total = items.length
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(total / size))
  // An out-of-range page (for example after deleting or filtering) is clamped, never empty.
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return {
    items: slice,
    page: current,
    pageCount,
    pageSize: size,
    total,
    from: slice.length ? start + 1 : 0,
    to: slice.length ? start + slice.length : 0,
  }
}

/** Filter first, then paginate. */
export function applyList<T>(
  items: T[],
  query: ListQuery,
  config: ListConfig<T>,
) {
  const matched = filterItems(items, query, config)
  return { matched, view: paginate(matched, query.page, query.pageSize) }
}

// Changing the search, a filter or the page size always returns to page 1.
export const withSearch = (query: ListQuery, search: string): ListQuery => ({
  ...query,
  search,
  page: 1,
})
export const withFilter = (
  query: ListQuery,
  id: string,
  value: string,
): ListQuery => {
  const filters = { ...query.filters }
  if (filterIsOn(value)) filters[id] = value
  else delete filters[id]
  return { ...query, filters, page: 1 }
}
export const withPage = (query: ListQuery, page: number): ListQuery => ({
  ...query,
  page: Math.max(1, Math.floor(page) || 1),
})
export const withPageSize = (query: ListQuery, pageSize: number): ListQuery => ({
  ...query,
  pageSize,
  page: 1,
})
export const clearFilters = (query: ListQuery): ListQuery => ({
  ...query,
  search: "",
  filters: {},
  page: 1,
})
export const hasActiveFilters = (query: ListQuery) =>
  !!normalizeSearch(query.search) ||
  Object.values(query.filters).some(filterIsOn)

/** Removable chips for whatever is currently narrowing the list. */
export function activeChips<T>(query: ListQuery, config: ListConfig<T>) {
  const chips: { id: string; label: string }[] = []
  if (normalizeSearch(query.search))
    chips.push({ id: "search", label: `Search: ${query.search.trim()}` })
  for (const def of config.filters || []) {
    const value = query.filters[def.id]
    if (!filterIsOn(value)) continue
    const text =
      def.options?.find((option) => option.value === value)?.label || value
    chips.push({ id: def.id, label: `${def.label}: ${text}` })
  }
  return chips
}

/** Page numbers to show: always first/last, a window around the current page, gaps as null. */
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  // Few pages: show them all, so no page is ever hidden behind a gap.
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const wanted = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...wanted]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(null)
    out.push(n)
  })
  return out
}

/** Date-only strings (YYYY-MM-DD) in a from/to range, both ends inclusive. Empty bounds are open. */
export function inDateRange(
  value: string | undefined,
  from?: string,
  to?: string,
) {
  if (!from && !to) return true
  if (!value) return false
  const day = value.slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

/** "1 company" / "2 companies" / "3 people": the label for a result count. */
export function countLabel(count: number, noun: string) {
  if (count === 1) return `1 ${noun}`
  const plural = /person$/i.test(noun)
    ? noun.replace(/person$/i, "people")
    : /[^aeiou]y$/i.test(noun)
      ? `${noun.slice(0, -1)}ies`
      : /(s|x|ch|sh)$/i.test(noun)
        ? `${noun}es`
        : `${noun}s`
  return `${count} ${plural}`
}

/** Sorted, de-duplicated select options from the values present in a list. */
export const optionsFrom = (values: string[]) =>
  [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }))
