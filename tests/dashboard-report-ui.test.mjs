import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { activeFixture, currentProject } from "./fixtures.mjs"
import { currentReportMonth } from "../src/monthly-report.ts"
import { buildMonthlyReport, reportPeriod } from "../Thesis-Backend/src/domain/monthly-report.js"
import { buildMonthlySummary } from "../Thesis-Backend/src/domain/monthly-summary.js"

test("Office and Site PM dashboards keep scoped summaries and open monthly reports with nested project details", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const w = dom.window, previous = new Map(), requests = []
  let reportRole = "opm"
  const report = () => buildMonthlyReport({ project: { id: "p4", name: "Authorized project", type: "Commercial", status: "active", created_at: "2020-01-01T00:00:00Z" }, baseline: null, events: [], period: reportPeriod(currentReportMonth()), role: reportRole })
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node,
    sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async url => {
      const path = new URL(String(url), "http://localhost").pathname
      requests.push(path)
      if (path.endsWith("/reports/monthly-summary")) return Response.json({ data: { summary: buildMonthlySummary({ reports: [report()], period: report().period, projection: reportRole === "spm" ? "site" : "staff" }), snapshot: "summary-snapshot" } })
      if (path.endsWith("/projects/p4/monthly-report")) return Response.json({ data: { report: report(), snapshot: "project-snapshot" } })
      throw Error(`Unexpected request: ${path}`)
    } })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  const click = async element => { assert.ok(element); await act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve, 0)) }) }
  const escape = () => act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  try {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    for (const [role, id] of [["opm", "a2"], ["spm", "a4"]]) {
      reportRole = role
      const state = activeFixture(), project = currentProject(state)
      project.name = "Authorized project"
      state.projects = [project, { ...project, id: "private", name: "Foreign private project", opmId: "other-office", team: [], clientId: "other-client" }]
      state.events = []
      const actor = state.accounts.find(account => account.id === id)
      actor.expiry = "2099-01-01"
      const reportRequests = () => requests.filter(path => /monthly-(summary|report)$/.test(path)).length
      const before = reportRequests()
      await act(() => root.render(React.createElement(Workspace, { key: role, state, actor, onCommand: async () => ({ ok: true }), onRead() {}, onMute() {}, onReload() {}, paused: false, idleWarning: false, onResume() {}, onPause() {}, onStayActive() {} })))
      assert.equal(reportRequests(), before, "Report data loads only when requested")
      assert.equal(document.querySelector('.sidebar [aria-label="Reports"]'), null)
      assert.equal(document.querySelectorAll('.executive-summary').length, 1)
      assert.equal(document.querySelectorAll('.executive-metric').length, 4)
      assert.match(document.querySelector('.executive-summary').textContent, /1 active site is assigned to you/)
      assert.doesNotMatch(document.querySelector('main').textContent, /Foreign private project/)
      const monthly = [...document.querySelectorAll('main button')].find(button => button.textContent === "Monthly report")
      monthly.focus()
      await click(monthly)
      const dialog = document.querySelector('[role="dialog"][aria-label="Monthly project report"]')
      assert.ok(dialog)
      assert.equal(dialog.querySelector('h1'), null, "No duplicate Reports page heading")
      assert.equal(dialog.querySelector('input[type="month"]').value, currentReportMonth())
      assert.match(dialog.textContent, /Authorized project/)
      assert.doesNotMatch(dialog.textContent, /Foreign private project/)
      assert.ok([...dialog.querySelectorAll('button')].some(button => button.textContent === "Download PDF"))
      assert.ok(dialog.querySelector('option[value="csv"]'))
      const details = dialog.querySelector('[aria-label="View details for Authorized project"]')
      details.focus()
      await click(details)
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 2)
      await escape()
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, "Escape closes project details first")
      assert.equal(document.activeElement, details)
      assert.equal(document.body.style.overflow, "hidden")
      await escape()
      assert.equal(document.querySelector('[role="dialog"]'), null)
      assert.equal(document.activeElement, monthly)
      assert.equal(document.body.style.overflow, "")
      await click(document.querySelector('.executive-metric'))
      assert.match(document.querySelector('.breadcrumb').textContent, /Active sites/)
      assert.doesNotMatch(document.querySelector('main').textContent, /Foreign private project/)
    }
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
