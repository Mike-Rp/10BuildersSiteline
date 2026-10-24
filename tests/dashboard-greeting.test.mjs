import assert from "node:assert/strict"
import test from "node:test"
import { nextDashboardGreeting, sessionDashboardGreeting } from "../src/dashboard-greeting.ts"
import { readFile } from "node:fs/promises"

const store = () => {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
}

test("each login shuffles the four personalized greetings without Hello or repeats between rounds", () => {
  const storage = store()
  const greetings = Array.from({ length: 20 }, () => nextDashboardGreeting("rotation", "  Karlo Espiritu  ", {
    storage, random: () => 0.4,
  }))
  for (let i = 0; i < greetings.length; i += 4) assert.equal(new Set(greetings.slice(i, i + 4).map(g => g.message)).size, 4)
  greetings.forEach((greeting, i) => {
    assert.match(greeting.message, /, Karlo Espiritu\.$/)
    assert.doesNotMatch(greeting.message, /Hello/)
    if (i) assert.notEqual(greeting.message, greetings[i - 1].message)
  })
})

test("greeting rotation tolerates blocked and malformed browser storage", () => {
  const blocked = { getItem() { throw Error("Blocked") }, setItem() { throw Error("Blocked") } }
  const messages = Array.from({ length: 4 }, () => nextDashboardGreeting("blocked", "", { storage: blocked }).message)
  assert.equal(new Set(messages).size, 4)
  assert.ok(messages.every(message => !message.includes(",")))
  const invalid = { getItem: () => '{"remaining":[999,-1],"last":999}', setItem() {} }
  assert.match(nextDashboardGreeting("invalid", "Mikaela", { storage: invalid }).message, /, Mikaela\.$/)
})

test("session refresh keeps the same greeting and a fresh login rotates it", () => {
  const storage = store()
  const first = sessionDashboardGreeting("session", "Karlo", { storage, fresh: true })
  for (let i = 0; i < 5; i++) assert.deepEqual(sessionDashboardGreeting("session", "Karlo", { storage }), first)
  const next = sessionDashboardGreeting("session", "Karlo", { storage, fresh: true })
  assert.notEqual(next.message, first.message)
  assert.deepEqual(sessionDashboardGreeting("session", "Karlo", { storage }), next)
  assert.match(sessionDashboardGreeting("other", "Mikaela", { storage }).message, /, Mikaela\.$/)
  storage.setItem("siteline-dashboard-session-greeting:session", "Hello, Karlo.")
  assert.doesNotMatch(sessionDashboardGreeting("session", "Karlo", { storage }).message, /Hello/)
  const blocked = { getItem() { throw Error("Blocked") }, setItem() { throw Error("Blocked") } }
  assert.match(sessionDashboardGreeting("blocked-session", "Karlo", { storage: blocked }).message, /, Karlo\.$/)
})

test("old five-greeting rotations do not alter the new four-greeting cycle", () => {
  const storage = store()
  storage.setItem("siteline-dashboard-greetings:legacy", '{"remaining":[2,3,4],"last":1}')
  const greetings = Array.from({ length: 4 }, () => nextDashboardGreeting("legacy", "Karlo", { storage }))
  assert.equal(new Set(greetings.map(greeting => greeting.message)).size, 4)
  assert.ok(greetings.every(greeting => !greeting.message.startsWith("Hello")))
})

test("welcome stays throughout the session despite elapsed time, activity and navigation", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Welcome } = await server.ssrLoadModule("/src/DashboardWelcome.tsx")
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_800_000_000_000 })
    const render = (greeting, key = "welcome") => React.act(() => root.render(React.createElement(Welcome, { greeting, key })))
    const advance = ms => React.act(() => t.mock.timers.tick(ms))
    const greeting = { message: "Welcome back, Karlo." }
    await render(undefined)
    assert.equal(document.querySelector(".dashboard-welcome"), null, "signed-out sessions have no welcome")
    await render(greeting)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, greeting.message)
    for (const event of ["scroll", "click", "keydown", "input"]) {
      await React.act(() => window.dispatchEvent(new dom.window.Event(event)))
      assert.ok(document.querySelector(".dashboard-welcome"), `${event} does not dismiss the welcome`)
    }
    await advance(10 * 60_000)
    await render(greeting)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, greeting.message, "the old ten-minute deadline no longer hides the greeting")
    await advance(24 * 60 * 60_000)
    await React.act(() => root.render(React.createElement("div", null, "Another page")))
    await render(greeting)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, greeting.message, "returning after a long time preserves the session greeting")
    const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8")
    assert.doesNotMatch(css, /dashboard-welcome-out/, "no CSS animation can fade out the persistent greeting")
    await render(undefined)
    assert.equal(document.querySelector(".dashboard-welcome"), null, "logout clears the greeting")
    const next = { message: "Good to see you, Karlo." }
    await render(next)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, next.message, "a new login shows the next greeting")
  } finally {
    await React.act(() => root.unmount())
    t.mock.timers.reset()
    await server.close()
    dom.window.close()
    for (const [key, value] of previous) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]
  }
})
