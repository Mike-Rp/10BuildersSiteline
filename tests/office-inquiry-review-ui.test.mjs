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
  const uploadedContracts = []
  const supplemental = "Power Systems Engineering"
  const globals = new Map()
  for (const [key, value] of Object.entries({
    window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, init) => {
      const path = String(url)
      if (path.endsWith("/files/upload-url")) return Response.json({ data: { mode: "database" } })
      if (path.endsWith("/files")) {
        uploadedContracts.push(init.body.get("file").name)
        return Response.json({ data: {} })
      }
      if (path.endsWith(`/files/${inquiry.workflow?.signed_contract?.id}/content`))
        return new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } })
      if (path.endsWith("/decision")) {
        assert.equal(JSON.parse(init.body).action, "approve")
        inquiry = { ...inquiry, status: "approved" }
        return Response.json({ data: inquiry })
      }
      if (path.endsWith("/workflow")) {
        const input = JSON.parse(init.body)
        if (input.action === "contract") {
          assert.equal(input.expected_contract_file_id, inquiry.workflow?.signed_contract?.id ?? null)
          inquiry = { ...inquiry, workflow: { ...inquiry.workflow,
            signed_contract: { id: input.contract_file_id, name: uploadedContracts.at(-1) } } }
          return Response.json({ data: inquiry })
        }
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
            ...inquiry.workflow,
            budget: Number(submitted.amount), review: { ...submitted, version: 1 },
            review_history: [{ version: 1, at: start, reason: submitted.reason, changes: { floor_area_sqm: { before: 120, after: 180 } } }],
          },
        }
        return Response.json({ data: inquiry })
      }
      if (path.endsWith("/planning")) {
        const input = JSON.parse(init.body)
        staffingRequest = input
        const scopes = ["Structural Engineering", "Mechanical", "Acoustic", ...(input.additional_scopes?.Design ?? [])]
        return Response.json({ data: {
          phases: ["Design"], estimate: { size: "Medium", end: submitted.end },
          staffing: { assessment_id: "assessment", phases: ["Design"], contract_file_id: inquiry.workflow.signed_contract.id, additional_scopes: input.additional_scopes },
          ...(input.phases && { additional_scope_options: { Design: [supplemental] },
            team: [{ stage: "Design", user_id: "ana", required_specializations: scopes, engineers: [
              { user_id: "ana", assigned_disciplines: ["Structural Engineering"] },
              { user_id: "kurt", assigned_disciplines: ["Mechanical"] },
            ] }],
            candidates: { Design: [
              { id: "ana", name: "Ana Reyes", qualifiedTags: ["Structural Engineering"], experienceYears: 0 },
              { id: "kurt", name: "Kurt Gonzales", qualifiedTags: ["Mechanical"], experienceYears: 2 },
            ] },
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
  const recordStep = label => [...document.querySelectorAll(".office-intake-record-nav button")]
    .find(item => item.querySelector("strong").textContent === label)
  assert.equal(document.querySelector(".office-intake-record h1").textContent, "Maple Residence")
  assert.equal(recordStep("Client proposal").getAttribute("aria-current"), "step")
  assert.equal(recordStep("Project information & budget").disabled, true)
  assert.equal(recordStep("Project assessment").disabled, true)
  assert.equal(document.querySelectorAll(".office-proposal-grid > .office-workflow-card").length, 2)
  await click(recordStep("Accepted inquiry"))
  assert.equal(document.querySelectorAll(".record-cards > .office-workflow-card").length, 2)
  assert.doesNotMatch(document.querySelector(".record-cards").textContent, /Land area/i)
  await click(button("Open client proposal"))
  await click(button("Mark proposal approved"))
  assert.match(document.querySelector(".office-review-toast").textContent, /Proposal approved/)
  const chooseContract = name => act(async () => {
    const input = document.querySelector('input[aria-label="Signed client contract file"]')
    Object.defineProperty(input, "files", { value: [new File(["contract"], name, { type: "application/pdf" })], configurable: true })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
  const confirmation = () => document.querySelector('[aria-label="Confirm signed contract"]')
  await chooseContract("discarded.pdf")
  assert.match(confirmation().textContent, /discarded.pdf/)
  await click(confirmation().querySelector('[aria-label="Close dialog"]'))
  assert.deepEqual(uploadedContracts, [])
  const measurements = document.querySelector('section[aria-labelledby="inquiry-review-measurements"]')
  assert.equal(document.querySelector("#inquiry-review-land_area"), null)
  assert.ok(measurements.closest(".office-review-form"))
  assert.ok(measurements.querySelector(".office-floor-estimate"))
  const editable = document.querySelector(".office-review-form")
  const clientInfo = editable.querySelector("header + details")
  const clientSummary = clientInfo.querySelector("summary")
  assert.equal(clientSummary.textContent, "Client information")
  assert.ok(clientSummary.querySelector(".office-review-disclosure-icon svg"))
  assert.equal(clientInfo.open, false)
  await click(clientSummary)
  assert.equal(clientInfo.open, true)
  await click(clientSummary)
  assert.equal(clientInfo.open, false)
  const originalPanel = document.querySelector(".office-admin-submission")
  assert.match(originalPanel.textContent, /Admin submission.*Read only/)
  assert.equal(originalPanel.querySelector("input"), null)
  const choose = (group, value) => click([...editable.querySelectorAll(`input[name="${group}"]`)].find(radio => radio.value === value))
  const liveDuration = () => document.querySelector(".office-review-duration").textContent
  assert.equal(document.querySelector(".office-review-size strong").textContent, "Small")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  await choose("review-technical", "Extensive specialized systems")
  assert.match(liveDuration(), /94 calendar days.*Low/)
  await choose("review-arrangement", "Highly concurrent phases")
  assert.match(liveDuration(), /75 calendar days.*Moderate/)
  await choose("review-arrangement", "Partially overlapping phases")
  assert.match(liveDuration(), /85 calendar days.*Moderate/)
  await enter("inquiry-review-floor_count", "3")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /180 m²/)
  assert.match(liveDuration(), /158 calendar days/)
  assert.match(editable.querySelector('label[for="inquiry-review-floor_count"]').textContent, /Edited/)
  await enter("inquiry-review-floor_count", "2")
  assert.equal(button("Save and continue").disabled, false)
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-budget")
  assert.match(document.querySelector("#inquiry-review-budget-error").textContent, /required/)
  assert.equal(submitted, undefined)

  await enter("inquiry-review-lot_area", "501")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  const lotField = document.querySelector("#inquiry-review-lot_area").parentElement
  assert.ok(lotField.classList.contains("office-review-field-changed"))
  assert.match(lotField.textContent, /Edited/)
  assert.doesNotMatch(lotField.textContent, /Admin:/)
  await enter("inquiry-review-lot_area", "94")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m²/)
  assert.match(liveDuration(), /85 calendar days/)
  await enter("inquiry-review-lot_area", "50")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "")
  assert.match(document.querySelector("#inquiry-review-area-per-floor-hint").textContent, /Enter the actual area per floor/)
  assert.match(document.querySelector(".office-floor-estimate").textContent, /Pending measurements/)
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-area-per-floor")
  assert.equal(submitted, undefined)
  await enter("inquiry-review-lot_area", "100")
  assert.ok(!lotField.classList.contains("office-review-field-changed"))
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
  assert.doesNotMatch(document.querySelector(".office-floor-estimate").textContent, /Admin:/)
  assert.ok(document.querySelector("#inquiry-review-floor-level-2").closest(".office-review-field-changed"))
  assert.match(originalPanel.textContent, /Total floor area \(m²\)120/)
  await enter("inquiry-review-budget", "5000000")
  assert.equal(document.getElementById("inquiry-review-budget").value, "5,000,000")
  await click(button("Save and continue"))
  assert.equal(document.activeElement.id, "inquiry-review-reason")
  await enter("inquiry-review-reason", "Updated project drawings")
  await click(button("Save and continue"))
  assert.equal(submitted.correction.floor_area_sqm, 180)
  assert.deepEqual(submitted.floorMeasurements, { mode: "individual", areas: [100, 80] })
  assert.equal(submitted.amount, "5000000")
  assert.equal(document.querySelector(".office-intake-record h1").textContent, "Maple Residence")
  assert.equal(document.querySelector(".office-intake-section-heading h2").textContent, "Project assessment")
  assert.equal(recordStep("Project assessment").getAttribute("aria-current"), "step")
  assert.equal(document.querySelector(".office-workflow-heading"), null)
  assert.equal(document.querySelector(".office-assessment-size-scale [aria-current]").textContent, "Medium")
  assert.match(document.querySelector(".office-assessment-ring").textContent, /9\s*\/ 15/)
  const scoreBreakdown = document.querySelector(".office-assessment-basis")
  assert.match(scoreBreakdown.textContent, /View score breakdown/)
  assert.deepEqual([...scoreBreakdown.querySelectorAll("dd span")].map(value => value.textContent), ["1/3", "2/3", "1/3", "3/3", "2/3"])
  assert.ok([...scoreBreakdown.querySelectorAll("meter")].every(meter => meter.max === 3))
  assert.ok([...document.querySelectorAll(".office-assessment-basis")].some(node => node.textContent.includes("View duration calculation")))

  const expectLockedSteps = async () => {
    for (const label of ["Accepted inquiry", "Client proposal", "Project information & budget"]) {
      const step = recordStep(label)
      assert.equal(step.disabled, true)
      assert.match(step.textContent, /Complete · Locked/)
      await click(step)
    }
    assert.equal(recordStep("Project assessment").getAttribute("aria-current"), "step")
    assert.equal(button("Edit project information"), undefined)
    assert.equal(button("Replace signed contract"), undefined)
  }
  await expectLockedSteps()
  await click(button("← Project inquiries"))
  await click(document.querySelector('button[aria-label="Continue project assessment for Maple Residence"]'))
  await expectLockedSteps()
  await click(button("Complete assessment"))
  await expectLockedSteps()
  assert.ok(button("Upload signed contract"))
  assert.equal(button("Continue to construction phases"), undefined)
  await chooseContract("signed.pdf")
  assert.match(confirmation().textContent, /signed.pdf/)
  assert.deepEqual(uploadedContracts, [])
  await click(button("Confirm this file"))
  assert.match(document.querySelector(".inquiry-contract-preview").textContent, /signed.pdf.*Contract confirmed/)
  await click(button("View contract"))
  const savedPreview = document.querySelector('[aria-label="Signed contract preview"]')
  assert.ok(savedPreview.querySelector('object[aria-label="Signed contract PDF"]'))
  await click(savedPreview.querySelector('[aria-label="Close dialog"]'))
  assert.equal(document.querySelector(".office-intake-record h1").textContent, "Maple Residence")
  assert.equal(document.querySelector(".office-workflow-heading"), null)
  await click(button("Continue to construction phases"))
  assert.equal(document.querySelector('input[type="file"]'), null)
  await click(button("Continue to staffing"))
  assert.deepEqual(uploadedContracts, ["signed.pdf"])
  assert.equal(staffingRequest.contract_file_id, inquiry.workflow.signed_contract.id)
  assert.match(document.querySelector(".inquiry-lineup-table tbody tr:first-child").textContent, /Kurt Gonzales.*2 years.*Lead SPM/)
  assert.match(document.querySelector(".inquiry-coverage-warning").textContent, /No eligible Site PM found for Acoustic.*meets its minimum coverage of 2/)
  assert.match(document.body.textContent, /Technical requirements · Extensive specialized systems/)
  assert.match(document.body.textContent, /Phase arrangement · Partially overlapping phases/)
  await select("Additional engineering scope", supplemental)
  await click(button("Add scope"))
  assert.deepEqual(staffingRequest.additional_scopes, { Design: [supplemental] })
  assert.match(document.body.textContent, /Power Systems Engineering/)
  assert.equal(button("Send assignment offers").disabled, true)
})
