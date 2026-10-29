import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("Office and Site PM navigation alternates controls across every module on desktop and mobile", {timeout:60000}, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"http://localhost", pretendToBeVisual:true })
  const w = dom.window, previous = new Map()
  for (const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const listeners = new Set()
  const media = {matches:false,addEventListener(type,listener){if(type === "change")listeners.add(listener)},removeEventListener(type,listener){listeners.delete(listener)}}
  w.matchMedia = () => media
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({cacheDir:`node_modules/.vite-tests/role-navigation-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const { default:React, act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default:Workspace} = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = initialState()
    const click = async element => {assert.ok(element);assert.equal(element.hidden,false,"Only visible controls may be used");await act(()=>element.click())}
    const resize = async compact => act(()=>{media.matches=compact;for(const listener of listeners)listener({matches:compact})})
    for (const role of ["opm","spm"]) {
      media.matches=false
      const actor = {...state.accounts.find(account=>account.role===role),expiry:"2099-01-01"}
      await act(()=>root.render(React.createElement(Workspace,{key:role,state,actor,onCommand:async()=>({ok:true}),onRead(){},onMute(){},onReload(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
      const menu = document.querySelector('.topbar .sidebar-toggle')
      const sidebar = document.getElementById('role-navigation')
      const close = sidebar.querySelector('.brand .role-nav-close')
      assert.ok(close)
      assert.equal(menu.getAttribute('aria-controls'),sidebar.id)
      assert.equal(menu.hidden,true,"Desktop sidebar starts open with only its internal X")
      const modules=[...sidebar.querySelectorAll('nav .nav-item')].map(button=>button.getAttribute('aria-label'))
      for (const compact of [false,true]) {
        await resize(compact)
        for (const label of modules) {
          if(!menu.hidden)await click(menu)
          assert.equal(menu.hidden,true)
          assert.equal(sidebar.hasAttribute('inert'),false)
          await click([...sidebar.querySelectorAll('nav .nav-item')].find(button=>button.getAttribute('aria-label')===label))
          assert.equal(document.querySelector('.breadcrumb strong').textContent,label)
          assert.equal(document.querySelectorAll('main h1').length,1,`${role} ${label}: each module has one main heading`)
          assert.ok(document.querySelector('main .page-title-panel h1'),`${role} ${label}: the module uses the shared title panel`)
          assert.equal(menu.hidden,!compact,`${role} ${label}: desktop stays open and mobile navigation closes after selection`)
          if(!menu.hidden){
            await click(menu)
            assert.ok(document.activeElement===close,`${role} ${label}: opening the drawer focuses its X`)
          }
          await click(close)
          assert.equal(menu.getAttribute('aria-expanded'),'false')
          assert.equal(menu.hidden,false)
          assert.equal(sidebar.hasAttribute('inert'),true)
          assert.ok(document.activeElement===menu,`${role} ${label}: closing returns focus to the menu`)
          assert.notEqual(document.body.style.overflow,'hidden')
        }
        if(compact){
          await click(menu)
          assert.equal(document.body.style.overflow,'hidden')
          await act(()=>document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
          assert.equal(menu.hidden,false)
          assert.ok(document.activeElement===menu)
        }
      }
      await act(()=>root.render(null))
    }
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for (const [key,descriptor] of previous) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]
  }
})
