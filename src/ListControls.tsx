import { useSyncExternalStore, type ReactNode } from "react"
import { Button, Icon } from "./ui"
import {
  PAGE_SIZES,
  activeChips,
  applyList,
  clearFilters,
  countLabel,
  defaultListQuery,
  hasActiveFilters,
  pageNumbers,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  type ListConfig,
  type ListQuery,
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
export const getListQuery = (key: string) => store.get(key) ?? DEFAULT
export function updateListQuery(
  key: string,
  change: (query: ListQuery) => ListQuery,
) {
  store.set(key, change(getListQuery(key)))
  notify()
}
export function resetListMemory() {
  store.clear()
  notify()
}

export type ListView<T> = ReturnType<typeof runList<T>>

/** Filters the (already role-scoped) items, then paginates them. */
export function runList<T>(key: string, items: T[], config: ListConfig<T>) {
  const query = getListQuery(key)
  const { matched, view } = applyList(items, query, config)
  return {
    key,
    config,
    query,
    matched,
    view,
    narrowed: hasActiveFilters(query),
  }
}

export function ListToolbar<T>({
  list,
  placeholder = "Search",
  noun = "result",
  showSearch = true,
}: {
  list: ListView<T>
  placeholder?: string
  noun?: string
  // Off when the page already has its own search box (for example the document browser).
  showSearch?: boolean
}) {
  const { key, config, query, view, narrowed } = list
  const chips = activeChips(query, config)
  const update = (change: (q: ListQuery) => ListQuery) =>
    updateListQuery(key, change)
  return (
    <div className="list-toolbar" role="search" aria-label={placeholder}>
      <div className="list-toolbar-controls">
        {showSearch && (
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label={placeholder}
              placeholder={placeholder}
              value={query.search}
              onChange={(event) =>
                update((q) => withSearch(q, event.target.value))
              }
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
                  update((q) => withFilter(q, def.id, event.target.value))
                }
              />
            ) : (
              <select
                value={query.filters[def.id] || "all"}
                onChange={(event) =>
                  update((q) => withFilter(q, def.id, event.target.value))
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
        {narrowed && (
          <Button
            variant="text-button"
            onClick={() => update((q) => clearFilters(q))}
          >
            Clear filters
          </Button>
        )}
      </div>
      <p className="list-count" role="status" aria-live="polite">
        {countLabel(list.matched.length, noun)}
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
                  update((q) =>
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
      <Button
        onClick={() => updateListQuery(list.key, (q) => clearFilters(q))}
      >
        Clear filters
      </Button>
    </div>
  )
}

/** Hidden while everything fits on the smallest page (10 items). */
export function ListPager<T>({
  list,
  touch = false,
}: {
  list: ListView<T>
  touch?: boolean
}) {
  const { view, key } = list
  if (view.total <= PAGE_SIZES[0]) return null
  const go = (page: number) => updateListQuery(key, (q) => withPage(q, page))
  return (
    <nav
      className={`pagination ${touch ? "touch" : ""}`}
      aria-label="Pagination"
    >
      <p className="pagination-summary" role="status" aria-live="polite">
        Showing {view.from}–{view.to} of {view.total}
      </p>
      <label className="pagination-size">
        <span>Per page</span>
        <select
          value={view.pageSize}
          onChange={(event) =>
            updateListQuery(key, (q) =>
              withPageSize(q, Number(event.target.value)),
            )
          }
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="pagination-pages">
        <Button
          disabled={view.page <= 1}
          aria-label="Previous page"
          onClick={() => go(view.page - 1)}
        >
          Previous
        </Button>
        {pageNumbers(view.page, view.pageCount).map((n, index) =>
          n === null ? (
            <span className="pagination-gap" aria-hidden="true" key={`gap${index}`}>
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
        <Button
          disabled={view.page >= view.pageCount}
          aria-label="Next page"
          onClick={() => go(view.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}

/**
 * Standard list layout: toolbar, then the page of items (or the filtered-empty
 * state, or the module's normal empty state), then the pager.
 */
export function ListSection<T>({
  list,
  placeholder,
  noun,
  render,
  empty,
  touch,
  toolbar = true,
}: {
  list: ListView<T>
  placeholder?: string
  noun?: string
  render: (items: T[]) => ReactNode
  // The module's normal empty state, shown when there is nothing to filter at all.
  empty?: ReactNode
  touch?: boolean
  toolbar?: boolean
}) {
  return (
    <>
      {toolbar && (
        <ListToolbar list={list} placeholder={placeholder} noun={noun} />
      )}
      {list.matched.length ? (
        render(list.view.items)
      ) : list.narrowed ? (
        <NoResults list={list} />
      ) : (
        (empty ?? render([]))
      )}
      <ListPager list={list} touch={touch} />
    </>
  )
}
