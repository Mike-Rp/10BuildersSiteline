import assert from "node:assert/strict"
import test from "node:test"
import { activeFixture, currentProject } from "./fixtures.mjs"
import { clientProjectViews } from "../src/client-access.ts"

test("staff notification rows open full previews, mark reads, dismiss by keyboard, and open the related profile or project; clients open project history", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  const w = dom.window
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, navigator: w.navigator,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.HTMLElement.prototype.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = activeFixture(), project = currentProject(state)
    const actor = state.accounts.find(account => account.id === "a4")
    actor.expiry = "2099-01-01"
    const fullMessage = 'A full notification message.\nSecond line: <img src="x"> stays text.'
    const notification = (id, title, detail, extra = {}) => ({ id, title, detail, date: "2026-10-25T01:00:00Z", type: "notice", read: false, target: "Dashboard", recipientIds: [actor.id], readBy: [], ...extra })
    state.events = [notification("901", "License renewal reminder", "Visit your Administrator with your renewed license."),
      notification("902", "General notification", fullMessage), notification("903", "Project update", "Review this project.", { projectId: project.id })]
    const read = []
    const props = { state, actor, onRead: ids => read.push(...ids), onMute() {}, onCommand: async () => ({ ok: true }), onReload() {},
      paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} }
    await React.act(() => root.render(React.createElement(Workspace, props)))
    const click = element => { assert.ok(element, "expected an interactive element"); return React.act(() => element.click()) }
    const byText = (container, text) => [...container.querySelectorAll("button")].find(button => button.textContent === text)
    const open = async title => {
      await click(document.querySelector(".notification-container > button"))
      await click([...document.querySelectorAll(".notification-popover .activity-item")].find(button => button.textContent.includes(title)))
      assert.equal(document.querySelector(".notification-popover"), null)
      return document.querySelector('[role="dialog"][aria-label="Notification details"]')
    }
    let modal = await open("License renewal reminder")
    assert.ok(modal)
    assert.ok(read.includes("901"))
    assert.match(modal.textContent, /Visit your Administrator/)
    await click(byText(modal, "View my license"))
    modal = document.querySelector('[role="dialog"][aria-label="My profile"]')
    assert.ok(modal)
    assert.equal(modal.querySelector('input[type="file"]'), null, "license access stays read-only for staff")
    await click(modal.querySelector('[aria-label="Close dialog"]'))
    modal = await open("General notification")
    assert.equal(modal.querySelector(".notification-detail-message").textContent, fullMessage)
    assert.equal(modal.querySelector("img"), null)
    assert.equal(modal.querySelector(".primary"), null, "unlinked messages remain readable without an invented destination")
    await React.act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    assert.equal(document.querySelector('[aria-label="Notification details"]'), null)
    assert.equal(document.body.style.overflow, "")
    modal = await open("Project update")
    await click(byText(modal, "Open project"))
    assert.ok(document.querySelector('[role="dialog"][aria-label="Project monitoring"]'))
    assert.ok(read.includes("903"))

    const { default: Client } = await server.ssrLoadModule("/src/ClientPortal.tsx")
    const client = state.accounts.find(account => account.id === "a9")
    const clientProject = clientProjectViews(state, client.id).find(item => item.id === project.id)
    assert.ok(clientProject)
    clientProject.history = [{ id: "client-history:p4:42", text: "Approved work is ready for viewing.", date: "2026-10-25", phase: "Mobilization", progress: 20 }]
    const clientReads = []
    await React.act(() => root.render(React.createElement(Client, { actor: client, projects: [clientProject], readNoticeIds: [], mutedTypes: [], onRead: ids => clientReads.push(...ids),
      onMute() {}, onResolve() {}, onReport() {}, onRecord() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} })))
    await click(document.querySelector(".notification-container > button"))
    await click(document.querySelector(".notification-popover .activity-item"))
    modal = document.querySelector('[aria-label="Notification details"]')
    assert.match(modal.textContent, /Approved work is ready for viewing/)
    await click(byText(modal, "Open project history"))
    assert.match(document.querySelector(".breadcrumb").textContent, /Progress History/)
    assert.deepEqual(clientReads, ["client-history:p4:42"])
  } finally {
    await React.act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
