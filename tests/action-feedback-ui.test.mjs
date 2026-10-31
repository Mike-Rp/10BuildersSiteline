import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("success has no popup; concurrent uploads show a non-modal progress bar until saving finishes, and errors never show success", async t => {
  const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost/",pretendToBeVisual:true})
  const w=dom.window, previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({cacheDir:`node_modules/.vite-tests/feedback-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import("react"),{createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {default:Feedback}=await server.ssrLoadModule("/src/ActionFeedback.tsx")
    const state=await server.ssrLoadModule("/src/action-feedback.ts")
    const client=await server.ssrLoadModule("/src/api/client.ts")
    client.setApiBase("http://localhost/api/v1")
    await act(()=>root.render(React.createElement(Feedback)))
    for(const path of ["/notifications/read","/workspace/reconcile-phase-handoffs","/auth/login"]) assert.equal(state.isInteractiveWrite(path,"POST"),false)
    assert.equal(state.isInteractiveWrite("/projects","GET"),false)
    let resolveUpload
    t.mock.method(globalThis,"fetch",()=>new Promise(resolve=>{resolveUpload=resolve}))
    const data=new FormData();data.set("file",new Blob(["file contents"],{type:"application/pdf"}),"plan.pdf")
    let request,finishSave
    await act(()=>{finishSave=state.beginFileUpload();request=client.api("/files",{method:"POST",body:data})})
    assert.ok(document.querySelector('progress[aria-label="File submission progress"]'))
    assert.match(document.querySelector('[aria-busy="true"]').textContent,/Uploading and saving/)
    assert.equal(document.querySelector('[role="dialog"]'),null,"upload progress is not a popup")
    assert.notEqual(document.getElementById("root").inert,true,"upload progress does not block the workspace")
    await act(()=>document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true})))
    assert.ok(document.querySelector('progress[aria-label="File submission progress"]'),"Escape cannot hide ongoing progress")
    await act(async()=>{resolveUpload(Response.json({data:{id:"file-id"}}));await request})
    assert.ok(document.querySelector('progress[aria-label="File submission progress"]'),"record saving keeps the progress bar visible after transfer")
    await act(()=>{state.showActionResult("Document uploaded and saved successfully.");finishSave();finishSave()})
    assert.equal(state.feedbackSnapshot().uploads,0,"cleanup is idempotent")
    assert.equal(document.querySelector('progress[aria-label="File submission progress"]'),null)
    assert.equal(document.querySelector('[role="dialog"]'),null,"successful uploads do not open a confirmation popup")
    t.mock.method(globalThis,"fetch",async()=>Response.json({message:"Saved",data:{} }))
    await act(()=>client.api("/projects",{method:"POST",json:{name:"Test"}}))
    assert.equal(document.querySelector('[role="dialog"]'),null,"successful saves do not open a confirmation popup")
    await act(()=>state.dismissActionResult())
    t.mock.method(globalThis,"fetch",async()=>Response.json({message:"Upload rejected"},{status:422}))
    await act(async()=>{await assert.rejects(client.api("/files",{method:"POST",body:data}),/Upload rejected/)})
    assert.equal(state.feedbackSnapshot().uploads,0)
    assert.match(document.querySelector('[role="alert"]').textContent,/Upload rejected/)
    assert.doesNotMatch(document.body.textContent,/completed successfully/)
    await act(()=>state.dismissActionResult())
    t.mock.method(globalThis,"fetch",async()=>Response.json({data:[]}))
    await act(()=>client.api("/projects"))
    assert.equal(document.querySelector('[role="dialog"]'),null,"ordinary page loads do not produce popups")
  } finally {
    await act(()=>root.unmount());await server.close();w.close()
    for(const [key,value] of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]
  }
})
