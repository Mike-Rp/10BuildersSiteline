import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("login asks which device to use and replaces a session only after confirmation", async () => {
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
  const originalFetch = globalThis.fetch
  try {
    const { default: App } = await server.ssrLoadModule("/src/App.tsx")
    const client = await server.ssrLoadModule("/src/api/client.ts")
    client.setToken("")
    const requests = []
    let approveReplacement = false
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith("/auth/login"))
      const body = JSON.parse(init.body)
      requests.push(body)
      if (body.replace_session === true) {
        approveReplacement = true
        return Response.json({ message: "Cannot reach the server. Try again." }, { status: 503 })
      }
      return Response.json({ message: "Your account is already logged in on another device.", error: { code: "ACCOUNT_ALREADY_SIGNED_IN" } }, { status: 409 })
    }
    await act(() => root.render(React.createElement(App)))
    const setValue = async (input, value) => act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value)
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
    const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label)
    const submit = () => act(() => document.querySelector('form.login-form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })))
    const [email, password] = document.querySelectorAll('form.login-form input')
    await setValue(email, "office@example.test")
    await setValue(password, "Password@123")
    await submit()
    assert.match(document.querySelector('[aria-label="Account already signed in"]').textContent, /already logged in on another device/)
    assert.equal(approveReplacement, false)
    assert.equal(email.getAttribute("aria-invalid"), "false")
    await act(() => button("Keep current device signed in").click())
    assert.equal(document.querySelector('[aria-label="Account already signed in"]'), null)
    assert.match(document.querySelector('[role="status"]').textContent, /current device will stay signed in/)
    assert.equal(requests.length, 1, "keeping the current device makes no takeover request")
    await setValue(password, "Password@123")
    await submit()
    await act(() => button("Log in on this device").click())
    assert.equal(approveReplacement, true)
    assert.equal(requests[2].replace_session, true)
    assert.match(document.querySelector('.login-error').textContent, /Cannot reach the server/)
    assert.equal(client.getToken(), "")
  } finally {
    await act(() => root.unmount())
    globalThis.fetch = originalFetch
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})

test("a replaced session clears the old token and announces why, without clearing a newer token", async t => {
  const { api, ApiError, getToken, setToken, setApiBase, SESSION_REPLACED_EVENT } = await import("../src/api/client.ts")
  const dom = new JSDOM("", { url: "http://localhost" })
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true, writable: true })
  const messages = []
  dom.window.addEventListener(SESSION_REPLACED_EVENT, event => messages.push(event.detail))
  setApiBase("http://test-session/api/v1")
  setToken("old-token")
  const response = () => Response.json({ error: { code: "SESSION_REPLACED", message: "Your account was signed in on another device. This device has been signed out." } }, { status: 401 })
  t.mock.method(globalThis, "fetch", async () => response())
  try {
    await assert.rejects(api("/auth/me"), error => error instanceof ApiError && error.code === "SESSION_REPLACED")
    assert.equal(getToken(), "")
    assert.equal(messages.length, 1)
    setToken("old-token")
    globalThis.fetch = async () => { setToken("new-token"); return response() }
    await assert.rejects(api("/auth/me"))
    assert.equal(getToken(), "new-token")
    assert.equal(messages.length, 1, "an old response cannot sign out a newly authenticated session")
  } finally {
    setToken("")
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window
    dom.window.close()
  }
})
