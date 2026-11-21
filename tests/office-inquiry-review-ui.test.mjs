import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("proposal approval opens mandatory review with live size and inline validation", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const start = `${new Date().getUTCFullYear() + 1}-01-12`
  let inquiry = {
    id: "maple", status: "consulting", details: {
      name: "Maple Residence", project_type: "Residential", address: "Quezon City",
      lot_area: 100, land_area: 100, floor_area_sqm: 120, floor_count: 2, anticipated_start: start,
      client_name: "Ana Reyes", email: "ana@gmail.com", phone: "09123456789", consultation: 30,
    },
  }
  let submitted
  const globals = new Map()
  for (const [key, value] of Object.entries({
    window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, init) => {
      const path = String(url)
      if (path.endsWith("/decision")) {
        assert.equal(JSON.parse(init.body).action, "approve")
        inquiry = { ...inquiry, status: "approved" }
        return Response.json({ data: inquiry })
      }
      if (path.endsWith("/workflow")) {
        submitted = JSON.parse(init.body)
        inquiry = {
          ...inquiry, details: { ...inquiry.details, ...submitted.correction },
          workflow: {
            budget: Number(submitted.amount), review: { ...submitted, version: 1 },
            review_history: [{ version: 1, at: start, reason: submitted.reason, changes: { floor_area_sqm: { before: 120, after: 180 } } }],
          },
        }
        return Response.json({ data: inquiry })
      }
      return Response.json({ data: [inquiry] })
    },
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
  const button = name => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === name)
  const click = node => act(() => node.click())
  const enter = (id, value) => act(() => {
    const input = document.getElementById(id)
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value)
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  await act(() => root.render(React.createElement(ProjectInquiries, { role: "opm", onReload() {} })))
  await click(document.querySelector('button[aria-label$="for Maple Residence"]'))
  await click(button("Open proposal"))
  await click(button("Mark proposal approved"))
  assert.match(document.querySelector(".office-review-toast").textContent, /Proposal approved/)
  assert.equal(document.querySelector(".office-review-size strong").textContent, "Small")
  assert.equal(button("Save and continue").disabled, false)
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-budget")
  assert.match(document.querySelector("#inquiry-review-budget-error").textContent, /required/)
  assert.equal(submitted, undefined)

  await enter("inquiry-review-lot_area", "501")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  await enter("inquiry-review-lot_area", "100")
  await enter("inquiry-review-floor_area_sqm", "351")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  await enter("inquiry-review-floor_area_sqm", "180")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Medium/)
  assert.match(document.querySelector("#inquiry-review-floor_area_sqm-helper").textContent, /Admin: 120 m²/)
  await click(button("View Admin submission"))
  assert.match(document.querySelector('[role="dialog"]').textContent, /Total floor area \(m²\)120/)
  await click(document.querySelector('button[aria-label="Close dialog"]'))
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-reason")
  await enter("inquiry-review-reason", "Updated project drawings")
  await enter("inquiry-review-budget", "5000000")
  await click(button("Save and continue"))
  assert.equal(submitted.correction.floor_area_sqm, "180")
  assert.equal(submitted.amount, "5000000")
  assert.match(document.querySelector(".office-workflow h1").textContent, /Assess project size/)

  await click(button("Project information & budget"))
  await click(button("Edit project information"))
  assert.match(document.querySelector("#inquiry-review-floor_area_sqm-helper").textContent, /Admin: 120 m²/)
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Medium/)
})
