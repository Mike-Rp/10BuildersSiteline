import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"
import { adminDashboardOverview } from "../src/admin-dashboard.ts"

const workspace = () => ({
  ...emptyState(),
  projects: [
    {id:"active",name:"Active clean",status:"active"},
    {id:"update",name:"Update project",status:"active",workflow:{pendingUpdate:{id:"u1"}}},
    {id:"both",name:"Two review types",status:"active",workflow:{pendingUpdate:{id:"u2"},pendingRework:{id:"r1"}}},
    {id:"draft",name:"Draft project",status:"draft",workflow:{pendingUpdate:{id:"u3"}}},
    {id:"changes",name:"Changes project",status:"changes_requested",opmAccepted:false},
    {id:"waiting",name:"Waiting project",status:"pending",opmAccepted:false},
    {id:"accepted",name:"Accepted intake",status:"pending",opmAccepted:true},
    {id:"completed",name:"Completed",status:"completed",workflow:{pendingUpdate:{id:"old"}}},
  ],
  accounts: [
    {id:"admin",name:"Admin",role:"admin",status:"active",expiry:"2099-01-01"},
    {id:"license",name:"Expired engineer",role:"spm",status:"active",expiry:"2020-01-01"},
    {id:"invited",name:"Invited engineer",role:"opm",status:"invited",expiry:"2020-01-01"},
    {id:"client",name:"Client",role:"client",status:"active",expiry:"2020-01-01"},
    {id:"suspended",name:"Suspended",role:"spm",status:"suspended",expiry:"2020-01-01"},
  ],
  companies: [{id:"request",name:"Requested company",status:"pending"},{id:"approved",name:"Approved company",status:"approved"}],
})

test("only explicit server handoff blockers become shared project tasks, never percentages or missing data", () => {
  const state = workspace()
  const project = state.projects[0]
  project.progress = 100
  project.handoffBlocker = "Unstructured legacy message"
  assert.equal(adminDashboardOverview(state).items.filter(i=>i.blocker).length,0)
  for(const status of ["unknown","incomplete","ready","final","inactive"]) {
    project.handoffReadiness={state:status,stageId:"1",reasonCode:"next_assignment",reason:"Confirm next Site PM."}
    assert.equal(adminDashboardOverview(state).items.filter(i=>i.blocker).length,0)
  }
  project.handoffReadiness={state:"blocked",stageId:"1",reasonCode:"next_assignment",reason:"Confirm next Site PM."}
  project.workflow={pendingUpdate:{id:"another-reason"},pendingRework:{id:"another"}}
  const items=adminDashboardOverview(state).items
  assert.equal(items.filter(i=>i.id===project.id).length,1)
  assert.equal(items.find(i=>i.blocker).key,`project:${project.id}`)
  assert.equal(items.find(i=>i.blocker).detail,"Confirm next Site PM.")
  for(const status of ["completed","archived","pending","draft"]) {
    project.status=status
    assert.equal(adminDashboardOverview(state).items.filter(i=>i.blocker).length,0)
  }
})

test("admin overview separates workload totals from one queue of current follow-up records", () => {
  const overview = adminDashboardOverview(workspace())
  assert.equal(overview.activeProjects, 3)
  assert.equal(overview.intakeProjects, 4)
  assert.equal(overview.teamAccounts, 4)
  assert.equal(overview.items.length, 7)
  assert.equal(new Set(overview.items.map(item => item.key)).size, 7)
  assert.equal(overview.items.filter(item => item.id === "both").length, 1)
  assert.equal(overview.items.find(item => item.id === "draft").category, "intake")
  assert.equal(overview.items.find(item => item.id === "draft").kind, "intake")
  assert.equal(overview.items.find(item => item.id === "changes").kind, "intake")
  assert.equal(overview.items.find(item => item.id === "waiting").detail, "Awaiting Office PM response")
  assert.equal(overview.items.find(item => item.id === "changes").detail, "Intake changes requested")
  assert.equal(overview.items.find(item => item.id === "license").kind, "account")
  for (const id of ["completed", "client", "suspended", "invited", "approved", "accepted", "active"])
    assert.ok(!overview.items.some(item => item.id === id), id)
})

test("resolved requests and reviews disappear without changing project status or source records", () => {
  const state = workspace()
  const snapshot = structuredClone(state)
  adminDashboardOverview(state)
  assert.deepEqual(state, snapshot)
  state.projects.find(p => p.id === "both").workflow = {pendingRework:{id:"r1"}}
  assert.equal(adminDashboardOverview(state).items.filter(item => item.id === "both").length, 1)
  state.projects.find(p => p.id === "both").workflow = {}
  state.companies[0].status = "approved"
  const result = adminDashboardOverview(state)
  assert.ok(!result.items.some(item => item.id === "both" || item.id === "request"))
  assert.equal(result.activeProjects, 3)
  assert.deepEqual(adminDashboardOverview(emptyState()), {activeProjects:0,intakeProjects:0,teamAccounts:0,items:[]})
})

