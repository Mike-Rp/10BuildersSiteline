import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("client-owned activation validates fields and requires verified server success", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const saved = new Map()
  for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const writes = []
  let release, invalid = false
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/activation-config")) return Response.json({ data: { client_owned: false } })
    writes.push(JSON.parse(init.body))
    if (String(url).endsWith("/start")) return await new Promise(resolve => { release = () => resolve(Response.json({ data: { status: "verification_required", verification_id: "challenge", same_email: false, delivery: "local_capture" } })) })
    return invalid ? Response.json({ error: { code: "VERIFICATION_CODE_INVALID", message: "Codes do not match." } }, { status: 401 }) : Response.json({ data: { status: "active" } })
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); window.close(); for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key] })
  const { default: Page } = await server.ssrLoadModule("/src/ClientOwnedActivation.tsx")
  await act(() => root.render(React.createElement(Page)))
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent === text)
  const enter = async (name, value) => act(() => {
    const input = document.querySelector(`[name="${name}"]`)
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value)
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  assert.equal(document.querySelector("[role=alert]"), null)
  await act(() => button("Activate account").click())
  assert.equal(writes.length, 0)
  assert.equal(document.activeElement.name, "code")
  assert.equal(document.querySelector('[name="email"]').getAttribute("aria-invalid"), "true")
  await enter("code", "a".repeat(24)); await enter("email", "own@example.org"); await enter("password", "Client password 123"); await enter("confirmation", "different")
  await act(() => button("Activate account").click()); assert.equal(writes.length, 0)
  await act(() => document.querySelector('[aria-label="Show create password"]').click())
  assert.equal(document.querySelector('[name="password"]').type, "text")
  await enter("confirmation", "Client password 123")
  await act(() => { const submit = button("Activate account"); submit.click(); submit.click() })
  assert.equal(writes.length, 1)
  await act(async () => release())
  assert.match(document.querySelector("[role=status]").textContent, /No email was sent to a real inbox/)
  assert.equal(document.querySelector('[name="password"]'), null)
  await enter("recipient_code", "b".repeat(24)); await enter("email_code", "c".repeat(24))
  invalid = true
  await act(() => button("Verify and activate account").click())
  assert.equal(document.querySelector('[name="recipient_code"]').value, "b".repeat(24))
  assert.equal(document.querySelector('[name="recipient_code"]').getAttribute("aria-invalid"), "true")
  assert.doesNotMatch(document.querySelector("h1").textContent, /Account activated/)
  invalid = false
  await act(() => button("Verify and activate account").click())
  assert.equal(document.querySelector("h1").textContent, "Account activated")
  const { default: ActivationPage } = await server.ssrLoadModule("/src/ClientActivationPage.tsx")
  const previousWrites = writes.length
  await act(() => root.render(React.createElement(ActivationPage)))
  assert.equal(document.querySelector("h1").textContent, "Activate your account", "new UI is the default even before server enablement")
  assert.deepEqual([...document.querySelectorAll("form label")].map(node => node.textContent), ["Activation code", "Email address", "Create password", "Confirm password"])
  assert.equal(button("Activate account").disabled, true)
  assert.match(document.querySelector('[role="status"]').textContent, /not enabled/)
  await act(() => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })))
  assert.equal(writes.length, previousWrites, "disabled service cannot submit credentials")
  await act(() => button("Use an earlier account activation code").click())
  assert.equal(document.querySelector("h1").textContent, "Activate your client account")
})
