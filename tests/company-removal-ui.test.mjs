import assert from "node:assert/strict"
import test from "node:test"

test("Admin company actions confirm deletion, archive history, and block committed companies",async t=>{
 const [{JSDOM},{createServer},React]=await Promise.all([import('jsdom'),import('vite'),import('react')])
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),w=dom.window,previous=new Map()
 let mode='delete',removed=0,posts=[]
 for(const[k,value]of Object.entries({window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,
 fetch:async(url,options)=>{
  if(options?.method==='POST')posts.push(JSON.parse(options.body))
  return new Response(JSON.stringify({data:{mode,companyName:'Sample Company'}}),{status:200,headers:{'Content-Type':'application/json'}})
 }})){previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,configurable:true,writable:true})}
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 t.after(async()=>{await React.act(()=>root.unmount());await server.close();w.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 const {default:Actions}=await server.ssrLoadModule('/src/CompanyRemovalActions.tsx')
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label||b.getAttribute('aria-label')===label)
 const click=async label=>React.act(async()=>{const b=button(label);assert.ok(b,label);b.click();await new Promise(r=>setTimeout(r,15))})
 const render=async()=>React.act(()=>root.render(React.createElement(Actions,{key:mode,company:{id:'company',name:'Sample Company'},onRemoved:async()=>{removed++}})))
 await render();await click('Actions for Sample Company');await click('Delete unused company')
 assert.match(document.querySelector('[role="dialog"]').textContent,/Sample Company/)
 assert.equal(posts.length,0,'opening confirmation never deletes')
 await click('Cancel');assert.equal(posts.length,0)
 await click('Actions for Sample Company');await click('Delete unused company');await click('Delete company')
 assert.deepEqual(posts[0],{action:'delete',companyName:'Sample Company'});assert.equal(removed,1)
 mode='archive';await render();await click('Actions for Sample Company');await click('Archive company')
 assert.match(document.querySelector('[role="dialog"]').textContent,/preserved/)
 await click('Archive company');assert.equal(posts[1].action,'archive')
 mode='blocked';await render();await click('Actions for Sample Company')
 assert.match(document.body.textContent,/Removal blocked/);assert.equal(button('Delete unused company'),undefined);assert.equal(button('Archive company'),undefined)
 assert.equal(posts.length,2)
})
