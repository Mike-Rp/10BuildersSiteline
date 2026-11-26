import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("uploaded contracts display green status across remounts and replacements", { timeout: 60000 }, async t => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  let inquiry = { id: "contract-inquiry", opm_id: "office-one", status: "approved", details: {
    name: "Contract residence", project_type: "Residential", address: "Quezon City", lot_area: 200,
    floor_area_sqm: 400, floor_count: 2, anticipated_start: "2080-01-12", client_name: "Ana Reyes",
    email: "ana@gmail.com", phone: "09123456789", consultation: 30,
  } }
  let filename = ""
  const writes = []
  const previous = new Map()
  for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement,
    Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true, fetch: async (url, init = {}) => {
      const path = String(url)
      if (path.endsWith("/files/upload-url")) return Response.json({ data: { mode: "database" } })
      if (path.endsWith("/files")) { filename = init.body.get("file").name; return Response.json({ data: {} }) }
      if (path.endsWith("/workflow")) {
        const input = JSON.parse(init.body)
        writes.push(input)
        assert.equal(input.action, "contract")
        inquiry = { ...inquiry, workflow: { signed_contract: { id: input.contract_file_id, name: filename } } }
        return Response.json({ data: inquiry })
      }
      return Response.json({ data: [inquiry] })
    } })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => {
    await act(() => root.unmount())
    await server.close()
    window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const { default: Inquiries } = await server.ssrLoadModule("/src/ProjectInquiries.tsx")
  const button = name => [...document.querySelectorAll("button")].find(el => el.textContent.trim() === name)
  const click = el => act(async () => { el.click(); await Promise.resolve() })
  const mount = async () => {
    await act(() => root.render(null))
    await act(() => root.render(React.createElement(Inquiries, { role: "opm", onReload() {} })))
    await click(document.querySelector('button[aria-label$="for Contract residence"]'))
  }
  const badge = () => document.querySelector(".inquiry-contract-status")
  const upload = async name => {
    const input = document.querySelector('input[aria-label="Signed client contract file"]')
    Object.defineProperty(input, "files", { value: [new File(["contract"], name, { type: "application/pdf" })], configurable: true })
    await act(async () => { input.dispatchEvent(new window.Event("change", { bubbles: true })); await Promise.resolve() })
    await click(button("Upload this file"))
  }
  await mount()
  assert.equal(badge().textContent, "Not uploaded")
  assert.ok(badge().querySelector("svg"))
  assert.equal(badge().closest(".inquiry-section-title").querySelector("h3").textContent, "Signed client contract")
  await upload("first.pdf")
  const firstId = inquiry.workflow.signed_contract.id
  assert.equal(badge().dataset.status, "uploaded")
  assert.equal(badge().textContent, "Uploaded")
  assert.equal(document.querySelector(".inquiry-contract-confirmation"), null)
  await mount()
  assert.equal(badge().dataset.status, "uploaded")
  await upload("replacement.pdf")
  assert.notEqual(inquiry.workflow.signed_contract.id, firstId)
  assert.equal(badge().dataset.status, "uploaded")
  assert.match(document.querySelector(".inquiry-contract-preview").textContent, /replacement.pdf/)
  await mount()
  assert.equal(badge().dataset.status, "uploaded")
  inquiry = { ...inquiry, opm_id: "office-two" }
  await mount()
  assert.equal(badge().dataset.status, "uploaded", "status reflects the saved file")
  assert.equal(writes.length, 2, "only uploads add API writes")
})
