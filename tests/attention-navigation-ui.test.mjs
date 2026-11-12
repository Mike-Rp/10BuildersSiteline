import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { initialState } from "./fixtures/demo-state.ts"

test("staff badges and missing banners link to acceptance, photo reviews and assignment controls on desktop and mobile", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/opm/dashboard", pretendToBeVisual: true })
  const w = dom.window, previous = new Map()
  const getItem = w.Storage.prototype.getItem
  w.Storage.prototype.getItem = function (key) { return String(key).startsWith("10buildline:workspace-guide:") ? "seen" : getItem.call(this, key) }
  for (const [key,value] of Object.entries({ window:w, document:w.document, HTMLElement:w.HTMLElement, Element:w.Element, Node:w.Node, localStorage:w.localStorage, requestAnimationFrame:w.requestAnimationFrame.bind(w), IS_REACT_ACT_ENVIRONMENT:true })) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  let compact = false
  w.matchMedia = () => ({ matches:compact, addEventListener(){}, removeEventListener(){} })
  w.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({ server:{middlewareMode:true,hmr:false,watch:null}, appType:"custom", logLevel:"silent", optimizeDeps:{noDiscovery:true,include:[]} })
  const {default:React,act} = await import("react")
  const {createRoot} = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default:Workspace} = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = initialState()
    const office = {...state.accounts.find(a=>a.id==="a2"),expiry:"2099-01-01"}
    const site = {...state.accounts.find(a=>a.id==="a5"),expiry:"2099-01-01"}
    state.accounts = state.accounts.map(a=>a.id===office.id?office:a.id===site.id?site:a)
    const base = state.projects.find(p=>p.status==="active")
    const project = (id,extra={}) => ({...structuredClone(base),id,name:id,phase:"Mobilization",status:"pending",opmId:office.id,opmAccepted:true,
      team:[{phase:"Mobilization",accountId:site.id,status:"pending"}],
      workflow:{version:1,checklist:{},responses:[],selections:[],notes:[],photos:[]},...extra})
    state.projects = [project("Acceptance needed",{opmAccepted:false}),project("Waiting for Site PM"),
      project("Photos to review",{status:"active",team:[{phase:"Mobilization",accountId:site.id,status:"confirmed"}],
        workflow:{version:1,checklist:{},responses:[],selections:[],notes:[],photos:[{id:"photo",name:"site.jpg",date:"2026-11-13",owner:"Site PM",photoReviewStatus:"pending"}]}})]
    let key = 0
    const render = async (actor,path) => {
      w.history.replaceState({},"",path)
      await act(()=>root.render(React.createElement(Workspace,{key:++key,state,actor,onCommand:async()=>({ok:true}),onRead(){},onMute(){},onReload(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
    }
    const priority = name => [...document.querySelectorAll(".urgent-banner-item")].find(button=>button.textContent.includes(name))
    for (compact of [false,true]) {
      await render(office,"/opm/confirmation-queue")
      assert.equal(document.querySelector('[aria-label="Confirmation queue"] .nav-count').textContent,"2")
      assert.ok(priority("Acceptance needed"))
      assert.equal(priority("Waiting for Site PM"),undefined,"Waiting records do not demand an Office PM action")
      await act(()=>priority("Acceptance needed").click())
      assert.match(document.querySelector("main").textContent,/Accept Office PM assignment/)
      assert.equal(document.querySelector('[aria-pressed="true"]').textContent.includes("Needs your action"),true)
      await render(office,"/opm/dashboard")
      assert.equal(document.querySelector('[aria-label="Active sites"] .nav-count').textContent,"1")
      await act(()=>priority("Photos to review").click())
      assert.match(document.querySelector('[role="tab"][aria-selected="true"]').textContent,/Site uploads/)
      assert.match(document.querySelector("main").textContent,/Site photos awaiting review \(1\)/)
      await render(site,"/spm/dashboard")
      assert.equal(document.querySelector('[aria-label="Active sites"] .nav-count').textContent,"3")
      assert.equal(priority("Acceptance needed"),undefined)
      await act(()=>priority("Waiting for Site PM").click())
      assert.ok(document.querySelector('[role="dialog"] [aria-label="Accept this project assignment"]'),"Response banner opens actual acceptance controls")
    }
  } finally {
    await act(()=>root.unmount()); await server.close(); dom.window.close()
    for (const [key,descriptor] of previous) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]
  }
})
