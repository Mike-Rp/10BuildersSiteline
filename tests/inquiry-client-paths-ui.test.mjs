import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("company inquiry steps preserve data, save/resume a draft, submit once and reuse an existing client", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const globals = new Map(), records = [], submitted = []
  const client = { id: "00000000-0000-4000-8000-000000000003", source: "account", client_type: "individual", client_name: "Existing Client", email: "existing@example.com", phone: "+639123456789", company_name: "", primary_contact: "", designation: "" }
  for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options = {}) => {
      const path = String(url), body = options.body ? JSON.parse(options.body) : undefined
      if (path.includes("/inquiries/clients?")) return Response.json({ data: [client] })
      if (path.includes("opm-candidates?project_type=Residential")) return Response.json({ data: [{ id: "preferred", name: "Avery Reyes", experience_years: 10 }] })
      if (path.endsWith("/inquiries/draft")) {
        const row = { id: body.id || "00000000-0000-4000-8000-000000000001", status: "draft", details: { ...body.details, intake_draft: "yes" } }
        records.splice(0, records.length, row); return Response.json({ data: row })
      }
      if (body && path.endsWith("/inquiries")) {
        submitted.push(body)
        const row = { id: body.draft_id || "new", status: "offered", opm_name: "Avery Reyes", details: body }
        records.splice(0, records.length, row); return Response.json({ data: row })
      }
      return Response.json({ data: records })
    },
  })) { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }) }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react"), { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(() => root.unmount()); await server.close(); window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } })
  const { default: ProjectInquiries } = await server.ssrLoadModule("/src/ProjectInquiries.tsx")
  const button = name => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === name)
  const click = async name => { assert.ok(button(name), name); await act(() => button(name).click()) }
  const set = async (selector, value) => act(() => { const input = document.querySelector(selector); assert.ok(input, selector); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })) })
  const radio = async (name, value) => act(() => document.querySelector(`[name="${name}"][value="${value}"]`).click())
  await act(() => root.render(React.createElement(ProjectInquiries, { role: "admin", onReload() {} })))
  await click("New project inquiry")
  assert.equal(document.querySelector('[placeholder="Maple Residence"]'), null)
  await radio("inquiry-client-record", "new"); await radio("inquiry-client-type", "company")
  await click("Next: Client details")
  await set('[aria-label="Company name"]', "Sample Development Corporation")
  await set('[aria-label="Primary contact (representative)"]', "Maria Santos")
  await set('[aria-label="Position / designation"]', "Coordinator")
  await set('[aria-label="Email address"]', "maria@example.com")
  await set('input[type="tel"]', "123456789")
  await click("Next: Project details")
  await set('[placeholder="Maple Residence"]', "Office Renovation")
  await set('[placeholder="Street, barangay, city"]', "Santa Rosa, Laguna")
  await set('[placeholder="e.g. 250"]', "250"); await set('[placeholder="e.g. 180"]', "180"); await set('[placeholder="e.g. 2"]', "2")
  await radio("inquiry-project-type", "Residential")
  await click("Previous step")
  assert.equal(document.querySelector('[aria-label="Company name"]').value, "Sample Development Corporation")
  assert.equal(document.querySelector('input[type="tel"]').value, "123456789")
  await click("Back to inquiries"); assert.ok(button("Save draft")); await click("Keep editing")
  assert.equal(document.querySelector('[aria-label="Company name"]').value, "Sample Development Corporation")
  await click("Back to inquiries"); await click("Save draft")
  assert.equal(submitted.length, 0)
  assert.match(document.querySelector(".inquiry-log-cards").textContent, /Unsubmitted draft/)
  await click("Continue draft"); await click("Next: Client details")
  assert.equal(document.querySelector('[aria-label="Primary contact (representative)"]').value, "Maria Santos")
  await click("Next: Project details")
  assert.equal(document.querySelector('[placeholder="Maple Residence"]').value, "Office Renovation")
  await click("Next: Review")
  assert.match(document.querySelector("#admin-inquiry-form").textContent, /Sample Development Corporation/)
  assert.match(document.querySelector("#admin-inquiry-form").textContent, /Maria Santos/)
  await act(() => document.querySelector('#admin-inquiry-form').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })))
  assert.equal(submitted[0].draft_id, "00000000-0000-4000-8000-000000000001")
  assert.equal(submitted[0].client_type, "company"); assert.equal(submitted[0].primary_contact, "Maria Santos")
  await click("View inquiry status"); await click("Back to inquiries"); await click("New project inquiry")
  await radio("inquiry-client-record", "existing")
  await set('[aria-label="Find an existing client"]', "existing")
  await act(() => new Promise(resolve => setTimeout(resolve, 300)))
  await click("Select"); await click("Next: Client details")
  assert.equal(document.querySelector('[aria-label="Client name"]').value, "Existing Client")
  assert.equal(document.querySelector('[aria-label="Client name"]').readOnly, true)
  assert.equal(document.querySelector('[aria-label="Email address"]').value, "existing@example.com")
  await click("Next: Project details")
  assert.ok(document.querySelector('.inquiry-client-verification'))
  await act(() => document.querySelector('.inquiry-client-verification input').click())
  await click("Next: Project details")
  await click("Back to inquiries"); await click("Discard changes")
  assert.equal(document.querySelector('#admin-inquiry-form'), null); assert.equal(submitted.length, 1)
})
