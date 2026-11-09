import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"
import { adminWorkspaceIndex, searchWorkspace } from "../src/admin-workspace-search.ts"

const statuses = { active: "Active", pending: "Awaiting Office PM" }
function workspace() {
  const state = initialState()
  const base = state.projects[0]
  state.projects = Array.from({ length: 23 }, (_, index) => ({ ...base, id: `search-${index}`, name: `Green Project ${String(index).padStart(2, "0")}`, type: index % 2 ? "Residential" : "Commercial", status: index % 2 ? "pending" : "active", docs: [] }))
  const doc = { id: "search-doc", name: "Green permit.pdf", label: "Building Permit", owner: "Admin", uploaded: true, clientVisible: false, date: "2026-11-10" }
  state.accounts[0] = { ...state.accounts[0], name: "Angela Green", email: "angela.unique@example.com", docs: [doc, { ...doc, id: "not-uploaded", name: "Missing.pdf", uploaded: false }] }
  state.companies[0] = { ...state.companies[0], name: "Greenline Construction", documents: [doc], manpowerDocuments: [] }
  return state
}

test("workspace search covers all loaded records and deduplicates uploaded files", () => {
  const index = adminWorkspaceIndex(workspace(), statuses)
  assert.equal(searchWorkspace(index, "green project", "name").filter(row => row.category === "projects").length, 23)
  assert.equal(searchWorkspace(index, "  GREEN   PROJECT 22  ", "relevance")[0].id, "search-22")
  assert.ok(searchWorkspace(index, "angela.unique@example.com", "relevance").some(row => row.category === "people"))
  assert.equal(index.filter(row => row.category === "documents" && row.id === "search-doc").length, 1)
  assert.ok(!index.some(row => row.id === "not-uploaded"))
  const items = ["Green Heights", "Green", "The Green Project"].map((name, i) => ({ id: String(i), name, text: name, category: "projects", subtitle: "" }))
  assert.equal(searchWorkspace(items, "green", "relevance")[0].name, "Green")
})

test("Admin search groups results, filters before limiting, and keeps other roles out", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/admin-search-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await React.act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: Search } = await server.ssrLoadModule("/src/AdminWorkspaceSearch.tsx")
  const opened = [], previews = []; let closed = 0
  const props = { role: "admin", state: workspace(), projectStatuses: statuses, onClose: () => closed++, onOpen: (...args) => opened.push(args), onPreview: doc => previews.push(doc) }
  const render = role => React.act(() => root.render(React.createElement(Search, { ...props, role })))
  const clickText = text => React.act(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text); assert.ok(button, text); button.click() })
  const input = value => React.act(() => { const el = document.querySelector('input[type="search"]'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })) })
  const category = name => React.act(() => [...document.querySelectorAll('.admin-search-categories button')].find(el => el.textContent.startsWith(name)).click())
  const select = (label, value) => React.act(() => { const el = [...document.querySelectorAll('label')].find(el => el.firstChild.textContent === label).querySelector('select'); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })) })
  await render("admin")
  assert.match(document.body.textContent, /Find something in your workspace/)
  assert.equal(document.querySelectorAll('.admin-search-results li').length, 0)
  await input("Green")
  assert.equal(document.querySelector('section[aria-label="Projects"]').querySelectorAll('li').length, 5)
  await clickText("View all 23 projects")
  assert.equal(document.querySelectorAll('.admin-search-results li').length, 10)
  await clickText("Show more")
  assert.equal(document.querySelectorAll('.admin-search-results li').length, 20)
  await input("Green Project 22")
  assert.equal(document.querySelectorAll('.admin-search-results li').length, 1, "search includes results past the displayed slice")
  await React.act(() => document.querySelector('.admin-search-results button').click())
  assert.deepEqual(opened.pop(), ["project", "search-22"])
  await input("Green")
  await select("Status", "active")
  assert.match(document.querySelector('.admin-search-summary').textContent, /12 results/)
  assert.match(document.querySelector('.admin-search-more').textContent, /Showing 10 of 12/)
  await select("Project type", "Residential")
  assert.match(document.body.textContent, /No matching results/)
  await clickText("Clear filters")
  assert.match(document.querySelector('.admin-search-summary').textContent, /23 results/)
  await category("People")
  await input("angela.unique@example.com")
  assert.equal(document.querySelectorAll('.admin-search-results li').length, 1)
  await React.act(() => document.querySelector('.admin-search-results button').click())
  assert.deepEqual(opened.pop(), ["account", props.state.accounts[0].id])
  await category("Documents"); await input("Green permit.pdf")
  await select("Document source", "Person")
  await React.act(() => document.querySelector('.admin-search-results button').click())
  assert.equal(previews[0].id, "search-doc"); assert.equal(closed, 1)
  for (const role of ["opm", "spm", "client"]) {
    await render(role)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.body.textContent, "")
  }
})
