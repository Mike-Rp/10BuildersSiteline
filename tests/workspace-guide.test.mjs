import { JSDOM } from "jsdom"
import { createServer } from "vite"
import assert from "node:assert/strict"
import { test } from "node:test"

test("guide supports first visit, skipping, role topics, navigation and replay", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  for (const name of ["window", "document", "HTMLElement", "Node", "localStorage", "KeyboardEvent"])
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.innerWidth = 1280
  globalThis.innerHeight = 900
  globalThis.MutationObserver = dom.window.MutationObserver
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()] }
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 300, top: 100, width: 180, height: 44, right: 480, bottom: 144, x: 300, y: 100, toJSON() {} } }
  const search = document.createElement("section")
  search.className = "active-sites"
  search.innerHTML = '<input placeholder="Search by project name…"><button>Open phase workspace</button>'
  document.body.append(search)
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const React = await import("react")
  const { createRoot } = await import("react-dom/client")
  const { default: Guide, guideTopics } = await server.ssrLoadModule("/src/WorkspaceGuide.tsx")
  const root = createRoot(document.getElementById("root"))
  let destination
  const actor = { id: "test-spm", name: "Kian Yamzon", role: "spm" }
  const mount = (enabled = true) => React.act(async () => root.render(React.createElement(Guide, { actor, enabled, onNavigate: page => { destination = page } })))
  const click = async label => {
    const button = [...document.querySelectorAll("button")].find(b => b.textContent === label)
    assert.ok(button, label)
    await React.act(async () => button.click())
  }
  try {
    await mount()
    assert.match(document.body.textContent, /Welcome to your workspace, Kian/)
    await click("Skip for now")
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await React.act(async () => root.render(null))
    await mount()
    assert.equal(document.querySelector('[role="dialog"]'), null, "welcome stays dismissed")
    await click("Workspace guide")
    assert.match(document.body.textContent, /Submit activity evidence/)
    const topicButton = [...document.querySelectorAll(".workspace-guide-topics button")][1]
    await React.act(async () => topicButton.click())
    assert.match(document.body.textContent, /Step 1 of 4/)
    await click("Next")
    assert.match(document.body.textContent, /Step 2 of 4/)
    await click("Back")
    assert.equal(destination, "Active sites")
    assert.ok(document.querySelector(".tour-spotlight"), "actual control is highlighted")
    assert.ok(document.querySelector(".tour-tooltip"), "guide stays open after navigation")
    await click("Next")
    assert.match(document.querySelector(".tour-tooltip").textContent, /This button opens your assigned phase/)
    await click("Next")
    assert.match(document.querySelector(".tour-tooltip").textContent, /not currently available/)
    const attachment = document.createElement("button")
    attachment.textContent = "Add attachments"
    await React.act(async () => document.body.append(attachment))
    assert.ok(document.querySelector(".tour-spotlight"), "control added by a form is found without restarting")
    assert.doesNotMatch(document.querySelector(".tour-tooltip").textContent, /not currently available/)
    await click("Exit tour")
    assert.equal(document.querySelector('[role="dialog"]'), null)
    for (const role of ["admin", "opm", "spm", "client"]) {
      assert.ok(guideTopics(role).length > 1)
      assert.ok(guideTopics(role).every(t => t.steps.length > 0))
    }
    assert.ok(!guideTopics("client").some(t => /Review evidence/.test(t.title)))
    await click("Workspace guide")
    await React.act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await mount(false)
    assert.equal(document.querySelector(".workspace-guide-trigger").disabled, true)
  } finally {
    await React.act(async () => root.unmount())
    await server.close()
    dom.window.close()
  }
})
