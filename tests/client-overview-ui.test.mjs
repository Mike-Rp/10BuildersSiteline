import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"
import { clientProjectViews } from "../src/client-access.ts"

test("client dashboard has an executive summary, removes timelines, and preserves shared records and navigation", async () => {
  const { JSDOM } = await import("jsdom")
  const { createServer } = await import("vite")
  const { default: React, act } = await import("react")
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: ClientPortal } = await server.ssrLoadModule("/src/ClientPortal.tsx")
    const state = initialState(), actor = state.accounts.find(a => a.id === "a9")
    const original = clientProjectViews(state, actor.id)[0]
    const project = { ...original, end: undefined, progress: 67, photos: [], history: [{ id: "sample", date: "2026-10-21", phase: original.phase, progress: 67, text: "Original retained note: awaiting review" }] }
    const props = { actor, projects: [project], readNoticeIds: [], mutedTypes: [], onMute() {}, onResolve() { throw Error("Unauthorized file") }, onReport() { return "report" }, onRecord() {}, onRead() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} }
    await act(() => root.render(React.createElement(ClientPortal, props)))
    assert.ok(document.querySelector('.client-overview'))
    assert.match(document.querySelector('[aria-label="Executive summary"]').textContent, /Executive summary/)
    assert.match(document.querySelector('.co-summary-narrative').textContent, new RegExp(project.name))
    assert.match(document.querySelector('.co-summary-narrative').textContent, /current phase is 67%/)
    assert.match(document.querySelector('.co-summary-grid').textContent, /Date not confirmed/)
    assert.match(document.querySelector('.co-summary-grid').textContent, /Oct 21, 2026/)
    assert.ok(!document.querySelector('nav button[aria-label="Phase Timeline"]'))
    assert.ok(!document.querySelector('.construction-phase-timeline'))
    assert.ok(!document.body.textContent.includes('View timeline'))
    assert.equal(document.querySelector('progress[aria-label="Current phase progress"]').value, 67)
    for (const removed of ["Recorded project completion", "Approved / recorded", "Where should we be today?", "Your view. Your project."]) assert.ok(!document.body.textContent.includes(removed), removed)
    assert.equal(document.querySelector('.client-overview details').open, false)
    assert.match(document.querySelector('.client-overview details').textContent, /Original retained note/)
    assert.match(document.querySelector('.co-target').textContent, /Not set/)
    assert.match(document.querySelector('.co-photos').textContent, /No site photos shared yet/)
    const click = async label => {
      const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent.trim() === label)
      assert.ok(button, `Missing button: ${label}`)
      await act(() => button.click())
    }
    await click('Help: project progress')
    assert.match(document.querySelector('[role="dialog"]').textContent, /not overall project completion/)
    await click('Close help: About your project progress')
    await click('Project details & contacts')
    assert.ok(document.querySelector('[aria-modal="true"] .client-project-facts'))
    assert.match(document.querySelector('[aria-modal="true"]').textContent, /Activity status/)
    const close = document.querySelector('[aria-modal="true"] button[aria-label="Close dialog"]')
    assert.ok(close)
    await act(() => close.click())
    await click('View progress history')
    assert.match(document.querySelector('.client-history-list').textContent, /Recorded update/)
    assert.match(document.querySelector('.client-history-list').textContent, /Original retained note/)
    await click('Project Overview')
    await click('View gallery')
    assert.match(document.querySelector('.main-content').textContent, /Site photographs will appear here/)
    await click('Project Overview')
    await click('Project documents')
    assert.equal(document.querySelector('.client-overview'), null)
    assert.ok(document.querySelector('.document-browser'))
    // Project switching updates the summary without retaining another project's data.
    const second = { ...project, id: 'client-second', name: 'Authorized second project', progress: Number.NaN, contacts: [], checklist: [], history: [], end: undefined }
    await act(() => root.render(React.createElement(ClientPortal, { ...props, projects: [project, second] })))
    const select = document.querySelector('.client-project-toolbar select')
    await act(() => { select.value = second.id; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    await click('Project Overview')
    assert.match(document.querySelector('.co-summary-narrative').textContent, /Authorized second project/)
    assert.match(document.querySelector('.co-summary-narrative').textContent, /progress has not been shared/)
    assert.ok(!document.querySelector('.co-executive').textContent.includes(project.name))
    assert.ok(!document.querySelector('.co-executive').textContent.includes('NaN'))
    assert.match(document.querySelector('.co-summary-grid').textContent, /contacts have not been shared/)
    await act(() => root.render(React.createElement(ClientPortal, { ...props, projects: [] })))
    await click('Project Overview')
    assert.equal(document.querySelector('.client-overview'), null)
    assert.match(document.body.textContent, /Your project access is pending/)
  } finally {
    await act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