test("Administrator dashboard filters and pages attention items and preserves action callbacks", async () => {
  const {JSDOM} = await import("jsdom")
  const {createServer} = await import("vite")
  const {default:React,act} = await import("react")
  const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost"})
  const previous = new Map()
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot} = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default:AdminDashboard} = await server.ssrLoadModule("/src/AdminDashboard.tsx")
    const opened = [], navigated = []
    let created = 0, activityOpened = 0
    const props = {
      overview:adminDashboardOverview(workspace()), onOpen:item=>opened.push(item), onNavigate:page=>navigated.push(page),
      onNewIntake:()=>created++,onActivity:()=>activityOpened++,activity:React.createElement("p",null,"Existing authorized activity feed"),
    }
    await act(()=>root.render(React.createElement(AdminDashboard,props)))
    const button = text => [...document.querySelectorAll("button")].find(el=>el.textContent.trim().startsWith(text))
    assert.equal(document.querySelectorAll(".ao-metric").length,3)
    assert.equal(button("Projects in intake").querySelector(".ao-metric-icon"),null)
    assert.equal(button("Projects in intake").querySelectorAll("svg").length,1)
    assert.ok(button("New project intake").matches(".ao-new-intake"))
    assert.ok(button("New project intake").querySelector("svg"))
    assert.equal(document.querySelector(".admin-overview table"),null)
    assert.equal(document.querySelectorAll(".ao-task").length,6)
    await act(()=>button("Next").click())
    assert.equal(document.querySelectorAll(".ao-task").length,1)
    await act(()=>button("Project updates").click())
    assert.equal(document.querySelectorAll(".ao-task").length,2)
    assert.equal(document.querySelector('.ao-filters [aria-pressed="true"]').textContent,"Project updates")
    await act(()=>document.querySelector(".ao-task").click())
    assert.equal(opened[0].kind,"project")
    assert.equal(opened[0].id,"update")
    await act(()=>button("Requests").click())
    await act(()=>document.querySelector(".ao-task").click())
    assert.equal(opened[1].kind,"company")
    await act(()=>button("Licenses").click())
    await act(()=>document.querySelector(".ao-task").click())
    assert.equal(opened[2].kind,"account")
    await act(()=>button("Active projects").click())
    assert.deepEqual(navigated,["Active sites"])
    await act(()=>button("Projects in intake").click())
    await act(()=>button("Team accounts").click())
    assert.deepEqual(navigated,["Active sites","Project intake","Team"])
    await act(()=>button("Intake").click())
    await act(()=>document.querySelector(".ao-task").click())
    assert.equal(opened[3].kind,"intake")
    await act(()=>button("New project intake").click())
    await act(()=>button("View all").click())
    assert.equal(created,1)
    assert.equal(activityOpened,1)
    assert.match(document.body.textContent,/Existing authorized activity feed/)
    await act(()=>root.render(React.createElement(AdminDashboard,{...props,overview:adminDashboardOverview(emptyState())})))
    assert.match(document.body.textContent,/Nothing waiting for attention/)
    assert.equal(document.querySelectorAll(".ao-task").length,0)
    const blocker = (id) => ({key:`project:${id}`,id,kind:"project",category:"updates",title:id,detail:"Confirm next phase SPM.",label:"Handoff blocked",icon:"alert",blocker:true})
    const one=blocker("one"),two=blocker("two")
    await act(()=>root.render(React.createElement(AdminDashboard,{...props,overview:{...props.overview,items:[one]}})))
    assert.match(document.querySelector(".ao-blocker-banner").textContent,/1 project cannot advance/)
    assert.equal(document.querySelector(".ao-blocker-banner").getAttribute("role"),null,"no polling live announcement")
    await act(()=>button("Review issue").click())
    assert.equal(opened.at(-1),one,"banner opens the very same task object")
    await act(()=>root.render(React.createElement(AdminDashboard,{...props,readinessAvailable:false,overview:{...props.overview,items:[one]}})))
    assert.equal(document.querySelector(".ao-blocker-banner"),null,"loading/failed readiness hides the warning")
    await act(()=>root.render(React.createElement(AdminDashboard,{...props,overview:{...props.overview,items:[one,two,...props.overview.items]}})))
    assert.match(document.querySelector(".ao-blocker-banner").textContent,/2 projects cannot advance/)
    await act(()=>button("View blockers").click())
    assert.equal(document.activeElement.id,"ao-attention-title")
    assert.equal(document.querySelectorAll(".ao-task").length,2)
    await act(()=>button("Requests").click())
    assert.equal(document.querySelectorAll(".ao-task").length,1,"ordinary filters still work")
    await act(()=>root.render(React.createElement(AdminDashboard,{...props,overview:props.overview})))
    assert.equal(document.querySelector(".ao-blocker-banner"),null,"resolved blockers disappear")
  } finally {
    await act(()=>root.unmount())
    await server.close()
    dom.window.close()
    for (const [key,descriptor] of previous) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key] }
  }
})
