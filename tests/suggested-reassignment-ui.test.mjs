import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Suggested reassignment requires OPM confirmation and preserves failed edits", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key,value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  previous.set('fetch',Object.getOwnPropertyDescriptor(globalThis,'fetch'))
  const requests=[]
  let fail=true, resolvePost, finish, mode='normal', saved=0, closed=0
  globalThis.fetch=async(url,options)=>{
    requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)})
    if(options.method==='POST')return await new Promise(resolve=>{resolvePost=()=>resolve(new Response(JSON.stringify(fail?{error:{message:'Candidate is no longer eligible.'}}:{data:{saved:true}}),{status:fail?409:200,headers:{'Content-Type':'application/json'}}));finish=resolvePost})
    return new Response(JSON.stringify({data:mode==='missing'?{available:false,message:'Apply database migration 023 to enable suggested reassignment.'}:{available:true,canReassign:true,version:'offer-v1',name:'Juan Dela Cruz',phase:'Design',userId:'old',tags:['Civil','Structural'],status:'pending',deadline:'2020-01-01T00:00:00Z',message:mode==='empty'?'No eligible replacement covers this responsibility scope.':'Eligibility is checked again when you confirm.',candidates:mode==='empty'?[]:[{id:'new-a',name:'Mika Reyes',tags:['Civil','Structural']},{id:'new-b',name:'Faith Fajardo',tags:['Civil','Structural']}]}}),{status:200,headers:{'Content-Type':'application/json'}})
  }
  const server=await createServer({cacheDir:`node_modules/.vite-tests/suggested-reassignment-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  try {
    const {default:Popup}=await server.ssrLoadModule('/src/SuggestedReassignment.tsx')
    const render=async key=>act(async()=>{root.render(React.createElement(Popup,{key,project:{id:'p1',name:'STI Santa Rosa'},phase:'Design',userId:'old',onClose:()=>{closed++},onSaved:async()=>{saved++}}));await tick()})
    const button=text=>[...document.querySelectorAll('button')].find(element=>element.textContent===text)
    await render('normal')
    assert.match(document.querySelector('[role="dialog"]').textContent,/Response overdue/)
    assert.equal(document.querySelectorAll('input[type="radio"]').length,2)
    assert.equal(button('Confirm Reassignment').disabled,true)
    await act(()=>document.querySelectorAll('input[type="radio"]')[1].click())
    const note=document.querySelector('textarea')
    await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(note,'No response after recorded contact attempts.');note.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
    assert.equal(button('Confirm Reassignment').disabled,false)
    await act(()=>{button('Confirm Reassignment').click();button('Confirm Reassignment').click()})
    assert.equal(requests.filter(request=>request.method==='POST').length,1)
    assert.deepEqual(requests.at(-1).body,{phase:'Design',userId:'old',newUserId:'new-b',version:'offer-v1',note:'No response after recorded contact attempts.'})
    await act(async()=>{finish();await tick()})
    assert.match(document.querySelector('[role="alert"]').textContent,/no longer eligible/)
    assert.equal(note.value,'No response after recorded contact attempts.')
    assert.equal(document.querySelector('input[value="new-b"]').checked,true)
    assert.equal(saved,0);assert.equal(closed,0)
    fail=false
    await act(()=>button('Confirm Reassignment').click())
    await act(async()=>{finish();await tick()})
    assert.equal(saved,1);assert.equal(closed,1)
    mode='empty';await render('empty')
    assert.equal(button('Confirm Reassignment').disabled,true)
    assert.match(document.querySelector('[role="dialog"]').textContent,/No eligible replacement/)
    mode='missing';await render('missing')
    assert.match(document.querySelector('[role="dialog"]').textContent,/migration 023/)
    assert.equal(button('Confirm Reassignment').disabled,true)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})
