import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("all shared PDF fields show 10 MB and reject oversized selections before preview or upload", { timeout: 30000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    navigator: { userAgent: dom.window.navigator.userAgent, userAgentData: {}, pdfViewerEnabled: true }, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const requests = [], previews = [], revoked = [], saves = []
  t.mock.method(globalThis, "fetch", async (...args) => { requests.push(args); throw Error("No upload is expected") })
  t.mock.method(URL, "createObjectURL", file => { previews.push(file.name); return `blob:upload-preview-${previews.length}` })
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url))
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  const mb = 1024 * 1024
  const file = (name, size) => {
    const selected = new dom.window.File(["%PDF-1.4"], name, { type: "application/pdf" })
    Object.defineProperty(selected, "size", { value: size })
    return selected
  }
  const select = async files => act(() => {
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: files, configurable: true })
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
  })
  const click = async (text, within = document) => {
    const button = [...within.querySelectorAll("button")].find(el => el.textContent.trim() === text || el.getAttribute("aria-label") === text)
    assert.ok(button, `Missing ${text}`)
    await act(() => button.click())
  }
  try {
    const { Upload } = await server.ssrLoadModule("/src/panels.tsx")
    for (const label of ["Client Contract Agreement", "PRC License", "QA/QC evidence", "Signed agreement", "General field evidence"]) {
      await act(() => root.render(React.createElement(Upload, { key: label, label, onSave: doc => saves.push(doc) })))
      const input = document.querySelector('input[type="file"]')
      const hint = document.getElementById(input.getAttribute("aria-describedby"))
      assert.match(hint.textContent, /PDF.*Project files share a 10 MB total limit/)
      assert.equal(input.getAttribute("aria-label"), label)
      assert.equal(document.querySelector('.upload-control button').getAttribute("aria-describedby"), hint.id)
      await select([file("too-large.pdf", 10 * mb + 1)])
      assert.match(document.querySelector('[role="alert"]').textContent, /10 MB or smaller/)
      assert.equal(document.querySelector('[role="dialog"]'), null)
      assert.equal(input.value, "")
    }
    assert.deepEqual(previews, [], "oversized files never create a PDF preview")
    assert.deepEqual(requests, [], "oversized files never reach the network")
    await select([file("boundary.pdf", 10 * mb)])
    assert.match(document.querySelector('[role="dialog"]').textContent, /boundary.pdf/)
    assert.match(document.querySelector('[role="dialog"] .upload-limit').textContent, /Project files share a 10 MB total limit/)
    assert.equal(previews.length, 1)
    // Invalid replacement must not leave the prior valid file confirmable.
    await select([file("oversized-replacement.pdf", 10 * mb + 1)])
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.match(document.querySelector('[role="alert"]').textContent, /10 MB/)
    assert.equal(revoked.length, 1)
    await select([file("corrected.pdf", 100)])
    assert.equal(document.querySelector('[role="alert"]'), null)
    assert.match(document.querySelector('[role="dialog"]').textContent, /corrected.pdf/)
    await click("Back")
    assert.equal(document.querySelector('[role="dialog"]'), null)

    await act(() => root.render(React.createElement(Upload, { key: "excel", label: "Manpower list", spreadsheet: true, onSave: doc => saves.push(doc) })))
    assert.match(document.querySelector('.upload-limit').textContent, /XLSX or XLS.*15 MB per file/)
    await select([file("report.pdf", 100)])
    assert.match(document.querySelector('[role="alert"]').textContent, /XLSX, XLS files only/)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(requests, [])
    assert.deepEqual(saves, [])

    // The retained chat-only extension picker uses the same per-file policy.
    const { default: ExtensionWorkflow } = await server.ssrLoadModule("/src/ExtensionWorkflow.tsx")
    const { default: ExtensionDemoProvider } = await server.ssrLoadModule("/src/ExtensionDemoContext.tsx")
    const { DEMO_ACCOUNTS } = await server.ssrLoadModule("/src/extension-demo.ts")
    await act(() => root.render(React.createElement(ExtensionDemoProvider, null, React.createElement(ExtensionWorkflow, { actor: DEMO_ACCOUNTS.find(actor => actor.id === "a5") }))))
    const card = [...document.querySelectorAll('.extension-project')].find(el => el.querySelector('h3')?.textContent === "Santos Residence")
    await click("Request Extension", card)
    const dialog = document.querySelector('[role="dialog"]')
    const input = dialog.querySelector('input[type="file"]')
    assert.equal(input.accept, ".pdf,.jpg,.jpeg,.png")
    assert.match(document.getElementById(input.getAttribute("aria-describedby")).textContent, /Project files share a 10 MB total limit/)
    const stored = localStorage.getItem("siteline-extension-demo-v1")
    await select([file("valid.pdf", 100), file("over-limit.pdf", 10 * mb + 1)])
    assert.match(dialog.querySelector('[role="alert"]').textContent, /over-limit.pdf.*10 MB or smaller/)
    assert.equal(dialog.querySelector('.extension-evidence li'), null, "a rejected batch adds no attachments")
    assert.equal(localStorage.getItem("siteline-extension-demo-v1"), stored)
    await select([file("accepted.pdf", 10 * mb)])
    assert.match(dialog.querySelector('.extension-evidence').textContent, /accepted.pdf/)
    assert.equal(dialog.querySelector('[role="alert"]'), null)
    assert.deepEqual(requests, [])
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
