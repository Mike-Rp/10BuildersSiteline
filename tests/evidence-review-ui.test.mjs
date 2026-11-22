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
    const button=label=>[...document.querySelectorAll("button")].find(el=>el.textContent===label)
    const popup=name=>document.querySelector(`[role="dialog"][aria-label="${name}"]`)
    const answer=(name,label)=>[...popup(name).querySelectorAll("button")].find(el=>el.textContent===label)
    // One dialog serves both decisions; the reviewer chooses Approve or Reject inside it.
    const render=async(reject,key)=>{
      await act(async()=>root.render(React.createElement(EvidenceReview,{key,projectId:"project-1",evidenceId:"7",
        onClose:()=>closed++,onConfirm:async(token,note,rejected)=>{confirmations.push({token,note});assert.equal(rejected,reject);return saveResult}})))
      if(reject)await act(async()=>button("Reject").click())
    }
    await render(false,"approve")
    assert.match(document.body.textContent,/20 \/ 30 points → 30 \/ 30 points/)
    assert.doesNotMatch(document.body.textContent,/Project:|80 \/ 270|90 \/ 270/)
    assert.doesNotMatch(document.body.textContent,/%/)
    assert.equal(confirmations.length,0)
    // Choosing Approve only selects it. Nothing is saved until the popup is answered with Yes.
    assert.equal(button("Approve").getAttribute("aria-checked"),"true")
    assert.equal(button("Reject").getAttribute("aria-checked"),"false")
    assert.match(document.querySelector(".evidence-decision-hint").textContent,/does not save it/)
    assert.equal(popup("Approve evidence?"),null,"no popup before Confirm approval is pressed")
    await act(async()=>button("Confirm approval").click())
    assert.ok(popup("Approve evidence?"),"Confirm approval asks first")
    assert.match(popup("Approve evidence?").textContent,/Concrete test report/)
    assert.match(popup("Approve evidence?").textContent,/20 \/ 30 points → 30 \/ 30 points/)
    assert.equal(confirmations.length,0,"nothing saved yet")
    await act(async()=>answer("Approve evidence?","No").click())
    assert.equal(popup("Approve evidence?"),null,"No closes only the popup")
    assert.ok(document.querySelector('[role="dialog"][aria-label="Review activity evidence"]'),"the review panel stays open")
    assert.equal(confirmations.length,0)
    assert.equal(closed,0)
    await act(async()=>button("Confirm approval").click())
    await act(async()=>{document.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}))})
    assert.equal(popup("Approve evidence?"),null,"Escape closes only the popup")
    assert.ok(document.querySelector('[role="dialog"][aria-label="Review activity evidence"]'))
    assert.equal(confirmations.length,0)
    await act(async()=>button("Confirm approval").click())
    await act(async()=>answer("Approve evidence?","Yes").click())
    assert.deepEqual(confirmations,[{token:"trusted-token",note:""}])
    assert.equal(closed,1)
    await render(true,"reject")
    assert.match(document.body.textContent,/20 \/ 30 points → 20 \/ 30 points/)
    assert.doesNotMatch(document.body.textContent,/Project:/)
    assert.doesNotMatch(document.body.textContent,/%/)
    assert.equal(button("Confirm rejection").disabled,true)
    const input=document.querySelector("textarea")
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value").set.call(input,"Missing inspection result");input.dispatchEvent(new dom.window.Event("input",{bubbles:true}))})
    assert.equal(button("Confirm rejection").disabled,false)
    assert.equal(button("Reject").getAttribute("aria-checked"),"true")
    await act(async()=>button("Confirm rejection").click())
    assert.ok(popup("Reject evidence?"),"Confirm rejection asks first")
    assert.match(popup("Reject evidence?").textContent,/Missing inspection result/,"the reason is shown in the popup")
    assert.equal(confirmations.length,1,"nothing new saved yet")
    await act(async()=>answer("Reject evidence?","No").click())
    assert.equal(popup("Reject evidence?"),null)
    assert.equal(confirmations.length,1)
    await act(async()=>button("Confirm rejection").click())
    await act(async()=>answer("Reject evidence?","Yes").click())
    assert.deepEqual(confirmations[1],{token:"trusted-token",note:"Missing inspection result"})
    saveResult=false
    await render(false,"save-failed")
    await act(async()=>button("Confirm approval").click())
    await act(async()=>answer("Approve evidence?","Yes").click())
    assert.equal(popup("Approve evidence?"),null,"the popup closes when saving fails")
    assert.match(document.querySelector('[role="alert"]').textContent,/refresh its current state/)
    assert.equal(button("Confirm approval").disabled,true)
    preview.before.project={earned:null,total:null,percentage:null,reason:"Complete project phase scope is unavailable."}
    preview.after.project=preview.before.project
    await render(false,"unknown-scope")
    assert.match(document.body.textContent,/Phase: 20 \/ 30 points → 30 \/ 30 points/)
    assert.doesNotMatch(document.body.textContent,/Project:|Complete project phase scope is unavailable/)
    preview.before.phase={earned:null,total:null,percentage:null,reason:"Complete phase activity scope is unavailable."}
    preview.after.phase=preview.before.phase
    await render(false,"unknown-phase-scope")
    assert.match(document.body.textContent,/Phase: Unavailable → Unavailable/)
    assert.match(document.body.textContent,/Complete phase activity scope is unavailable/)
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
