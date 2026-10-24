import assert from "node:assert/strict"
import test from "node:test"
import { nextDashboardGreeting, WELCOME_DURATION_MS } from "../src/dashboard-greeting.ts"

const store = () => {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
}

test("each login shuffles five personalized greetings without repeats between rounds", () => {
  assert.equal(WELCOME_DURATION_MS, 600_000)
  const storage = store()
  const greetings = Array.from({ length: 20 }, (_, index) => nextDashboardGreeting("rotation", "  Karlo Espiritu  ", {
    storage, now: index * 1000, random: () => 0.4,
  }))
  for (let i = 0; i < greetings.length; i += 5) assert.equal(new Set(greetings.slice(i, i + 5).map(g => g.message)).size, 5)
  greetings.forEach((greeting, i) => {
    assert.match(greeting.message, /, Karlo Espiritu\.$/)
    assert.equal(greeting.expiresAt, i * 1000 + WELCOME_DURATION_MS)
    if (i) assert.notEqual(greeting.message, greetings[i - 1].message)
  })
})

test("greeting rotation tolerates blocked and malformed browser storage", () => {
  const blocked = { getItem() { throw Error("Blocked") }, setItem() { throw Error("Blocked") } }
  const messages = Array.from({ length: 5 }, () => nextDashboardGreeting("blocked", "", { storage: blocked }).message)
  assert.equal(new Set(messages).size, 5)
  assert.ok(messages.every(message => !message.includes(",")))
  const invalid = { getItem: () => '{"remaining":[999,-1],"last":999}', setItem() {} }
  assert.match(nextDashboardGreeting("invalid", "Mikaela", { storage: invalid }).message, /, Mikaela\.$/)
})

test("welcome lasts ten minutes despite activity, stays gone after expiry, and returns on the next login", async t => {
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
    const greeting = { message: "Welcome back, Karlo.", expiresAt: Date.now() + WELCOME_DURATION_MS }
    await render(undefined)
    assert.equal(document.querySelector(".dashboard-welcome"), null, "restored sessions have no welcome")
    await render(greeting)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, greeting.message)
    assert.equal(document.querySelector(".dashboard-welcome").style.animationDelay, "599700ms")
    await advance(5000)
    await render(greeting)
    assert.equal(document.querySelector(".dashboard-welcome").style.animationDelay, "599700ms", "workspace updates must not shift the fade timing")
    await advance(WELCOME_DURATION_MS - 5001)
    assert.ok(document.querySelector(".dashboard-welcome"))
    await advance(1)
    assert.equal(document.querySelector(".dashboard-welcome"), null)
    await render(greeting, "return-to-dashboard")
    assert.equal(document.querySelector(".dashboard-welcome"), null, "navigation cannot restart an expired welcome")

    const next = { message: "Hello, Karlo.", expiresAt: Date.now() + WELCOME_DURATION_MS }
    await render(next)
    assert.equal(document.querySelector(".dashboard-welcome").textContent, next.message)
    await advance(5000)
    await React.act(() => root.render(React.createElement("div", null, "Another page")))
    await advance(1000)
    await render(next)
    assert.equal(document.querySelector(".dashboard-welcome").style.animationDelay, "593700ms", "returning uses the original expiry")
    await advance(WELCOME_DURATION_MS - 6000)
    assert.equal(document.querySelector(".dashboard-welcome"), null)

    function Session({ greeting, dashboard = true }) {
      const [current, setCurrent] = React.useState(greeting)
      return dashboard ? React.createElement(Welcome, { greeting: current, onDismiss: () => setCurrent(undefined) }) : React.createElement("div", null, "Another page")
    }
    for (const event of ["click", "keydown", "input"]) {
      const greeting = { message: `Hello after ${event} login.`, expiresAt: Date.now() + WELCOME_DURATION_MS }
      const session = dashboard => React.act(() => root.render(React.createElement(Session, { greeting, dashboard, key: event })))
      await session(true)
      assert.ok(document.querySelector(".dashboard-welcome"), "each new login starts a fresh welcome")
      await advance(5000)
      await React.act(() => window.dispatchEvent(new dom.window.Event("scroll")))
      assert.ok(document.querySelector(".dashboard-welcome"), "reading and scrolling do not dismiss the welcome")
      await React.act(() => window.dispatchEvent(new dom.window.Event(event)))
      assert.ok(document.querySelector(".dashboard-welcome"), `${event} does not dismiss the welcome`)
      await session(false)
      await session(true)
      assert.ok(document.querySelector(".dashboard-welcome"), "returning before expiry keeps the welcome")
      await advance(WELCOME_DURATION_MS - 5001)
      assert.ok(document.querySelector(".dashboard-welcome"), "activity and navigation do not shorten the ten-minute timer")
      await advance(1)
      assert.equal(document.querySelector(".dashboard-welcome"), null, "the welcome disappears completely at ten minutes")
      await session(false)
      await session(true)
      assert.equal(document.querySelector(".dashboard-welcome"), null, "returning to the dashboard cannot revive an expired welcome")
    }
  } finally {
    await React.act(() => root.unmount())
    t.mock.timers.reset()
    await server.close()
    dom.window.close()
    for (const [key, value] of previous) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]
  }
})
