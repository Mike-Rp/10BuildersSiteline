import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("Reports opens the selected authorized project and handles removed access and empty lists", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const saved = new Map(), requests = []
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true, fetch: async url => {
      requests.push(String(url))
      return new Response(JSON.stringify({ message: "Report unavailable" }), { status: 403 })
    } })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  try {
    const { default: Reports } = await server.ssrLoadModule("/src/Reports.tsx")
    const render = projects => act(() => root.render(React.createElement(Reports, { projects })))
    await render([{ id: "one", name: "Project One" }, { id: "two", name: "Project Two" }])
    assert.equal(document.querySelector('select'), null)
    await act(() => {
      const search = document.querySelector('input[type="search"]')
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'two')
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.equal(document.querySelectorAll('.report-project-results button').length, 1)
    await act(() => document.querySelector('.report-project-results button').click())
    const preview = () => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Preview & export"))
    await act(() => preview().click())
    assert.match(requests.at(-1), /projects\/two\/monthly-report/)
    await act(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Close").click())
    await render([{ id: "one", name: "Project One" }])
    await act(() => preview().click())
    assert.match(requests.at(-1), /projects\/one\/monthly-report/)
    await render([])
    assert.match(document.body.textContent, /No projects available/)
    assert.equal(document.querySelector('[aria-modal="true"]'), null)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  }
})
