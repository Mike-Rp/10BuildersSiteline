import assert from "node:assert/strict"
import test from "node:test"
import { activeFixture, currentProject } from "./fixtures.mjs"

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test("workspace saves prevent duplicate requests, retain failed notes, and allow retry", async () => {
  await withUi(async ({ React, root, server, w, click, button }) => {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = activeFixture(), actor = state.accounts.find(account => account.id === "a4")
    actor.expiry = "2099-01-01"
    const requests = []
    let pending = deferred()
    await React.act(() => root.render(React.createElement(Workspace, {
      state, actor, onCommand(command) { requests.push(command); return pending.promise },
      onRead() {}, onMute() {}, onReload() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {},
    })))
    await click([...document.querySelectorAll(".sidebar button")].find(el => el.textContent.trim() === "Active sites"))
    let save = button("Add diary note")
    assert.equal(save.disabled, true, "Empty notes should not submit")
    const note = document.querySelector('[placeholder="Add an internal operational note."]')
    await input(React, w, note, "Confirm the concrete delivery with the site team.")
    save = button("Add diary note")
    await React.act(() => { save.click(); save.click() })
    assert.equal(requests.length, 1, "Rapid clicks should send exactly one command")
    assert.equal(requests[0].type, "add_note")
    assert.equal(save.disabled, true)
    assert.equal(note.disabled, true, "Prevent edits that could be cleared by the in-flight save")
    assert.match(document.querySelector('.workflow-feedback[role="status"]').textContent, /Saving changes/)
    await React.act(async () => { pending.resolve({ ok: false, error: "The server is unavailable. Try again." }) })
    assert.equal(note.value, "Confirm the concrete delivery with the site team.")
    assert.equal(save.disabled, false)
    assert.match(document.querySelector('.workflow-feedback[role="alert"]').textContent, /server is unavailable/)

    pending = deferred()
    await click(save)
    await React.act(async () => { pending.reject(new Error("Connection interrupted.")) })
    assert.match(document.querySelector('[role="alert"]').textContent, /Connection interrupted/)
    assert.equal(note.value, "Confirm the concrete delivery with the site team.")

    pending = deferred()
    await click(save)
    await React.act(async () => { pending.resolve({ ok: true }) })
    assert.equal(requests.length, 3)
    assert.equal(note.value, "", "Clear the note only after confirmed success")
    assert.match(document.querySelector('.workflow-feedback[role="status"]').textContent, /Site diary updated/)
    assert.equal(document.querySelector('.workflow-feedback[role="alert"]'), null)
  })
})

test("failed signed agreement saves keep the selected file and show the error in its dialog", async () => {
  await withUi(async ({ React, root, server, w, click, button }) => {
    const { default: LeadPanel } = await server.ssrLoadModule("/src/LeadSubcontractorPanel.tsx")
    const state = activeFixture(), project = currentProject(state)
    project.status = "pending"
    project.docs = project.docs.filter(doc => doc.name !== "signed.png")
    const actor = state.accounts.find(account => account.id === "a4")
    let pending = deferred(), calls = 0, activated = 0
    await React.act(() => root.render(React.createElement(LeadPanel, {
      state, project, actor,
      onAction(command) { assert.equal(command.type, "upload_agreement"); calls++; return pending.promise },
      onCrew() {}, onNewCompany() {}, onPreview() {}, onActivated() { activated++ }, onOpenActive() {},
    })))
    const fileInput = document.querySelector('input[type="file"]')
    assert.ok(fileInput)
    const file = new File(["signed agreement"], "agreement.png", { type: "image/png" })
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] })
    await React.act(() => fileInput.dispatchEvent(new w.Event("change", { bubbles: true })))
    const confirm = button("Confirm upload")
    await React.act(async () => { confirm.click(); confirm.click() })
    assert.equal(calls, 1, "Upload and workflow commands should not be duplicated")
    let dialog = document.querySelector('[role="dialog"][aria-label="Confirm document upload"]')
    assert.equal(button("Back", dialog).disabled, true)
    assert.equal(button("Retry upload", dialog).disabled, true)
    await click(dialog.querySelector('[aria-label="Close dialog"]'))
    assert.ok(document.querySelector('[aria-label="Confirm document upload"]'), "Keep the in-flight file preview open")
    await React.act(async () => { pending.resolve(false) })
    dialog = document.querySelector('[aria-label="Confirm document upload"]')
    assert.ok(dialog, "Do not discard the selected agreement on a rejected save")
    assert.equal(dialog.querySelector('[role="alert"]').textContent, "We couldn’t save your upload. Your file is still selected—please try again.")
    assert.match(dialog.textContent, /agreement.png/)
    assert.equal(activated, 0)
    assert.equal(button("Confirm upload", dialog).disabled, false)

    pending = deferred()
    await click(button("Confirm upload", dialog))
    assert.equal(dialog.querySelector('[role="alert"]'), null, "Clear the stale error during a retry")
    await React.act(async () => { pending.resolve(true) })
    assert.equal(calls, 2)
    assert.equal(activated, 1)
    assert.equal(document.querySelector('[aria-label="Confirm document upload"]'), null)
  })
})

test("agreement issue validation explains its minimum and preserves the description on failure", async () => {
  await withUi(async ({ React, root, server, w, click, button }) => {
    const { AgreementPreviewModal } = await server.ssrLoadModule("/src/ClientSubconReview.tsx")
    const state = activeFixture(), project = currentProject(state)
    project.clientSubcon = "Client subcontractor"
    const actor = state.accounts.find(account => account.id === "a4")
    let calls = 0
    await React.act(() => root.render(React.createElement(AgreementPreviewModal, {
      project, actor, onAction: async () => { calls++; return false }, onClose() {},
    })))
    await click(button("Report Issue"))
    const note = document.querySelector("textarea")
    const send = button("Send to Admin")
    assert.match(document.body.textContent, /at least 10 characters/)
    await input(React, w, note, "short")
    assert.equal(send.disabled, true)
    await input(React, w, note, "The uploaded agreement belongs to another company.")
    assert.equal(send.disabled, false)
    await click(send)
    assert.equal(calls, 1)
    assert.equal(note.value, "The uploaded agreement belongs to another company.")
    assert.match(document.querySelector('.agreement-review [role="alert"]').textContent, /could not be sent/)
  })
})

async function input(React, w, element, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, "value").set.call(element, value)
    element.dispatchEvent(new w.Event("input", { bubbles: true }))
  })
}

async function withUi(run) {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, navigator: w.navigator,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    fetch: async () => new Response(JSON.stringify({ data: { download_url: "/files/test" } }), { status: 200 }),
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
  const button = (text, container = document) => [...container.querySelectorAll("button")].find(el => el.textContent.trim() === text)
  const click = element => { assert.ok(element, "Expected an interactive element"); return React.act(async () => { element.click() }) }
  try { await run({ React, root, server, w, click, button }) }
  finally {
    await React.act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
}
