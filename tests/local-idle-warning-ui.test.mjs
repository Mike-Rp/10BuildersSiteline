import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("short idle settings warn later, Stay signed in resets both timers, and a new login clears stale warnings", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/admin", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  let now = 0, sequence = 0, expired = 0
  const timers = new Map()
  dom.window.setTimeout = (callback, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id }
  dom.window.clearTimeout = id => timers.delete(id)
  const advance = async milliseconds => act(() => {
    const target = now + milliseconds
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at; timers.delete(next[0]); next[1].callback()
    }
    now = target
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: useIdleWarning } = await server.ssrLoadModule("/src/useIdleWarning.ts")
    function Harness({ enabled = true, minutes = 1, session = "first-session" }) {
      const { idleWarning, stayActive } = useIdleWarning(enabled, minutes, () => expired++, session)
      return React.createElement(React.Fragment, null, idleWarning && React.createElement("p", { role: "status" }, "Idle warning"), React.createElement("button", { onClick: stayActive }, "Stay signed in"))
    }
    const render = props => act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness, props))))
    const warning = () => document.querySelector('[role="status"]')
    await render({})
    assert.equal(timers.size, 2, "Strict Mode must not leave duplicate timers")
    await advance(0)
    assert.equal(warning(), null, "One-minute settings must not warn immediately")
    await advance(48000)
    assert.ok(warning())
    await act(() => document.querySelector("button").click())
    assert.equal(warning(), null)
    await advance(12000)
    assert.equal(expired, 0, "Old expiry timer must be canceled by explicit continuation")
    assert.equal(warning(), null)
    await advance(36000)
    assert.ok(warning(), "Warning appears again only after another idle period")
    await render({ session: "new-login" })
    assert.equal(warning(), null, "New login gets a clean idle state even for the same account")
    await advance(12000)
    assert.equal(expired, 0)
    await render({ enabled: false })
    assert.equal(timers.size, 0)
    await advance(60000)
    assert.equal(expired, 0, "Signing out removes the old timers")
    await render({ minutes: 15, session: "long-session" })
    await advance(839999)
    assert.equal(warning(), null)
    await advance(1)
    assert.ok(warning(), "Long settings retain the one-minute advance warning")
    await act(() => window.dispatchEvent(new dom.window.Event("scroll")))
    assert.ok(warning(), "Programmatic scrolling must not extend inactivity")
    await advance(60000)
    assert.equal(expired, 1)
  } finally {
    await act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
