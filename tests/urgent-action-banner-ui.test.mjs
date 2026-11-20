import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("priority banner opens individual tasks and shows the full queue only for multiple items", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Banner } = await server.ssrLoadModule("/src/UrgentActionBanner.tsx")
    const items = [
      { key: "pending", title: "Pending renewal", urgency: "attention" },
      { key: "soon", title: "Approaching license expiry", urgency: "soon", due: Date.parse("2026-10-28"), dateOnly: true },
      { key: "qa", title: "Evidence review", urgency: "overdue", due: Date.parse("2026-10-26T10:00:00Z"), overdue: 2, dueSoon: 1 },
      { key: "blocked", title: "Blocked handoff", urgency: "blocked" },
      { key: "other", title: "Other action", urgency: "attention" },
    ].map(item => ({ detail: "Open the existing record", status: "Review required", ...item }))
    const opened = []
    const render = list => act(() => root.render(React.createElement(Banner, { items: list, onOpen: item => opened.push(item.key) })))
    await render(items)
    const banner = () => document.querySelector('[aria-label="Priority action items"]')
    assert.ok(banner().classList.contains("urgent-critical"))
    assert.equal(banner().getAttribute("role"), null)
    assert.match(document.querySelector('.urgent-banner-summary').textContent, /2 overdue \/ expired2 due soon1 blocked/)
    assert.deepEqual([...document.querySelectorAll('.urgent-item-copy > strong')].map(el => el.textContent), ["Evidence review", "Blocked handoff", "Approaching license expiry"])
    assert.equal(document.querySelector('.urgent-item-status.soon time').dateTime, "2026-10-28")
    assert.doesNotMatch(document.querySelector('.urgent-item-status.soon time').textContent, /AM|PM|:/)
    await act(() => document.querySelector('[aria-label="Open priority item: Approaching license expiry"]').click())
    await act(() => document.querySelector('.urgent-banner-heading button').click())
    assert.deepEqual(opened, ["soon"])
    const queue = document.querySelector('[role="dialog"][aria-label="All priority items"]')
    assert.equal(queue.querySelectorAll('.urgent-banner-item').length, 5)
    await act(() => queue.querySelector('[aria-label="Open priority item: Other action"]').click())
    assert.deepEqual(opened, ["soon", "other"])
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(banner().querySelectorAll('.urgent-banner-item').length, 3)
    await render([items[1]])
    assert.ok(banner().classList.contains("urgent-warning"))
    assert.equal(banner().querySelector('.urgent-banner-heading button'), null)
    await render([])
    assert.equal(banner(), null)
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
