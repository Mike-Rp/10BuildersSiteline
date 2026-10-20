import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { Button, Empty, Icon } from "./ui"
import { SkeletonRows } from "./LoadingSkeleton"
import {
  PAGE_SIZES,
  activeChips,
  applyList,
  clearFilters,
  countLabel,
  defaultListQuery,
  hasActiveFilters,
  pageNumbers,
  paginateRemote,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  type ListConfig,
  type ListQuery,
  type PageSlice,
} from "./listing"

// Per-list search, filters, page and page size are remembered for the browser
// session (until reload or sign-out). Lists call runList() during render, so
// the host component calls useListMemory() once to re-render when they change.
const store = new Map<string, ListQuery>()
const listeners = new Set<() => void>()
let version = 0
const DEFAULT = defaultListQuery()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const notify = () => {
  version += 1
  listeners.forEach((listener) => listener())
}

export function useListMemory() {
  useSyncExternalStore(subscribe, () => version)
}
// A list may start with a different page size (dashboard widgets use 5).
export const getListQuery = (key: string, pageSize?: number): ListQuery =>
  store.get(key) ??
  (pageSize && pageSize !== DEFAULT.pageSize ? { ...DEFAULT, pageSize } : DEFAULT)
export function updateListQuery(
  key: string,
  change: (query: ListQuery) => ListQuery,
  pageSize?: number,
) {
  store.set(key, change(getListQuery(key, pageSize)))
  notify()
}
export function resetListMemory() {
  store.clear()
  notify()
}

export type ListStatus = {
  state: "ready" | "loading" | "error"
  message?: string
  onRetry?: () => void
}
export type ListView<T> = {
  key: string
  config: ListConfig<T>
  query: ListQuery
  // Everything that matches (client-side lists). For server-side lists this is just the current page.
  matched: T[]
  view: PageSlice<T>
  // Number of matching records overall (the filtered total).
  count: number
  narrowed: boolean
  status: ListStatus
  pageSize?: number
  // Page sizes offered by the pager (default 10 / 25 / 50; the project explorer uses 6 / 12 / 24).
  pageSizes?: readonly number[]
}
const READY: ListStatus = { state: "ready" }

/** Filters the (already role-scoped) items, then paginates them. */
export function runList<T>(
  key: string,
  items: T[],
  config: ListConfig<T>,
  options: { pageSize?: number; pageSizes?: readonly number[] } = {},
): ListView<T> {
  const query = getListQuery(key, options.pageSize)
  const { matched, view } = applyList(items, query, config)
  return {
    key,
    config,
    query,
    matched,
    view,
    count: matched.length,
    narrowed: hasActiveFilters(query),
    status: READY,
    pageSize: options.pageSize,
    pageSizes: options.pageSizes,
  }
}

/** A list whose current page (and the filtered total) came from the server. */
export function remoteList<T>(
  key: string,
  config: ListConfig<T>,
  pageItems: T[],
  total: number,
  status: ListStatus,
  options: { pageSize?: number } = {},
): ListView<T> {
  const query = getListQuery(key, options.pageSize)
  return {
    key,
    config,
    query,
    matched: pageItems,
    view: paginateRemote(pageItems, total, query.page, query.pageSize),
    count: total,
    narrowed: hasActiveFilters(query),
    status,
    pageSize: options.pageSize,
  }
}

const update = <T,>(
  list: ListView<T>,
  change: (query: ListQuery) => ListQuery,
) => updateListQuery(list.key, change, list.pageSize)

