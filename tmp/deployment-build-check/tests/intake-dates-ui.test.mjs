import assert from "node:assert/strict"
import test from "node:test"
import { dateLabel, emptyState, latestProjectDate, localToday } from "../src/model.ts"

test("completion calendar starts with the start-date year, stays blank until selected, and preserves intake date rules", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  try {
    const { IntakeForm } = await server.ssrLoadModule("/src/panels.tsx")
    const { Modal } = await server.ssrLoadModule("/src/ui.tsx")
    const field = text => document.getElementById([...document.querySelectorAll("label")].find(label => label.textContent === text)?.htmlFor || "")
    const start = () => field("Estimated start date *"), end = () => field("Estimated completion date *")
    const button = name => [...(document.querySelector(".completion-calendar") || document).querySelectorAll("button")].find(element => (element.getAttribute("aria-label") || element.textContent.trim()) === name)
    const click = name => React.act(() => { assert.ok(button(name), name); button(name).click() })
    const type = (input, value) => React.act(() => {
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(input, value)
      input.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    let closed = 0
    await React.act(() => root.render(React.createElement(Modal, { title: "New project intake", onClose: () => closed++ }, React.createElement(IntakeForm, { state: emptyState(), onSubmit() {}, onClient: account => account, onClose() {} }))))
    assert.equal(start().value, localToday())
    assert.equal(end().value, "")
    await click("Choose estimated completion date")
    assert.equal(document.querySelector('.completion-calendar-selectors label:last-child select').value, localToday().slice(0, 4))
    assert.equal(end().value, "", "opening the calendar does not choose a date")
    assert.match(document.querySelector('.completion-calendar-note').textContent, /No completion date selected/)
    await React.act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
    assert.equal(closed, 0, "Escape closes only the calendar")
    assert.equal(end().value, "")
    const year = Number(localToday().slice(0, 4)) + 1
    await type(start(), `${year}-01-15`)
    await click("Choose estimated completion date")
    assert.equal(document.querySelector('.completion-calendar-heading strong').textContent, `January ${year}`)
    assert.equal(button(`Jan 15, ${year}`).disabled, true, "completion must be after start")
    assert.equal(button(`Jan 14, ${year}`).disabled, true)
    await click(`Jan 16, ${year}`)
    assert.equal(end().value, `${year}-01-16`)
    assert.match(document.body.textContent, /Planned duration: 1 calendar days/)
    await click("Choose estimated completion date")
    assert.equal(button(`Jan 16, ${year}`).getAttribute("aria-pressed"), "true")
    await click("Cancel")
    assert.equal(document.querySelector('.completion-calendar'), null)
    assert.equal(end().value, `${year}-01-16`, "cancel preserves the confirmed date")
    await type(start(), `${year}-12-31`)
    assert.equal(end().value, "", "a later start clears an invalid existing completion")
    await click("Choose estimated completion date")
    assert.equal(document.querySelector('.completion-calendar-heading strong').textContent, `December ${year}`)
    assert.equal(button(`Dec 31, ${year}`).disabled, true)
    await click("Next month")
    assert.equal(document.querySelector('.completion-calendar-heading strong').textContent, `January ${year + 1}`)
    await click(`Jan 1, ${year + 1}`)
    assert.equal(end().value, `${year + 1}-01-01`, "year rollover uses the next valid day")
    await type(end(), `${year + 1}-06-10`)
    assert.equal(end().value, `${year + 1}-06-10`, "manual date entry remains available")
    await type(end(), `${year}-12-31`)
    assert.equal(end().getAttribute("aria-invalid"), "true", "manual entry cannot bypass the after-start rule")
    await type(end(), `${Number(localToday().slice(0, 4)) + 11}-01-01`)
    assert.equal(end().getAttribute("aria-invalid"), "true", "manual entry beyond the ten-year limit is rejected")
    assert.match(document.body.textContent, /Date is too far in the future/)
    await type(end(), "")
    let leapYear = year
    while (new Date(Date.UTC(leapYear, 1, 29)).getUTCMonth() !== 1) leapYear++
    await type(start(), `${leapYear}-02-28`)
    await click("Choose estimated completion date")
    await click(`Feb 29, ${leapYear}`)
    assert.equal(end().value, `${leapYear}-02-29`, "leap day can be selected")
    assert.match(document.body.textContent, /Planned duration: 1 calendar days/)
    await click("Choose estimated completion date")
    const max = latestProjectDate()
    const [maxYear, maxMonth, maxDay] = max.split("-").map(Number)
    const choose = async (selector, value) => React.act(() => {
      const select = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, "value").set.call(select, String(value))
      select.dispatchEvent(new w.Event("change", { bubbles: true }))
    })
    await choose('.completion-calendar-selectors label:last-child select', maxYear)
    await choose('.completion-calendar-selectors label:first-child select', maxMonth - 1)
    assert.equal(button("Next month").disabled, true, "month navigation stops at the allowed upper boundary")
    for (const day of document.querySelectorAll('.completion-calendar-days button')) {
      if (Number(day.textContent) > maxDay) assert.equal(day.disabled, true, "dates after the upper boundary are disabled")
    }
    await click(dateLabel(max))
    assert.equal(end().value, max, "the maximum allowed completion date is selectable")
    assert.equal(end().getAttribute("aria-invalid"), "false")
    // With no start date, opening uses the current local year without filling completion.
    await type(start(), "")
    await type(end(), "")
    await React.act(() => end().dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true })))
    assert.equal(document.querySelector('.completion-calendar-selectors label:last-child select').value, localToday().slice(0, 4))
    assert.equal(end().value, "")
  } finally {
    await React.act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  }
})
