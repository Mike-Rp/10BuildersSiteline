import assert from "node:assert/strict"
import test from "node:test"
import { activeFixture, currentProject } from "./fixtures.mjs"
import { PROJECT_PHASE_DEFINITIONS } from "../src/model.ts"

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test("SPM Assignments badge matches its projects even when responses are blocked", async () => {
  await withUi(async ({ React, root, server, w, click }) => {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = activeFixture(), original = currentProject(state)
    state.projects = [
      { ...structuredClone(original), id: "first-assignment", name: "First Assignment", status: "pending" },
      { ...structuredClone(original), id: "second-assignment", name: "Second Assignment", status: "pending", opmAccepted: false },
    ]
    const actor = state.accounts.find(account => account.id === "a4")
    actor.expiry = "2099-01-01"
    await React.act(() => root.render(React.createElement(Workspace, {
      state, actor, onCommand() {}, onRead() {}, onMute() {}, onReload() {}, paused: false,
      onResume() {}, onPause() {}, idleWarning: false, onStayActive() {},
    })))
    await click(document.querySelector('.sidebar [aria-label="Active sites"]'))
    const assignments = () => [...document.querySelectorAll('[aria-label="Active Sites views"] [role="tab"]')].find(button => button.textContent.includes("Assignments"))
    assert.match(assignments().textContent, /Assignments\s*2/)
    await click(assignments())
    assert.equal(document.querySelectorAll('.as-card').length, 2)
    const search = document.querySelector('.active-sites input')
    await React.act(() => {
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(search, 'First Assignment')
      search.dispatchEvent(new w.Event('input', { bubbles: true }))
    })
    assert.equal(document.querySelectorAll('.as-card').length, 1)
    assert.match(assignments().textContent, /Assignments\s*2/, "badge counts all assigned projects before panel filters")
  })
})

test("client subcontractor activation is enabled after acknowledgment on allocation-version projects", async () => {
  await withUi(async ({ React, root, server, click, button }) => {
    const { default: LeadPanel } = await server.ssrLoadModule("/src/LeadSubcontractorPanel.tsx")
    const state = activeFixture(), project = currentProject(state)
    project.status = "pending"
    project.workflow.activation = undefined
    project.subcontractorAllocationVersion = 1
    project.clientSubcon = "Client Company"
    project.clientSubconReview = { acknowledgedById: "a4", acknowledgedBy: "Lead Site PM", acknowledgedAt: "2026-11-05T15:40:00Z", issues: [] }
    project.team = PROJECT_PHASE_DEFINITIONS.Residential.map(({ name, disciplines }, sequence) => ({ phase: name, requiredDisciplines: disciplines, sequence, accountId: sequence === 0 ? "a4" : "a5", status: "confirmed" }))
    const actor = state.accounts.find(account => account.id === "a4")
    let commands = 0
    await React.act(() => root.render(React.createElement(LeadPanel, {
      state, project, actor, onAction(command) { assert.equal(command.type, "activate_project"); commands++; return true },
      onCrew() {}, onNewCompany() {}, onPreview() {}, onActivated() {}, onOpenActive() {},
    })))
    assert.equal(document.querySelector('.activation-count').textContent.trim(), "5 of 5 Passed")
    assert.match(document.querySelector('.lead-activation-panel .badge').textContent, /Ready to activate/)
    assert.ok(!document.querySelector('.activation-checklist').textContent.includes('Signed Site PM'))
    const activate = button("Activate Project & Move to Active Sites")
    assert.equal(activate.disabled, false)
    await click(activate)
    const confirm = document.querySelector('[role="dialog"] .modal-actions .primary')
    assert.ok(confirm)
    await click(confirm)
    assert.equal(commands, 1)
  })
})

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
    const feedback = await server.ssrLoadModule("/src/action-feedback.ts")
    feedback.dismissActionResult()
    await click([...document.querySelectorAll(".sidebar button")].find(el => el.textContent.trim() === "Active sites"))
    await click(button("Open phase workspace"))
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
    // Errors are reported through the shared action-result dialog; successful saves update the page silently.
    await React.act(async () => { pending.resolve({ ok: false, error: "The server is unavailable. Try again." }) })
    assert.equal(note.value, "Confirm the concrete delivery with the site team.")
    assert.equal(save.disabled, false)
    assert.match(feedback.feedbackSnapshot().result?.message ?? "", /server is unavailable/)
    assert.equal(feedback.feedbackSnapshot().result?.error, true)
    feedback.dismissActionResult()

    pending = deferred()
    await click(save)
    await React.act(async () => { pending.reject(new Error("Connection interrupted.")) })
    assert.match(feedback.feedbackSnapshot().result?.message ?? "", /Connection interrupted/)
    assert.equal(note.value, "Confirm the concrete delivery with the site team.")
    feedback.dismissActionResult()

    pending = deferred()
    await click(save)
    await React.act(async () => { pending.resolve({ ok: true }) })
    assert.equal(requests.length, 3)
    assert.equal(note.value, "", "Clear the note only after confirmed success")
    assert.equal(feedback.feedbackSnapshot().result, undefined, "Successful saves raise no error dialog")
  })
})

