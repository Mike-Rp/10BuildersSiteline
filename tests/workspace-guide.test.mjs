import { JSDOM } from "jsdom"
import { createServer } from "vite"
import assert from "node:assert/strict"
import { test } from "node:test"

test("guide supports first visit, skipping, role topics, navigation and replay", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  for (const name of ["window", "document", "HTMLElement", "Node", "localStorage", "KeyboardEvent"])
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
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
    await click("Open Active sites")
    assert.equal(destination, "Active sites")
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
