import assert from 'node:assert/strict'
import test from 'node:test'

test('restricted accounts load no workspace data and see only renewal form or pending status',async t=>{
 const [{JSDOM},{createServer},React]=await Promise.all([import('jsdom'),import('vite'),import('react')])
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),w=dom.window,previous=new Map()
 let pending=false,reloads=0,signouts=0;const requests=[]
 const status={renewalOnly:true,renewalSubmissionAllowed:true,expiry:'2026-12-03',restrictedOn:'2026-11-10'}
 for(const[k,value]of Object.entries({window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,
 fetch:async(url,options)=>{const path=String(url);requests.push(path)
  if(path.endsWith('/licenses/me'))return Response.json({data:status})
  if(options?.method==='POST'){pending=true;return Response.json({data:{id:1,status:'under_review'}})}
  return Response.json({data:{submissions:pending?[{id:1,profession:'Civil Engineer',license_number:'0012345',license_expiry:'2030-01-01',status:'under_review',submitted_at:'2026-11-10'}]:[]}})
 }})){previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,configurable:true,writable:true})}
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 t.after(async()=>{await React.act(()=>root.unmount());await server.close();w.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 const {loadState}=await server.ssrLoadModule('/src/api/load.ts')
 for(const role of ['spm','opm']){
  requests.length=0;const state=await loadState({id:'engineer',role,full_name:'Juan Cruz'})
  assert.equal(state.projects.length,0);assert.equal(state.accounts.length,1)
  assert.equal(requests.length,1);assert.ok(requests[0].endsWith('/licenses/me'))
 }
 const {default:Page}=await server.ssrLoadModule('/src/RestrictedRenewalPage.tsx')
 await React.act(async()=>{root.render(React.createElement(Page,{actor:{id:'engineer',name:'Juan Cruz',role:'spm'},status,onReload:async()=>{reloads++},onSignOut:()=>{signouts++}}));await new Promise(r=>setTimeout(r,20))})
 assert.equal(document.querySelector('aside,nav,.sidebar'),null)
 const field=label=>document.getElementById([...document.querySelectorAll('label')].find(l=>l.textContent===label)?.htmlFor||'')
 const enter=(label,value)=>React.act(()=>{const el=field(label);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})
 await enter('Licensed profession','Civil Engineer');await enter('PRC license number','0012345');await enter('New expiry date','2030-01-01')
 const file=field('Supporting license document');Object.defineProperty(file,'files',{value:[new File(['%PDF-1.4'],'renewed.pdf',{type:'application/pdf'})]})
 await React.act(()=>file.dispatchEvent(new w.Event('change',{bubbles:true})))
 await React.act(async()=>{document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20))})
 assert.equal(document.querySelector('form'),null)
 assert.match(document.body.textContent,/License renewal under review/)
 assert.equal(reloads,1)
 assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='View submission'))
 await React.act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Sign out').click())
 assert.equal(signouts,1)
 pending=false
 await React.act(async()=>{root.render(React.createElement(Page,{key:'missed',actor:{id:'engineer',name:'Juan Cruz',role:'opm'},status:{...status,renewalSubmissionAllowed:false},onReload:async()=>{},onSignOut(){}}));await new Promise(r=>setTimeout(r,20))})
 assert.equal(document.querySelector('form'),null)
 assert.match(document.body.textContent,/Visit your Administrator/)
 assert.match(document.body.textContent,/submission window has ended/)
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Submit for Admin verification'),false)
 pending=true
 await React.act(async()=>{root.render(React.createElement(Page,{key:'timely',actor:{id:'engineer',name:'Juan Cruz',role:'opm'},status:{...status,renewalSubmissionAllowed:false},onReload:async()=>{},onSignOut(){}}));await new Promise(r=>setTimeout(r,20))})
 assert.match(document.body.textContent,/License renewal under review/)
 assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='View submission'))
})
