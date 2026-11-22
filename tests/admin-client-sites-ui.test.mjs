import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Team counts linked active sites for client accounts", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:8443/admin/dashboard", pretendToBeVisual: true }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}
  const user = { id: "search-navigation-admin", role: "admin", full_name: "Search Navigation Admin", email: "search@example.invalid", status: "active", date_added: "2026-01-01" }
  const client = { ...user, id: "linked-client", role: "client", full_name: "Linked Client", email: "client@example.invalid" }
  const projectParts = ["active", "archived"].map(status => {
    const list = { id: `${status}-site`, name: `${status} site`, project_type: "Residential", lifecycle_status: status, client_name: client.full_name }
    return { list, detail: { ...list, client_accounts: [client] }, documents: [], history: [], photos: [], notes: [], assignments: [], contracts: [] }
  })
  w.sessionStorage.setItem("siteline-api-token", `test.${Buffer.from(JSON.stringify({ sub: user.id, details: { id: user.id, role: user.role } })).toString("base64url")}.test`)
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(String(url), "http://localhost:8443").pathname.replace(/^\/api\/v1/, "")
    if (path === "/auth/me" || path === `/accounts/${user.id}`) return Response.json(user)
    if (path === "/accounts") return Response.json([user, client])
    if (path === `/accounts/${client.id}`) return Response.json(client)
    if (path === "/workspace") return Response.json({ accounts: {}, projects: {}, preferences: {} })
    if (path === "/workspace/reconcile-phase-handoffs") return Response.json([])
    if (init?.method && init.method !== "GET") return Response.json({})
    if (path === "/workspace/project-data") return Response.json(projectParts)
    if (["/subcontractors", "/notifications", "/licenses/overview", "/licenses/renewals"].includes(path)) return Response.json([])
    throw Error(`Unexpected request: ${path}`)
  })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/admin-search-navigation-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  await act(async () => { root.render(React.createElement(App)); await new Promise(resolve => setTimeout(resolve, 50)) })
  for (let i = 0; i < 50 && !document.querySelector('.admin-workspace'); i++) await act(() => new Promise(resolve => setTimeout(resolve, 20)))
  assert.ok(document.querySelector('.admin-workspace'), document.body.textContent.slice(-300))
  await act(() => document.querySelector('.sidebar [aria-label="Team"]').click())
  const clientRow = [...document.querySelectorAll('.person-cell')].find(row => row.textContent.includes(client.full_name))
  assert.ok(clientRow)
  await act(() => clientRow.click())
  const accountDialog = document.querySelector('[role="dialog"]')
  const siteCount = [...accountDialog.querySelectorAll('.account-detail-grid > div')].find(field => field.querySelector('small')?.textContent === 'ACTIVE SITES')
  assert.equal(siteCount?.querySelector('strong')?.textContent, '1')
  assert.equal(accountDialog.querySelectorAll('.assignment-history').length, 2)
})
