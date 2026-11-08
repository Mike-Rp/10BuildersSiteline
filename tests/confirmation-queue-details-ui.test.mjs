import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("Confirmation Queue opens read-only popups with engineer acceptance statuses and no manual scope review badges", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/confirmation-details-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const { default: Details } = await server.ssrLoadModule("/src/ConfirmationQueueDetails.tsx")
    const state = initialState()
    const actor = { ...state.accounts.find(account => account.role === "opm"), expiry: "2099-01-01" }
    const people = state.accounts.filter(account => account.role === "spm").slice(0, 3)
    assert.equal(people.length, 3)
    const tags = ["Civil", "Electrical", "Mechanical"]
    const project = { ...state.projects[0], id: "popup-project", name: "Popup Test Project", status: "pending", opmId: actor.id, opmAccepted: true, clientSubcon: undefined, subcontractorAllocation: undefined, subcontractorAllocationVersion: undefined,
      team: [{ phase: "Design", accountId: people[0].id, status: "confirmed", requiredDisciplines: tags, engineers: people.map((person, index) => ({ accountId: person.id, assignedDisciplines: [tags[index]], status: index === 2 ? "pending" : "confirmed" })) }], docs: [] }
    state.projects = [project]
    state.phaseAllocationAvailable = false
    state.tradeAllocationAvailable = false
    let writes = 0
    const click = async element => { assert.ok(element); await act(async () => { element.focus(); element.click(); await new Promise(resolve => setTimeout(resolve, 0)) }) }
    const button = (scope, text) => [...scope.querySelectorAll("button")].find(item => item.textContent.includes(text))
    await act(() => root.render(React.createElement(Workspace, { state, actor, onCommand: async () => { writes++; return { ok: true } }, onRead() {}, onMute() {}, onReload() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} })))
    await click(document.querySelector('nav [aria-label="Confirmation queue"]'))
    const card = document.querySelector(".opm-confirmation-card")
    assert.ok(card)
    assert.equal(card.querySelectorAll("details.opm-confirmation-details").length, 0)
    const teamButton = button(card, "View Site PM team by phase")
    await click(teamButton)
    let dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.getAttribute("aria-label"), "Site PM Team by Phase")
    assert.equal(dialog.querySelectorAll(".confirmation-engineer").length, 3)
    for (const person of people) assert.ok(dialog.textContent.includes(person.name))
    assert.doesNotMatch(dialog.textContent, /Coverage complete|Coverage needs review/)
    assert.match(dialog.textContent, /Confirmed/)
    assert.match(dialog.textContent, /Awaiting acceptance/)
    assert.equal(dialog.querySelectorAll("input,select,textarea").length, 0)
    await act(() => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.ok(document.activeElement === teamButton, "Closing returns focus to the team button")
    await click(button(card, "View subcontractor allocation"))
    dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.getAttribute("aria-label"), "Subcontractor Allocation")
    assert.match(dialog.textContent, /Signed agreement required/)
    assert.equal(dialog.querySelectorAll("input,select,textarea").length, 0)
    await click(button(dialog, "Close"))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(writes, 0)

    await click(button(card, "Track Site PM responses"))
    assert.equal(document.querySelectorAll('.site-pm-roster-contact').length, 3, "Every engineer in the phase has a contact button")
    assert.equal([...document.querySelectorAll('.site-pm-roster-contact button')].filter(item=>item.textContent==='Review Reassignment').length,1,'A pending supporting engineer stays actionable even after the coordinator confirms')
    const contactButton = document.querySelector(`button[aria-label="View contact details for ${people[2].name} in Design"]`)
    await click(contactButton)
    dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.getAttribute('aria-label'), 'Site PM Contact Details')
    assert.equal(dialog.querySelector('[aria-label="Site PM work email"]').value, people[2].email)
    assert.equal(dialog.querySelector('[aria-label="Site PM work email"]').readOnly, true)
    assert.equal(dialog.querySelector('[aria-label="Site PM contact number"]').value, people[2].phone || 'Not recorded')
    assert.match(dialog.textContent, /Awaiting acceptance/)
    let copied = ''
    Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copied = value } } })
    await click(button(dialog, 'Copy Contact Details'))
    assert.ok(copied.includes(people[2].email))
    assert.match(dialog.textContent, /Contact details copied/)
    Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard unavailable') } } })
    await click(button(dialog, 'Copy Contact Details'))
    assert.match(dialog.textContent, /Select and copy/)
    await click(button(dialog, 'Close'))
    assert.ok(document.activeElement === contactButton)
    assert.equal(writes, 0, 'Viewing and copying contact information does not modify assignments or send messages')

    project.team[0].status = "confirmed"
    project.team[0].engineers[1].assignedDisciplines = ["Civil"]
    await act(() => root.render(React.createElement(Details, { state, project, view: "team", onClose() {} })))
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /Uncovered areas|Duplicate responsibility|Coverage needs review/)
    delete project.team[0].engineers
    await act(() => root.render(React.createElement(Details, { state, project, view: "team", onClose() {} })))
    assert.match(document.querySelector('[role="dialog"]').textContent, /No specialization details recorded/)
    assert.match(document.querySelector('[role="dialog"]').textContent, /Confirmed/)
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /Coverage|review required|Uncovered areas/)

    const { DOC_LABELS } = await server.ssrLoadModule("/src/model.ts")
    project.docs = [{ id: "agreement", label: DOC_LABELS[6], name: "signed-agreement.pdf", uploaded: true }]
    state.phaseAllocationAvailable = true
    previous.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"))
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url, method: options.method || "GET" })
      return new Response(JSON.stringify({ data: {
        revision: 1, canEdit: true, completed: [], phases: [{ name: "Design", disciplines: ["Civil"] }], assignments: [], history: [],
        companies: [{ id: "company-a", name: "Company A", foremen: [{ id: "foreman-1", name: "Foreman Mika", phone: "09123456789" }], status: "approved", reviewed: true, unavailable: false, commitments: 0, disciplines: ["Civil"] }],
        requests: [{ id: 1, status: "approved", reason: "Initial allocation", proposal: [{ phase: "Design", companyId: "company-a", foremanId: "foreman-1" }], responses: { "company-a": { status: "accepted", note: "Scope agreed" } } }]
      } }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    await act(async () => {
      root.render(React.createElement(Details, { state, project, view: "subcontractors", onClose() {} }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    dialog = document.querySelector('[role="dialog"]')
    assert.match(dialog.textContent, /Signed agreement on file/)
    assert.match(dialog.textContent, /Company A/)
    assert.match(dialog.textContent, /Foreman Mika/)
    assert.match(dialog.textContent, /accepted/)
    assert.match(dialog.textContent, /Scope agreed/)
    assert.equal(dialog.querySelectorAll("input,select,textarea").length, 0, "Read-only allocation hides editing even if the API reports canEdit")
    assert.ok([...dialog.querySelectorAll("button")].every(item => /Close/.test(item.textContent) || item.getAttribute("aria-label") === "Close dialog"))
    assert.ok(requests.length > 0)
    assert.ok(requests.every(request => request.method === "GET"))
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
