import assert from "node:assert/strict"
import test from "node:test"
import {
  activeChips,
  applyList,
  clearFilters,
  defaultListQuery,
  filterItems,
  hasActiveFilters,
  inDateRange,
  matchesSearch,
  pageNumbers,
  paginate,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
} from "../src/listing.ts"
import { initialState } from "./fixtures/demo-state.ts"
import { clientProjectViews } from "../src/client-access.ts"
import { ownedProjects } from "../src/workflows.ts"

const items = Array.from({ length: 48 }, (_, i) => ({
  id: i + 1,
  name: i % 2 ? `Tower ${i + 1}` : `Villa ${i + 1}`,
  type: i % 3 === 0 ? "Residential" : "Commercial",
  date: `2026-0${(i % 9) + 1}-15`,
}))
const config = {
  searchText: (x) => `${x.name} ${x.type}`,
  filters: [
    {
      id: "type",
      label: "Type",
      options: [
        { value: "Residential", label: "Residential" },
        { value: "Commercial", label: "Commercial" },
      ],
      test: (x, v) => x.type === v,
    },
    {
      id: "from",
      label: "From",
      kind: "date",
      test: (x, v) => inDateRange(x.date, v),
    },
  ],
}

test("page math: first page, last partial page, out-of-range pages", () => {
  const first = paginate(items, 1, 10)
  assert.deepEqual(
    [first.from, first.to, first.total, first.pageCount, first.items.length],
    [1, 10, 48, 5, 10],
  )
  const last = paginate(items, 5, 10)
  assert.deepEqual([last.from, last.to, last.items.length], [41, 48, 8])
  // Out of range is clamped to the nearest real page, never an empty view.
  assert.equal(paginate(items, 99, 10).page, 5)
  assert.equal(paginate(items, 0, 10).page, 1)
  assert.equal(paginate(items, -3, 10).page, 1)
  const empty = paginate([], 1, 10)
  assert.deepEqual([empty.from, empty.to, empty.total, empty.pageCount], [0, 0, 0, 1])
  assert.equal(paginate(items, 1, 50).pageCount, 1)
  assert.equal(paginate(items, 2, 25).items[0].id, 26)
})

test("search is case-insensitive, trims spaces and matches the main text", () => {
  assert.ok(matchesSearch("Alden Heights", "  ALDEN "))
  assert.ok(matchesSearch("anything", "   "))
  assert.equal(
    filterItems(items, { search: "  tower 30 ", filters: {} }, config).length,
    1,
  )
  assert.ok(
    filterItems(items, { search: "RESIDENTIAL", filters: {} }, config).every(
      (x) => x.type === "Residential",
    ),
  )
})

test("filters combine with AND, and 'all' / empty mean off", () => {
  const q = { search: "", filters: { type: "Residential", from: "2026-05-01" } }
  const out = filterItems(items, q, config)
  assert.ok(out.length > 0)
  assert.ok(out.every((x) => x.type === "Residential" && x.date >= "2026-05-01"))
  assert.equal(
    filterItems(items, { search: "", filters: { type: "all" } }, config).length,
    48,
  )
  assert.equal(
    filterItems(items, { search: "villa", filters: { type: "Residential" } }, config).every(
      (x) => /villa/i.test(x.name) && x.type === "Residential",
    ),
    true,
  )
})

test("filter then paginate: totals reflect the filtered list", () => {
  const { matched, view } = applyList(
    items,
    { ...defaultListQuery(), filters: { type: "Residential" }, page: 2 },
    config,
  )
  assert.equal(matched.length, 16)
  assert.equal(view.total, 16)
  assert.deepEqual([view.from, view.to], [11, 16])
})

test("changing search, a filter or the page size resets to page 1", () => {
  let q = withPage(defaultListQuery(), 4)
  assert.equal(q.page, 4)
  assert.equal(withSearch(q, "villa").page, 1)
  assert.equal(withFilter(q, "type", "Residential").page, 1)
  assert.equal(withPageSize(q, 25).page, 1)
  assert.equal(withPageSize(q, 25).pageSize, 25)
  // Turning a filter off removes it.
  q = withFilter(withFilter(defaultListQuery(), "type", "Residential"), "type", "all")
  assert.deepEqual(q.filters, {})
})

