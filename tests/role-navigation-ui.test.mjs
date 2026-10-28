import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("Office and Site PM mobile sidebars close from their own brand header and return focus to the menu", {timeout:30000}, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost", pretendToBeVisual:true })
  const w = dom.window, previous = new Map()
  for (const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  w.matchMedia = () => ({matches:true,addEventListener(){},removeEventListener(){}})
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({cacheDir:`node_modules/.vite-tests/role-navigation-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const { default:React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default:Workspace} = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = initialState()
    for (const role of ["opm","spm"]) {
      const actor = {...state.accounts.find(account=>account.role===role),expiry:"2099-01-01"}
      await act(()=>root.render(React.createElement(Workspace,{key:role,state,actor,onCommand:async()=>({ok:true}),onRead(){},onMute(){},onReload(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
      const menu = document.querySelector('.topbar .mobile-menu')
      const sidebar = document.getElementById('role-navigation')
      const close = sidebar.querySelector('.brand .role-nav-close')
      assert.ok(close)
      assert.equal(menu.getAttribute('aria-controls'),sidebar.id)
      assert.equal(menu.getAttribute('aria-expanded'),'false')
      await act(()=>menu.click())
      assert.equal(sidebar.classList.contains('mobile-open'),true)
      assert.equal(menu.getAttribute('aria-expanded'),'true')
      await act(()=>close.click())
      assert.equal(sidebar.classList.contains('mobile-open'),false)
      assert.equal(menu.getAttribute('aria-expanded'),'false')
      assert.equal(document.activeElement,menu)
    }
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for (const [key,descriptor] of previous) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]
  }
})