export function ListToolbar<T>({
  list,
  placeholder = "Search",
  noun = "record",
  showSearch = true,
  debounceMs = 0,
  extra,
}: {
  list: ListView<T>
  placeholder?: string
  noun?: string
  // Extra controls placed with the filters (for example a sort choice).
  extra?: ReactNode
  // Off when the page already has its own search box (for example the document browser).
  showSearch?: boolean
  // Wait this long after typing stops before searching (server-side lists use 300).
  debounceMs?: number
}) {
  const { config, query, narrowed } = list
  const chips = activeChips(query, config)
  const [text, setText] = useState(query.search)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Follow changes made elsewhere (Clear filters, removing the search chip).
  useEffect(() => setText(query.search), [query.search])
  useEffect(() => () => clearTimeout(timer.current), [])
  const onSearch = (value: string) => {
    setText(value)
    clearTimeout(timer.current)
    if (!debounceMs) update(list, (q) => withSearch(q, value))
    else
      timer.current = setTimeout(
        () => update(list, (q) => withSearch(q, value)),
        debounceMs,
      )
  }
  return (
    <div className="list-toolbar" role="search" aria-label={placeholder}>
      <div className="list-toolbar-controls">
        {showSearch && (
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label={placeholder}
              placeholder={placeholder}
              value={text}
              onChange={(event) => onSearch(event.target.value)}
            />
          </div>
        )}
        {(config.filters || []).map((def) => (
          <label className="list-filter" key={def.id}>
            <span>{def.label}</span>
            {def.kind === "date" ? (
              <input
                type="date"
                value={query.filters[def.id] || ""}
                onChange={(event) =>
                  update(list, (q) => withFilter(q, def.id, event.target.value))
                }
              />
            ) : (
              <select
                value={query.filters[def.id] || "all"}
                onChange={(event) =>
                  update(list, (q) => withFilter(q, def.id, event.target.value))
                }
              >
                <option value="all">{def.allLabel || "All"}</option>
                {(def.options || []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        {extra}
        {narrowed && (
          <Button
            variant="text-button"
            onClick={() => update(list, (q) => clearFilters(q))}
          >
            Clear filters
          </Button>
        )}
      </div>
      <p className="list-count" role="status" aria-live="polite">
        {list.status.state === "loading"
          ? "Loading…"
          : countLabel(list.count, noun)}
      </p>
      {chips.length > 0 && (
        <ul className="filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                className="filter-chip"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() =>
                  update(list, (q) =>
                    chip.id === "search"
                      ? withSearch(q, "")
                      : withFilter(q, chip.id, "all"),
                  )
                }
              >
                {chip.label}
                <span aria-hidden="true"> ✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Shown instead of a module's normal empty state when filters hide everything. */
export function NoResults<T>({ list }: { list: ListView<T> }) {
  return (
    <div className="empty no-results">
      <Icon name="search" size={30} />
      <h3>No results match your filters.</h3>
      <Button onClick={() => update(list, (q) => clearFilters(q))}>
        Clear filters
      </Button>
    </div>
  )
}

/**
 * Full pager for module pages: first / previous / numbered pages with ellipsis /
 * next / last, a page-size choice, and "Showing X–Y of Z records" for the
 * FILTERED results. Hidden while everything fits on the smallest page (10).
 * On narrow screens it collapses to Previous / "Page X of Y" / Next.
 */
export function ListPager<T>({
  list,
  touch = false,
  unit = "records",
}: {
  list: ListView<T>
  touch?: boolean
  // What is being counted in "Showing X–Y of Z …".
  unit?: string
}) {
  const { view } = list
  const sizes = list.pageSizes ?? PAGE_SIZES
  if (list.count <= sizes[0]) return null
  const go = (page: number) => update(list, (q) => withPage(q, page))
  const multiple = view.pageCount > 1
  return (
    <nav
      className={`pagination ${touch ? "touch" : ""}`}
      aria-label="Pagination"
    >
      <p className="pagination-summary" role="status" aria-live="polite">
        Showing {view.from}–{view.to} of {list.count} {unit}
        <span className="pagination-page-of">
          {" "}
          · Page {view.page} of {view.pageCount}
        </span>
      </p>
      <label className="pagination-size">
        <span>Rows per page</span>
        <select
          value={view.pageSize}
          onChange={(event) =>
            update(list, (q) => withPageSize(q, Number(event.target.value)))
          }
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      {multiple && (
        <div className="pagination-pages">
          <Button
            className="pagination-first"
            disabled={view.page <= 1}
            aria-label="First page"
            onClick={() => go(1)}
          >
            First
          </Button>
          <Button
            disabled={view.page <= 1}
            aria-label="Previous page"
            onClick={() => go(view.page - 1)}
          >
            Previous
          </Button>
          <span className="pagination-mini">
            Page {view.page} of {view.pageCount}
          </span>
          <span className="pagination-numbers">
            {pageNumbers(view.page, view.pageCount).map((n, index) =>
              n === null ? (
                <span
                  className="pagination-gap"
                  aria-hidden="true"
                  key={`gap${index}`}
                >
                  …
                </span>
              ) : (
                <Button
                  key={n}
                  className={`pagination-page ${n === view.page ? "active" : ""}`}
                  aria-label={`Page ${n}`}
                  aria-current={n === view.page ? "page" : undefined}
                  onClick={() => go(n)}
                >
                  {n}
                </Button>
              ),
            )}
          </span>
          <Button
            disabled={view.page >= view.pageCount}
            aria-label="Next page"
            onClick={() => go(view.page + 1)}
          >
            Next
          </Button>
          <Button
            className="pagination-last"
            disabled={view.page >= view.pageCount}
            aria-label="Last page"
            onClick={() => go(view.pageCount)}
          >
            Last
          </Button>
        </div>
      )}
    </nav>
  )
}

/** Dashboard widgets: Previous / "Page X of Y" / Next, no page-size choice. */
export function CompactPager<T>({ list }: { list: ListView<T> }) {
  const { view } = list
  if (view.pageCount <= 1) return null
  const go = (page: number) => update(list, (q) => withPage(q, page))
  return (
    <nav className="pagination compact" aria-label="Pagination">
      <Button
        disabled={view.page <= 1}
        aria-label="Previous page"
        onClick={() => go(view.page - 1)}
      >
        Previous
      </Button>
      <span className="pagination-status" role="status" aria-live="polite">
        Page {view.page} of {view.pageCount}
      </span>
      <Button
        disabled={view.page >= view.pageCount}
        aria-label="Next page"
        onClick={() => go(view.page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}

/**
 * Standard list layout: toolbar, then the page of items (or the loading, error,
 * filtered-empty or "No records yet" state), then the pager.
 */
export function ListSection<T>({
  list,
  placeholder,
  noun,
  render,
  empty,
  touch,
  toolbar = true,
  compact = false,
  debounceMs,
  unit,
  toolbarExtra,
}: {
  list: ListView<T>
  placeholder?: string
  noun?: string
  unit?: string
  // Extra control shown in the toolbar (for example a sort choice).
  toolbarExtra?: ReactNode
  render: (items: T[]) => ReactNode
  // The module's normal empty state. Omit for "No records yet"; null for nothing.
  empty?: ReactNode
  touch?: boolean
  toolbar?: boolean
  // Dashboard widget: no toolbar, compact pager.
  compact?: boolean
  debounceMs?: number
}) {
  const { status } = list
  const items = list.view.items
  let body: ReactNode
  if (status.state === "error")
    body = (
      <div className="empty list-error" role="alert">
        <Icon name="alert" size={30} />
        <h3>{status.message || "These records could not be loaded."}</h3>
        {status.onRetry && <Button onClick={status.onRetry}>Retry</Button>}
      </div>
    )
  else if (status.state === "loading" && !items.length)
    body = (
      <SkeletonRows rows={compact ? 3 : Math.min(list.query.pageSize, 6)} />
    )
  else if (list.count > 0 || items.length) body = render(items)
  else if (list.narrowed) body = <NoResults list={list} />
  else body = empty === undefined ? <Empty title="No records yet" /> : empty
  return (
    <>
      {toolbar && !compact && (
        <ListToolbar
          list={list}
          placeholder={placeholder}
          noun={noun}
          debounceMs={debounceMs}
          extra={toolbarExtra}
        />
      )}
      <div
        aria-busy={status.state === "loading"}
        className={status.state === "loading" ? "list-busy" : undefined}
      >
        {body}
      </div>
      {status.state === "error" || (status.state === "loading" && !items.length) ? null : compact ? (
        <CompactPager list={list} />
      ) : (
        <ListPager list={list} touch={touch} unit={unit} />
      )}
    </>
  )
}
