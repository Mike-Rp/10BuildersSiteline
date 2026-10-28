import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"
import { clientProjectViews } from "../src/client-access.ts"

test("Client sidebar toggle works on desktop, laptop and mobile with keyboard, resize and page navigation", { timeout: 30000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:8443/", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const listeners = new Set()
  const media = { matches: false, media: "(max-width: 1000px)", addEventListener(type, listener) { if (type === "change") listeners.add(listener) }, removeEventListener(type, listener) { listeners.delete(listener) } }
  w.matchMedia = () => media
  w.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const network = []
  t.mock.method(globalThis, "fetch", async url => { network.push(String(url)); throw Error("Navigation must not access the backend") })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/client-navigation-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: ClientPortal } = await server.ssrLoadModule("/src/ClientPortal.tsx")
    const state = initialState(), actor = state.accounts.find(a => a.id === "a9")
    const props = { actor, projects: clientProjectViews(state, actor.id), readNoticeIds: [], mutedTypes: [], onMute() {}, onResolve() { throw Error("Unauthorized file") }, onReport() { return "report" }, onRecord() {}, onRead() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} }
    await act(() => root.render(React.createElement(ClientPortal, props)))
    const toggle = () => document.querySelector(".client-portal .sidebar-toggle")
    const sidebar = () => document.getElementById("client-navigation")
    const click = async element => { assert.ok(!!element, "Navigation control must exist"); assert.equal(element.hidden,false,"Hidden controls must not be used"); await act(() => element.click()) }
    const resize = async width => act(() => { Object.defineProperty(w, "innerWidth", { value: width, configurable: true }); media.matches = width <= 1000; for (const listener of listeners) listener({ matches: media.matches }) })
    assert.equal(toggle().getAttribute("aria-controls"), "client-navigation")
    assert.equal(toggle().getAttribute("aria-expanded"), "true")
    assert.ok(!toggle().classList.contains("mobile-menu"), "toggle must remain visible on desktop")
    for (const width of [1920, 1366, 1024]) {
      await resize(width)
      assert.equal(toggle().getAttribute("aria-label"), "Collapse Client navigation")
      assert.equal(toggle().hidden,true,"Open sidebar shows only its internal close control")
      const close = sidebar().querySelector('.brand .client-nav-close')
      assert.ok(close, "Client close control belongs inside the sidebar brand header on desktop")
      await click(close)
      assert.equal(toggle().getAttribute("aria-expanded"), "false")
      assert.equal(toggle().hidden,false)
      assert.equal(document.activeElement, toggle())
      await click(toggle())
      assert.equal(toggle().hidden,true)
      assert.equal(document.activeElement,close)
      await click(close)
      assert.equal(toggle().getAttribute("aria-label"), "Expand Client navigation")
      assert.equal(sidebar().getAttribute("aria-hidden"), "true")
      assert.ok(sidebar().hasAttribute("inert"))
      assert.ok(document.querySelector(".client-portal.sidebar-collapsed"))
      assert.equal(document.querySelector(".client-nav-backdrop"), null)
      await click(toggle())
      await click(sidebar().querySelector('[aria-label="Project Overview"]'))
      assert.equal(toggle().getAttribute("aria-expanded"), "true", "desktop navigation stays expanded after page changes")
    }
    for (const width of [1000, 900, 768, 390, 320]) {
      await resize(width)
      assert.equal(toggle().getAttribute("aria-label"), "Open Client navigation")
      await click(toggle())
      assert.equal(toggle().getAttribute("aria-expanded"), "true")
      assert.equal(toggle().hidden,true,"Mobile open state also hides the hamburger")
      assert.equal(document.body.style.overflow, "hidden")
      assert.equal(document.activeElement.getAttribute("aria-label"), "Close Client navigation")
      assert.ok(document.activeElement.closest('.brand'), "Mobile close control stays inside the sidebar header")
      const controls = [...sidebar().querySelectorAll('button:not(:disabled)')]
      controls.at(-1).focus()
      await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })))
      assert.equal(document.activeElement.getAttribute("aria-label"), "Close Client navigation")
      await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
      assert.equal(toggle().getAttribute("aria-expanded"), "false")
      assert.ok(document.activeElement === toggle())
      assert.equal(document.body.style.overflow, "")
      await click(toggle())
      await click(document.querySelector(".client-nav-backdrop"))
      assert.equal(toggle().getAttribute("aria-expanded"), "false")
      await click(toggle())
      await click(document.querySelector(".client-nav-close"))
      assert.equal(toggle().getAttribute("aria-expanded"), "false")
      await click(toggle())
      await click(sidebar().querySelector('[aria-label="Preferences"]'))
      assert.equal(toggle().getAttribute("aria-expanded"), "false")
      assert.match(document.querySelector("main").textContent, /Your notification preferences/)
    }
    await resize(1366)
    await click(sidebar().querySelector('.brand .client-nav-close'))
    await resize(390)
    await click(toggle())
    await resize(1366)
    assert.equal(toggle().getAttribute("aria-expanded"), "false", "desktop collapse choice survives viewport changes")
    assert.equal(document.body.style.overflow, "")
    const css = await readFile(new URL("../src/client-overview.css", import.meta.url), "utf8")
    assert.match(css, /sidebar-collapsed > \.main-shell\s*\{[^}]*margin-left: 0;[^}]*width: 100%/)
    assert.match(css, /\.sidebar-toggle\s*\{[^}]*display: inline-flex/)
    assert.equal(network.length, 0)
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
