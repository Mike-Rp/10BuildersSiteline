import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test(
  "the app ignores a cached demo workspace and requires backend authentication",
  { timeout: 30000 },
  async (t) => {
    const dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      {
        url: "http://localhost:8443/",
        pretendToBeVisual: true,
      },
    )
    const w = dom.window
    const globals = [
      "window",
      "document",
      "HTMLElement",
      "Element",
      "Node",
      "Event",
      "KeyboardEvent",
      "MouseEvent",
      "InputEvent",
      "File",
      "FileReader",
      "Blob",
      "DOMParser",
      "MutationObserver",
      "getComputedStyle",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "sessionStorage",
      "localStorage",
      "HTMLInputElement",
      "HTMLSelectElement",
      "HTMLTextAreaElement",
      "SVGElement",
      "CustomEvent",
    ]
    const previous = new Map()
    const set = (key, value) => {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      })
    }
    for (const key of globals) set(key, w[key])
    set("navigator", w.navigator)
    w.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })
    set("matchMedia", w.matchMedia)
    set(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    set(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    w.scrollTo = () => {}
    w.HTMLElement.prototype.scrollIntoView = () => {}
    const oldApi = process.env.VITE_API_URL
    process.env.VITE_API_URL = "http://127.0.0.1:39999/api/v1"
    const cached = JSON.stringify({
      accounts: [{ id: "a1", name: "Cached Demo Admin", role: "admin" }],
      projects: [{ id: "p1", name: "Cached Demo Site" }],
      companies: [],
      rules: {},
    })
    w.localStorage.setItem("siteline-admin-workspace-v1", cached)
    w.sessionStorage.setItem("siteline-session-account", "a1")
    const calls = []
    t.mock.method(globalThis, "fetch", async (url, init) => {
      calls.push({
        url: String(url),
        body: init.body ? JSON.parse(init.body) : undefined,
      })
      return Response.json({ message: "Invalid credentials" }, { status: 401 })
    })
    const server = await createServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    let unmount = () => {}
  t.after(async () => {
    unmount()
    await new Promise(resolve => setImmediate(resolve))
      await server.close()
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
      if (oldApi === undefined) delete process.env.VITE_API_URL
      else process.env.VITE_API_URL = oldApi
    })
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const until = async (fn) => {
      for (let n = 0; n < 200; n++) {
        if (fn()) return
        await sleep(25)
      }
      throw new Error(
        "Timed out waiting for the sign-in screen: " +
          w.document.body.textContent,
      )
    }
    const React = await import("react")
  const { createRoot } = await import("react-dom/client")
  const { flushSync } = await import("react-dom")
  const root = createRoot(w.document.getElementById("root"))
  unmount = () => flushSync(() => root.unmount())
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  root.render(React.createElement(App))
    await until(() => w.document.querySelector("form.login-form"))
    assert.doesNotMatch(
      w.document.body.textContent,
      /Cached Demo Admin|Cached Demo Site/,
    )
    assert.equal(calls.length, 0)
    const inputs = w.document.querySelectorAll("form.login-form input")
    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        "value",
      ).set.call(input, value)
      input.dispatchEvent(new w.Event("input", { bubbles: true }))
    }
    setValue(inputs[0], "Admin")
    setValue(inputs[1], "Password")
    await sleep(50)
    w.document
      .querySelector("form.login-form")
      .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }))
    await until(() =>
      w.document.body.textContent.includes(
        "The email or password you entered is incorrect.",
      ),
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "http://127.0.0.1:39999/api/v1/auth/login")
    assert.deepEqual(calls[0].body, { email: "Admin", password: "Password" })
    assert.ok(w.document.querySelector("form.login-form"))
    assert.doesNotMatch(
      w.document.body.textContent,
      /Cached Demo Admin|Cached Demo Site/,
    )
    assert.equal(w.localStorage.getItem("siteline-admin-workspace-v1"), cached)
  },
)
