import test from "node:test"
import assert from "node:assert/strict"

test("linked location selectors clear children, restrict cities, preserve legacy entries and support disabled views", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), previous = new Map(), w = dom.window
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  try {
    const { default: LocationFields } = await server.ssrLoadModule("/src/LocationFields.tsx")
    let saved
    function Harness({ initial, disabled = false }) {
      const [value, setValue] = React.useState(initial)
      return React.createElement(LocationFields, { value, disabled, prefix: "Project", onChange: next => { saved = next; setValue(next) } })
    }
    const render = props => React.act(() => root.render(React.createElement(Harness, props)))
    const fields = () => [...document.querySelectorAll('[role="combobox"]')]
    const focus = index => React.act(() => fields()[index].focus())
    const type = (index, text) => React.act(() => {
      const element = fields()[index]
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(element, text)
      element.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    const key = (index, name) => React.act(() => fields()[index].dispatchEvent(new w.KeyboardEvent("keydown", { key: name, bubbles: true })))
    const options = () => [...document.querySelectorAll('[role="option"]')]
    const select = async (index, value) => {
      await focus(index)
      if (fields()[index].getAttribute("aria-expanded") !== "true") await key(index, "ArrowDown")
      if (!value) { await type(index, ""); return }
      const option = document.querySelector(`[role="option"][data-location-code="${value}"]`)
      assert.ok(option, value)
      await React.act(() => option.click())
    }
    await render({})
    assert.equal(fields().length, 3)
    assert.equal(fields()[1].disabled, true); assert.equal(fields()[2].disabled, true)
    await focus(0)
    assert.equal(options().length, 18)
    await type(0, "central visayas")
    assert.equal(options().length, 1)
    assert.match(options()[0].textContent, /Central Visayas/)
    assert.equal(fields()[0].checkValidity(), false, "typing a prefix alone must not save an unconfirmed location")
    await key(0, "Enter")
    assert.equal(saved.region, "Region VII (Central Visayas)")
    assert.equal(fields()[0].getAttribute("aria-expanded"), "false")
    await select(0, "0700000000")
    assert.equal(fields()[1].disabled, false); assert.equal(fields()[2].disabled, true)
    await focus(1)
    assert.ok(!options().some(option => option.textContent === "Negros Oriental"))
    await select(1, "0702200000")
    assert.equal(fields()[2].disabled, false)
    await focus(2)
    assert.ok(!options().some(option => option.dataset.locationCode === "0730600000"))
    await select(1, "independent:0700000000")
    await focus(2)
    await type(2, "cebu city")
    assert.equal(options().length, 1, "search tokens can match City of Cebu in a different word order")
    await key(2, "ArrowDown")
    assert.ok(document.getElementById(fields()[2].getAttribute("aria-activedescendant")))
    await key(2, "Enter")
    assert.equal(saved.psgcCode, "0730600000")
    assert.equal(saved.city, "City of Cebu")
    await type(2, "An invented location")
    assert.match(document.body.textContent, /No matching locations/)
    assert.equal(saved.city, ""); assert.equal(saved.psgcCode, undefined)
    assert.equal(fields()[2].checkValidity(), false)
    let escaped = 0
    const escape = event => { if (event.key === "Escape") escaped++ }
    document.addEventListener("keydown", escape)
    await key(2, "Escape")
    assert.equal(fields()[2].getAttribute("aria-expanded"), "false")
    assert.equal(escaped, 0, "closing suggestions must not close the parent dialog")
    await key(2, "Escape")
    assert.equal(escaped, 1)
    document.removeEventListener("keydown", escape)
    await focus(0)
    await type(0, "Metro Manila")
    assert.equal(options().length, 1)
    await key(0, "Enter")
    assert.equal(saved.province, ""); assert.equal(saved.city, ""); assert.equal(saved.psgcCode, undefined)
    assert.equal(fields()[1].value, ""); assert.equal(fields()[2].disabled, true)
    await select(1, "ncr")
    await focus(2)
    assert.equal(options().length, 17)
    await select(2, "1380600000")
    assert.equal(saved.city, "City of Manila")
    await select(1, "")
    assert.equal(saved.city, ""); assert.equal(fields()[2].disabled, true)
    saved = undefined
    await render({ key: "legacy", initial: { region: "Central Visayas", province: "Cebu", city: "Cebu City" } })
    assert.equal(fields()[2].value, "City of Cebu")
    assert.equal(saved, undefined, "resolving a stored alias must not write or reapprove the record on mount")
    await render({ key: "unknown", initial: { region: "Old region", province: "Old province", city: "Old city" } })
    assert.match(document.body.textContent, /Saved location: Old city/)
    assert.equal(fields()[0].value, "")
    await render({ key: "disabled", disabled: true, initial: { region: "Central Visayas", province: "Cebu", city: "Cebu City" } })
    assert.ok(fields().every(field => field.disabled && field.required))
  } finally {
    await React.act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  }
})
