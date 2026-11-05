import assert from "node:assert/strict"
import test from "node:test"

test("Active Sites shows an icon-and-text schedule badge, filters to Delayed, and details/banner render", async () => {
  const {JSDOM}=await import("jsdom"),{createServer}=await import("vite"),{default:React,act}=await import("react")
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"}),saved=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try{
    const {default:ActiveSites}=await server.ssrLoadModule("/src/ActiveSites.tsx")
    const {ScheduleDetails,DelayedBanner}=await server.ssrLoadModule("/src/ScheduleBadge.tsx")
    const site=(id,end,extra={})=>({id,name:`Project ${id}`,type:"Commercial",phase:"Structure",status:"active",progress:40,start:"2026-01-01",end,...extra})
    const projects=[site("late","2026-10-19"),site("fine","2027-03-01"),site("open",undefined),site("done","2026-01-01",{status:"completed"})]
    const render=(props)=>act(()=>root.render(React.createElement(ActiveSites,{projects,onOpen:()=>{},today:"2026-10-26",...props})))
    const names=()=>[...document.querySelectorAll(".as-card h2")].map(h=>h.textContent)
    const badges=()=>[...document.querySelectorAll(".as-card .schedule-badge")].map(b=>b.textContent)

    await render()
    assert.deepEqual(names().sort(),["Project fine","Project late","Project open"],"completed projects are not in Active Sites")
    assert.deepEqual(badges().sort(),["Delayed · 7 days overdue","No target date","On schedule"])
    assert.ok([...document.querySelectorAll(".as-card .schedule-badge")].every(b=>b.querySelector("svg")),"every badge pairs an icon with its text")

    const filter=()=>document.querySelector(".as-delayed-filter")
    assert.equal(filter().textContent,"Delayed (1)")
    assert.equal(filter().getAttribute("aria-pressed"),"false")
    assert.equal(document.querySelectorAll(".as-toolbar select").length,3,"the filter is a toggle, not a fourth dropdown")
    await act(()=>filter().click())
    assert.equal(filter().getAttribute("aria-pressed"),"true")
    assert.deepEqual(names(),["Project late"])
    await act(()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Clear filters").click())
    assert.equal(names().length,3)
    assert.equal(filter().getAttribute("aria-pressed"),"false")

    // The app remounts the list (new key) when a "Delayed projects" row opens it pre-filtered.
    await render({initialDelayed:true,key:"delayed"})
    assert.deepEqual(names(),["Project late"],"a Delayed projects row opens the list already filtered")
    assert.equal(filter().getAttribute("aria-pressed"),"true")

    await act(()=>root.render(React.createElement("div",null,
      React.createElement(ScheduleDetails,{project:{status:"active",end:"2026-10-19"},today:"2026-10-26"}),
      React.createElement(DelayedBanner,{project:{status:"active",end:"2026-10-19"},today:"2026-10-26"}),
      React.createElement(DelayedBanner,{project:{status:"active",end:"2027-03-01"},today:"2026-10-26"}),
      React.createElement(DelayedBanner,{project:{status:"completed",end:"2026-01-01"},today:"2026-10-26"}))))
    const details=document.querySelector(".schedule-details").textContent
    assert.match(details,/Delayed/)
    assert.match(details,/Target completion: Oct 19, 2026/)
    assert.match(details,/7 days overdue/)
    const banners=[...document.querySelectorAll(".schedule-banner")]
    assert.equal(banners.length,1,"only a delayed, active project gets the banner")
    assert.equal(banners[0].textContent,"This project passed its target completion date on Oct 19, 2026 (7 days overdue).")
    assert.equal(banners[0].querySelector("button,a,input"),null,"the banner is read-only")
  }finally{
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]
  }
})
