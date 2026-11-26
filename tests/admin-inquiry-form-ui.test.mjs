import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("admin inquiry log and form show grouped controls, phone formats, and the routing preview", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const globals = new Map()
  for (const [key, value] of Object.entries({
    window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async url => Response.json({ data: String(url).includes("opm-candidates?project_type=Residential")
      ? [{ id: "preferred", name: "Avery Reyes", experience_years: 10 },
        { id: "second", name: "Jordan Santos", experience_years: 8 },
        { id: "third", name: "Sam Cruz", experience_years: 6 },
        { id: "fourth", name: "Alex Ramos", experience_years: 4 }] : [] }),
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await act(() => root.unmount())
    await server.close()
    window.close()
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const { default: ProjectInquiries } = await server.ssrLoadModule("/src/ProjectInquiries.tsx")
  await act(() => root.render(React.createElement(ProjectInquiries, { role: "admin", onReload() {} })))
  assert.equal(document.querySelectorAll(".inquiry-log-tabs button").length, 4)
  assert.ok(document.querySelector(".inquiry-log-tabs + .inquiry-log-filters"))
  const button = name => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === name)
  await act(() => button("New project inquiry").click())
  await act(() => document.querySelector('[name="inquiry-client-record"][value="new"]').click())
  await act(() => document.querySelector('[name="inquiry-client-type"][value="individual"]').click())
  await act(() => button("Next: Client details").click())
  assert.ok(document.querySelector('input[placeholder="Lastname, FirstName"]'))
  const phone = document.querySelector('input[type="tel"]')
  const setPhone = value => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(phone, value)
    phone.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  assert.equal(document.querySelector(".mobile-number-prefix").textContent, "+63 9")
  await setPhone("123")
  assert.equal(phone.value, "123")
  await setPhone("123A4")
  assert.equal(phone.value, "123")
  await setPhone("123-4")
  assert.equal(phone.value, "123")
  await setPhone("1234567890")
  assert.equal(phone.value, "123")
  assert.match(phone.getAttribute("aria-describedby"), /phone-notice/)
  const paste = new window.Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(paste, "clipboardData", { value: { getData: () => "+639123456789" } })
  await act(() => phone.dispatchEvent(paste))
  assert.equal(phone.value, "123456789")
  assert.equal(phone.checkValidity(), true)
  await act(() => {
    for (const [selector, value] of [['[aria-label="Client name"]', 'Maria Santos'], ['[aria-label="Email address"]', 'maria@example.com']]) {
      const input = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value)
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
    }
  })
  await act(() => button("Next: Project details").click())
  const measurements = document.querySelector(".admin-inquiry-measurements")
  assert.equal(measurements.querySelectorAll('input[inputmode="decimal"]').length, 3)
  assert.equal(measurements.querySelectorAll('input[type="number"]').length, 1)
  assert.match(measurements.textContent, /Lot area/)
  assert.doesNotMatch(measurements.textContent, /Land area/i)
  const [lotInput, totalInput] = measurements.querySelectorAll('input[inputmode="decimal"]')
  const floorInput = measurements.querySelector('input[type="number"]')
  const enterMeasurement = (input, value) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value)
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  await enterMeasurement(lotInput, "7432")
  await enterMeasurement(floorInput, "200")
  await enterMeasurement(totalInput, "234")
  assert.equal(totalInput.checkValidity(), false, "a 1.17 m² average cannot proceed")
  assert.equal(totalInput.getAttribute("aria-invalid"), "true")
  assert.match(measurements.textContent, /Allowed range is 4,000 to 1,486,400 m²/)
  assert.match(measurements.querySelector('[role="alert"]').textContent, /at least 4,000 m²/)
  assert.equal(measurements.querySelector('input[type="checkbox"]'), null, "there is no bypass checkbox")
  await enterMeasurement(totalInput, "4000")
  assert.equal(totalInput.checkValidity(), true)
  await enterMeasurement(floorInput, "100")
  await enterMeasurement(totalInput, "1999")
  assert.equal(totalInput.checkValidity(), false, "the minimum recalculates when the floor count changes")
  await enterMeasurement(totalInput, "2000")
  assert.equal(totalInput.checkValidity(), true)
  const footprintInput = measurements.querySelectorAll('input[inputmode="decimal"]')[2]
  await enterMeasurement(lotInput, "210")
  await enterMeasurement(footprintInput, "147.01")
  assert.equal(footprintInput.checkValidity(), false)
  await enterMeasurement(footprintInput, "147")
  assert.equal(footprintInput.checkValidity(), true)
  assert.match(measurements.textContent, /Site occupancy: 70%/)
  await act(() => document.querySelector('input[name="inquiry-project-type"][value="Residential"]').click())
  assert.match(document.querySelector(".admin-inquiry-opm-preview li:first-child").textContent, /Avery Reyes.*Best match/)
  assert.match(document.querySelector(".admin-inquiry-opm-preview li:last-child").textContent, /Sam Cruz/)
  assert.equal(document.querySelectorAll(".admin-inquiry-opm-preview li").length, 3)
  assert.equal(document.querySelector(".admin-inquiry-opm-preview li input, .admin-inquiry-opm-preview li button"), null)
  await act(() => document.querySelector('input[name="inquiry-classification"][value="Urgent"]').click())
  await act(() => document.querySelectorAll('input[name="immediate-consultation"]')[1].click())
  assert.equal(document.querySelector(".admin-inquiry-classification").disabled, true)
  assert.equal(document.querySelector('input[name="inquiry-classification"]:checked').value, "Normal")
  assert.match(document.querySelector(".admin-inquiry-consultation").textContent, /within one working day/)

})
