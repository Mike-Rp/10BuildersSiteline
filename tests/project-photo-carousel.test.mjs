import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("carousel downloads each approved photo once, loops and navigates from memory, and frees urls on close", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const saved = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  mock.timers.enable({ apis: ["setInterval"] })
  dom.window.setInterval = globalThis.setInterval
  dom.window.clearInterval = globalThis.clearInterval
  const originalFetch = globalThis.fetch, createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL
  const requests = [], created = [], revoked = []
  let counter = 0
  URL.createObjectURL = () => { const url = `blob:photo-${++counter}`; created.push(url); return url }
  URL.revokeObjectURL = url => { revoked.push(url) }
  globalThis.fetch = async url => {
    requests.push(String(url))
    await new Promise(resolve => setImmediate(resolve))
    return new Response(new Blob(["x"], { type: "image/jpeg" }), { status: 200 })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const client = await server.ssrLoadModule("/src/api/client.ts")
    const { default: Overview } = await server.ssrLoadModule("/src/ProjectMonitoringOverview.tsx")
    const { initialState } = await server.ssrLoadModule("/tests/fixtures/demo-state.ts")
    const { workflowFor } = await server.ssrLoadModule("/src/workflows.ts")
    client.setToken("test-token")
    const state = initialState(), project = state.projects.find(p => p.status === "active")
    const photo = (id, date) => ({ id, name: `${id}.jpg`, uploaded: true, clientVisible: true, date, owner: "x", label: "Site photo" })
    project.workflow = { ...workflowFor(project), photos: [photo("p1", "2026-11-12"), photo("p2", "2026-11-11")] }
    for (const id of ["p1", "p2"]) client.registerFileUrl(id, `/api/v1/projects/${project.id}/phase-files/${id}`)
    const settle = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)) })
    const shown = () => document.querySelector(".monitor-photo img")?.getAttribute("src")
    const click = label => act(async () => { document.querySelector(`[aria-label="${label}"]`).click() })
    await act(async () => root.render(React.createElement(Overview, { project, state, onPreview() {} })))
    await settle()
    assert.ok(shown(), "first photo displays")
    for (let i = 0; i < 6; i++) { await act(async () => mock.timers.tick(5000)); await settle(); assert.ok(shown(), `photo ${i + 1} stays visible while looping`) }
    for (const label of ["Next approved photo", "Next approved photo", "Previous approved photo", "Previous approved photo", "Previous approved photo"]) { await click(label); await settle(); assert.ok(shown()) }
    const files = requests.filter(url => url.includes("/phase-files/"))
    assert.equal(files.length, 2, `only two file requests, saw ${files.join(", ")}`)
    assert.equal(created.length, 2)
    await act(async () => root.unmount())
    assert.deepEqual([...revoked].sort(), [...created].sort(), "object urls are released when the carousel closes")
  } finally {
    mock.timers.reset()
    globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
    await server.close(); dom.window.close()
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  }
})
