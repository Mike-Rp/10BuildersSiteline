import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'

test('inactivity warning preserves work, needs explicit continuation, and expires without background renewal',async()=>{
  const dom=new JSDOM('<div id="root"></div><textarea id="draft">Unsaved work</textarea>',{url:'http://localhost/admin',pretendToBeVisual:true}),w=dom.window,prior=new Map()
  let now=Date.UTC(2026,9,30),last=now,tick,activities=0,expired=0
  const realNow=Date.now,realInterval=w.setInterval
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,sessionStorage:w.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(url)=>{
    if(String(url).endsWith('/auth/activity')){activities++;last=now}
    return new Response(JSON.stringify({data:{lastActivityAt:last,expiresAt:last+1800000,warningAt:last+1500000,serverNow:now}}),{status:200,headers:{'Content-Type':'application/json'}})
  }})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
  Date.now=()=>now;w.setInterval=fn=>{tick=fn;return 1}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
  try{
    const client=await server.ssrLoadModule('/src/api/client.ts'),{default:Monitor}=await server.ssrLoadModule('/src/SessionInactivity.tsx')
    client.setApiBase('http://test/api');client.setToken('test-session')
    w.addEventListener(client.SESSION_REPLACED_EVENT,()=>expired++)
    await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(Monitor)));await new Promise(r=>setTimeout(r,25))})
    now+=1500000;await act(()=>tick())
    assert.match(document.querySelector('[role=dialog]').textContent,/5:00/)
    await act(()=>document.dispatchEvent(new w.Event('scroll',{bubbles:true})))
    assert.equal(activities,0)
    await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='Stay signed in').click();await new Promise(r=>setTimeout(r,10))})
    assert.equal(activities,1);assert.equal(document.querySelector('[role=dialog]'),null)
    assert.equal(document.getElementById('draft').value,'Unsaved work')
    now+=1800000;await act(()=>tick())
    assert.equal(client.getToken(),'');assert.equal(expired,1)
    await act(()=>tick());assert.equal(expired,1)
  }finally{
    await act(()=>root.unmount());await server.close();Date.now=realNow;w.setInterval=realInterval;dom.window.close()
    for(const [key,value] of prior){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}
  }
})
