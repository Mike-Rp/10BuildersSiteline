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
  let staffingRequest
  const supplemental = "Power Systems Engineering"
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
        const input = JSON.parse(init.body)
        if (input.action === "assessment") {
          inquiry = { ...inquiry, workflow: { ...inquiry.workflow, assessment: {
            id: "assessment", technical: input.technical, arrangement: input.arrangement, size: "Medium", complexity: "Moderate",
            score: 8, planningDays: 104, durationDays: 104, suggestedEnd: submitted.end,
          } } }
          return Response.json({ data: inquiry })
        }
        submitted = input
        inquiry = {
          ...inquiry, details: { ...inquiry.details, ...submitted.correction },
          workflow: {
            budget: Number(submitted.amount), review: { ...submitted, version: 1 },
            review_history: [{ version: 1, at: start, reason: submitted.reason, changes: { floor_area_sqm: { before: 120, after: 180 } } }],
          },
        }
        return Response.json({ data: inquiry })
      }
      if (path.endsWith("/planning")) {
        const input = JSON.parse(init.body)
        staffingRequest = input
        const scopes = ["Structural Engineering", ...(input.additional_scopes?.Design ?? [])]
        return Response.json({ data: {
          phases: ["Design"], estimate: { size: "Medium", end: submitted.end },
          staffing: { assessment_id: "assessment", phases: ["Design"], contract_file_id: "contract", additional_scopes: input.additional_scopes },
          ...(input.phases && { additional_scope_options: { Design: [supplemental] },
            team: [{ stage: "Design", user_id: "ana", required_specializations: scopes, engineers: [{ user_id: "ana", assigned_disciplines: ["Structural Engineering"] }] }],
            candidates: { Design: [{ id: "ana", name: "Ana Reyes", qualifiedTags: ["Structural Engineering"] }] },
          }),
        } })
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
  const select = (label, value) => act(() => {
    const control = [...document.querySelectorAll("label")].find(item => item.firstChild?.textContent === label)?.querySelector("select")
    assert.ok(control, label)
    control.value = value
    control.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
  await act(() => root.render(React.createElement(ProjectInquiries, { role: "opm", onReload() {} })))
  await click(document.querySelector('button[aria-label$="for Maple Residence"]'))
  await click(button("Open proposal"))
  await click(button("Mark proposal approved"))
  assert.match(document.querySelector(".office-review-toast").textContent, /Proposal approved/)
  const measurements = document.querySelector('section[aria-labelledby="inquiry-review-measurements"]')
  assert.ok(measurements.closest(".office-review-form"))
  assert.ok(measurements.querySelector(".office-floor-estimate"))
  assert.equal(document.querySelector(".office-review-size strong").textContent, "Small")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  await select("Technical requirements", "Extensive specialized systems")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m².*94 calendar days.*Low/)
  await select("Project phase arrangement", "Highly concurrent phases")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m².*75 calendar days.*Moderate/)
  await select("Project phase arrangement", "Partially overlapping phases")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m².*85 calendar days.*Moderate/)
  await enter("inquiry-review-floor_count", "3")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /180 m².*158 calendar days/)
  await enter("inquiry-review-floor_count", "2")
  assert.equal(button("Save and continue").disabled, false)
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-budget")
  assert.match(document.querySelector("#inquiry-review-budget-error").textContent, /required/)
  assert.equal(submitted, undefined)

  await enter("inquiry-review-lot_area", "501")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  await enter("inquiry-review-lot_area", "94")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m².*85 calendar days/)
  await enter("inquiry-review-lot_area", "50")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "")
  assert.match(document.querySelector("#inquiry-review-area-per-floor-hint").textContent, /Enter the actual area per floor/)
  assert.match(document.querySelector(".office-floor-estimate").textContent, /Pending measurements/)
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-area-per-floor")
  assert.equal(submitted, undefined)
  await enter("inquiry-review-lot_area", "100")
  await enter("inquiry-review-area-per-floor", "175.5")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  await enter("inquiry-review-area-per-floor", "90")
  await enter("inquiry-review-lot_area", "94")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "90")
  await enter("inquiry-review-lot_area", "100")
  await select("Floor sizes", "individual")
  await enter("inquiry-review-floor-level-1", "100")
  await enter("inquiry-review-floor-level-2", "")
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-floor-level-2")
  assert.match(document.querySelector("#inquiry-review-floor-level-2-error").textContent, /positive area/)
  await enter("inquiry-review-floor-level-2", "80")
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
  assert.equal(submitted.correction.floor_area_sqm, 180)
  assert.deepEqual(submitted.floorMeasurements, { mode: "individual", areas: [100, 80] })
  assert.equal(submitted.amount, "5000000")
  assert.match(document.querySelector(".office-workflow h1").textContent, /Assess project size/)

  await click(button("Project information & budget"))
  await click(button("Edit project information"))
  assert.equal(document.querySelector("#inquiry-review-floor-level-2").value, "80")
  assert.match(document.querySelector("#inquiry-review-floor_area_sqm-helper").textContent, /Admin: 120 m²/)
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Medium/)
  await click(button("Cancel"))
  await click(button("Continue to assessment"))
  await click(button("Complete assessment"))
  await click(button("Continue to construction phases"))
  await click(button("Continue to staffing"))
  assert.match(document.body.textContent, /Technical requirements · Extensive specialized systems/)
  assert.match(document.body.textContent, /Phase arrangement · Partially overlapping phases/)
  await select("Additional engineering scope", supplemental)
  await click(button("Add scope"))
  assert.deepEqual(staffingRequest.additional_scopes, { Design: [supplemental] })
  assert.match(document.body.textContent, /Power Systems Engineering/)
  assert.equal(button("Send assignment offers").disabled, true)
})
