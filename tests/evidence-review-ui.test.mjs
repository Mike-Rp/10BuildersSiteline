import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React,{act} from "react"

test("activity review shows trusted impact before confirmation, requires rejection reasons, and handles stale previews",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost",pretendToBeVisual:true})
  const previous=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const originalFetch=globalThis.fetch
  const totals=(earned,total)=>({earned,total,percentage:earned/total*100,reason:null})
  const preview={activity:"Concrete test report",phase_name:"Foundation",review_token:"trusted-token",
    before:{phase:totals(20,30),project:totals(80,270)},after:{phase:totals(30,30),project:totals(90,270)}}
  const requests=[],confirmations=[]
  let fail=false,closed=0,saveResult=true
  globalThis.fetch=async url=>{requests.push(String(url));return new Response(JSON.stringify(fail?{message:"Evidence is already reviewed or superseded."}:{data:preview}),{status:fail?409:200,headers:{"Content-Type":"application/json"}})}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try {
    const {default:EvidenceReview}=await server.ssrLoadModule("/src/EvidenceReview.tsx")
    const render=async(reject,key)=>{await act(async()=>root.render(React.createElement(EvidenceReview,{key,projectId:"project-1",evidenceId:"7",reject,
      onClose:()=>closed++,onConfirm:async(token,note)=>{confirmations.push({token,note});return saveResult}})))}
    const button=label=>[...document.querySelectorAll("button")].find(el=>el.textContent===label)
    await render(false,"approve")
    assert.match(document.body.textContent,/20 \/ 30 · 66.7% → 30 \/ 30 · 100%/)
    assert.match(document.body.textContent,/80 \/ 270 · 29.6% → 90 \/ 270 · 33.3%/)
    assert.equal(confirmations.length,0)
    await act(async()=>button("Confirm approval").click())
    assert.deepEqual(confirmations,[{token:"trusted-token",note:""}])
    assert.equal(closed,1)
    await render(true,"reject")
    assert.match(document.body.textContent,/20 \/ 30 · 66.7% → 20 \/ 30 · 66.7%/)
    assert.equal(button("Confirm rejection").disabled,true)
    const input=document.querySelector("textarea")
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value").set.call(input,"Missing inspection result");input.dispatchEvent(new dom.window.Event("input",{bubbles:true}))})
    assert.equal(button("Confirm rejection").disabled,false)
    await act(async()=>button("Confirm rejection").click())
    assert.deepEqual(confirmations[1],{token:"trusted-token",note:"Missing inspection result"})
    saveResult=false
    await render(false,"save-failed")
    await act(async()=>button("Confirm approval").click())
    assert.match(document.querySelector('[role="alert"]').textContent,/refresh its current state/)
    assert.equal(button("Confirm approval").disabled,true)
    preview.before.project={earned:null,total:null,percentage:null,reason:"Complete project phase scope is unavailable."}
    preview.after.project=preview.before.project
    await render(false,"unknown-scope")
    assert.match(document.body.textContent,/Project: Unavailable → Unavailable/)
    assert.match(document.body.textContent,/Complete project phase scope is unavailable/)
    fail=true
    await render(false,"stale")
    assert.match(document.querySelector('[role="alert"]').textContent,/superseded/)
    assert.equal(button("Confirm approval").disabled,true)
    assert.ok(requests.every(url=>url.endsWith("/projects/project-1/evidence/7/review-preview")))
  } finally {
    await act(()=>root.unmount());await server.close();globalThis.fetch=originalFetch;dom.window.close()
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
