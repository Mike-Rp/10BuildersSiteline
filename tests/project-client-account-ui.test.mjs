import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("project client setup creates or links an account and shows temporary credentials once", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/opm/active-sites", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  let reused = false
  const writes = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "POST") {
      writes.push(JSON.parse(options.body))
      return Response.json({ data: { id: "client", full_name: "Client Contact", email: "client@10builders.com", status: "invited", reused, ...(!reused ? { temp_password: "TemporaryPassword123" } : {}) } })
    }
    return Response.json({ data: { clients: [], editable: true, defaults: { company_name: "Example Client", contact_person: "Client Contact", email: "client@10builders.com", phone: "09171234567" } } })
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: Setup } = await server.ssrLoadModule("/src/ProjectClientAccount.tsx")
  let saved = 0
  const render = key => act(async () => { root.render(React.createElement(Setup, { key, projectId: "project", onSaved: async () => { saved++ } })); await new Promise(resolve => setTimeout(resolve, 20)) })
  await render("new")
  assert.equal(document.querySelector('input[type="email"]').value,"client@10builders.com")
  assert.ok(document.querySelector('label[for]'))
  await act(async () => { document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.equal(writes.length,1);assert.equal(writes[0].project_id,"project");assert.equal(saved,1)
  assert.match(document.body.textContent,/Awaiting first sign-in/)
  assert.ok([...document.querySelectorAll('input')].some(input => input.value === "TemporaryPassword123"))
  assert.equal(document.querySelector('.project-client-account form'), null)
  reused = true
  await render("existing")
  await act(async () => { document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.equal(saved,2)
  assert.match(document.body.textContent,/Existing client account linked/)
  assert.equal(document.querySelector('.account-sign-in-details'),null)
})
