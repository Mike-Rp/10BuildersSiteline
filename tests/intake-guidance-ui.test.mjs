import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"

test("intake tabs filter before paging and preserve counts, destinations, help focus and modal context", async () => {
  const {JSDOM}=await import("jsdom")
  const {createServer}=await import("vite")
  const {default:React,act}=await import("react")
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"})
  const previous=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {AdminIntakeTable,IntakeTabs}=await server.ssrLoadModule("/src/IntakeGuidance.tsx")
    const {intakeGuidance,intakeViewCounts}=await server.ssrLoadModule("/src/intake-guidance.ts")
    const {default:InfoPopover}=await server.ssrLoadModule("/src/InfoPopover.tsx")
    const {Modal}=await server.ssrLoadModule("/src/ui.tsx")
    const {ListSection,runList,useListMemory,updateListQuery,getListQuery,resetListMemory}=await server.ssrLoadModule("/src/ListControls.tsx")
    const state=emptyState(),admin={id:"admin",role:"admin",status:"active",expiry:"2099-01-01"}
    state.accounts=[admin]
    state.projects=Array.from({length:14},(_,i)=>({id:String(i),name:`Intake ${i}`,type:i===0?"Commercial":"Residential",status:i<12?"draft":"pending",opmId:"opm",opmAccepted:false,docs:[],team:[]}))
    const opened=[]
    function Harness(){
      useListMemory()
      const [view,setView]=React.useState("all")
      const counts=intakeViewCounts(state.projects,p=>intakeGuidance(state,p,admin))
      const items=state.projects.filter(p=>view==="all"||intakeGuidance(state,p,admin)?.kind===view)
      const list=runList("guidance-ui",items,{searchText:p=>p.name})
      return React.createElement(React.Fragment,null,
        React.createElement(IntakeTabs,{value:view,counts,onChange:value=>{setView(value);updateListQuery("guidance-ui",q=>({...q,page:1}))}}),
        React.createElement(ListSection,{list,placeholder:"Search intake",render:projects=>React.createElement(AdminIntakeTable,{state,projects,actor:admin,onOpen:(p,edit)=>opened.push([p.id,edit])})}))
    }
    await act(()=>root.render(React.createElement(Harness)))
    const tab=text=>[...document.querySelectorAll('.intake-tabs > button')].find(b=>b.textContent.startsWith(text))
    assert.match(tab("All intake").textContent,/14/)
    assert.match(tab("Needs your action").textContent,/12/)
    await act(()=>document.querySelector('[aria-label="Next page"]').click())
    assert.equal(document.querySelectorAll('tbody tr').length,4)
    await act(()=>tab("Needs your action").click())
    assert.equal(getListQuery("guidance-ui").page,1)
    assert.equal(document.querySelectorAll('tbody tr').length,10)
    await act(()=>document.querySelector('tbody tr td:last-child button').click())
    assert.deepEqual(opened[0],["0",true])
    await act(()=>tab("Waiting for others").click())
    assert.equal(document.querySelectorAll('tbody tr').length,2)
    await act(()=>document.querySelector('tbody tr td:last-child button').click())
    assert.deepEqual(opened[1],["12",false])
    const search=document.querySelector('input')
    await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(search,"missing");search.dispatchEvent(new dom.window.Event("input",{bubbles:true}))})
    assert.match(document.body.textContent,/No results match/)
    assert.match(tab("All intake").textContent,/14/)
    assert.match(tab("Waiting for others").textContent,/2/)
    let modalClosed=0
    await act(()=>root.render(React.createElement(Modal,{title:"Existing intake details",onClose:()=>modalClosed++},React.createElement(InfoPopover,{title:"Role ownership"},"Only the assigned role can accept."))))
    const help=document.querySelector('.intake-info-trigger')
    await act(()=>help.click())
    assert.equal(help.getAttribute('aria-expanded'),"true")
    assert.match(document.querySelector('.intake-info-panel').textContent,/Only the assigned role/)
    assert.ok(document.activeElement === document.querySelector('.intake-info-heading button'), `Help focus landed on ${document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName}`)
    await act(()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:"Escape",bubbles:true})))
    assert.equal(modalClosed,0)
    assert.ok(!document.querySelector('.intake-info-panel'), "Escape must remove the help panel")
    assert.ok(document.activeElement === help, "Escape must restore help trigger focus")
    await act(()=>help.click())
    await act(()=>document.querySelector('.modal-header').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})))
    assert.ok(!document.querySelector('.intake-info-panel'), "Outside pointer must remove the help panel")
    await act(()=>help.click())
    await act(()=>document.querySelector('[aria-label="Close help: Role ownership"]').click())
    assert.ok(document.activeElement === help, "Close must restore help trigger focus")
    await act(()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:"Escape",bubbles:true})))
    assert.equal(modalClosed,1)
    resetListMemory()
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
