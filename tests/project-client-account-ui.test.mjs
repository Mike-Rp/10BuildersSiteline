import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("project client setup shows role-specific recovery and requires ownership confirmation", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/opm/active-sites", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  let admin = false
  const writes = []
  const client = { id:"client",full_name:"Client Contact",email:"client@gmail.com",activation_status:"pending_activation" }
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "POST") {
      writes.push({url:String(url),body:JSON.parse(options.body)})
      return Response.json({data:{status:"pending_activation",next_action:"issue_activation_code"}})
    }
    return Response.json({data:{clients:writes.length?[client]:[],can_recover:admin && !writes.length,
      can_issue_activation_code:!admin && !!writes.length,next_action:"request_email_correction",defaults:{email:client.email}}})
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); w.close(); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: Setup } = await server.ssrLoadModule("/src/ProjectClientAccount.tsx")
  let saved = 0
  const render = key => act(async () => { root.render(React.createElement(Setup, { key, projectId: "project", onSaved: async () => { saved++ } })); await new Promise(resolve => setTimeout(resolve, 20)) })
  await render("opm")
  assert.match(document.body.textContent,/Request a corrected client email/)
  assert.equal(document.querySelector("form"),null)
  admin=true
  await render("admin")
  assert.equal(document.querySelector('input[type="email"]').value,client.email)
  assert.equal(document.querySelector('button[type="submit"]').disabled,true)
  await act(()=>document.querySelector('input[type="checkbox"]').click())
  await act(async () => { document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await new Promise(resolve=>setTimeout(resolve,20)) })
  assert.equal(writes.length,1)
  assert.ok(writes[0].url.endsWith('/projects/project/client-account/recover'))
  assert.deepEqual(writes[0].body,{email:client.email,ownership_verified:true})
  assert.equal(saved,1)
  admin=false
  await render("opm-after-recovery")
  assert.match(document.body.textContent,/Issue activation code/)
})
