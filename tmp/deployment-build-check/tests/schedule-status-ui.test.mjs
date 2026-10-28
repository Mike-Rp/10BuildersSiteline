import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { initialState } from "./fixtures/demo-state.ts"
import { localScheduleDate, projectScheduleStatus } from "../src/domain/schedule-status.ts"
import { clientProjectViews } from "../src/client-access.ts"

test("schedule badges, delayed filters, role navigation and view-only notices use authorized loaded records", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  const click = async label => {
    const button = [...document.querySelectorAll("button")].find(el => el.getAttribute("aria-label") === label || el.textContent.trim() === label)
    assert.ok(button, `Missing button: ${label}`)
    await act(() => button.click())
  }
  const render = async (Component, props, key = Component.name) => act(() => root.render(React.createElement(Component, { ...props, key })))
  try {
    const { default: Badge, ProjectScheduleDetails, DelayedProjectNotice } = await server.ssrLoadModule("/src/ScheduleStatus.tsx")
    const { default: ActiveSites } = await server.ssrLoadModule("/src/ActiveSites.tsx")
    const { default: AdminDashboard } = await server.ssrLoadModule("/src/AdminDashboard.tsx")
    const { default: RoleWorkspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const { default: ClientPortal } = await server.ssrLoadModule("/src/ClientPortal.tsx")
    const { default: PlannedTimeline } = await server.ssrLoadModule("/src/PlannedTimeline.tsx")
    const today = "2026-10-27"
    const projects = Array.from({ length: 12 }, (_, i) => ({ id: `authorized-${i}`, name: `Project ${String(i).padStart(2, "0")}`, type: "Commercial", phase: "Structure", status: "active", start: "2026-01-01", end: i < 10 ? "2026-10-26" : "2099-01-01", progress: 100 }))
    const completed = { ...projects[0], id: "completed", name: "Completed record", status: "completed" }
    const snapshot = structuredClone(projects)
    await render(ProjectScheduleDetails, { project: projects[0], today })
    assert.match(document.body.textContent, /DelayedTarget completion: Oct 26, 20261 day overdue/)
    assert.ok(document.querySelector('[data-schedule-status="Delayed"] svg'))
    await render(Badge, { project: completed, today })
    assert.equal(document.querySelector('[data-schedule-status]').textContent, "Completed")
    await render(DelayedProjectNotice, { project: completed, today })
    assert.equal(document.querySelector('.schedule-delay-notice'), null)
    await render(ProjectScheduleDetails, { project: { ...projects[0], end: undefined }, today })
    assert.match(document.body.textContent, /No target dateTarget completion: No target date/)
    await render(PlannedTimeline, { project: { ...projects[0], end: "2020-01-01" } })
    assert.equal(document.querySelector('[data-schedule-status]').textContent, "Delayed", "100% does not establish completion")
    assert.match(document.querySelector('.timeline-range').textContent, /Jan 1, 2020/)
    assert.doesNotMatch(document.querySelector('.timeline-range').textContent, /End date not set/)

    await render(ActiveSites, { projects: [...projects, completed], onOpen() {}, today })
    assert.equal(document.querySelectorAll('.as-card').length, 9)
    assert.doesNotMatch(document.querySelector('.active-sites').textContent, /Completed record/)
    await click("Next")
    assert.match(document.querySelector('.as-pagination').textContent, /Page 2 of 2/)
    await click("Delayed")
    assert.equal(document.querySelectorAll('.as-card').length, 9)
    assert.match(document.querySelector('.as-results p').textContent, /of 10 projects/)
    assert.match(document.querySelector('.as-pagination').textContent, /Page 1 of 2/)
    assert.ok([...document.querySelectorAll('[data-schedule-status]')].every(el => el.textContent === "Delayed"))
    await click("List")
    assert.equal(document.querySelectorAll('.as-list tbody tr').length, 9)
    assert.match(document.querySelector('.as-list tbody').textContent, /Delayed1 day overdueOct 26, 2026/)
    await click("Clear filters")
    assert.equal(document.querySelector('.as-schedule-filter button').getAttribute("aria-pressed"), "false")
    await render(ActiveSites, { projects: [completed, projects[11]], today, initialScheduleFilter: "delayed", onOpen() {} }, "empty-delayed")
    assert.match(document.body.textContent, /No delayed projects/)
    assert.equal(document.querySelectorAll('.as-card').length, 0)
    assert.deepEqual(projects, snapshot)

    let openedDelayed = 0
    await render(AdminDashboard, { overview: { activeProjects: 12, intakeProjects: 0, teamAccounts: 0, items: [] }, delayedCount: 10,
      onDelayedProjects() { openedDelayed++ }, onNavigate() {}, onOpen() {}, onNewIntake() {}, onActivity() {} })
    await click("Delayed projects (10)")
    assert.equal(openedDelayed, 1)
    assert.ok(document.querySelector('[aria-label="1 attention items"]'))
    assert.doesNotMatch(document.querySelector('.ao-panel').textContent, /Nothing waiting for attention/)

    const state = initialState(), office = state.accounts.find(a => a.id === "a2"), site = state.accounts.find(a => a.id === "a6")
    const late = { ...state.projects.find(p => p.id === "p1"), name: "Authorized late project", start: "2020-01-01", end: "2020-02-01" }
    const foreign = { ...late, id: "foreign", name: "Foreign private project", opmId: "other-opm", team: [], clientId: "other-client" }
    state.projects = [late, foreign, { ...late, id: "done", name: "Completed owned project", status: "completed" }]
    const before = structuredClone(state)
    const props = { state, actor: office, onCommand: () => { throw Error("Schedule UI must not save") }, onRead() {}, onMute() {}, paused: false, idleWarning: false, onStayActive() {}, onResume() {}, onPause() {}, onReload() {} }
    await render(RoleWorkspace, props, "office")
    await click("Delayed projects (1)")
    assert.equal(document.querySelector('.as-schedule-filter button').getAttribute("aria-pressed"), "true")
    assert.equal(document.querySelectorAll('.as-card').length, 1)
    assert.match(document.querySelector('.as-card').textContent, /Authorized late project/)
    assert.doesNotMatch(document.querySelector('.main-content').textContent, /Foreign private project|Completed owned project/)
    await click("View Project Details")
    assert.match(document.querySelector('[role="dialog"] [aria-label="Project schedule"]').textContent, /DelayedTarget completion: Feb 1, 2020/)
    await click("Close dialog")

    const style = document.createElement("style")
    style.textContent = await readFile(new URL("../src/schedule-status.css", import.meta.url), "utf8")
    document.head.append(style)
    await render(RoleWorkspace, { ...props, actor: site }, "site")
    const expected = projectScheduleStatus(late, localScheduleDate()).daysOverdue
    const notice = document.querySelector('.schedule-delay-notice')
    assert.equal(notice.textContent, `This project passed its target completion date on Feb 1, 2020 (${expected} days overdue).`)
    assert.equal(notice.querySelector('button, input, select, a'), null)
    await act(() => [...document.querySelectorAll('.nav-item')].find(el => el.textContent.includes("Active sites")).click())
    assert.ok(document.querySelector('.as-card .schedule-delay-notice'))
    assert.equal(dom.window.getComputedStyle(document.querySelector('.as-details')).minHeight, "48px")
    assert.equal(document.querySelector('.schedule-delay-notice button'), null)
    assert.deepEqual(state, before)

    const client = state.accounts.find(a => a.id === "a9")
    const ownProjects = clientProjectViews(state, client.id)
    const clientProps = { actor: client, projects: ownProjects, readNoticeIds: [], mutedTypes: [], onMute() {}, onResolve() {}, onReport() { return "" }, onRecord() {}, onRead() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} }
    await render(ClientPortal, clientProps)
    assert.ok(document.querySelector('.client-overview [data-schedule-status="Delayed"]'))
    assert.match(document.querySelector('.client-overview [aria-label="Project schedule"]').textContent, /Target completion: Feb 1, 2020/)
    assert.doesNotMatch(document.querySelector('.main-content').textContent, /Foreign private project/)
    await click("Project details & contacts")
    assert.ok(document.querySelector('[role="dialog"] [data-schedule-status="Delayed"]'))
    assert.equal(document.querySelector('[role="dialog"] [aria-label="Project schedule"] button'), null)
    assert.deepEqual(state, before)
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
