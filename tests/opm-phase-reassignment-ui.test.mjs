import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("OPM monitoring offers per-engineer reassignment using server candidates", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/opm/active-sites", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const getItem = w.Storage.prototype.getItem
  w.Storage.prototype.getItem = function (key) { return String(key).startsWith("10buildline:workspace-guide:") ? "seen" : getItem.call(this, key) }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}
  const requests = []
  t.mock.method(globalThis, "fetch", async url => {
    requests.push(String(url))
    if (String(url).endsWith("/auth/me")) return Response.json({ data: { workspace_guide_seen: true } })
    return Response.json({ data: { available: true, canReassign: true, phase: "Design", userId: "a5", name: "Declined Engineer", status: "declined", tags: ["Structural"], version: "test", candidates: [{ id: "replacement", name: "Server Qualified Engineer", tags: ["Structural"] }] } })
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
  const state = initialState(), actor = { ...state.accounts.find(a => a.id === "a2"), expiry: "2099-01-01" }
  const project = { ...state.projects.find(p => p.status === "active"), id: "roster", name: "Roster project", status: "active", opmId: actor.id, team: [
    { phase: "Design", accountId: "a4", status: "confirmed", engineers: [
      { accountId: "a4", status: "confirmed", assignedDisciplines: ["Civil"] },
      { accountId: "a5", status: "declined", assignedDisciplines: ["Structural"] },
    ] },
    { phase: "Foundation", accountId: "a5", status: "declined" },
  ], workflow: { version: 1, checklist: {}, responses: [], selections: [], notes: [], photos: [] } }
  state.projects = [project]
  await act(() => root.render(React.createElement(Workspace, { state, actor, onCommand: async () => ({ ok: true }), onRead() {}, onMute() {}, onReload() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} })))
  await act(() => document.querySelector('.as-details').click())
  const design = [...document.querySelectorAll('.role-roster > div')].find(row => row.querySelector('strong')?.textContent === 'Design')
  assert.ok(design)
  const actions = design.querySelectorAll('button[aria-label^="Review reassignment"]')
  assert.equal(actions.length, 1, "only the unconfirmed engineer has a reassignment action")
  assert.equal(document.querySelectorAll('.role-roster select').length, 0)
  await act(async () => { actions[0].click(); await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.ok(requests.some(url => url.includes('/reassignment-options?phase=Design&userId=a5')))
  assert.match(document.body.textContent, /Server Qualified Engineer/)
  const dialogs = [...document.querySelectorAll('[role="dialog"]')]
  assert.equal(dialogs.at(-1).getAttribute('aria-label'), 'Review reassignment', 'Replacement dialog appears above project monitoring')
  assert.ok(dialogs.some(dialog => dialog.getAttribute('aria-label') === 'Project monitoring'))
  assert.ok(dialogs.at(-1).contains(document.activeElement), 'Keyboard focus moves to replacement dialog')
  await act(() => dialogs.at(-1).querySelector('[aria-label="Close dialog"]').click())
  assert.equal([...document.querySelectorAll('[role="dialog"]')].at(-1).getAttribute('aria-label'), 'Project monitoring')
  assert.equal(document.querySelectorAll('.site-pm-roster-contact > button[aria-label^="View contact details"]').length, 0)
  assert.ok(document.querySelector('.site-pm-roster-name'))
})
