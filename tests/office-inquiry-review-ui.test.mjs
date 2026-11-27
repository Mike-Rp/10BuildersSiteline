import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("proposal approval opens mandatory review with live size and inline validation", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const workflowScrolls = []
  window.HTMLElement.prototype.scrollIntoView = function(options) { workflowScrolls.push({ element: this, options }) }
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
  let deferStaffing = false
  let releaseStaffing
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
        if (input.action === "proposal_details") {
          inquiry = { ...inquiry, details: { ...inquiry.details,
            client_decision_date: input.decision_date, client_decision_note: input.decision_note } }
          return Response.json({ data: inquiry })
        }
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
        if (input.phases && deferStaffing) await new Promise(resolve => { releaseStaffing = resolve })
        staffingRequest = input
        const scopes = ["Structural Engineering", "Mechanical", "Acoustic", ...(input.additional_scopes?.Design ?? [])]
        const phases = ["Design", "Foundation", "Structure"]
        return Response.json({ data: {
          phases, estimate: { size: "Medium", end: submitted.end },
          staffing: { assessment_id: "assessment", phases, contract_file_id: inquiry.workflow.signed_contract.id, additional_scopes: input.additional_scopes },
          ...(input.phases && { additional_scope_options: { Design: [supplemental] },
            team: [{ stage: "Design", user_id: "ana", required_specializations: scopes, engineers: [
              { user_id: "ana", assigned_disciplines: ["Structural Engineering"] },
              { user_id: "kurt", assigned_disciplines: ["Mechanical"] }, // Older API recommendation.
            ] }],
            candidates: { Design: [
              { id: "ana", name: "Ana Reyes", qualifiedTags: ["Structural Engineering"], experienceYears: 0 },
              { id: "kurt", name: "Kurt Gonzales", qualifiedTags: ["Mechanical"], experienceYears: 2, licenseByScope: {
                Mechanical: { cutoff: start.slice(0,4) + "-01-20", expiry: start.slice(0,4) + "-02-19" },
              } },
            ], Foundation: [], Structure: [] },
            candidateBlockers: { Foundation: "schedule", Structure: "qualifications" },
            blockedCandidates: { Foundation: [{ id: "blocked", name: "Unavailable Engineer", qualifiedTags: ["Civil"], reason: "schedule" }] },
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
  const enter = async (id, value) => {
    const input = document.getElementById(id)
    if (input.readOnly) await click(input.closest('[data-admin-field]').querySelector('.office-field-edit'))
    await act(() => {
      Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, "value").set.call(input, value)
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
  }
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
  assert.equal(document.querySelector(".office-intake-record-nav").closest(".office-intake-record"), null)
  assert.equal(document.querySelector(".office-intake-record").nextElementSibling, document.querySelector(".office-intake-record-nav"))
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
  const confirmation = () => document.querySelector('[aria-label="Upload signed contract"]')
  await chooseContract("discarded.pdf")
  assert.match(confirmation().textContent, /discarded.pdf/)
  await click(confirmation().querySelector('[aria-label="Close dialog"]'))
  assert.deepEqual(uploadedContracts, [])
  const measurements = document.querySelector('section[aria-labelledby="inquiry-review-measurements"]')
  assert.equal(document.querySelector("#inquiry-review-land_area"), null)
  assert.ok(measurements.closest(".office-review-form"))
  assert.ok(measurements.querySelector(".office-floor-estimate"))
  const editable = document.querySelector(".office-review-form")
  for (const key of ["name", "address", "lot_area", "floor_count"]) {
    const control = document.getElementById("inquiry-review-" + key)
    assert.equal(control.readOnly, true)
    assert.equal(control.disabled, true)
    assert.doesNotMatch(control.closest("[data-admin-field]").textContent, /Provided by Admin|Edit/)
  }
  assert.equal(editable.querySelectorAll(".office-field-edit").length, 0)
  assert.equal(document.getElementById("inquiry-review-reason"), null)
  assert.equal(measurements.querySelectorAll(".office-field-edit").length, 0)
  await click(button("Edit project details"))
  assert.match(document.querySelector(".office-project-details-heading").textContent, /Editing.*Save editing to finish/)
  assert.equal(button("Save editing").disabled, true)
  for (const key of ["name", "address", "lot_area", "floor_count"])
    assert.equal(document.getElementById("inquiry-review-" + key).disabled, false)
  await enter("inquiry-review-name", "Temporary name")
  assert.equal(button("Save editing").disabled, false)
  await click(button("Cancel editing"))
  assert.equal(document.getElementById("inquiry-review-name").value, "Maple Residence")
  assert.equal(document.getElementById("inquiry-review-name").readOnly, true)
  assert.equal(document.getElementById("inquiry-review-name").disabled, true)
  assert.equal(button("Request correction"), undefined)
  await click(button("Edit project details"))
  const immutableAdmin = document.querySelector(".office-admin-submission").textContent
  const clientInfo = editable.querySelector('section[aria-labelledby="inquiry-review-client-information"]')
  assert.match(clientInfo.textContent, /Client information.*Read only/)
  assert.match(clientInfo.textContent, /Client name.*Contact number.*Contact email address/)
  assert.equal(clientInfo.querySelectorAll("input").length, 0)
  const originalPanel = document.querySelector(".office-admin-submission")
  assert.match(originalPanel.textContent, /Admin submission.*View only/)
  assert.equal(originalPanel.querySelector("input"), null)
  const choose = (group, value) => click([...editable.querySelectorAll(`input[name="${group}"]`)].find(radio => radio.value === value))
  for (const group of ["review-technical", "review-arrangement"]) {
    const radios = [...editable.querySelectorAll(`input[name="${group}"]`)]
    assert.ok(radios.length)
    assert.ok(radios.every(radio => !radio.checked && radio.required))
  }
  const liveDuration = () => document.querySelector(".office-review-duration").textContent
  assert.equal(document.querySelector(".office-review-size strong").textContent, "Small")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  await choose("review-technical", "Extensive specialized systems")
  assert.match(liveDuration(), /Select technical requirements and phase arrangement/)
  await choose("review-arrangement", "Highly concurrent phases")
  assert.match(liveDuration(), /75 calendar days.*Moderate/)
  await choose("review-arrangement", "Partially overlapping phases")
  assert.match(liveDuration(), /85 calendar days.*Low/)
  await enter("inquiry-review-floor_count", "3")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /180 m²/)
  assert.match(liveDuration(), /134 calendar days/)
  assert.doesNotMatch(editable.querySelector('label[for="inquiry-review-floor_count"]').closest("[data-admin-field]").textContent, /Edited/)
  await enter("inquiry-review-floor_count", "2")
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.equal(document.activeElement.id, "inquiry-review-budget")
  assert.match(document.querySelector("#inquiry-review-budget-error").textContent, /required/)
  assert.equal(submitted, undefined)

  await enter("inquiry-review-lot_area", "501")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Large/)
  const lotField = document.querySelector("#inquiry-review-lot_area").parentElement
  assert.ok(lotField.classList.contains("office-review-field-changed"))
  assert.doesNotMatch(lotField.textContent, /Edited/)
  assert.doesNotMatch(lotField.textContent, /Admin:/)
  await enter("inquiry-review-lot_area", "94")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /120 m²/)
  assert.match(liveDuration(), /85 calendar days/)
  await enter("inquiry-review-lot_area", "30")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "60")
  assert.match(document.querySelector(".office-floor-review [role='status']").textContent, /Invalid/)
  assert.match(document.querySelector(".office-floor-estimate").textContent, /Pending measurements/)
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.equal(document.activeElement.id, "inquiry-review-area-per-floor")
  assert.equal(submitted, undefined)
  await enter("inquiry-review-lot_area", "100")
  assert.ok(!lotField.classList.contains("office-review-field-changed"))
  await enter("inquiry-review-area-per-floor", "175.5")
  assert.match(document.querySelector(".office-floor-estimate").textContent, /Pending measurements/)
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.match(document.querySelector("#inquiry-review-area-per-floor-error").textContent, /must not exceed the lot area/)
  await enter("inquiry-review-area-per-floor", "90")
  await enter("inquiry-review-lot_area", "94")
  assert.equal(document.querySelector("#inquiry-review-area-per-floor").value, "90")
  await enter("inquiry-review-lot_area", "100")
  await enter("inquiry-review-address", "Updated location")
  await click(button("Save editing"))
  assert.equal(document.getElementById("inquiry-review-address").disabled, true)
  assert.match(document.querySelector(".office-project-details-heading").textContent, /Edits ready.*Save and continue/)
  await select("Floor sizes", "individual")
  await enter("inquiry-review-floor-level-1", "100")
  await enter("inquiry-review-floor-level-2", "")
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.equal(document.activeElement.id, "inquiry-review-floor-level-2")
  assert.match(document.querySelector("#inquiry-review-floor-level-2-error").textContent, /positive floor area/)
  await enter("inquiry-review-floor-level-2", "241")
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.equal(document.activeElement.id, "inquiry-review-floor-level-2")
  assert.match(document.querySelector("#inquiry-review-floor-level-2-error").textContent, /must not exceed the lot area/)
  await enter("inquiry-review-floor-level-2", "80")
  assert.match(document.querySelector(".office-review-size").textContent, /Small → Medium/)
  assert.doesNotMatch(document.querySelector(".office-floor-estimate").textContent, /Admin:/)
  assert.ok(document.querySelector("#inquiry-review-floor-level-2").closest(".office-review-field-changed"))
  assert.match(originalPanel.textContent, /Total floor area \(m²\)120/)
  await enter("inquiry-review-budget", "5000000")
  assert.equal(document.getElementById("inquiry-review-budget").value, "5,000,000")
  assert.equal(button("Save and continue").disabled, true)
  await act(() => document.querySelector("form.office-workflow-form").dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})))
  assert.equal(document.activeElement.id, "inquiry-review-reason")
  const reasonControl = document.getElementById("inquiry-review-reason")
  assert.equal(reasonControl.tagName, "TEXTAREA")
  assert.equal(reasonControl.maxLength, 1000)
  assert.equal(reasonControl.rows, 5)
  await enter("inquiry-review-reason", "   ")
  assert.equal(button("Save and continue").disabled, true)
  assert.equal(reasonControl.getAttribute("aria-invalid"), "true")
  assert.match(document.getElementById("inquiry-review-reason-error").textContent, /Enter a reason/)
  await enter("inquiry-review-reason", "Updated project drawings\nClient confirmed the measurements.")
  assert.equal(document.getElementById("inquiry-review-reason-error"), null)
  assert.equal(button("Save and continue").disabled, false)
  assert.equal(originalPanel.textContent, immutableAdmin, "working edits leave the Admin reference unchanged")
  await click(button("Save and continue"))
  assert.equal(document.querySelector(".office-admin-submission"), null)
  assert.match(immutableAdmin, /Maple Residence/)
  assert.equal(submitted.correction.floor_area_sqm, 180)
  assert.equal(submitted.correction.address, "Updated location")
  assert.deepEqual(submitted.floorMeasurements, { mode: "individual", areas: [100, 80] })
  assert.equal(submitted.amount, "5000000")
  assert.equal(document.querySelector(".office-intake-record h1").textContent, "Maple Residence")
  assert.equal(document.querySelector(".office-intake-section-heading h2").textContent, "Project assessment")
  assert.equal(recordStep("Project assessment").getAttribute("aria-current"), "step")
  assert.equal(document.querySelector(".office-workflow-heading"), null)
  assert.equal(document.querySelector(".office-assessment-size-scale [aria-current]").textContent, "Medium")
  assert.match(document.querySelector(".office-assessment-ring").textContent, /8\s*\/ 15/)
  const complexityCard = document.querySelector('[data-assessment-metric="complexity"]')
  assert.equal(complexityCard.querySelector("select"), null)
  assert.match(complexityCard.querySelector("dl").textContent, /Technical requirements.*Phase arrangement/)
  const scoreBreakdown = complexityCard.querySelector(".office-assessment-basis")
  const scoreToggle = scoreBreakdown.querySelector("summary")
  assert.match(scoreToggle.textContent, /View score breakdown/)
  assert.ok(scoreToggle.querySelector("svg"))
  assert.equal(scoreBreakdown.open, false)
  await click(scoreToggle)
  assert.equal(scoreBreakdown.open, true)
  assert.deepEqual([...scoreBreakdown.querySelectorAll("dd span")].map(value => value.textContent), ["1/3", "2/3", "3/3", "2/3"])
  assert.ok([...scoreBreakdown.querySelectorAll("meter")].every(meter => meter.max === 3))
  await click(scoreToggle)
  assert.equal(scoreBreakdown.open, false)
  assert.ok([...document.querySelectorAll(".office-assessment-basis")].some(node => node.textContent.includes("View duration calculation")))
  assert.ok(document.querySelector('[data-assessment-metric="size"] .office-assessment-toggle summary svg'))
  assert.ok(document.querySelector('[data-assessment-metric="duration"] .office-assessment-toggle summary svg'))

  let verifiedProposalSave = false
  const expectViewableSteps = async () => {
    for (const label of ["Accepted inquiry", "Client proposal", "Project information & budget"]) {
      const step = recordStep(label)
      assert.equal(step.disabled, false)
      await click(step)
      assert.equal(recordStep(label).getAttribute("aria-current"), "step")
      assert.equal(workflowScrolls.at(-1)?.element, document.querySelector(".office-intake-record-nav"))
      assert.equal(workflowScrolls.at(-1)?.options.block, "start")
      assert.equal(document.activeElement, recordStep(label))
      if (label === "Accepted inquiry") assert.equal(button("Edit project information"), undefined)
      if (label === "Client proposal") {
        if (inquiry.workflow.assessment) {
          assert.equal(button("Edit client decision details"), undefined)
          continue
        }
        assert.ok(button("Edit client decision details"))
        await click(button("Edit client decision details"))
        assert.ok(button("Save changes"))
        if (!verifiedProposalSave) {
          const noteInput = document.querySelector(".office-proposal-grid textarea")
          await act(() => {
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(noteInput, "Client selected the proposal")
            noteInput.dispatchEvent(new window.Event("input", { bubbles: true }))
          })
          await click(button("Save changes"))
          assert.match(document.querySelector(".office-proposal-grid").textContent, /Client selected the proposal/)
          verifiedProposalSave = true
        } else await click(button("Cancel editing"))
      }
      if (label === "Project information & budget") {
        if (inquiry.workflow.assessment) {
          assert.equal(button("Edit project information"), undefined)
          assert.equal(Boolean(document.querySelector(".office-reviewed-intake > .office-workflow-card input")), false)
          assert.match(recordStep(label).textContent, /Locked · View only/)
          continue
        }
        assert.ok(button("Edit project information"))
        const audit = document.querySelector(".office-review-audit")
        assert.ok(audit.querySelector("summary svg"))
        assert.deepEqual([...audit.querySelectorAll("thead th")].map(node => node.textContent), ["Field", "Previous value", "New value"])
        assert.match(audit.querySelector("tbody th").textContent, /Total floor area \(m²\)/)
        assert.deepEqual([...audit.querySelectorAll("tbody td")].map(node => node.textContent), ["120", "180"])
        for (const title of ["Client information and schedule", "Budget allocation"]) {
          const section = [...document.querySelectorAll(".office-reviewed-intake details")].find(node => node.querySelector("summary")?.textContent === title)
          assert.equal(section?.open, true, `${title} should open by default`)
        }
        assert.doesNotMatch(document.querySelector(".office-reviewed-intake").textContent, /Update the reviewed schedule/)
        await click(button(inquiry.workflow.assessment ? "View project assessment" : "Continue to project assessment"))
        assert.equal(recordStep("Project assessment").getAttribute("aria-current"), "step")
        await click(recordStep("Project information & budget"))
        await click(button("Edit project information"))
        assert.ok(document.querySelector(".office-review-form"))
        await click(button("Cancel"))
      }
    }
    await click(recordStep("Project assessment"))
    assert.equal(recordStep("Project assessment").getAttribute("aria-current"), "step")
    assert.equal(button("Replace signed contract"), undefined)
  }
  await expectViewableSteps()
  await click(button("← Back"))
  await click(document.querySelector('button[aria-label="Continue project assessment for Maple Residence"]'))
  await expectViewableSteps()
  assert.equal(button("Set up construction phases"), undefined)
  await click(button("Save assessment"))
  assert.equal(inquiry.workflow.assessment, undefined)
  assert.match(document.querySelector('[role="dialog"]').textContent, /cannot edit them after saving/)
  await click(button("Keep reviewing"))
  assert.equal(inquiry.workflow.assessment, undefined)
  await click(button("Save assessment"))
  await click(button("Save and lock"))
  assert.match(document.querySelector('[role="dialog"]').textContent, /All four setup steps are now view only/)
  await click(button("View assessment"))
  assert.equal(button("Save assessment"), undefined)
  assert.doesNotMatch(document.querySelector(".office-workflow-grid.assessment").textContent, /Assessment saved|Assessment completed/)
  const assessmentNotice = [...document.querySelectorAll(".office-workflow-notice")].find(node => node.textContent.includes("Assessment saved"))
  assert.ok(assessmentNotice)
  assert.ok(assessmentNotice.compareDocumentPosition(button("Set up construction phases")) & window.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.equal(button("Edit assessment"), undefined)
  assert.equal(document.querySelector('[data-assessment-metric="complexity"] select'), null)
  await expectViewableSteps()
  assert.ok(button("Upload signed contract"))
  assert.equal(button("Set up construction phases").disabled, true)
  await chooseContract("signed.pdf")
  assert.match(confirmation().textContent, /signed.pdf/)
  assert.deepEqual(uploadedContracts, [])
  await click(button("Upload this file"))
  assert.match(document.querySelector(".inquiry-contract-preview").textContent, /signed.pdf.*Saved to this inquiry/)
  assert.equal(document.querySelector(".inquiry-contract-status").dataset.status, "uploaded")
  assert.equal(document.querySelector(".inquiry-contract-confirmation"), null)
  await click(button("View contract"))
  const savedPreview = document.querySelector('[aria-label="Signed contract preview"]')
  assert.ok(savedPreview.querySelector('object[aria-label="Signed contract PDF"]'))
  await click(savedPreview.querySelector('[aria-label="Close dialog"]'))
  assert.equal(document.querySelector(".office-intake-record h1").textContent, "Maple Residence")
  assert.equal(document.querySelector(".office-workflow-heading"), null)
  assert.equal(button("Set up construction phases").disabled, false)
  await click(button("Set up construction phases"))
  assert.equal(document.querySelector('input[type="file"]'), null)
  deferStaffing = true
  await click(button("Confirm and continue to staffing"))
  const preparingButton = button("Preparing staffing…")
  assert.ok(preparingButton)
  assert.equal(preparingButton.disabled, true)
  assert.equal(preparingButton.getAttribute("aria-busy"), "true")
  assert.ok(preparingButton.querySelector(".inquiry-action-spinner"))
  assert.equal(button("Back to assessment").disabled, true)
  deferStaffing = false
  await act(async () => { releaseStaffing() })
  assert.equal(button("Preparing staffing…"), undefined)
  assert.deepEqual(uploadedContracts, ["signed.pdf"])
  assert.equal(staffingRequest.contract_file_id, inquiry.workflow.signed_contract.id)
  assert.match(document.body.textContent,/One suggested Site PM per phase/)
  assert.equal(document.querySelectorAll(".inquiry-engineers article").length,1)
  assert.doesNotMatch(document.body.textContent, /Peak staffing|Site PMs? needed at the same time/)
  assert.equal(document.querySelector(".inquiry-lineup-table"), null)
  assert.equal(button("Send assignment offers"), undefined)
  await click(button("Preview SPM lineup"))
  assert.equal(document.querySelector(".inquiry-stepper [aria-current='step']").textContent, "4Preview SPM lineup")
  assert.match(document.querySelector(".inquiry-lineup-table tbody tr:first-child").textContent, /Ana Reyes.*0 years.*Lead SPM/)
  assert.equal(button("Send assignment offers").disabled, true)
  assert.ok(document.getElementById("inquiry-preview-issues"))
  await click(button("Back to staffing"))
  assert.match(document.querySelector(".inquiry-engineers").textContent, /Ana Reyes/)
  assert.match(document.querySelector(".inquiry-staffing").textContent, /Phase dates needed to check license coverage/)
  assert.match(document.querySelector(".inquiry-coverage-warning").textContent, /No eligible Site PM found for Acoustic.*meets its minimum coverage of 1/)
  const staffingTabs = [...document.querySelectorAll(".inquiry-phase-nav button")]
  assert.equal(document.querySelector(".inquiry-lineup-table"), null)
  assert.equal(staffingTabs[0].dataset.staffingIssue, "false")
  for (const [tab, phase] of [[staffingTabs[1], "Foundation"], [staffingTabs[2], "Structure"]]) {
    assert.equal(tab.dataset.staffingIssue, "true")
    assert.match(tab.textContent, new RegExp(`${phase}.*No eligible engineer available`))
  }
  assert.doesNotMatch(document.body.textContent, /Phases that need staffing review/)
  await click(staffingTabs[1])
  assert.equal(staffingTabs[1].getAttribute("aria-pressed"), "true")
  assert.match(document.querySelector(".inquiry-intake [role='status']").textContent, /Foundation.*schedule conflicts/)
  assert.doesNotMatch(document.querySelector(".inquiry-intake").textContent, /Unavailable matches|Unavailable Engineer/)
  assert.equal(button("Send assignment offers"), undefined)
  await click(staffingTabs[0])
  assert.match(document.body.textContent, /Technical requirements · Extensive specialized systems/)
  assert.match(document.body.textContent, /Phase arrangement · Partially overlapping phases/)
  assert.equal(button("Add scope"), undefined)
  assert.equal(document.querySelector(".inquiry-phase-coverage select"), null)
  assert.equal(document.querySelector(".inquiry-engineer-card select"), null)
  await click(document.querySelector('button[aria-label="Edit Ana Reyes"]'))
  assert.ok(document.querySelector(".inquiry-engineer-card select"))
  await click(button("Cancel editing"))
  assert.equal(document.querySelector(".inquiry-engineer-card select"), null)
  await click(document.querySelector('button[aria-label="Edit Ana Reyes"]'))
  await click(button("Save changes"))
  assert.equal(document.querySelector(".inquiry-engineer-card select"), null)
  await click(document.querySelector('button[aria-label="Remove Ana Reyes"]'))
  assert.ok(document.querySelector('[role="dialog"][aria-label="Remove engineer?"]'))
  assert.equal(document.querySelectorAll(".inquiry-engineer-card").length, 1)
  await click(button("Keep engineer"))
  assert.equal(document.querySelectorAll(".inquiry-engineer-card").length, 1)
  await click(document.querySelector('button[aria-label="Remove Ana Reyes"]'))
  await click(button("Remove engineer"))
  assert.equal(document.querySelectorAll(".inquiry-engineer-card").length, 0)
  await click(button("Assign engineer"))
  await select("Add SPM to phase", "ana")
  assert.equal(document.querySelectorAll(".inquiry-engineer-card").length, 1)
  assert.equal(button("Send assignment offers"), undefined)
  const setupDialog = () => document.querySelector('[role="dialog"][aria-label="Project setup"]')
  await click(setupDialog().querySelector('[aria-label="Close dialog"]'))
  assert.ok(document.querySelector('[role="dialog"][aria-label="Are you sure you want to leave?"]'))
  await click(button("Continue editing"))
  assert.ok(setupDialog())
  assert.match(document.querySelector(".inquiry-engineer-header").textContent, /Ana Reyes/)
  await act(() => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  assert.ok(button("Discard changes"))
  await click(button("Discard changes"))
  assert.equal(setupDialog(), null)
  assert.ok(button("Set up construction phases"))
  await click(button("Set up construction phases"))
  assert.equal(document.querySelector(".inquiry-staffing"), null)
  assert.ok(button("Confirm and continue to staffing"))
})
