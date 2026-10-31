import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { addDays, localDay } from '../Thesis-Backend/src/common/utilities/license-status.utility.js'

test('replacement form requires office signing and shows contacts; banner explains viewing deadline', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost'})
  const previous = new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react')
  const {createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  const originalFetch=globalThis.fetch
  const writes=[]
  let finished=0
  try {
    globalThis.fetch=async (url,init={}) => {
      if(init.method==='POST') { writes.push(JSON.parse(init.body)); return Response.json({data:{status:'accepted'}}) }
      return Response.json({data:{project:{id:'project',name:'Sample project'},role:'spm',stage:'Foundation',isLead:false,
        available:true,current:{id:'outgoing',name:'Outgoing engineer',expiry:addDays(localDay(),30)},pending:null,previous:[],summary:{required:2,approved:1,pct:50},
        candidates:[{id:'incoming',name:'Incoming engineer',phone:'09171234567',email:'incoming@example.com',workload:1,matchPercent:100,best:true,licenseExpiry:addDays(localDay(),400)}]}})
    }
    const {OverrideDialog,LicenseBanner}=await server.ssrLoadModule('/src/LicenseWorkflow.tsx')
    await act(async ()=> { root.render(React.createElement(OverrideDialog,{target:{projectId:'project',stageId:1},onClose(){},onDone(){finished++}})); await new Promise(r=>setTimeout(r,40)) })
    assert.match(document.body.textContent,/09171234567/)
    assert.match(document.body.textContent,/incoming@example.com/)
    assert.match(document.body.textContent,/No in-system acceptance is needed/)
    const submit=()=>document.querySelector('button[type="submit"]')
    assert.equal(submit().disabled,true)
    const setValue=(el,value)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));el.dispatchEvent(new window.Event('change',{bubbles:true}))}
    await act(()=>setValue(document.querySelector('textarea'),'License policy replacement'))
    await act(()=>document.querySelector('input[type="checkbox"]').click())
    assert.equal(submit().disabled,true,'signing date still required')
    await act(()=>setValue(document.querySelector('input[type="date"]'),localDay()))
    assert.equal(submit().disabled,false)
    await act(async ()=>submit().click())
    assert.equal(writes.length,1)
    assert.equal(writes[0].appointment_signed,true)
    assert.equal(writes[0].signed_on,localDay())
    assert.equal(writes[0].from_user_id,'outgoing')
    assert.equal(finished,1)
    await act(()=>root.render(React.createElement(LicenseBanner,{license:{status:'expiring_soon',expiry:addDays(localDay(),30)}})))
    assert.match(document.body.textContent,/Replacement preparation notice/)
    assert.match(document.body.textContent,/new assignments are blocked/i)
    await act(()=>root.render(React.createElement(LicenseBanner,{license:{status:'expired',expiry:addDays(localDay(),-1)}})))
    assert.match(document.body.textContent,/License expired · viewing-only access/)
    assert.match(document.body.textContent,/submissions, approvals and project changes are disabled/i)
    await act(()=>root.render(React.createElement(LicenseBanner,{license:{status:'renewal_under_review',expiry:addDays(localDay(),30)}})))
    assert.match(document.body.textContent,/Replacement preparation notice/)
  } finally {
    await act(()=>root.unmount()); globalThis.fetch=originalFetch
    await server.close(); dom.window.close()
    for(const [key,descriptor] of previous) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key] }
  }
})
