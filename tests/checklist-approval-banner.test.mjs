import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { emptyState } from "../src/model.ts"

test("OPM dashboard highlights checklist deadlines, opens the right reviews, and clears resolved items", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  const now = Date.now(), hour = 3_600_000
  const actor = { id: "office", name: "Office PM", role: "opm", status: "active", expiry: "2099-01-01", docs: [], scope: [], projectTypes: [], email: "office@example.test" }
  const item = (id, age, status = "submitted") => ({ id, evidenceId: id, label: `Activity ${id}`, version: 0, status, submittedAt: age === undefined ? undefined : new Date(now - age * hour).toISOString() })
  const project = (id, items, changes = {}) => ({ id, name: `Project ${id}`, phase: "Mobilization", type: "Residential", status: "active", opmId: actor.id, opmAccepted: true,
    progress: 0, start: "2026-01-01", end: "2027-01-01", docs: [], team: [], workflow: { version: 1, checklist: { Mobilization: items }, responses: [], selections: [], notes: [], photos: [] }, ...changes })
  const overdue = project("overdue", [item("old", 73), item("approved", 100, "approved")])
  const soon = project("soon", [item("soon", 60)])
  const later = project("later", [item("later", 1)])
  const undated = project("undated", [item("undated", undefined)])
  const outside = project("outside", [item("outside", 100)], { opmId: "other-opm" })
  const completed = project("completed", [item("completed", 100)], { status: "completed" })
  const opened = []
  try {
    const { default: Banner } = await server.ssrLoadModule("/src/ChecklistApprovalBanner.tsx")
    const projects = [later, soon, outside, completed, undated, overdue]
    const render = async (list = projects, account = actor) => act(() => root.render(React.createElement(Banner, { projects: list, actor: account, now, onReview: p => opened.push(p?.id || "all") })))
    await render()
    const banner = () => document.querySelector('[aria-label="Checklist approval deadlines"], [aria-label="Priority action items"]')
    assert.ok(banner().classList.contains("overdue"))
    assert.match(banner().textContent, /4 checklist activities across 4 projects/)
    assert.match(banner().textContent, /1 overdue/)
    assert.match(banner().textContent, /1 due within 24 hours/)
    assert.deepEqual([...document.querySelectorAll('.checklist-approval-project > div:first-child > strong')].map(el => el.textContent), ["Project overdue", "Project soon", "Project later"])
    assert.doesNotMatch(banner().textContent, /Project outside|Project completed|Activity approved/)
    assert.match(banner().textContent, /1 more project/)
    assert.equal(document.querySelector('time').dateTime, new Date(now - hour).toISOString())
    await act(() => document.querySelector('[aria-label="Review checklist for Project soon"]').click())
    await act(() => document.querySelector('.checklist-approval-heading button').click())
    assert.deepEqual(opened, ["soon", "all"])
    await render([soon])
    assert.ok(!banner().classList.contains("overdue"))
    assert.match(banner().textContent, /1 checklist activity across 1 project is waiting/)
    await render([undated])
    assert.match(banner().textContent, /Submission date unavailable/)
    assert.equal(document.querySelector('time'), null)
    await render([project("resolved", [item("resolved", 100, "approved")])])
    assert.equal(banner(), null)
    await render(projects, { ...actor, role: "spm" })
    assert.equal(banner(), null)

    // The dashboard action must bypass remembered filters and open the selected project's QA/QC queue.
    const { default: RoleWorkspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const { updateListQuery, getListQuery, resetListMemory } = await server.ssrLoadModule("/src/ListControls.tsx")
    const sameName = project("same-name", [item("duplicate", 1)], { name: soon.name })
    const state = { ...emptyState(), accounts: [actor], projects: [overdue, soon, sameName] }
    updateListQuery("opm:review-qa", q => ({ ...q, search: "stale search", filters: { phase: "Design" }, page: 5 }))
    const props = { state, actor, onCommand: async () => ({ ok: true }), onRead: () => {}, onMute: () => {}, paused: false, idleWarning: false,
      onStayActive: () => {}, onResume: () => {}, onPause: () => {}, onReload: () => {} }
    await act(() => root.render(React.createElement(RoleWorkspace, props)))
    assert.ok(banner())
    const metrics = document.querySelector('.executive-summary')
    assert.ok(banner().compareDocumentPosition(metrics) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
    await act(() => document.querySelector('[aria-label="Review checklist for Project soon"]').click())
    assert.equal(document.querySelector('.tabs.standalone .active').textContent, "QA/QC evidence (3)")
    assert.equal(getListQuery("opm:review-qa").search, "")
    assert.deepEqual(getListQuery("opm:review-qa").filters, { project: "soon" })
    assert.equal(getListQuery("opm:review-qa").page, 1)
    assert.match(document.querySelector('.review-evidence-card').textContent, /Activity soon/)
    assert.equal(document.querySelectorAll('.review-evidence-card').length, 1)
    await act(() => [...document.querySelectorAll('.nav-item')].find(el => el.textContent.includes("Dashboard")).click())
    await act(() => document.querySelector('.urgent-banner-heading button').click())
    assert.equal(getListQuery("opm:review-qa").search, "")
    assert.deepEqual(getListQuery("opm:review-qa").filters, {})
    assert.equal(document.querySelectorAll('.review-evidence-card').length, 3)
    // Progress banners also clear stale filters and use IDs when project names match.
    const submission = id => ({ id, version: 1, authorId: "site", submittedAt: new Date(now - 73 * hour).toISOString(), note: `Report for ${id}`, issues: [], priorPhase: "Mobilization", priorProgress: 0, requestedPhase: "Mobilization", requestedProgress: 10 })
    const progress = project("progress", [], { name: "Matching project", workflow: { ...soon.workflow, checklist: {}, pendingUpdate: submission("progress-report") } })
    const otherProgress = project("other-progress", [], { name: progress.name, workflow: { ...progress.workflow, pendingUpdate: submission("other-report") } })
    await act(() => updateListQuery("opm:review-progress", q => ({ ...q, search: "stale search", filters: { phase: "Design" }, page: 5 })))
    await act(() => root.render(React.createElement(RoleWorkspace, { ...props, state: { ...state, projects: [progress, otherProgress] } })))
    await act(() => [...document.querySelectorAll('.nav-item')].find(el => el.textContent.includes("Dashboard")).click())
    await act(() => document.querySelector('.urgent-banner-item').click())
    assert.equal(getListQuery("opm:review-progress").search, "")
    assert.deepEqual(getListQuery("opm:review-progress").filters, { project: "other-progress" })
    assert.equal(getListQuery("opm:review-progress").page, 1)
    assert.match(document.querySelector('.main-content').textContent, /Report for other-report/)
    assert.doesNotMatch(document.querySelector('.main-content').textContent, /Report for progress-report/)
    assert.ok(banner(), "The relevant module retains its priority banner")
    await act(() => root.unmount())
    resetListMemory()
  } finally {
    await act(() => { if (document.getElementById("root")?.childNodes.length) root.unmount() })
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
