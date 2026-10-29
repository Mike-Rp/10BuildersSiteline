import assert from "node:assert/strict"
import test from "node:test"

test("login carousel rotates automatically with display-only indicators and pauses when hidden or reduced-motion is enabled", async t => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const media = matches => ({
    matches,
    listeners: new Set(),
    addEventListener(_event, listener) { this.listeners.add(listener) },
    removeEventListener(_event, listener) { this.listeners.delete(listener) },
    change(matches) { this.matches = matches; this.listeners.forEach(listener => listener()) },
  })
  const wide = media(true), reduced = media(false)
  window.matchMedia = query => query.includes("min-width") ? wide : reduced
  let hidden = false
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: Banner } = await server.ssrLoadModule("/src/LoginBanner.tsx")
    t.mock.timers.enable({ apis: ["setInterval"] })
    window.setInterval = globalThis.setInterval
    window.clearInterval = globalThis.clearInterval
    const advance = ms => React.act(() => t.mock.timers.tick(ms))
    const heading = () => document.querySelector(".login-banner h2").textContent
    const activeIndicator = () => [...document.querySelectorAll(".login-banner-indicator")].findIndex(el => el.classList.contains("is-active"))
    await React.act(() => root.render(React.createElement(Banner)))
    assert.equal(heading(), "Project monitoring")
    assert.equal(activeIndicator(), 0)
    assert.equal(document.querySelectorAll(".login-banner button, .login-banner a, .login-banner [tabindex]").length, 0)
    assert.equal(document.querySelector(".login-banner-indicators").getAttribute("aria-hidden"), "true")
    await advance(5999)
    assert.equal(heading(), "Project monitoring")
    await advance(1)
    assert.equal(heading(), "Team coordination")
    assert.equal(activeIndicator(), 1)
    await React.act(() => document.querySelector(".login-banner-indicator").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })))
    assert.equal(heading(), "Team coordination", "clicking a bar cannot select a slide")
    await advance(6000)
    assert.equal(heading(), "Document management")
    assert.equal(activeIndicator(), 2)
    await advance(6000)
    assert.equal(heading(), "Project monitoring", "rotation loops through all slides")

    await React.act(() => { hidden = true; document.dispatchEvent(new dom.window.Event("visibilitychange")) })
    await advance(18000)
    assert.equal(heading(), "Project monitoring", "background tabs do not rotate")
    await React.act(() => { hidden = false; document.dispatchEvent(new dom.window.Event("visibilitychange")) })
    await advance(6000)
    assert.equal(heading(), "Team coordination")
    await React.act(() => reduced.change(true))
    await advance(18000)
    assert.equal(heading(), "Team coordination", "reduced-motion preference pauses rotation")
    await React.act(() => reduced.change(false))
    await advance(6000)
    assert.equal(heading(), "Document management")
    await React.act(() => wide.change(false))
    await advance(18000)
    assert.equal(heading(), "Document management", "the hidden mobile banner does not rotate")
    await React.act(() => wide.change(true))
    await advance(6000)
    assert.equal(heading(), "Project monitoring")
    // The admin version uses the same photos as a full-screen background on phones too.
    await React.act(() => root.render(React.createElement(Banner, {key:"admin",background:true})))
    assert.equal(document.querySelectorAll('.admin-login-background picture').length,3)
    assert.equal(document.querySelectorAll('.admin-login-background button,.login-banner-footer,.login-photo-caption').length,0)
    assert.equal(document.querySelectorAll('.admin-login-background source').length,0,"Admin mobile backgrounds must not use the transparent mobile placeholder")
    const activeBackground=()=>document.querySelector('.admin-login-background .is-active img').getAttribute('src')
    const before=activeBackground()
    await React.act(()=>wide.change(false))
    await advance(6000)
    assert.notEqual(activeBackground(),before,"Admin background rotates even at mobile widths")
    await React.act(()=>reduced.change(true))
    const pausedBackground=activeBackground()
    await advance(18000)
    assert.equal(activeBackground(),pausedBackground)
  } finally {
    await React.act(() => root.unmount())
    t.mock.timers.reset()
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
  assert.equal(wide.listeners.size, 0)
  assert.equal(reduced.listeners.size, 0)
})
