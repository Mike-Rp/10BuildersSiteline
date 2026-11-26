import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("optional zero normalization preserves decimals, empty values, grouping and unchanged zero edits", async t => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const { default: NumberInput } = await server.ssrLoadModule("/src/GroupedNumberInput.tsx")
  let stored
  function Form({ normalizeLeadingZeros }) {
    const [value, setValue] = React.useState("")
    stored = value
    return React.createElement(NumberInput, { value, normalizeLeadingZeros, onValueChange: setValue })
  }
  const input = () => document.querySelector("input")
  const enter = value => act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input(), value)
    input().setSelectionRange(value.length, value.length)
    input().dispatchEvent(new dom.window.Event("input", { bubbles: true }))
  })
  await act(() => root.render(React.createElement(Form, { normalizeLeadingZeros: true })))
  for (const [raw, display, value] of [["000050000", "50,000", "50000"], ["0.50", "0.50", "0.50"], ["", "", ""], ["000", "0", "0"], ["00", "0", "0"], ["0000.50", "0.50", "0.50"]]) {
    await enter(raw)
    assert.equal(input().value, display)
    assert.equal(stored, value)
    assert.equal(input().selectionStart, display.length)
  }
  await act(() => root.render(React.createElement(Form, { key: "default" })))
  await enter("000050000")
  assert.equal(stored, "000050000", "normalization is opt-in")
  assert.equal(input().value, "000,050,000")
})
