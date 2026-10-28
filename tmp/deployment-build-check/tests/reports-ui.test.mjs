import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { buildMonthlyReport, reportPeriod } from "../Thesis-Backend/src/domain/monthly-report.js"
import { buildMonthlySummary } from "../Thesis-Backend/src/domain/monthly-summary.js"
import { currentReportMonth } from "../src/monthly-report.ts"

const previousMonth = () => { const [y, m] = currentReportMonth().split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}` }
const summaryFor = (month, role, projection) => {
  const period = reportPeriod(month)
  const source = id => ({ projects: [{ id, project_type_id: 1 }], project_type_stages: [{ project_type_id: 1, project_stage_id: 1, sort_order: 1 }], project_stages: [{ id: 1, code: "Foundation" }], project_phase_checklists: [{ project_id: id, project_stage_id: 1 }], project_phase_checklist_items: [{ id: 1, project_id: id, project_stage_id: 1, weight: 10, required: true }], project_phase_evidence: [{ id: 1, project_id: id, project_stage_id: 1, checklist_item_id: 1, status: "pending" }], pending_rework_requests: [], project_phase_updates: [], project_progress_history: [] })
  const project = (id, name, type) => ({ id, name, type, status: "active", created_at: "2020-01-01T00:00:00Z" })
  const reports = [
    buildMonthlyReport({ project: project("one", "Project One", "Residential"), baseline: { covered_from: "2020-01-01T00:00:00Z", data: source("one") }, events: [], period, role }),
    buildMonthlyReport({ project: project("two", "Project Two", "Commercial"), baseline: null, events: [], period, role }),
  ]
  return { summary: buildMonthlySummary({ reports, period, projection, excludedAfterCutoff: 1 }), snapshot: `snapshot-${month}` }
}

test("Reports opens on the overall monthly summary with filters, exports, retry and project details for the same month", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const saved = new Map(), requests = []
  let mode = "fail", role = ["admin", "staff"], exported
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true, fetch: async (url, init) => {
      requests.push({ url: String(url), init })
      const month = new URL(String(url), "http://x").searchParams.get("month")
      if (String(url).endsWith("/monthly-summary/export")) {
        const body=JSON.parse(init.body)
        const data=summaryFor(currentReportMonth(),...role)
        const {summaryView}=await import("../Thesis-Backend/src/domain/monthly-summary.js")
        return new Response(JSON.stringify({data:body.format==='csv'?{csv:'"Project One"'}:{summary:data.summary,view:summaryView(data.summary,body.filters)}}),{status:200})
      }
      if (String(url).includes("/monthly-summary?")) {
        if (mode === "fail") return new Response(JSON.stringify({ message: "Database unavailable" }), { status: 503 })
        if (mode === "empty") return new Response(JSON.stringify({ data: { summary: { ...summaryFor(month, ...role).summary, rows: [] }, snapshot: "s" } }), { status: 200 })
        return new Response(JSON.stringify({ data: summaryFor(month, ...role) }), { status: 200 })
      }
      return new Response(JSON.stringify({ message: "Report unavailable" }), { status: 403 })
    } })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  URL.createObjectURL = blob => { exported = blob; return "blob:x" }; URL.revokeObjectURL = () => {}
  dom.window.HTMLAnchorElement.prototype.click = function () {}
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)))
  const button = text => [...document.querySelectorAll("button")].find(b => b.textContent === text)
  const setValue = async (element, value) => act(() => {
    const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value)
    element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
  })
  const bodyRows = () => [...document.querySelectorAll(".report-summary-table tbody tr")]
  try {
    const { default: Reports } = await server.ssrLoadModule("/src/Reports.tsx")
    await act(() => root.render(React.createElement(Reports)))
    assert.match(document.body.textContent, /summarizes monthly construction progress, approvals, completed phases, rework, and pending reviews/)
    assert.match(requests[0].url, new RegExp(`/reports/monthly-summary\\?month=${currentReportMonth()}`))
    assert.equal(document.querySelector('input[type="month"]').value, currentReportMonth())
    await settle()
    assert.match(document.querySelector('[role="alert"]').textContent, /Database unavailable/)
    mode = "ok"
    await act(() => button("Try again").click()); await settle()
    assert.equal(requests.filter(r => r.url.includes("/monthly-summary?")).length, 2)

    const text = document.body.textContent
    assert.match(text, /During .*Approval events/)
    assert.match(text, /Outstanding at the reporting cutoff/)
    assert.match(text, /Partial · 1 of 2 projects contributed/)
    assert.match(text, /1 created on or after the cutoff excluded/)
    assert.match(text, /1 pending evidence review: Project One \(1\)/)
    assert.equal(bodyRows().length, 2)
    const two = bodyRows().find(r => r.textContent.includes("Project Two"))
    assert.equal([...two.querySelectorAll("td")].filter(td => td.textContent.startsWith("Unavailable")).length, 7, "missing history is Unavailable, never 0")
    assert.deepEqual([...document.querySelectorAll(".report-summary-table thead th")].map(th => th.textContent).slice(0, 9),
      ["Project", "Type", "Progress at month start", "Progress at cutoff", "Change", "Approval events", "Phases completed", "Confirmed rework", "Pending reviews"])

    await setValue(document.querySelector('input[type="search"]'), "two")
    assert.equal(bodyRows().length, 1)
    assert.match(document.body.textContent, /Showing 1 of 2 projects/)
    await act(() => button("Clear filters").click())
    await setValue([...document.querySelectorAll("select")].find(s => s.querySelector('option[value="pending"]')), "pending")
    assert.deepEqual(bodyRows().map(r => r.querySelector("th").textContent), ["Project One"])
    assert.equal(document.querySelector('.report-export-actions select').value,'pdf')
    await act(async()=>{
      button('Download PDF').click()
      const deadline=Date.now()+15000
      while(exported?.type!=='application/pdf'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20))
    })
    assert.deepEqual(JSON.parse(requests.at(-1).init.body),{snapshot:`snapshot-${currentReportMonth()}`,format:'print',filters:{search:'',type:'',outstanding:'pending'}})
    assert.equal(exported.type,'application/pdf')
    assert.equal(document.querySelector('.monthly-print-frame'),null)
    await setValue(document.querySelector('.report-export-actions select'),'csv')
    await act(() => button("Export CSV").click()); await settle()
    const exportRequest = requests.at(-1)
    assert.match(exportRequest.url, /\/reports\/monthly-summary\/export$/)
    assert.deepEqual(JSON.parse(exportRequest.init.body), { snapshot: `snapshot-${currentReportMonth()}`, format: "csv", filters: { search: "", type: "", outstanding: "pending" } })
    assert.equal(await exported.text(), '"Project One"')

    const past = previousMonth()
    await setValue(document.querySelector('input[type="month"]'), past); await settle()
    assert.match(requests.at(-1).url, new RegExp(`month=${past}`))
    assert.match(document.body.textContent, /Month-end snapshot/)
    await act(() => document.querySelector('button[aria-label="View details for Project One"]').click())
    assert.match(requests.at(-1).url, new RegExp(`/projects/one/monthly-report\\?month=${past}`))
    assert.equal(document.querySelector('[aria-modal="true"] input[type="month"]').value, past)
    await act(() => button("Close").click())
    assert.equal(document.querySelector('[aria-modal="true"]'), null)

    const before = requests.length
    await setValue(document.querySelector('input[type="month"]'), "2099-01"); await settle()
    assert.equal(requests.length, before, "future months are not requested")
    assert.match(document.body.textContent, /Future reporting months are unavailable/)

    role = ["client", "client"]
    await setValue(document.querySelector('input[type="month"]'), currentReportMonth()); await settle()
    assert.doesNotMatch(document.querySelector(".report-summary-table").textContent, /Pending reviews|Approval events|Confirmed rework/)
    assert.equal([...document.querySelectorAll("select")].some(s => s.querySelector('option[value="pending"]')), false)
    assert.doesNotMatch(document.body.textContent, /Outstanding at the reporting cutoff/)

    mode = "empty"
    await act(() => button("Refresh").click()); await settle()
    assert.match(document.body.textContent, /No projects in this report/)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close(); URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  }
})
