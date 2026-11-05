import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"
import { downloadApiFile, registerFileUrl, fileUrlSnapshot } from "../src/api/client.ts"
import { clearWorkspaceCache, readWorkspaceCache, saveWorkspaceCache } from "../src/workspaceCache.ts"

const memoryStorage = () => {
  const items = new Map()
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
  }
}
const workspace = () => ({ ...emptyState(), accounts: [{ id: "u1", name: "Admin", role: "admin", status: "active" }] })

test("a saved workspace comes back only for the same signed-in user", () => {
  globalThis.sessionStorage = memoryStorage()
  saveWorkspaceCache("u1", workspace(), false)
  assert.equal(readWorkspaceCache("u1").state.accounts[0].name, "Admin")
  assert.equal(readWorkspaceCache("u1").mustReset, false)
  assert.equal(readWorkspaceCache("someone-else"), undefined)
})

test("a password-reset account keeps its reset requirement in the saved copy", () => {
  globalThis.sessionStorage = memoryStorage()
  saveWorkspaceCache("u1", workspace(), true)
  assert.equal(readWorkspaceCache("u1").mustReset, true)
})

test("clearing, damaged or foreign-shaped data never produces a workspace", () => {
  globalThis.sessionStorage = memoryStorage()
  saveWorkspaceCache("u1", workspace(), false)
  clearWorkspaceCache()
  assert.equal(readWorkspaceCache("u1"), undefined)
  sessionStorage.setItem("siteline-workspace-cache", "{not json")
  assert.equal(readWorkspaceCache("u1"), undefined)
  sessionStorage.setItem("siteline-workspace-cache", JSON.stringify({ build: "other-build", userId: "u1", state: workspace() }))
  assert.equal(readWorkspaceCache("u1"), undefined)
  sessionStorage.setItem("siteline-workspace-cache", JSON.stringify({ build: "test", userId: "u1", state: { accounts: "nope" } }))
  assert.equal(readWorkspaceCache("u1"), undefined)
})

test("storage that is unavailable or full leaves the app working and drops the old copy", () => {
  globalThis.sessionStorage = memoryStorage()
  saveWorkspaceCache("u1", workspace(), false)
  sessionStorage.setItem = () => { throw new DOMException("full", "QuotaExceededError") }
  assert.doesNotThrow(() => saveWorkspaceCache("u1", workspace(), false))
  assert.equal(readWorkspaceCache("u1"), undefined)
  delete globalThis.sessionStorage
  assert.doesNotThrow(() => saveWorkspaceCache("u1", workspace(), false))
  assert.equal(readWorkspaceCache("u1"), undefined)
  assert.doesNotThrow(() => clearWorkspaceCache())
})

test("document download links survive a restore", async () => {
  globalThis.sessionStorage = memoryStorage()
  registerFileUrl("doc-1", "/api/v1/files/doc-1/content")
  saveWorkspaceCache("u1", workspace(), false)
  assert.equal(fileUrlSnapshot()["doc-1"], "/api/v1/files/doc-1/content")
  const restored = readWorkspaceCache("u1")
  assert.ok(restored)
  // The link is registered again, so a download is attempted instead of silently returning nothing.
  const originalFetch = globalThis.fetch
  let requested = ""
  globalThis.fetch = async url => { requested = String(url); return new Response("x", { status: 200 }) }
  try { await downloadApiFile("doc-1") } finally { globalThis.fetch = originalFetch }
  assert.match(requested, /\/files\/doc-1\/content$/)
})
