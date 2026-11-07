import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("Existing engineer scope review saves multiple tags, limits selection and preserves failed edits", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  previous.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"))
  const requests = []
  let reject = true
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method, body: JSON.parse(options.body) })
    return new Response(JSON.stringify(reject ? { error: { message: "Assignment changed. Refresh and retry." } } : { data: { saved: true } }), { status: reject ? 409 : 200, headers: { "Content-Type": "application/json" } })
  }
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/scope-review-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Review } = await server.ssrLoadModule("/src/EngineerScopeReview.tsx")
    const state = initialState()
    const engineer = state.accounts.find(account => account.role === "spm")
    const project = { ...state.projects[0], id: "scope-review-project", team: [
      { phase: "Finishes", accountId: engineer.id, status: "confirmed", requiredDisciplines: ["Electrical", "Interior/Finishes", "Civil", "Structural", "Mechanical"] },
      { phase: "Foundation", accountId: engineer.id, status: "pending", requiredDisciplines: ["Civil", "Structural"] },
      { phase: "Design", accountId: engineer.id, status: "confirmed", requiredDisciplines: ["Mechanical"] }
    ] }
    engineer.qualifiedRequirements = ["Electrical", "Interior/Finishes", "Civil", "Structural"]
    engineer.engineerCommitments = project.team.map(row => ({ project_id: project.id, phase: row.phase, tags: null }))
    let reloads = 0
    const render = async () => act(() => root.render(React.createElement(Review, { project, state, onReload: async () => { reloads++ } })))
    const click = async element => act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    await render()
    assert.equal(document.querySelectorAll("select").length, 0)
    const rows = document.querySelectorAll(".scope-review-row")
    assert.equal(rows.length, 3)
    const boxes = [...rows[0].querySelectorAll('input[type="checkbox"]')]
    assert.equal(boxes.length, 4, "Only verified phase-matching tags appear")
    const save = rows[0].querySelector("button")
    assert.equal(save.disabled, true)
    await click(boxes[0])
    await click(boxes[1])
    assert.equal(rows[1].querySelectorAll("input:checked").length, 0, "Selections are independent by assignment")
    assert.match(rows[0].textContent, /2 of 3 specializations selected/)
    await click(save)
    assert.deepEqual(requests[0].body, { phase: "Finishes", userId: engineer.id, tags: ["Electrical", "Interior/Finishes"] })
    assert.equal(requests[0].method, "POST")
    assert.equal(reloads, 0)
    assert.match(document.querySelector('[role="alert"]').textContent, /Assignment changed/)
    assert.equal(rows[0].querySelectorAll("input:checked").length, 2)
    assert.equal(save.disabled, false)
    await click(boxes[2])
    assert.equal(boxes[3].disabled, true, "A fourth assigned tag is blocked")
    await click(boxes[2])
    assert.equal(boxes[3].disabled, false)
    reject = false
    await click(save)
    assert.equal(reloads, 1)
    assert.deepEqual(requests[1].body.tags, ["Electrical", "Interior/Finishes"])
    assert.equal(save.disabled, true, "Saved scope cannot be submitted again")
    assert.match(document.querySelector('[role="status"]').textContent, /saved/)
    assert.match(rows[2].textContent, /No verified specializations match this phase/)
    assert.equal(rows[2].querySelector("button").disabled, true)
    engineer.engineerCommitments = []
    await render()
    assert.equal(document.querySelector(".engineer-scope-review"), null, "Recorded scopes do not appear for review")
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
