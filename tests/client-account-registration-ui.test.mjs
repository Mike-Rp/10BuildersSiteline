import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { emptyState } from "../src/model.ts"

test("Admin can select Client, enter an existing email, link a project and save temporary credentials", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/admin/team" }), w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const writes = [], submitted = []
  let saved
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(String(url), "http://localhost").pathname.replace(/^\/api\/v1/, "")
    const body = JSON.parse(options.body)
    writes.push({ path, method: options.method, body })
    if (path === "/accounts") return Response.json({ data: { id: "client-id", email: body.email, status: "invited", temp_password: body.password } })
    if (path === "/accounts/client-id/workspace") return Response.json({ data: {} })
    throw new Error(`Unexpected request: ${path}`)
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const React = await import("react"), { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await React.act(() => root.unmount()); await server.close(); w.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const { AccountForm } = await server.ssrLoadModule("/src/panels.tsx")
  const { saveApiAccount } = await server.ssrLoadModule("/src/api/actions.ts")
  const state = emptyState()
  state.projects = [{ id: "project-id", name: "Client House" }]
  state.accounts = [{ id: "existing-client", email: "registered@gmail.com" }]
  await React.act(() => root.render(React.createElement(AccountForm, { state, onClose() {}, onSave: async (account, password) => {
    submitted.push(account); saved = await saveApiAccount(account, false, password)
  } })))
  const field = label => document.getElementById([...document.querySelectorAll("label")].find(item => item.textContent === label)?.htmlFor || "")
  const enter = (label, value) => React.act(() => {
    const element = field(label); assert.ok(element, label)
    const prototype = element.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value)
    element.dispatchEvent(new w.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
  })
  const submit = () => React.act(async () => document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })))
  const role = field("Account role")
  assert.ok([...role.options].some(option => option.value === "client" && option.textContent === "Client"))
  assert.ok(![...role.options].some(option => option.value === "admin"))
  await enter("Account role", "client")
  assert.ok(field("Email address *"))
  assert.equal(field("Email address *").placeholder, "client@gmail.com")
  assert.equal(document.querySelector(".registration-credentials"), null)
  assert.doesNotMatch(document.querySelector("form").textContent, /Professional license details|Project experience|Job title/)
  assert.match(document.querySelector("form").textContent, /Hand the sign-in details to the client during onboarding/)
  await enter("First name *", "Maria"); await enter("Last name *", "Santos")
  await submit(); assert.equal(writes.length, 0)
  assert.match(document.body.textContent, /Full name and email are required/)
  await enter("Email address *", "not-an-email")
  await submit(); assert.equal(writes.length, 0)
  assert.match(document.body.textContent, /Enter a valid email address/)
  await enter("Email address *", "REGISTERED@gmail.com")
  await submit(); assert.equal(writes.length, 0)
  assert.match(document.body.textContent, /already assigned to another account/)
  await enter("Email address *", "  Maria.Santos@gmail.com  ")
  await submit(); assert.equal(writes.length, 0)
  assert.match(document.body.textContent, /Link at least one project/)
  const project = [...document.querySelectorAll("label")].find(label => label.textContent.trim() === "Client House")?.querySelector("input")
  assert.ok(project); await React.act(() => project.click())
  const temporaryPassword = document.querySelector(".password-display code").textContent
  await submit()
  assert.equal(writes.length, 2)
  const created = writes[0]
  assert.equal(created.path, "/accounts"); assert.equal(created.method, "POST")
  assert.equal(created.body.role, "client"); assert.equal(created.body.email, "maria.santos@gmail.com")
  assert.equal(created.body.full_name, "Maria Santos")
  assert.deepEqual(created.body.scope, { projects: ["project-id"] })
  assert.equal(created.body.auto_work_email, undefined)
  assert.equal(created.body.initial_credentials, undefined)
  assert.equal(created.body.password, temporaryPassword)
  assert.equal(saved.password, temporaryPassword); assert.equal(saved.email, "maria.santos@gmail.com")
  assert.equal(submitted[0].role, "client")
  await enter("Account role", "spm")
  assert.equal(field("Email address *"), null)
  assert.ok(document.querySelector(".registration-credentials"))
  await enter("Account role", "client")
  assert.equal(field("Email address *").value, "", "Switching roles clears any previous role's email")
})
