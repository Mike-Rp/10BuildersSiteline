import assert from "node:assert/strict"
import test from "node:test"

test("notification saves report failures, serialize toggles, and discard responses after switching accounts", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, fetch: globalThis.fetch })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  let fail = false, held, release, controls, snapshot, setSnapshot
  const calls = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url, body, token: init.headers.get("Authorization") })
    if (held) { const wait = held; held = undefined; await wait }
    return new Response(JSON.stringify(fail ? { message: "Storage unavailable" } : { data: url.endsWith("/notifications/read") ? { ids: body.ids } : {} }), { status: fail ? 503 : 200 })
  }
  try {
    const { default: useSettings, NotificationSaveStatus } = await server.ssrLoadModule("/src/useNotificationSettings.tsx")
    const client = await server.ssrLoadModule("/src/api/client.ts")
    client.setApiBase("https://example.test/api")
    client.setToken("token-a")
    const initial = { accounts: [], projects: [], companies: [], events: [{ id: "1", read: false }], muted: [], userPreferences: { a: [] } }
    function Harness({ accountId = "a", signedOut = false }) {
      const [state, setState] = React.useState(initial)
      const ref = React.useRef(state)
      ref.current = state
      controls = useSettings(accountId, ref, setState, signedOut)
      snapshot = state
      setSnapshot = setState
      return React.createElement(NotificationSaveStatus, controls)
    }
    const settle = () => React.act(async () => { await new Promise(setImmediate); await new Promise(setImmediate) })
    await React.act(() => root.render(React.createElement(Harness)))
    fail = true
    await React.act(() => controls.toggleMute("notice"))
    await settle()
    assert.deepEqual(snapshot.userPreferences.a, [], "failed writes cannot replace saved preferences")
    assert.match(document.querySelector('[role="alert"]').textContent, /could not be saved.*previous settings were kept/i)
    fail = false
    await React.act(() => controls.toggleMute("notice"))
    await settle()
    assert.deepEqual(snapshot.userPreferences.a, ["notice"])
    assert.equal(document.querySelector('[role="alert"]'), null)
    await React.act(() => { controls.toggleMute("request"); controls.toggleMute("approval") })
    await settle()
    assert.deepEqual(snapshot.userPreferences.a, ["notice", "request", "approval"], "rapid toggles build on saved state rather than overwrite each other")
    await React.act(() => controls.markRead(["1", "foreign-id"]))
    await settle()
    assert.equal(snapshot.events[0].read, true)
    assert.deepEqual(snapshot.events[0].readBy, ["a"])
    assert.deepEqual(calls.at(-1).body.ids, ["1"])
    fail = true
    await React.act(() => controls.toggleMute("notice"))
    await settle()
    assert.deepEqual(snapshot.userPreferences.a, ["notice", "request", "approval"])
    fail = false

    held = new Promise(resolve => { release = resolve })
    await React.act(() => controls.toggleMute("progress"))
    await settle()
    assert.match(document.querySelector('[role="status"]').textContent, /Saving notification/)
    assert.equal(calls.at(-1).token, "Bearer token-a")
    client.setToken("token-b")
    await React.act(() => {
      setSnapshot({ ...initial, muted: ["approval"], userPreferences: { b: ["approval"] } })
      root.render(React.createElement(Harness, { accountId: "b" }))
    })
    assert.deepEqual(snapshot.userPreferences, { b: ["approval"] }, "a late response for account A cannot change account B")
    assert.equal(controls.pending, false)
    assert.equal(controls.error, "")
    await React.act(() => controls.toggleMute("notice"))
    await settle()
    assert.deepEqual(snapshot.userPreferences.b, ["approval", "notice"])
    assert.equal(calls.at(-1).token, "Bearer token-b")
    release()
    await settle()
    assert.deepEqual(snapshot.userPreferences, { b: ["approval", "notice"] }, "an earlier session's response stays isolated even when it finishes later")
    await React.act(() => root.render(React.createElement(Harness, { accountId: "b", signedOut: true })))
    const count = calls.length
    await React.act(() => controls.toggleMute("progress"))
    await settle()
    assert.equal(calls.length, count, "signed-out sessions cannot save preferences")
  } finally {
    release?.()
    await React.act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})

test("a failed notification or preference load is reported instead of restoring empty defaults", async () => {
  const { setApiBase, setToken } = await import("../src/api/client.ts")
  const { loadState } = await import("../src/api/load.ts")
  const originalFetch = globalThis.fetch
  setApiBase("https://example.test/api")
  setToken("test-token")
  try {
    for (const failedPath of ["/notifications", "/workspace"]) {
      globalThis.fetch = async url => {
        const failed = new URL(url).pathname.endsWith(failedPath)
        return new Response(JSON.stringify(failed ? { message: "Saved notification state could not be loaded" } : { data: [] }), { status: failed ? 403 : 200 })
      }
      await assert.rejects(loadState({ id: "client", role: "client" }), /Saved notification state could not be loaded/)
    }
  } finally {
    globalThis.fetch = originalFetch
    setToken("")
  }
})