test("clear filters keeps the page size; chips describe what is active", () => {
  let q = withPageSize(defaultListQuery(), 50)
  q = withFilter(withSearch(q, "Villa"), "type", "Commercial")
  assert.ok(hasActiveFilters(q))
  assert.deepEqual(
    activeChips(q, config).map((c) => c.label),
    ["Search: Villa", "Type: Commercial"],
  )
  const cleared = clearFilters(q)
  assert.equal(hasActiveFilters(cleared), false)
  assert.equal(cleared.pageSize, 50)
  assert.equal(cleared.page, 1)
})

test("page numbers keep first and last and show gaps", () => {
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3])
  assert.deepEqual(pageNumbers(1, 4), [1, 2, 3, 4])
  assert.deepEqual(pageNumbers(1, 10), [1, 2, null, 10])
  assert.deepEqual(pageNumbers(5, 10), [1, null, 4, 5, 6, null, 10])
  assert.deepEqual(pageNumbers(10, 10), [1, null, 9, 10])
})

test("date range is inclusive and open-ended", () => {
  assert.ok(inDateRange("2026-03-10T08:00:00Z", "2026-03-10", "2026-03-10"))
  assert.ok(!inDateRange("2026-03-09", "2026-03-10"))
  assert.ok(inDateRange("2026-03-09", undefined, "2026-03-10"))
  assert.ok(!inDateRange(undefined, "2026-03-10"))
  assert.ok(inDateRange(undefined))
})

test("role scope comes first: filtering a scoped list can never reveal out-of-scope records", () => {
  const state = initialState()
  const everyProject = (s) => s.projects
  const nameConfig = { searchText: (p) => `${p.name} ${p.type} ${p.status}` }
  for (const [actorId, expected] of [
    ["a4", ownedProjects(state, state.accounts.find((a) => a.id === "a4"))],
    ["a2", ownedProjects(state, state.accounts.find((a) => a.id === "a2"))],
  ]) {
    const scoped = expected
    const allowed = new Set(scoped.map((p) => p.id))
    // Even the broadest possible search ("") over scoped input stays inside scope.
    for (const search of ["", "a", "residential", "active", "p"]) {
      const { matched } = applyList(
        scoped,
        withSearch(defaultListQuery(), search),
        nameConfig,
      )
      assert.ok(matched.every((p) => allowed.has(p.id)), `${actorId} ${search}`)
    }
    // A record outside the scope is only reachable if the caller passed it in.
    const outside = everyProject(state).filter((p) => !allowed.has(p.id))
    assert.ok(outside.length > 0)
    const { matched } = applyList(
      scoped,
      withSearch(defaultListQuery(), outside[0].name),
      nameConfig,
    )
    assert.ok(!matched.some((p) => p.id === outside[0].id), actorId)
  }
  // Client: only the client's own projects are ever input to the list.
  const client = state.accounts.find((a) => a.id === "a9")
  const views = clientProjectViews(state, client)
  const ownIds = new Set(views.map((v) => v.id))
  const foreign = state.projects.find((p) => !ownIds.has(p.id))
  const { matched } = applyList(
    views,
    withSearch(defaultListQuery(), foreign.name),
    { searchText: (v) => v.name },
  )
  assert.ok(matched.every((v) => ownIds.has(v.id)))
  assert.ok(!matched.some((v) => v.id === foreign.id))
})

test("result counts are pluralised correctly", async () => {
  const { countLabel } = await import("../src/listing.ts")
  assert.equal(countLabel(1, "company"), "1 company")
  assert.equal(countLabel(12, "company"), "12 companies")
  assert.equal(countLabel(39, "person"), "39 people")
  assert.equal(countLabel(1, "person"), "1 person")
  assert.equal(countLabel(5, "project"), "5 projects")
  assert.equal(countLabel(0, "result"), "0 results")
  assert.equal(countLabel(2, "match"), "2 matches")
})

test("ellipsis: first and last always shown, a window around the current page, gaps elsewhere", async () => {
  const { pageNumbers } = await import("../src/listing.ts")
  assert.deepEqual(pageNumbers(1, 20), [1, 2, null, 20])
  assert.deepEqual(pageNumbers(15, 30), [1, null, 14, 15, 16, null, 30])
  assert.deepEqual(pageNumbers(5, 20), [1, null, 4, 5, 6, null, 20])
  assert.deepEqual(pageNumbers(20, 20), [1, null, 19, 20])
  assert.deepEqual(pageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7], "few pages are all shown")
  assert.deepEqual(pageNumbers(1, 1), [1])
})

