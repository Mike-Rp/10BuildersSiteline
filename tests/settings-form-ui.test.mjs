import assert from "node:assert/strict"
import test from "node:test"

test("renewal reminders only offer Confirm change after an edit, and accept spaces or commas",async()=>{
  const {JSDOM}=await import("jsdom"),{createServer}=await import("vite"),{default:React,act}=await import("react")
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"}),saved=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try{
    const {SettingsForm}=await server.ssrLoadModule("/src/panels.tsx")
    const saves=[]
    const rules={grace:30,cap:3,response:3,idle:15,reminderDays:[60,30,14,7,0]}
    await act(()=>root.render(React.createElement(SettingsForm,{rules,onSave:(next,label)=>{saves.push([next,label])}})))
    const confirms=()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='Confirm change')
    assert.equal(confirms().length,0,"an untouched form offers no Confirm change")
    assert.match(document.body.textContent,/Maximum active projects per engineer before they stop appearing in recommendations\./)
    const input=document.querySelector('input[aria-label="License renewal reminder days"]')
    const setValue=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set
    await act(()=>{setValue.call(input,"60 30, 7");input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
    assert.equal(confirms().length,1)
    assert.equal(confirms()[0].disabled,false,"space-separated days are valid")
    await act(()=>confirms()[0].click())
    assert.deepEqual(saves,[[{...rules,reminderDays:[60,30,7]},"License renewal reminders"]])
  }finally{
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]
  }
})
