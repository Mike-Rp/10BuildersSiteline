import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "./fixtures/demo-state.ts"

test("a Site PM can validate company contacts and retry registration without manpower fields or uploads", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  let uploads = 0
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, navigator: w.navigator,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    fetch: async (url, init) => {
      if (String(url).endsWith("/files") && init?.method === "POST") uploads++
      return new Response(JSON.stringify({ data: { download_url: "/files/test", manpowerCount: uploads === 1 ? 2 : 1 } }), { status: 200 })
    },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.HTMLElement.prototype.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  const button = text => [...document.querySelectorAll("button")].find(el => el.textContent.trim() === text)
  const click = element => { assert.ok(element, "Expected an interactive element"); return React.act(async () => { element.click() }) }
  const input = (element, value) => React.act(async () => {
    Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(element, value)
    element.dispatchEvent(new w.Event("input", { bubbles: true }))
  })
  const field = label => [...document.querySelectorAll("input")].find(element => element.getAttribute("aria-label") === label) || document.getElementById([...document.querySelectorAll("form label")].find(el => el.textContent === label)?.htmlFor || "")
  try {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = initialState(), actor = state.accounts.find(account => account.id === "a5")
    state.projects = []
    actor.expiry = "2099-01-01"
    const commands = []
    await React.act(async () => root.render(React.createElement(Workspace, {
      state, actor, onCommand: async command => { commands.push(command); return commands.length === 1 ? { ok: false, error: "Please try again." } : { ok: true } }, onRead() {}, onMute() {}, onReload() {},
      paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {},
    })))
    await click([...document.querySelectorAll(".sidebar button")].find(el => el.textContent.trim() === "Subcon directory"))
    assert.equal(button("Suggest Company").disabled, false)
    await click(button("Suggest Company"))
    assert.equal(document.querySelectorAll("form select").length, 0, "No project or availability selection is required for a new company")
    assert.equal(field("Company availability").value, "Available")
    assert.equal(field("Company availability").readOnly, true)
    assert.ok(![...document.querySelectorAll("form label")].some(element => element.textContent === "Available manpower"))
    assert.equal(button("Download Excel template"), undefined)
    assert.equal(button("Upload manpower list"), undefined)
    assert.equal(document.querySelector('input[accept=".xlsx,.xls"]'), null)
    await input(field("Company name *"), "New Labor Company")
    await input(field("Operating region *"), "Central Visayas")
    await input(field("Operating province / NCR *"), "Cebu")
    await input(field("Operating city / municipality *"), "Cebu City")
    await input(field("Primary foreman mobile number"), "123")
    await input(field("Company email *"), "company@yahoo.com")
    await click(button("Submit for Admin approval"))
    assert.equal(commands.length, 0)
    assert.match(document.body.textContent, /Enter an 11-digit mobile number/)
    assert.match(document.body.textContent, /Enter a valid @gmail.com email address/)
    assert.equal(field("Primary foreman mobile number").getAttribute("aria-invalid"), "true")
    assert.equal(field("Primary foreman full name").getAttribute("aria-invalid"), "true")
    assert.equal(field("Company email *").getAttribute("aria-invalid"), "true")
    assert.match(document.getElementById(field("Company email *").getAttribute("aria-describedby")).textContent, /Enter a valid @gmail.com email address/)
    await input(field("Company email *"), "company@gmial.com")
    assert.equal(field("Company email *").getAttribute("aria-invalid"), "true", "An incorrect edit must keep its error highlight")
    await input(field("Primary foreman full name"), "  Juan Dela Cruz  ")
    await input(field("Primary foreman mobile number"), "abc0917123456789")
    assert.equal(field("Primary foreman mobile number").value, "09171234567")
    await input(field("Company email *"), "Company.Crew@GMAIL.COM")
    assert.equal(field("Company email *").getAttribute("aria-invalid"), null, "A correct email clears the error highlight")
    assert.equal(field("Primary foreman mobile number").getAttribute("aria-invalid"), null)
    await input(field("Backup foreman full name"), "Maria Santos")
    await click(button("Submit for Admin approval"))
    assert.equal(commands.length, 0, "A backup name requires a complete mobile number")
    assert.equal(field("Backup foreman mobile number").getAttribute("aria-invalid"), "true")
    await input(field("Backup foreman mobile number"), "09181234567")
    await click(button("Submit for Admin approval"))
    assert.equal(commands.length, 1)
    assert.deepEqual(commands[0].company.manpowerDocuments, [], "No workforce list is attached")
    assert.equal(commands[0].company.manpowerCount, 0)
    assert.equal(field("Company name *").value, "New Labor Company", "A failed save retains the entered company details")
    assert.equal(field("Backup foreman full name").value, "Maria Santos")
    assert.equal(field("Backup foreman mobile number").value, "09181234567")
    assert.match(document.querySelector('[role="dialog"]').textContent, /try again/)
    await click(button("Submit for Admin approval"))
    assert.equal(commands.length, 2)
    assert.equal(commands[1].type, "request_company")
    assert.equal(commands[1].projectId, undefined)
    assert.equal(commands[1].company.projectId, "")
    assert.equal(commands[1].company.email, "company.crew@gmail.com")
    assert.equal(commands[1].company.phone, "09171234567")
    assert.equal(commands[1].company.contact, "Juan Dela Cruz")
    assert.deepEqual(commands[1].company.foremen, [{ name: "Juan Dela Cruz", phone: "09171234567" }, { name: "Maria Santos", phone: "09181234567" }])
    assert.equal(commands[1].company.manpowerCount, 0)
    assert.deepEqual(commands[1].company.manpowerDocuments, [])
    assert.equal(uploads, 0)
    assert.equal(commands[1].company.availability, "available")
    assert.equal(commands[1].company.status, "pending")
    assert.deepEqual(commands[1].company.operatingLocation, { region: "Central Visayas", province: "Cebu", city: "Cebu City" })
    assert.deepEqual(commands[1].company.activeProjectIds, [])
  } finally {
    await React.act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