test("boundaries: first and last pages, one-record and exact-multiple lists", async () => {
  const { paginate } = await import("../src/listing.ts")
  const first = paginate(items, 1, 10)
  assert.equal(first.page <= 1, true, "Previous / First are disabled on page 1")
  const last = paginate(items, 99, 10)
  assert.equal(last.page, last.pageCount, "Next / Last are disabled on the last page")
  assert.deepEqual([last.from, last.to], [41, 48])
  const exact = paginate(items.slice(0, 20), 2, 10)
  assert.deepEqual([exact.pageCount, exact.from, exact.to], [2, 11, 20])
  const one = paginate(items.slice(0, 1), 1, 10)
  assert.deepEqual([one.pageCount, one.from, one.to], [1, 1, 1])
})

test("clamp after records are removed (archive / status change): never an invalid page", async () => {
  const { paginate } = await import("../src/listing.ts")
  let list = items.slice(0, 25) // 3 pages of 10
  assert.equal(paginate(list, 3, 10).items.length, 5)
  list = list.slice(0, 19) // five records left the list while the user was on page 3
  const after = paginate(list, 3, 10)
  assert.equal(after.page, 2)
  assert.deepEqual([after.from, after.to], [11, 19])
  assert.equal(paginate(list.slice(0, 10), 2, 10).page, 1)
  assert.deepEqual(
    [paginate([], 5, 10).page, paginate([], 5, 10).items.length],
    [1, 0],
  )
})

test("remote pages: the view follows the server's total and clamps too", async () => {
  const { paginateRemote } = await import("../src/listing.ts")
  const view = paginateRemote(items.slice(10, 20), 290, 2, 10)
  assert.deepEqual([view.page, view.pageCount, view.from, view.to, view.total], [2, 29, 11, 20, 290])
  assert.equal(paginateRemote([], 290, 99, 10).page, 29)
})

test("stable order: paging through tied records neither repeats nor skips any", async () => {
  const { stableSort, paginate } = await import("../src/listing.ts")
  // Every record has the same sort key; only the id tiebreak makes the order deterministic.
  const tied = Array.from({ length: 137 }, (_, i) => ({ id: `id-${String(i * 7919 % 137).padStart(4, "0")}`, name: "Same Name" }))
  const compare = (a, b) => a.name.localeCompare(b.name)
  const ordered = stableSort(tied, compare, (x) => x.id)
  const shuffled = stableSort([...tied].reverse(), compare, (x) => x.id)
  assert.deepEqual(shuffled.map((x) => x.id), ordered.map((x) => x.id), "input order never changes the result")
  for (const size of [10, 25, 50]) {
    const ids = []
    for (let page = 1; page <= paginate(ordered, 1, size).pageCount; page++)
      ids.push(...paginate(ordered, page, size).items.map((x) => x.id))
    assert.equal(ids.length, 137, `page size ${size}: nothing skipped`)
    assert.equal(new Set(ids).size, 137, `page size ${size}: nothing repeated`)
    assert.deepEqual(ids, ordered.map((x) => x.id))
  }
})

test("role-scoped counts: the filtered count equals the matches inside the role's own records", () => {
  const state = initialState()
  for (const id of ["a2", "a4", "a6"]) {
    const actor = state.accounts.find((a) => a.id === id)
    const scoped = ownedProjects(state, actor)
    const cfg = { searchText: (p) => `${p.name} ${p.type} ${p.status}` }
    for (const search of ["", "active", "p", "zzz"]) {
      const { matched, view } = applyList(scoped, withSearch(defaultListQuery(), search), cfg)
      const expected = scoped.filter((p) => cfg.searchText(p).toLowerCase().includes(search)).length
      assert.equal(matched.length, expected, `${id} "${search}"`)
      assert.equal(view.total, expected)
      assert.ok(view.total <= scoped.length, "a count can never exceed what the role may see")
    }
    assert.ok(scoped.length < state.projects.length, `${id} does not see every project`)
  }
})
