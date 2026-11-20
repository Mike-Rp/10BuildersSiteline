import assert from "node:assert/strict"
import test from "node:test"

test("shared calendar preserves bounds, cancellation, clearing, and disabled fields", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await React.act(() => root.unmount()); await server.close(); w.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const { default: DatePicker } = await server.ssrLoadModule("/src/DatePicker.tsx")
  const { Modal, Field } = await server.ssrLoadModule("/src/ui.tsx")
  let value = "2026-11-15", outerClosed = 0, submits = 0
  function Form({ disabled = false, required = false, bounded = true, earliest } = {}) {
    const [date, setDate] = React.useState(value)
    return React.createElement(Modal, { title: "Parent form", onClose: () => outerClosed++ },
      React.createElement("form", { onSubmit: e => { e.preventDefault(); submits++ } },
        React.createElement(Field, { label: "Expiry date" }, React.createElement(DatePicker, {
          calendarTitle: "Expiry date", value: date, disabled, required,
          ...(bounded ? { min: "2026-11-10", max: "2026-11-20" } : {}),
          ...(earliest ? { min: earliest, highlightMin: true } : {}),
          onValueChange: next => { value = next; setDate(next) },
        }))))
  }
  const render = props => React.act(() => root.render(React.createElement(Form, props)))
  const click = selector => React.act(() => { const el = document.querySelector(selector); assert.ok(el, selector); el.focus(); el.click() })
  const day = number => [...document.querySelectorAll('.completion-calendar-days button')].find(el => el.textContent === String(number))
  await render({})
  const input = document.querySelector('input[type="date"]')
  assert.equal(document.querySelector('label').htmlFor, input.id)
  await click('button[aria-label="Choose expiry date"]')
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 2)
  assert.equal(day(9).disabled, true); assert.equal(day(10).disabled, false)
  assert.equal(day(20).disabled, false); assert.equal(day(21).disabled, true)
  assert.equal(day(15).getAttribute('aria-pressed'), 'true')
  await React.act(() => day(18).click())
  assert.equal(value, "2026-11-18"); assert.equal(input.value, value)
  assert.equal(submits, 0)
  await click('button[aria-label="Choose expiry date"]')
  await React.act(() => document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(outerClosed, 0); assert.equal(value, "2026-11-18")
  assert.equal(document.activeElement.getAttribute('aria-label'), "Choose expiry date")
  await click('button[aria-label="Choose expiry date"]')
  await React.act(() => [...document.querySelectorAll('.completion-calendar button')].find(el => el.textContent === 'Clear').click())
  assert.equal(value, "")
  await render({ required: true })
  await click('button[aria-label="Choose expiry date"]')
  assert.ok(![...document.querySelectorAll('.completion-calendar button')].some(el => el.textContent === 'Clear'))
  await React.act(() => [...document.querySelectorAll('.completion-calendar button')].find(el => el.textContent === 'Cancel').click())
  await render({ disabled: true })
  await click('button[aria-label="Choose expiry date"]')
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
  await render({ bounded: false })
  await click('input[type="date"]')
  assert.ok(document.querySelectorAll('.completion-calendar-selectors label:last-child option').length >= 200)
  assert.ok([...document.querySelectorAll('.completion-calendar-days button')].every(el => !el.disabled))
  await React.act(() => document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await render({ bounded: false, earliest: "2027-01-04" })
  await click('button[aria-label="Choose expiry date"]')
  assert.match(document.querySelector(".completion-calendar-heading").textContent, /January 2027/)
  assert.equal(day(3).disabled, true)
  assert.equal(day(4).disabled, false)
  assert.ok(day(4).classList.contains("completion-earliest"))
  assert.equal(input.value, "")
  await React.act(() => day(4).click())
  assert.equal(input.value, "2027-01-04")
})
