import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { CLIENT_PHOTO_EXAMPLES, canShowClientPhotoExamples } from "../src/client-photo-examples.ts"
import { initialState } from "./fixtures/demo-state.ts"
import { clientProjectViews } from "../src/client-access.ts"

test("sample photos are restricted to the requested active Client with no shared photos and all images exist", async () => {
  const actor = { email: "gonzales.vialh@10builders.com", status: "active" }
  assert.equal(canShowClientPhotoExamples(actor, { photos: [] }), true)
  assert.equal(canShowClientPhotoExamples({ ...actor, email: " GONZALES.VIALH@10BUILDERS.COM " }, { photos: [] }), true)
  assert.equal(canShowClientPhotoExamples({ ...actor, status: "suspended" }, { photos: [] }), false)
  assert.equal(canShowClientPhotoExamples({ ...actor, email: "another.client@10builders.com" }, { photos: [] }), false)
  assert.equal(canShowClientPhotoExamples(actor, undefined), false)
  assert.equal(canShowClientPhotoExamples(actor, { photos: [{ id: "real-photo" }] }), false)
  for (const photo of CLIENT_PHOTO_EXAMPLES) {
    const bytes = await readFile(new URL(`../public${photo.src}`, import.meta.url))
    assert.ok(bytes.length > 1000)
    assert.match(photo.alt, /Illustrative construction example/)
  }
})

test("Client photo collage previews labeled samples without API activity and uses real uploads when present", { timeout: 30000 }, async t => {
  const { JSDOM } = await import("jsdom")
  const { createServer } = await import("vite")
  const { default: React, act } = await import("react")
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map(), w = dom.window
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node, sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const requests = [], resolves = []
  t.mock.method(globalThis, "fetch", async url => { requests.push(String(url)); throw Error("No sample uploads or API calls allowed") })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/client-samples-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Portal } = await server.ssrLoadModule("/src/ClientPortal.tsx")
    const state = initialState(), actor = { ...state.accounts.find(a => a.id === "a9"), email: "gonzales.vialh@10builders.com", name: "Vialh Gonzales" }
    const project = { ...clientProjectViews(state, actor.id)[0], photos: [] }
    const props = { actor, projects: [project], readNoticeIds: [], mutedTypes: [], onMute() {}, onResolve(projectId, id) { resolves.push(id); return { id, name: `${id}.jpg`, label: "Site photo", uploaded: true, clientVisible: true, owner: "Site PM", date: "2026-10-27" } }, onReport() { return "report" }, onRecord() { throw Error("Samples must never create production activity records") }, onRead() {}, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} }
    const render = async overrides => act(() => root.render(React.createElement(Portal, { ...props, ...overrides })))
    const click = async label => {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === label || b.getAttribute("aria-label") === label)
      assert.ok(!!button, `Missing ${label}`)
      await act(() => button.click())
    }
    await render({})
    assert.equal(document.querySelectorAll(".co-photos .client-photos-collage .client-photo").length, 3)
    assert.match(document.querySelector(".co-photos").textContent, /Sample photos/)
    assert.match(document.querySelector(".co-photos").textContent, /not project uploads/)
    assert.match(document.querySelector(".co-summary-resources").textContent, /0 shared site photos/)
    assert.equal(document.querySelectorAll(".co-update-stack .co-shortcuts button").length, 2)
    await click("View sample photo: Foundation overview")
    assert.match(document.querySelector('[aria-modal="true"]').textContent, /AI-generated illustration/)
    assert.match(document.querySelector('[aria-modal="true"]').textContent, /does not document work or progress/)
    assert.equal(document.querySelector('.client-sample-preview').getAttribute('src'), CLIENT_PHOTO_EXAMPLES[0].src)
    await click("Close dialog")
    await click("View gallery")
    assert.equal(document.querySelectorAll(".client-sample-photos img").length, 3)
    await click("Project Overview")
    assert.equal(resolves.length, 0)
    assert.equal(requests.length, 0)
    // Once there are actual uploads, samples disappear and the latest three records are used.
    const uploaded = [21, 22, 23, 24].map(day => ({ id: `real-${day}`, name: `Actual site ${day}.jpg`, label: "Released site photo", uploaded: true, date: `2026-10-${day}` }))
    await render({ projects: [{ ...project, photos: uploaded }] })
    assert.ok(!document.querySelector(".client-sample-photos"))
    const tiles = [...document.querySelectorAll(".client-photos-collage .client-photo")]
    assert.equal(tiles.length, 3)
    assert.match(tiles[0].textContent, /Actual site 24/)
    assert.ok(!tiles.some(tile => tile.textContent.includes("Actual site 21")))
    assert.deepEqual(resolves.slice().sort(), ["real-22", "real-23", "real-24"])
    for (const count of [1, 2]) {
      await render({ projects: [{ ...project, photos: uploaded.slice(0, count) }] })
      assert.ok(document.querySelector(`.client-photos-collage.photos-${count}`))
    }
    await render({ actor: { ...actor, email: "different.client@10builders.com" } })
    assert.ok(!document.querySelector(".client-sample-photos"))
    assert.match(document.querySelector(".co-photos").textContent, /No site photos shared yet/)
    await render({ projects: [] })
    assert.ok(!document.querySelector(".client-sample-photos"))
    assert.equal(requests.length, 0)
  } finally {
    await act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
