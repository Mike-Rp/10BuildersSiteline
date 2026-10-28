import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import * as React from "react"

test("notifications reveal older date-ordered batches on scroll and reset after closing", async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, navigator: w.navigator, HTMLElement: w.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ cacheDir: "node_modules/.vite-tests/" + process.pid,
    server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await React.act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const { default: Messages } = await server.ssrLoadModule("/src/NotificationMessages.tsx")
  const items = Array.from({ length: 24 }, (_, i) => ({ id: String(i + 1), date: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z` }))
  const source = structuredClone(items)
  function Harness() {
    const [open, setOpen] = React.useState(true)
    return React.createElement(React.Fragment, null,
      React.createElement("button", { id: "toggle", onClick: () => setOpen(!open) }, "Toggle notifications"),
      open && React.createElement(Messages, { items, empty: React.createElement("p", null, "No notifications"),
        renderItems: batch => batch.map(item => React.createElement("button", { className: "message", key: item.id, "data-id": item.id }, item.id)) }))
  }
  await React.act(() => root.render(React.createElement(Harness)))
  const ids = () => [...document.querySelectorAll(".message")].map(node => node.dataset.id)
  assert.deepEqual(ids(), ["24", "23", "22", "21", "20", "19", "18", "17"])
  assert.match(document.querySelector(".notification-date-heading").textContent, /Oct 24, 2026/)
  assert.deepEqual(items, source, "Date sorting does not mutate the account's source feed")
  let scroller = document.querySelector(".notification-scroll")
  Object.defineProperties(scroller, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 }, scrollTop: { configurable: true, writable: true, value: 100 } })
  await React.act(() => scroller.dispatchEvent(new w.Event("scroll")))
  assert.equal(ids().length, 8, "Scrolling near the top does not load history")
  scroller.scrollTop = 750
  await React.act(() => scroller.dispatchEvent(new w.Event("scroll")))
  assert.equal(ids().length, 16)
  assert.equal(ids()[0], "24")
  assert.equal(ids().at(-1), "9")
  assert.equal(scroller.scrollTop, 750, "Loading an older batch preserves the current scroll position")
  const older = [...document.querySelectorAll("button")].find(button => button.textContent === "Show older notifications")
  await React.act(() => older.click())
  assert.equal(ids().length, 24)
  assert.equal(ids().at(-1), "1")
  assert.match(document.querySelector(".notification-history-status").textContent, /oldest available/)
  await React.act(() => document.getElementById("toggle").click())
  assert.equal(document.querySelector(".notification-scroll"), null)
  await React.act(() => document.getElementById("toggle").click())
  scroller = document.querySelector(".notification-scroll")
  assert.equal(scroller.scrollTop, 0)
  assert.deepEqual(ids(), ["24", "23", "22", "21", "20", "19", "18", "17"])
})
