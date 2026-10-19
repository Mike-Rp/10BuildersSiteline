import assert from "node:assert/strict"
import test from "node:test"
import { defaultListQuery, withFilter, withPage, withPageSize, withSearch } from "../src/listing.ts"
import {
  createLatestGuard,
  engineerQueryString,
  parseAccountsPage,
} from "../src/listSource.ts"

const params = (q) => Object.fromEntries(new URLSearchParams(engineerQueryString(q)))

test("the Engineer Directory query asks for engineers only, a page at a time, in a stable order", () => {
  assert.deepEqual(params(defaultListQuery()), {
    page: "1",
    pageSize: "10",
    role_ids: "1,2,3",
    sortBy: "name",
  })
  const q = withPage(withPageSize(defaultListQuery(), 25), 3)
  assert.deepEqual([params(q).page, params(q).pageSize], ["3", "25"])
})

test("search, role and status filters are sent to the server (search is trimmed)", () => {
  let q = withSearch(defaultListQuery(), "  Diana ")
  q = withFilter(withFilter(q, "role", "spm"), "status", "active")
  assert.deepEqual(params(q), {
    page: "1",
    pageSize: "10",
    role_ids: "3",
    status: "active",
    q: "Diana",
    sortBy: "name",
  })
})

test("filters the server cannot apply fall back to the browser", () => {
  assert.equal(engineerQueryString(withFilter(defaultListQuery(), "license", "Valid")), undefined)
  assert.equal(engineerQueryString(withFilter(defaultListQuery(), "status", "deactivated")), undefined)
  assert.equal(engineerQueryString(withFilter(defaultListQuery(), "status", "pending-setup")), undefined)
  assert.equal(engineerQueryString(withFilter(defaultListQuery(), "role", "client")), undefined)
  // Turning the filter off returns to server-side paging.
  const off = withFilter(withFilter(defaultListQuery(), "license", "Valid"), "license", "all")
  assert.ok(engineerQueryString(off))
})

test("a page response is read from the pagination block", () => {
  const page = parseAccountsPage({
    code: 200,
    count: 290,
    data: [{ id: "a" }, { id: "b" }],
    pagination: { page: 2, page_size: 10, total: 290, total_pages: 29 },
  })
  assert.deepEqual(page, { ids: ["a", "b"], total: 290, page: 2, pageCount: 29 })
  // Tolerates a response without the pagination block.
  assert.deepEqual(parseAccountsPage({ count: 2, data: [{ id: "x" }, { id: "y" }] }).total, 2)
  assert.deepEqual(parseAccountsPage({}), { ids: [], total: 0, page: 1, pageCount: 1 })
})

test("only the latest request may update the screen", () => {
  const guard = createLatestGuard()
  const slow = guard.begin()
  const fast = guard.begin()
  assert.equal(guard.isCurrent(slow), false, "an older, slower response is ignored")
  assert.equal(guard.isCurrent(fast), true)
  guard.begin() // cancelled / superseded
  assert.equal(guard.isCurrent(fast), false)
})
