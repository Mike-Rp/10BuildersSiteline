import assert from "node:assert/strict"
import test from "node:test"
import {JSDOM} from "jsdom"
import {createServer} from "vite"
import React,{act} from "react"

test("targeted rework previews only selected credit, requires a reason, and keeps dismissal unchanged",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost",pretendToBeVisual:true})
  const previous=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const originalFetch=globalThis.fetch,confirmations=[]
  const total=(earned,total)=>({earned,total,percentage:earned/total*100,reason:null})
  let save=true,closed=0
  globalThis.fetch=async(url,init)=>{
    assert.match(String(url),/\/rework-requests\/request-1\/preview$/)
    const selected=JSON.parse(init.body).selected_activity_ids||["1","2"],loss=selected.includes("1")?10:0
    return new Response(JSON.stringify({data:{request_id:"request-1",reason:"Failed inspection",selected,
      activities:[{id:"1",label:"Concrete inspection",status:"approved"},{id:"2",label:"Pending report",status:"pending"}],
      before:{phase:total(20,30),project:total(80,270)},after:{phase:total(20-loss,30),project:total(80-loss,270)},
      loss:{phase:loss/30*100,project:loss/270*100},review_token:JSON.stringify(selected)}}),{status:200,headers:{"Content-Type":"application/json"}})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try{
    const {default:Review}=await server.ssrLoadModule("/src/ReworkReview.tsx")
    const render=async(confirm,key)=>act(async()=>root.render(React.createElement(Review,{key,requestId:"request-1",confirm,onClose:()=>closed++,onConfirm:async(token,ids,reason)=>{confirmations.push({token,ids,reason});return save}})))
    const button=label=>[...document.querySelectorAll("button")].find(b=>b.textContent===label)
    const reason=async text=>act(async()=>{const input=document.querySelector("textarea");Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value").set.call(input,text);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}))})
    await render(true,"confirm")
    assert.match(document.body.textContent,/20 \/ 30 · 66.7% → 10 \/ 30 · 33.3%/)
    assert.match(document.body.textContent,/80 \/ 270 · 29.6% → 70 \/ 270 · 25.9%/)
    assert.equal(button("Confirm rework").disabled,true)
    await act(async()=>document.querySelectorAll('input[type="checkbox"]')[0].click())
    assert.match(document.body.textContent,/Loss: 0 percentage points/)
    assert.match(document.body.textContent,/80 \/ 270 · 29.6% → 80 \/ 270 · 29.6%/)
    await reason("Correct the pending report")
    await act(async()=>button("Confirm rework").click())
    assert.deepEqual(confirmations[0],{token:'["2"]',ids:["2"],reason:"Correct the pending report"})
    assert.equal(closed,1)
    await render(false,"dismiss")
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length,0)
    assert.match(document.body.textContent,/80 \/ 270 · 29.6% → 80 \/ 270 · 29.6%/)
    assert.equal(button("Dismiss request").disabled,true)
    await reason("No correction is required")
    save=false
    await act(async()=>button("Dismiss request").click())
    assert.match(document.querySelector('[role="alert"]').textContent,/fresh preview/)
    assert.equal(button("Dismiss request").disabled,true)
  }finally{
    await act(()=>root.unmount());await server.close();globalThis.fetch=originalFetch;dom.window.close()
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
