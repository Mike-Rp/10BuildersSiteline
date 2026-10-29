import assert from "node:assert/strict"
import test from "node:test"
import { api, setApiBase, setToken } from "../src/api/client.ts"

test("API reads stay fresh across session changes and cannot opt into browser caching", async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original; setToken("") })
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return Response.json({ data: { revision: calls.length } })
  }
  setApiBase("http://127.0.0.1:3000/api/v1")
  setToken("local-test-session-a")
  assert.equal((await api("/workspace", { cache: "force-cache" })).revision, 1)
  assert.equal((await api("/workspace")).revision, 2)
  setToken("local-test-session-b")
  assert.equal((await api("/workspace")).revision, 3)
  assert.ok(calls.every(call => call.init.cache === "no-store"))
  assert.notEqual(calls[0].init.headers.get("Authorization"), calls[2].init.headers.get("Authorization"))
})
