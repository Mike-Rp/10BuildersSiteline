import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("all roles confirm manual sign-out on desktop and mobile; cancellation never clears the session", { timeout: 60000 }, async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:8443/", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  for (const [key, value] of Object.entries({ window: w, document: w.document, HTMLElement: w.HTMLElement, Element: w.Element, Node: w.Node,
    getComputedStyle:w.getComputedStyle.bind(w), sessionStorage: w.sessionStorage, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  let compact = false
  w.matchMedia = () => ({ matches: compact, addEventListener() {}, removeEventListener() {} })
  w.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  let user
  const calls = []
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(String(url), "http://localhost:8443").pathname.replace(/^\/api\/v1/, "")
    const method = init?.method || "GET"
    calls.push({ path, method })
    if (path === "/auth/me") return Response.json(user)
    if (path === "/auth/login" || path === "/auth/admin/login" || path === "/auth/staff/login") {
      return Response.json({user,token:`test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString("base64url")}.test`})
    }
    if (path === "/auth/logout") return Response.json({ ok: true })
    if (path === "/accounts") return Response.json([user])
    if (path === `/accounts/${user.id}`) return Response.json(user)
    if (path === "/workspace") return Response.json({ accounts: {}, projects: {}, preferences: {} })
    if (method === "GET" || path === "/workspace/reconcile-phase-handoffs") return Response.json([])
    throw Error(`Unexpected mutation: ${method} ${path}`)
  })
  const server = await createServer({ cacheDir: `node_modules/.vite-tests/sign-out-${process.pid}`, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { default: React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { default: App } = await server.ssrLoadModule("/src/App.tsx")
    const client = await server.ssrLoadModule("/src/api/client.ts")
    const click = async element => { assert.ok(!!element, "Expected a sign-out control"); await act(() => element.click()) }
    const logoutCalls = () => calls.filter(c => c.path === "/auth/logout").length
    let swipeClock=1000
    const swipe=async direction=>act(()=>{
      const target=document.querySelector('.main-shell h1') || document.querySelector('.main-shell')
      assert.ok(target,'workspace swipe surface')
      const touch=(x)=>({identifier:1,clientX:x,clientY:180})
      const event=(type,x,time)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[touch(x)]},changedTouches:{value:[touch(x)]},timeStamp:{value:time}});target.dispatchEvent(e)}
      const start=direction==='right'?100:300,end=direction==='right'?300:100
      event('touchstart',start,swipeClock);event('touchmove',end,swipeClock+60);event('touchend',end,swipeClock+140);swipeClock+=300
    })

    const confirmation = () => document.querySelector('[role="dialog"][aria-label="Sign out of 10BuildLine?"]')
    const confirmButton = () => [...confirmation().querySelectorAll("button")].find(b => b.textContent.trim() === "Sign out")
    for (const role of ["admin", "opm", "spm", "client"]) {
      for (const mobile of [false, true]) {
        compact = mobile
        Object.defineProperty(w,"innerWidth",{value:mobile?390:1366,configurable:true})
        user = { id: `signout-${role}`, role, full_name: `Test ${role}`, email: `${role}@example.invalid`, status: "active", date_added: "2026-01-01" }
        // Restore a workspace refresh, rather than an explicit sign-in page.
        w.history.replaceState(null, "", role === "admin" ? "/admin" : "/")
        const token = `test.${Buffer.from(JSON.stringify({ sub: user.id, details: { id: user.id, role } })).toString("base64url")}.test`
        client.setToken(token)
        await act(async () => { root.render(React.createElement(App, { key: `${role}-${mobile}` })); await new Promise(resolve => setTimeout(resolve, 25)) })
        for (let n = 0; n < 100 && !document.querySelector('.sidebar [aria-label="Sign out"]'); n++) await act(() => new Promise(resolve => setTimeout(resolve, 10)))
        assert.ok(!!document.querySelector('.sidebar [aria-label="Sign out"]'), `Missing exit for ${role}, mobile=${mobile}`)
        assert.equal(w.location.pathname.startsWith('/admin'), role === 'admin', 'restored sessions use the portal for the verified account role')
        assert.equal(w.location.pathname, `/${role}`)
        const beforeSwipeLogout=logoutCalls()
        await click([...document.querySelectorAll('.sidebar .nav-item')].find(el=>el.textContent.trim().startsWith('Active sites')))
        await swipe('right')
        assert.match(document.querySelector('.sidebar .nav-item.active').textContent,role==='client'?/Overview/:/Dashboard/)
        assert.equal(confirmation(),null)
        await swipe('right')
        assert.ok(confirmation(),role+' second swipe opens the existing confirmation')
        await click([...confirmation().querySelectorAll('button')].find(el=>el.textContent.trim()==='Cancel'))
        assert.equal(logoutCalls(),beforeSwipeLogout,'swipe cancellation keeps the session')
        assert.equal(client.getToken(),token)
        await swipe('left')
        assert.match(document.querySelector('.sidebar .nav-item.active').textContent,/Active sites/)
        await swipe('right')
        // A fresh login adds the role workspace after 10BuildLine's landing page.
        // Exercise real browser traversal against the mounted application.
        w.history.replaceState(null, "", role === "admin" ? "/admin/login" : role === "client" ? "/" : "/staff/login")
        w.history.pushState(null, "", `/${role}`)
        const traverse = direction => act(async () => {
          const moved = new Promise(resolve => w.addEventListener("popstate", resolve, {once:true}))
          w.history[direction]()
          await moved
        })
        await traverse("back")
        assert.ok(document.querySelector("form.login-form"), "Back must display 10BuildLine's landing page")
        assert.equal(client.getToken(), token, "Back is navigation, not sign out")
        const type = async (input, value) => act(() => {
          Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(input, value)
          input.dispatchEvent(new w.Event("input", {bubbles:true}))
        })
        await type(document.querySelector('input[type="email"], input[name="email"], input[autocomplete="username"]'), user.email)
        await type(document.querySelector('input[type="password"]'), "test-password")
        await act(async () => {
          document.querySelector('form.login-form').dispatchEvent(new w.Event("submit", {bubbles:true,cancelable:true}))
          await new Promise(resolve => setTimeout(resolve, 30))
        })
        for (let n = 0; n < 100 && document.querySelector('form.login-form'); n++) await act(() => new Promise(resolve => setTimeout(resolve, 10)))
        assert.equal(w.location.pathname, `/${role}`, "successful credentials push the role route")
        assert.ok(!document.querySelector('form.login-form'))
        await traverse("back")
        assert.ok(document.querySelector('form.login-form'), "fresh login preserves the landing entry")
        await traverse("forward")
        assert.ok(document.querySelector('.sidebar [aria-label="Sign out"]'), "Forward restores the authorized workspace")
        assert.equal(w.location.pathname, `/${role}`)
        const baseline = logoutCalls()
        async function requestSignOut() {
          const toggle = document.querySelector(".sidebar-toggle, .mobile-menu")
          const sidebarOpen = toggle?.getAttribute("aria-expanded") === "true" || document.querySelector(".sidebar.mobile-open")
          if (mobile && !sidebarOpen) await click(toggle)
          await click(document.querySelector('.sidebar [aria-label="Sign out"]'))
          assert.ok(!!confirmation(), `Missing confirmation for ${role}, mobile=${mobile}`)
          assert.ok(!confirmation().closest(".sidebar"), "dialog must remain visible when the sidebar closes")
          assert.match(confirmation().textContent, /Are you sure you want to sign out/)
          assert.equal(client.getToken(), token)
          assert.equal(logoutCalls(), baseline, "opening confirmation must not send logout")
          assert.ok(!document.querySelector("form.login-form"))
        }
        await requestSignOut()
        await click([...confirmation().querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel"))
        assert.ok(!confirmation())
        assert.equal(client.getToken(), token)
        await requestSignOut()
        await act(() => document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
        assert.ok(!confirmation())
        assert.equal(client.getToken(), token)
        await requestSignOut()
        await click(confirmation().querySelector('[aria-label="Close dialog"]'))
        assert.ok(!confirmation())
        assert.equal(client.getToken(), token)
        await requestSignOut()
        await act(() => confirmation().parentElement.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true })))
        assert.ok(!confirmation())
        assert.equal(client.getToken(), token)
        assert.equal(logoutCalls(), baseline)
        await requestSignOut()
        const confirm = confirmButton()
        w.localStorage.setItem(`siteline-recent-projects:${user.id}`, '["project-id"]')
        w.sessionStorage.setItem(`siteline-dashboard-session-greeting:${user.id}`, user.full_name)
        await act(async () => { confirm.click(); confirm.click(); await new Promise(resolve => setTimeout(resolve, 10)) })
        assert.equal(logoutCalls(), baseline + 1, "confirm sends exactly one logout request")
        assert.equal(client.getToken(), "")
        assert.equal(w.localStorage.getItem(`siteline-recent-projects:${user.id}`), null)
        assert.equal(w.sessionStorage.getItem(`siteline-dashboard-session-greeting:${user.id}`), null)
        assert.ok(!!document.querySelector("form.login-form"), `Confirmed ${role} logout must return to login`)
        assert.equal(w.location.pathname, role === 'admin' ? '/admin/login' : role === 'client' ? '/login' : '/staff/login')
        assert.equal(!!document.querySelector('.admin-access-badge'), role !== 'client')
        await act(() => root.render(null))
      }
    }
  } finally {
    await act(() => root.unmount())
    await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