test("failed signed agreement saves keep the selected file and show the error inline", async () => {
  await withUi(async ({ React, root, server, w, click, button }) => {
    const { default: LeadPanel } = await server.ssrLoadModule("/src/LeadSubcontractorPanel.tsx")
    const state = activeFixture(), project = currentProject(state)
    project.status = "pending"
    project.docs = project.docs.filter(doc => doc.name !== "signed.png")
    // The shared fixture keeps a legacy seven-phase team; activation requires every Residential workflow phase.
    project.team = PROJECT_PHASE_DEFINITIONS.Residential.map(({ name, disciplines }, sequence) => ({
      phase: name, requiredDisciplines: disciplines, sequence, accountId: sequence === 0 ? "a4" : "a5", status: "confirmed",
    }))
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
    const control = () => document.querySelector(".attachment-control")
    assert.match(control().textContent, /agreement.png/)
    const confirm = button("Confirm upload")
    assert.ok(confirm, "Selecting a file offers an explicit confirmation")
    await React.act(async () => { confirm.click(); confirm.click() })
    assert.equal(calls, 1, "Upload and workflow commands should not be duplicated")
    assert.equal(button("Add attachments", control())?.disabled ?? button("Uploading…", control())?.disabled, true, "Keep the selection locked while saving")
    assert.equal(button("Uploading…", control())?.disabled, true)
    await React.act(async () => { pending.resolve(false) })
    assert.match(control().textContent, /agreement.png/, "Do not discard the selected agreement on a rejected save")
    assert.equal(control().querySelector('[role="alert"]').textContent, "We couldn’t save your upload. Your files are still selected—please try again.")
    assert.equal(activated, 0)
    assert.equal(button("Confirm upload", control()).disabled, false)

    pending = deferred()
    await click(button("Confirm upload", control()))
    assert.equal(control().querySelector('[role="alert"]'), null, "Clear the stale error during a retry")
    await React.act(async () => { pending.resolve(true) })
    assert.equal(calls, 2)
    assert.equal(activated, 1)
    assert.equal(button("Confirm upload"), undefined, "The saved selection is cleared")
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
    assert.match(note.placeholder, /at least 10 characters/)
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

test("Submit progress update stays disabled until there are field notes, and then sends exactly what was typed", async () => {
  await withUi(async ({ React, root, server, w, click, button }) => {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = activeFixture(), actor = state.accounts.find(account => account.id === "a4")
    actor.expiry = "2099-01-01"
    const requests = []
    await React.act(() => root.render(React.createElement(Workspace, {
      state, actor, onCommand(command) { requests.push(command); return Promise.resolve({ ok: true }) },
      onRead() {}, onMute() {}, onReload() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {},
    })))
    await click([...document.querySelectorAll(".sidebar button")].find(el => el.textContent.trim() === "Active sites"))
    await click(button("Open phase workspace"))
    const submit = () => button("Submit progress update")
    const notes = () => document.querySelector('[placeholder="Report the current conditions, observations, or a site issue."]')
    assert.equal(submit().disabled, true, "an empty update cannot be sent")
    assert.match(document.getElementById("progress-update-hint").textContent, /field notes or an attachment/)
    await click(submit())
    assert.equal(requests.length, 0, "clicking the disabled button sends nothing")
    await input(React, w, notes(), "   ")
    assert.equal(submit().disabled, true, "spaces are not a note")
    await input(React, w, notes(), "Foundation forms are in place.")
    assert.equal(submit().disabled, false)
    assert.equal(document.getElementById("progress-update-hint"), null, "the hint goes away once there is something to send")
    await click(submit())
    assert.equal(requests.length, 1)
    assert.equal(requests[0].type, "submit_progress")
    assert.equal(requests[0].note, "Foundation forms are in place.")
    await React.act(async () => {})
    assert.equal(notes().value, "", "the form is cleared after a successful send")
    assert.equal(submit().disabled, true, "and cannot be sent again empty")
  })
})
