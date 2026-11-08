import assert from "node:assert/strict"
import test from "node:test"

test("Admin company registration defaults pending and requires evidence before verification", async t => {
  const [{JSDOM},{createServer},React]=await Promise.all([import('jsdom'),import('vite'),import('react')])
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),w=dom.window,previous=new Map()
  for(const [k,value] of Object.entries({window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
  t.after(async()=>{await React.act(()=>root.unmount());await server.close();w.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
  const {CompanyForm}=await server.ssrLoadModule('/src/panels.tsx'),saved=[]
  await React.act(()=>root.render(React.createElement(CompanyForm,{owner:'Admin',actorId:'admin',role:'admin',status:'pending',onClose(){},onSave:company=>saved.push(company)})))
  const availability=document.querySelector('[role="group"][aria-label="Company availability"]')
  assert.ok(availability)
  assert.match(availability.textContent,/Available/)
  assert.match(availability.textContent,/Set automatically/)
  assert.equal(availability.querySelectorAll('input,select,textarea').length,0,'Automatic availability is presented as status, not an editable field')
  const field=label=>[...document.querySelectorAll('input')].find(el=>el.getAttribute('aria-label')===label)||document.getElementById([...document.querySelectorAll('label')].find(l=>l.textContent===label)?.htmlFor||'')
  const enter=(label,value)=>React.act(()=>{const el=field(label);assert.ok(el,label);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})
  const submit=()=>React.act(async()=>document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})))
  await enter('Company name *','AquaLine');await enter('Company email *','aqualine@gmail.com')
  await enter('Primary foreman full name','Juan Cruz');await enter('Primary foreman mobile number','09171234567')
  await enter('Primary company category *','Mechanical / Plumbing')
  const trade=[...document.querySelectorAll('label')].find(b=>b.textContent.trim()==='Plumbing')?.querySelector('input')
  assert.ok(trade);await React.act(()=>trade.click())
  await submit();assert.equal(saved.length,1);assert.equal(saved[0].verificationDecision,'pending')
  assert.equal(saved[0].primaryTrade,'Mechanical / Plumbing');assert.deepEqual(saved[0].proposedDisciplines,['Plumbing'])
  assert.deepEqual(saved[0].activeProjectIds,[]);assert.equal(saved[0].manpowerCount,0)
  assert.equal(saved[0].availability,'available','Registration still saves the same automatic availability value')
  await enter('Verification decision','verified');await submit();assert.equal(saved.length,1)
  assert.match(document.body.textContent,/Attach supporting records/)
  assert.doesNotMatch(document.body.textContent,/Site PM reviews|SPM review/)
})
