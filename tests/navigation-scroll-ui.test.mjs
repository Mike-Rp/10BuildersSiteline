import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("All role routes reset scroll; folder changes and pagination target their section without moving a dialog's background", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/admin/dashboard", pretendToBeVisual: true })
  const w = dom.window, previous = new Map(), scrolls = [], targets = []
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.scrollTo = value => scrolls.push(value)
  w.HTMLElement.prototype.scrollIntoView = function () { targets.push(this) }
  w.requestAnimationFrame = callback => { callback(); return 1 }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: useWorkspacePage } = await server.ssrLoadModule("/src/useWorkspacePage.ts")
    const { useScrollOnChange, scrollListAfterChange } = await server.ssrLoadModule("/src/navigation-scroll.ts")
    function Page({ role }) {
      const { page, navigate } = useWorkspacePage(role)
      return React.createElement("button", { onClick: () => navigate(role === "client" ? "Progress History" : "Active sites") }, page)
    }
    for (const role of ["admin", "opm", "spm", "client"]) {
      w.history.replaceState({}, "", `/${role}/${role === "client" ? "overview" : "dashboard"}`)
      await act(() => root.render(React.createElement(Page, { key: role, role })))
      const before = scrolls.length
      await act(() => document.querySelector("button").click())
      assert.equal(scrolls.length, before + 1, `${role} navigation resets scroll`)
      assert.deepEqual(scrolls.at(-1), { top: 0, left: 0, behavior: "instant" })
      await act(() => root.render(React.createElement(Page, { key: role, role })))
      assert.equal(scrolls.length, before + 1, "Refreshing data does not reset scroll")
    }
    function Folder({ path }) {
      const ref = useScrollOnChange(path)
      return React.createElement("section", { ref }, React.createElement("button", null, path))
    }
    await act(() => root.render(React.createElement(Folder, { path: "project" })))
    const before = targets.length
    await act(() => root.render(React.createElement(Folder, { path: "folder" })))
    assert.equal(targets.length, before + 1)
    const section = document.querySelector("section")
    scrollListAfterChange(section.querySelector("button"))
    assert.equal(targets.at(-1), section)
    const body = document.createElement("div")
    body.className = "modal-body"
    section.replaceWith(body); body.append(section)
    body.scrollTop = 300
    body.getBoundingClientRect = () => ({ top: 100 })
    section.getBoundingClientRect = () => ({ top: -100 })
    const targetCount = targets.length
    scrollListAfterChange(section.querySelector("button"))
    assert.equal(body.scrollTop, 100)
    assert.equal(targets.length, targetCount, "Dialog pagination does not scroll the underlying document")
    body.replaceWith(section)
  } finally {
    await act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
