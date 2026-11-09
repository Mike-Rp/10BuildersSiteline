import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("the data refresh interval shows the 5 minute default, saves a choice, keeps it on failure and merges with other rules", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/admin" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { SettingsForm } = await server.ssrLoadModule("/src/panels.tsx")
    const calls = []
    let resolveSave
    function Harness({ initial }) {
      const [rules, setRules] = React.useState(initial)
      return React.createElement(SettingsForm, { rules, onSave: async (next, label) => {
        calls.push({ next, label })
        const result = await new Promise(resolve => { resolveSave = resolve })
        if (result) setRules(next)
        return result
      } })
    }
    const base = { grace: 30, cap: 2, response: 3, idle: 15, reminderDays: [60, 30, 14, 7, 0] }
    await act(() => root.render(React.createElement(Harness, { initial: base })))
    const row = () => document.querySelector(".refresh-rule-row")
    const select = () => row().querySelector("select")
    const button = text => [...row().querySelectorAll("button")].find(element => element.textContent === text)
    const choose = value => act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set.call(select(), String(value))
      select().dispatchEvent(new dom.window.Event("change", { bubbles: true }))
    })
    assert.equal(select().value, "300", "No saved setting shows the 5 minute default")
    assert.match(select().selectedOptions[0].textContent, /5 minutes \(recommended\)/)
    assert.deepEqual([...select().options].map(o => o.value), ["15", "60", "120", "300", "600", "1800", "3600"])
    assert.equal(button("Confirm change"), undefined, "The default is not a pending change")

    await choose(15)
    assert.equal(button("Confirm change").disabled, false)
    await act(() => button("Confirm change").click())
    assert.equal(select().disabled, true, "Controls lock while saving")
    assert.equal(button("Saving…").disabled, true)
    assert.deepEqual(calls[0].next, { ...base, refreshSeconds: 15 }, "Other rules are sent unchanged")
    assert.equal(calls[0].label, "Data refresh interval")
    await act(async () => { resolveSave(false) })
    assert.equal(select().value, "15", "A failed save keeps the choice")
    assert.match(row().querySelector('[role="alert"]').textContent, /could not be saved/)
    assert.equal(button("Confirm change").disabled, false)

    await act(() => button("Confirm change").click())
    await act(async () => { resolveSave(true) })
    assert.equal(button("Confirm change"), undefined, "A saved choice is no longer pending")
    assert.match(row().querySelector('[role="status"]').textContent, /saved/)
    assert.equal(select().value, "15")

    await choose(600)
    await act(() => button("Cancel").click())
    assert.equal(select().value, "15", "Cancel restores the saved interval")
    assert.equal(calls.length, 2)

    // A value saved elsewhere that is not a preset still shows as the current choice.
    await act(() => root.render(React.createElement(Harness, { initial: { ...base, refreshSeconds: 90 }, key: "custom" })))
    assert.equal(select().value, "90")
    assert.ok([...select().options].some(o => o.value === "90"))
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
