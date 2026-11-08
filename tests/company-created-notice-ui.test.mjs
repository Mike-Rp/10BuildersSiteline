import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Company creation shows a persistent directory notice only after a successful save", {timeout:60000}, async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:8443/admin/directory',pretendToBeVisual:true}),w=dom.window,previous=new Map()
  for(const [key,value]of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,sessionStorage:w.sessionStorage,localStorage:w.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{}
  const user={id:'creation-admin',role:'admin',full_name:'Creation Admin',email:'admin@example.invalid',status:'active',date_added:'2026-01-01'}
  w.sessionStorage.setItem('siteline-api-token',`test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString('base64url')}.test`)
  let reject=true,created,attempts=0
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const path=new URL(String(url),'http://localhost:8443').pathname.replace(/^\/api\/v1/,'')
    if(path==='/auth/me')return Response.json(user)
    if(path==='/accounts')return Response.json([user])
    if(path===`/accounts/${user.id}`)return Response.json(user)
    if(path==='/workspace')return Response.json({accounts:{},projects:{},preferences:{}})
    if(path==='/files')return Response.json({data:{download_url:'/test-company-record'}})
    if(path==='/subcontractors/registrations'){
      attempts++
      if(reject)return Response.json({error:{message:'Company registration could not be saved.'}},{status:409})
      const draft=JSON.parse(options.body)
      assert.equal(draft.verificationDecision,'verified')
      created={id:draft.id,company_name:draft.name,contact_email:draft.email,directory_status:'approved'}
      return Response.json({data:{id:draft.id,status:'approved'}})
    }
    if(path==='/subcontractors')return Response.json(created?[created]:[])
    if(['/workspace/reconcile-phase-handoffs','/workspace/project-data','/notifications','/licenses/overview','/licenses/renewals'].includes(path))return Response.json([])
    throw new Error(`Unexpected request: ${path}`)
  })
  const server=await createServer({cacheDir:`node_modules/.vite-tests/company-created-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  const click=async element=>{assert.ok(element);await act(async()=>{element.focus();element.click();await tick()})}
  const button=text=>[...document.querySelectorAll('button')].find(item=>item.textContent===text)
  const enter=async(label,value)=>act(()=>{
    const id=[...document.querySelectorAll('label')].find(item=>item.textContent===label)?.htmlFor
    const input=document.getElementById(id)||document.querySelector(`[aria-label="${label}"]`)
    assert.ok(input,label)
    Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?w.HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,'value').set.call(input,value)
    input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}))
  })
  try {
    const {default:App}=await server.ssrLoadModule('/src/App.tsx')
    await act(async()=>{root.render(React.createElement(App));await tick()})
    for(let i=0;i<50&&!document.querySelector('.admin-workspace');i++)await act(()=>new Promise(resolve=>setTimeout(resolve,20)))
    assert.ok(document.querySelector('.admin-workspace'))
    const resources=document.querySelector('.sidebar [aria-label="Resources"]')
    if(resources)await click(resources)
    await click(document.querySelector('.sidebar [aria-label="Directory"]'))
    await click([...document.querySelectorAll('[role="tab"]')].find(item=>item.textContent==='Subcontractors'))
    assert.equal(document.querySelector('.company-created-notice'),null)
    await click(button('Add company'))
    await enter('Company name *','Naay Construction')
    await enter('Company email *','naay@gmail.com')
    await enter('Primary foreman full name','Mika Cruz')
    await enter('Primary foreman mobile number','09987654345')
    await enter('Primary company category *','Structural / Rebar')
    await click([...document.querySelectorAll('label')].find(label=>label.textContent.trim()==='Civil')?.querySelector('input'))
    const {dismissActionResult}=await server.ssrLoadModule('/src/action-feedback.ts')
    const file=document.querySelector('input[type="file"]')
    Object.defineProperty(file,'files',{configurable:true,value:[new File(['%PDF-1.4'],'company-record.pdf',{type:'application/pdf'})]})
    await act(()=>file.dispatchEvent(new w.Event('change',{bubbles:true})))
    await click(button('Confirm upload'))
    await act(()=>dismissActionResult())
    await click(document.querySelector('.check-row input'))
    await enter('Verification note *','Reviewed company supporting records and Civil capability.')
    const submit=async()=>act(async()=>{document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick()})
    await submit()
    assert.equal(attempts,1)
    assert.equal(document.querySelector('.company-created-notice'),null,'Failed saves must not show a creation confirmation')
    assert.ok(document.querySelector('[aria-label="Add subcontractor company"]'))
    await act(()=>dismissActionResult())
    reject=false
    await submit()
    await act(()=>dismissActionResult())
    const notice=document.querySelector('.company-created-notice')
    assert.ok(notice)
    assert.equal(notice.getAttribute('role'),'status')
    assert.match(notice.textContent,/Naay Construction was added successfully/)
    assert.match(notice.textContent,/Registered and verified/)
    assert.equal(document.querySelector('[aria-label="Add subcontractor company"]'),null)
    assert.ok(button('View Company'))
    assert.equal(attempts,2)
    await click(document.querySelector('[aria-label="Dismiss company creation notification"]'))
    assert.equal(document.querySelector('.company-created-notice'),null)
    assert.ok(document.body.textContent.includes('Naay Construction'),'Dismissing the notice does not remove the company')
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})
