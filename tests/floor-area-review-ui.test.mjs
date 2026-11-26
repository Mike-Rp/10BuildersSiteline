import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React from "react"

test("small average floor area requires review and changing measurements resets confirmation", async () => {
  const dom = new JSDOM('<div id="root"></div>')
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Review } = await server.ssrLoadModule("/src/FloorAreaReview.tsx")
    const render = (area, floors, lot) => React.act(() => root.render(React.createElement("form", {}, React.createElement(Review, { area, floors, lot }))))
    await render(3, 100)
    assert.match(document.body.textContent, /Average floor area: 0.03 m² per floor/)
    assert.match(document.body.textContent, /too small for 100 floors/)
    assert.equal(document.querySelector("form").checkValidity(), false)
    await React.act(() => document.querySelector("input").click())
    assert.equal(document.querySelector("form").checkValidity(), true)
    await render(4, 100)
    assert.equal(document.querySelector("input").checked, false)
    assert.equal(document.querySelector("form").checkValidity(), false)
    await render(180, 2)
    assert.match(document.body.textContent, /Average floor area: 90 m² per floor/)
    assert.equal(document.querySelector("input"), null)
    await render(0, 100)
    assert.equal(document.querySelector(".floor-area-review"), null)
    await render(3, 0)
    assert.equal(document.querySelector(".floor-area-review"), null)
    await render(1e30, 3213211, 321)
    assert.match(document.querySelector('[role="alert"]').textContent, /no more than 200 floors/)
    assert.doesNotMatch(document.body.textContent, /Average floor area/)
    await render(32101, 100, 321)
    assert.match(document.querySelector('[role="alert"]').textContent, /must not exceed/)
    assert.doesNotMatch(document.body.textContent, /Average floor area/)
    await render(32100, 100, 321)
    assert.match(document.body.textContent, /Average floor area: 321 m² per floor/)
  } finally {
    await React.act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
