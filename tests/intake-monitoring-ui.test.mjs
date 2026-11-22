import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("frontend follows server decisions for company allocation and independent phase responsibilities", { timeout: 90000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const prior = new Map()
  const office = { id: "office", role: "opm", name: "Office PM" }
  const responsibility = (id, name, scope, parallel = false) => ({
    id, user_id: id, name, scopes: [scope], assignment_status: "confirmed", upload_access: parallel ? "parallel" : "locked",
    can_approve_parallel_uploads: !parallel, blocker: parallel ? undefined : "Waiting for overlap approval",
    items: [{ id: "42", title: "Inspection and Testing Records", status: "missing", can_submit: parallel, can_review: true },
      { id: "43", title: "Final checklist item", status: "missing", can_submit: false, can_review: false, blocker: "Waiting for full Envelope checklist approval" }],
  })
  const ana = responsibility("ana", "Ana Santos", "Electrical Installation")
  const ben = responsibility("ben", "Ben Cruz", "Mechanical Building Services")
  const joel = responsibility("joel", "Joel Lim", "Fire Alarm", true)
  const allocation = {
    version: 1, revision: 1, status: "awaiting_decision", company: { id: "first", name: "Harborline Builders" }, history: [],
    can_record_decision: true, can_reallocate: false, can_upload_agreement: false,
  }
  const monitoring = {
    version: 1, arrangement: "Highly concurrent phases", active_checklist: { approved: 2, required: 3 },
    turnover: { can_confirm: false, stage_id: "envelope", blocker: "One required Envelope item remains" },
    phases: [{ name: "Envelope / Curtain Wall", status: "active", responsibilities: [] },
      { name: "MEP Rough-In", status: "upcoming", responsibilities: [ana, ben] },
      { name: "Fire & Life Safety", status: "upcoming", responsibilities: [joel] }],
  }
  const project = { id: "project", phase: "Envelope / Curtain Wall", status: "active", opmId: office.id, docs: [], projectCompanyAllocation: allocation, overlapMonitoring: monitoring }
  const requests = []
  const respond = data => Response.json({ data })
  const totals = { phase: { earned: 20, total: 30, percentage: 67 }, project: { earned: 20, total: 100, percentage: 20 } }
  const fetch = async (url, init) => {
    const path = new URL(String(url), window.location.href).pathname
    const json = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    requests.push({ path, json })
    if (path.endsWith("/project-company-allocation")) {
      assert.equal(json.expected_revision, allocation.revision++)
      assert.equal(json.company_id, allocation.company.id)
      if (json.action === "reallocate") {
        allocation.company = { id: "second", name: "Northgate Construction" }
        Object.assign(allocation, { status: "awaiting_decision", can_record_decision: true, can_reallocate: false })
      } else {
        const accepted = json.action === "accept"
        const decision = accepted ? "accepted" : "declined"
        allocation.history.push({ id: allocation.company.id, company_name: allocation.company.name, decision })
        Object.assign(allocation, { status: decision, can_record_decision: false, can_reallocate: !accepted, can_upload_agreement: accepted })
      }
      return respond(allocation)
    }
    if (path.endsWith("/parallel-upload-approvals")) {
      assert.equal(json.expected_active_stage_id, "envelope")
      const row = [ana, ben].find(row => row.id === json.responsibility_id)
      Object.assign(row, { upload_access: "parallel", can_approve_parallel_uploads: false, blocker: undefined })
      row.items[0].can_submit = true
      return respond({})
    }
    if (path.endsWith("/review-preview")) return respond({ activity: "Inspection and Testing Records", phase_name: "MEP Rough-In", review_token: "fresh", before: totals, after: totals })
    if (path.endsWith("/evidence-history")) return respond([])
    if (path.endsWith("/files/upload-url")) return respond({ mode: "database" })
    if (path.endsWith("/files")) return respond({})
    if (path.endsWith("/phase-files")) return respond({ file: { id: `file-${json.responsibility_id}` } })
    if (path.endsWith("/checklist-items/42/submit")) {
      const row = [ana, ben, joel].find(row => row.id === json.responsibility_id)
      assert.deepEqual(json.file_ids, [`file-${row.id}`])
      Object.assign(row.items[0], { status: "submitted", can_submit: false, evidence_id: `evidence-${row.id}` })
      return respond({})
    }
    if (path.endsWith("/evidence/evidence-ben/reject")) {
      assert.equal(json.expected_review_token, "fresh")
      Object.assign(ben.items[0], { status: "rework_required", can_submit: true, review_note: json.review_note })
      return respond({})
    }
    if (path.endsWith("/advance-phase")) {
      assert.equal(json.expected_stage_id, "envelope")
      project.phase = "MEP Rough-In"
      monitoring.phases[0].status = "completed"
      monitoring.phases[1].status = "active"
      monitoring.turnover = { stage_id: "mep", can_confirm: false }
      return respond({ advanced: true })
    }
    throw new Error(`Unexpected request ${path}`)
  }
  for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true, fetch })) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
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
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const { default: Company } = await server.ssrLoadModule("/src/ProjectCompanyAllocation.tsx")
  const { default: Phase } = await server.ssrLoadModule("/src/PhaseOverlapPanel.tsx")
  const { sendApiWorkflow } = await server.ssrLoadModule("/src/api/actions.ts")
  const button = (label, within = document) => [...within.querySelectorAll("button")].find(node => node.textContent.trim() === label)
  const click = node => act(() => node.click())
  const body = () => document.getElementById("root").textContent
  const showCompany = (readOnly = false) => root.render(React.createElement(Company, { project, readOnly, onReload: () => showCompany(), onAgreement: async () => true }))
  await act(() => showCompany(true))
  assert.equal(button("Record accepted"), undefined)
  await act(() => showCompany())
  await click(button("Record declined"))
  await click(button("Reallocate to next company"))
  assert.match(body(), /Northgate Construction.*Awaiting company decision/)
  await click(button("Record accepted"))
  assert.match(body(), /Accepted and locked/)
  assert.ok(document.querySelector('[aria-label="Upload signed subcontractor agreement"]'))

  let actor = office
  const showPhase = () => root.render(React.createElement(Phase, { project, actor, onReload: showPhase, onCommand: async command => {
    await sendApiWorkflow({ projects: [project] }, actor, command)
    showPhase()
    return true
  } }))
  const selectPhase = name => act(() => {
    const select = document.querySelector("select")
    select.value = name
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
  await act(showPhase)
  assert.match(body(), /Overlap review suggested/)
  assert.ok(button("Confirm phase turnover").disabled)
  await selectPhase("MEP Rough-In")
  for (const row of [ana, ben]) await click(button("Approve parallel uploads", document.querySelector(`[aria-label="${row.name} responsibilities"]`)))
  assert.match(body(), /Official turnover pending.*Parallel uploads open.*Parallel uploads open/)

  for (const row of [ana, ben, joel]) {
    actor = { id: row.id, role: "spm", name: row.name }
    await act(showPhase)
    const file = document.querySelector('input[aria-label="Submit evidence for Inspection and Testing Records"]')
    assert.ok(file)
    assert.equal(document.querySelector('input[aria-label="Submit evidence for Final checklist item"]'), null)
    Object.defineProperty(file, "files", { value: [new File(["sample"], "evidence.pdf", { type: "application/pdf" })] })
    await act(() => file.dispatchEvent(new window.Event("change", { bubbles: true })))
    await click(button("Confirm upload"))
    assert.equal(row.items[0].status, "submitted", body())
  }
  assert.deepEqual(requests.filter(request => request.path.endsWith("/phase-files")).map(request => request.json.responsibility_id), ["ana", "ben", "joel"])
  actor = office
  await act(showPhase)
  await selectPhase("MEP Rough-In")
  await click(button("Review evidence", document.querySelector('[aria-label="Ben Cruz responsibilities"]')))
  await click(button("Reject"))
  const reason = document.querySelector("textarea")
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(reason, "Add the missing test result.")
    reason.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  await click(button("Confirm rejection"))
  const confirmation = [...document.querySelectorAll('[role="dialog"]')].at(-1)
  await click(button("Yes", confirmation))
  assert.equal(ben.items[0].status, "rework_required")
  assert.equal(ana.items[0].status, "submitted")
  assert.equal(joel.items[0].status, "submitted")
  assert.ok(button("Confirm phase turnover").disabled)
  monitoring.active_checklist.approved = 3
  Object.assign(monitoring.turnover, { can_confirm: true, blocker: undefined })
  for (const row of [ana, ben, joel]) Object.assign(row.items[1], { can_submit: true, blocker: undefined })
  actor = { id: ana.id, role: "spm", name: ana.name }
  await act(showPhase)
  assert.ok(document.querySelector('input[aria-label="Submit evidence for Final checklist item"]'))
  monitoring.arrangement = "Sequential phases"
  await act(showPhase)
  assert.equal(document.querySelector('input[aria-label="Submit evidence for Final checklist item"]'), null)
  monitoring.arrangement = "Partially overlapping phases"
  joel.upload_access = "locked"
  actor = { id: joel.id, role: "spm", name: joel.name }
  await act(showPhase)
  assert.equal(document.querySelector('input[aria-label="Submit evidence for Final checklist item"]'), null)
  actor = office
  await act(showPhase)
  await click(button("Confirm phase turnover"))
  assert.match(body(), /Official active phase · MEP Rough-In/)
  assert.match(body(), /Returned for revision/)
  assert.match(body(), /Awaiting review/)
})
