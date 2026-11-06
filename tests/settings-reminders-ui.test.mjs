import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("reminder settings compare day values, validate input and preserve edits through a failed save", async () => {
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
    function Harness() {
      const [rules, setRules] = React.useState({ grace: 30, cap: 2, response: 3, idle: 15, reminderDays: [60, 30, 14, 7, 0] })
      return React.createElement(SettingsForm, { rules, onSave: async (next, label) => {
        calls.push({ next, label })
        const result = await new Promise(resolve => { resolveSave = resolve })
        if (result) setRules(next)
        return result
      } })
    }
    await act(() => root.render(React.createElement(Harness)))
    const row = () => document.querySelector('.reminder-rule-row')
    const input = () => row().querySelector('input')
    const button = text => [...row().querySelectorAll('button')].find(element => element.textContent === text)
    const change = value => act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input(), value)
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.equal(button('Confirm change'), undefined, 'Default spacing must not create a false change')
    await change('0,7,14,30,60,60')
    assert.equal(button('Confirm change'), undefined, 'Reordering and duplicates do not change the saved schedule')
    for (const invalid of ['', '60, s30', '366', '-1', '1.5', '0x10', Array.from({length:13},(_,i)=>i).join(',')]) {
      await change(invalid)
      assert.equal(input().getAttribute('aria-invalid'), 'true')
      assert.equal(button('Confirm change').disabled, true)
    }
    await change('90, 30, ')
    assert.equal(button('Confirm change').disabled, false, 'Trailing comma must not prevent a valid schedule from saving')
    await act(() => button('Confirm change').click())
    assert.equal(input().disabled, true)
    assert.equal(button('Saving…').disabled, true)
    assert.deepEqual(calls[0].next.reminderDays, [90,30], 'Whitespace must not introduce an expiry-day zero')
    await act(async () => { resolveSave(false) })
    assert.equal(input().value, '90, 30, ')
    assert.match(row().querySelector('[role="alert"]').textContent, /could not be saved/)
    assert.equal(button('Confirm change').disabled, false)
    await act(() => button('Confirm change').click())
    await act(async () => { resolveSave(true) })
    assert.equal(input().value, '90, 30')
    assert.equal(button('Confirm change'), undefined)
    assert.match(row().querySelector('[role="status"]').textContent, /saved/)
    await change('120, 0')
    await act(() => button('Cancel').click())
    assert.equal(input().value, '90, 30', 'Cancel restores the latest saved schedule')
    assert.equal(calls.length, 2)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
