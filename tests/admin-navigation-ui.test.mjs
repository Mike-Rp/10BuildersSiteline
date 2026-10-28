import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Admin navigation toggles on desktop and mobile, handles resizing, closes on navigation and restores keyboard focus", { timeout: 30000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:8443/", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node,
    sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const listeners = new Set()
  const media = { matches: false, media: "(max-width: 1000px)", addEventListener(type, listener) { if (type === "change") listeners.add(listener) }, removeEventListener(type, listener) { listeners.delete(listener) } }
  w.matchMedia = () => media
  w.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const user = { id: "admin-navigation-test", role: "admin", full_name: "Navigation Test Admin", email: "navigation@example.invalid", status: "active", date_added: "2026-01-01" }
  const token = `test.${Buffer.from(JSON.stringify({ sub: user.id, details: { id: user.id, role: user.role } })).toString("base64url")}.test`
  w.sessionStorage.setItem("siteline-api-token", token)
  const calls = []
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(String(url), "http://localhost:8443").pathname.replace(/^\/api\/v1/, "")
    calls.push({ path, method: init?.method || "GET" })
    if (path === "/auth/me") return Response.json(user)
    if (path === "/accounts") return Response.json([user])
    if (path === `/accounts/${user.id}`) return Response.json(user)
    if (path === "/workspace") return Response.json({ accounts: {}, projects: {}, preferences: {} })
    if (path === "/reports/monthly-summary") return Response.json({ message: "Report connection unavailable" }, { status: 503 })
    if (["/workspace/reconcile-phase-handoffs", "/workspace/project-data", "/subcontractors", "/notifications", "/licenses/overview", "/licenses/renewals"].includes(path)) return Response.json([])
    throw Error(`Unexpected request: ${path}`)
  })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/admin-navigation-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: App } = await server.ssrLoadModule("/src/App.tsx")
    await act(async () => { root.render(React.createElement(App)); await new Promise(resolve => setTimeout(resolve, 50)) })
    for (let i = 0; i < 50 && !document.querySelector(".admin-workspace"); i++) await act(() => new Promise(resolve => setTimeout(resolve, 20)))
    assert.ok(!!document.querySelector(".admin-workspace"), document.body.textContent.slice(0, 200))
    assert.equal(document.querySelector('.sidebar [aria-label="Reports"]'), null)
    assert.ok(document.querySelector('.sidebar [aria-label="Project intake"]'))
    assert.equal(document.querySelectorAll('.executive-summary').length, 1)
    const monthly = [...document.querySelectorAll('main button')].find(button => button.textContent === "Monthly report")
    assert.ok(monthly)
    monthly.focus()
    await act(async () => { monthly.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.ok(document.querySelector('[role="dialog"][aria-label="Monthly project report"]'))
    assert.match(document.querySelector('[role="dialog"]').textContent, /Report connection unavailable/)
    await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, monthly)
    await act(() => document.querySelector('.ao-new-intake').click())
    assert.ok(document.querySelector('[role="dialog"]'), "New project intake still opens from Dashboard")
    await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    const toggle = () => document.querySelector(".sidebar-toggle")
    const sidebar = () => document.getElementById("admin-navigation")
    const shell = () => document.querySelector(".admin-workspace")
    const click = async element => { assert.ok(!!element); await act(() => element.click()) }
    const resize = async compact => act(() => { media.matches = compact; for (const listener of listeners) listener({ matches: compact }) })
    assert.equal(toggle().getAttribute("aria-controls"), "admin-navigation")
    assert.equal(toggle().getAttribute("aria-expanded"), "true")
    assert.equal(toggle().classList.contains("mobile-menu"), false, "desktop toggle must not use the mobile-only hidden class")
    await click(toggle())
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    assert.ok(shell().classList.contains("sidebar-collapsed"))
    assert.ok(sidebar().hasAttribute("inert"))
    assert.equal(sidebar().getAttribute("aria-hidden"), "true")
    assert.equal(document.querySelector(".admin-nav-backdrop"), null)
    await click(toggle())
    assert.equal(toggle().getAttribute("aria-expanded"), "true")
    await click(document.querySelector('.sidebar [aria-label="Active sites"]'))
    assert.equal(toggle().getAttribute("aria-expanded"), "true", "desktop navigation stays open after changing pages")
    // Smaller laptops/tablets and phones use the same accessible drawer behavior.
    await resize(true)
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    await click(toggle())
    assert.equal(toggle().getAttribute("aria-expanded"), "true")
    assert.equal(document.body.style.overflow, "hidden")
    assert.equal(document.activeElement.getAttribute("aria-label"), "Close navigation")
    const focusable = [...sidebar().querySelectorAll('button:not(:disabled)')]
    focusable.at(-1).focus()
    await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })))
    assert.equal(document.activeElement.getAttribute("aria-label"), "Close navigation")
    await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    assert.equal(document.activeElement.classList.contains("sidebar-toggle"), true)
    assert.equal(document.body.style.overflow, "")
    await click(toggle())
    await click(document.querySelector(".admin-nav-backdrop"))
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    await click(toggle())
    await click(document.querySelector('.sidebar [aria-label="Dashboard"]'))
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    await click(toggle())
    await click(document.querySelector(".admin-nav-close"))
    assert.equal(toggle().getAttribute("aria-expanded"), "false")
    await resize(false)
    assert.equal(toggle().getAttribute("aria-expanded"), "true")
    await click(toggle())
    await resize(true)
    await click(toggle())
    await resize(false)
    assert.equal(toggle().getAttribute("aria-expanded"), "false", "desktop collapse choice survives viewport changes")
    assert.equal(document.body.style.overflow, "")
    const css = await readFile(new URL("../src/admin-navigation.css", import.meta.url), "utf8")
    assert.match(css, /sidebar-collapsed > \.main-shell\s*\{[^}]*margin-left: 0;[^}]*width: 100%/)
    assert.match(css, /\.sidebar-toggle\s*\{[^}]*display: inline-flex/)
    assert.ok(!calls.some(call => ["/accounts", "/workspace"].includes(call.path) && call.method !== "GET"), "navigation never changes account or workspace records")
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
