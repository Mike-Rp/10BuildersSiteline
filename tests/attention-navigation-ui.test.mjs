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
      assert.equal(document.querySelector('[aria-label="Project intake"] .nav-count').textContent,"2")
      assert.ok(priority("Acceptance needed"))
      assert.ok(!priority("Waiting for Site PM"),"Waiting records do not demand an Office PM action")
      await act(()=>priority("Acceptance needed").click())
      assert.match(document.querySelector("main").textContent,/Accept Office PM assignment/)
      assert.match(document.querySelector('#project-intake-panel-mine [aria-pressed="true"]').textContent,/Needs your action/)
      await render(office,"/opm/dashboard")
      assert.equal(document.querySelector('[aria-label="Active sites"] .nav-count').textContent,"1")
      await act(()=>priority("Photos to review").click())
      assert.match(document.querySelector('[role="tab"][aria-selected="true"]').textContent,/Site uploads/)
      assert.match(document.querySelector("main").textContent,/Site photos awaiting review \(1\)/)
      await render(site,"/spm/dashboard")
      assert.equal(document.querySelector('[aria-label="Active sites"] .nav-count').textContent,"3")
      assert.doesNotMatch(document.querySelector("main").textContent,/Office PM acceptance required/)
      await act(()=>priority("Waiting for Site PM").click())
      assert.match(document.querySelector('[role="dialog"]').textContent,/Accept (Lead Site PM assignment|my phase assignments)/)
    }

    state.projects = [project("Concurrent intake", {
      inquiryOrigin: true,
      docs: [],
      team: [{phase:"Mobilization",accountId:site.id,status:"pending",isLead:true}],
    })]
    await render(office,"/opm/project-inquiries")
    assert.equal(document.querySelector("main h1").textContent,"Project intake")
    assert.equal(document.querySelector('[aria-label="Project intake views"] [aria-selected="true"]').id,"project-intake-tab-inquiries")
    assert.ok(!document.querySelector('nav [aria-label="Project inquiries"]'),"The inquiry workflow has no separate sidebar entry")
    assert.ok(!document.querySelector('nav [aria-label="Confirmation queue"]'),"The confirmation queue has no separate sidebar entry")
    await act(()=>document.querySelector("#project-intake-tab-mine").click())
    const intakeSearch = document.querySelector('input[placeholder="Search confirmations"]')
    await act(() => {
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(intakeSearch, "")
      intakeSearch.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    const card = document.querySelector(".opm-confirmation-card")
    assert.match(card.textContent,/0 of 6 uploaded/)
    assert.match(card.textContent,/0 of 1 assignments accepted/)
    assert.match(card.textContent,/while documents are being uploaded/)
    const cardButton = label => [...card.querySelectorAll("button")].find(button=>button.textContent.includes(label))
    await act(()=>cardButton("View assignment status").click())
    const status = document.querySelector('[aria-label="Site PM assignment status"]')
    assert.match(status.textContent,/Concurrent intake/)
    assert.match(status.textContent,/Mobilization/)
    await act(()=>[...status.querySelectorAll("button")].find(button=>button.textContent==="Close").click())
    await act(()=>cardButton("Upload required documents").click())
    assert.equal(w.location.pathname,"/opm/documents")
    assert.match(document.querySelector("main").textContent,/Required documents/)

    const inquiry = { id: "a9bd9cc9-c4ad-4000-8000-000000000000", created_at: "2026-11-20T03:00:00Z",
      status: "offered", details: { name: "Maple Residence", project_type: "Residential", consultation: 30 },
      match: { project_type: "Residential", experience_years: 7 } }
    const fetch = globalThis.fetch
    previous.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"))
    globalThis.fetch = (url, options) => String(url).endsWith("/projects/inquiries")
      ? Promise.resolve(Response.json({ data: [inquiry, { ...inquiry, id: "completed", status: "approved" }] }))
      : fetch(url, options)
    await render(office,"/opm/project-intake")
    const newInquiryBanner = document.querySelector(".opm-new-inquiries")
    assert.ok(newInquiryBanner, "New inquiries are visible on the default intake tab")
    assert.match(newInquiryBanner.textContent,/New project inquiry.*Maple Residence/)
    assert.equal(document.querySelector('#project-intake-tab-mine').getAttribute("aria-selected"),"true")
    await act(()=>newInquiryBanner.querySelector("button").click())
    const pendingInquiry = document.querySelector(".office-workflow")
    assert.match(pendingInquiry.textContent,/Pending inquiry/)
    assert.match(pendingInquiry.textContent,/Inquiry reference 10BL-2026-A9BD9CC9C4AD/)
    assert.doesNotMatch(pendingInquiry.textContent,/Why this match|Relevant experience|Matched project type/)
  } finally {
    await act(()=>root.unmount()); await server.close(); dom.window.close()
    for (const [key,descriptor] of previous) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]
  }
})
