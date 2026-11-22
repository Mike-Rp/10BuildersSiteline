import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("selecting a search result navigates behind details and closing stays in its module", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:8443/admin/dashboard", pretendToBeVisual: true }), w = dom.window, previous = new Map()
  // The first-visit workspace guide is a modal; tests that exercise the app itself treat it as already seen.
  { const getItem = dom.window.Storage.prototype.getItem; dom.window.Storage.prototype.getItem = function (key) { return String(key).startsWith('10buildline:workspace-guide:') ? 'seen' : getItem.call(this, key) } }
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}
  const user = { id: "search-navigation-admin", role: "admin", full_name: "Search Navigation Admin", email: "search@example.invalid", status: "active", date_added: "2026-01-01" }
  w.sessionStorage.setItem("siteline-api-token", `test.${Buffer.from(JSON.stringify({ sub: user.id, details: { id: user.id, role: user.role } })).toString("base64url")}.test`)
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(String(url), "http://localhost:8443").pathname.replace(/^\/api\/v1/, "")
    if (path === "/auth/me" || path === `/accounts/${user.id}`) return Response.json(user)
    if (path === "/accounts") return Response.json([user])
    if (path === "/workspace") return Response.json({ accounts: {}, projects: {}, preferences: {} })
    if (init?.method && init.method !== "GET") return Response.json({})
    if (["/workspace/project-data", "/subcontractors", "/notifications", "/licenses/overview", "/licenses/renewals"].includes(path)) return Response.json([])
    throw Error(`Unexpected request: ${path}`)
  })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/admin-search-navigation-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  await act(async () => { root.render(React.createElement(App)); await new Promise(resolve => setTimeout(resolve, 50)) })
  for (let i = 0; i < 50 && !document.querySelector('.admin-workspace'); i++) await act(() => new Promise(resolve => setTimeout(resolve, 20)))
  assert.ok(document.querySelector('.admin-workspace'))
  await act(() => document.querySelector('.sidebar [aria-label="Settings"]').click())
  await act(() => document.querySelector('.global-search-trigger').click())
  await act(() => { const input = document.querySelector('.admin-search-input input'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, "Search Navigation Admin"); input.dispatchEvent(new w.Event('input', { bubbles: true })) })
  await act(() => document.querySelector('.admin-search-results button').click())
  assert.equal(document.querySelector('.admin-workspace-search'), null)
  assert.match(document.querySelector('.breadcrumb').textContent, /Directory.*Engineers/)
  assert.ok(document.querySelector('[role="dialog"]'), "record details open over the destination")
  assert.match(document.querySelector('.search-landing-notice').textContent, /Search Navigation Admin/)
  await act(() => document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.match(document.querySelector('.breadcrumb').textContent, /Directory.*Engineers/)
  assert.ok(document.querySelector('.engineer-card.search-result-highlight'))
  await act(() => [...document.querySelectorAll('.search-landing-notice button')].find(button => button.textContent === 'Show all records').click())
  assert.equal(document.querySelector('.search-landing-notice'), null)
  assert.equal(document.querySelector('.search-result-highlight'), null)
  assert.match(document.querySelector('.breadcrumb').textContent, /Directory.*Engineers/)
})
