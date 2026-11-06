import test from 'node:test'
import assert from 'node:assert/strict'

test('Workspace stays visible while other sidebar categories collapse and follow page navigation',async t=>{
 const [{JSDOM},{createServer},React]=await Promise.all([import('jsdom'),import('vite'),import('react')])
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),w=dom.window,previous=new Map()
 for(const[k,value]of Object.entries({window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
 previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,configurable:true,writable:true})}
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 t.after(async()=>{await React.act(()=>root.unmount());await server.close();w.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 const {default:Nav}=await server.ssrLoadModule('/src/CollapsibleSidebarNav.tsx')
 const {ADMIN_NAV}=await server.ssrLoadModule('/src/adminNav.ts')
 let selected
 const props={items:ADMIN_NAV,counts:{Team:{count:2,description:'staff license alerts'},Directory:{count:1,description:'pending company'}},onNavigate:p=>{selected=p}}
 const render=async page=>React.act(()=>root.render(React.createElement(Nav,{...props,page})))
 const headers=()=>[...document.querySelectorAll('.sidebar-category-toggle')]
 const category=name=>headers().find(b=>b.querySelector('span').textContent===name)
 const workspace=()=>document.querySelector('.sidebar-category-heading')
 const children=name=>name==='Workspace'?workspace().nextElementSibling:document.getElementById(category(name).getAttribute('aria-controls'))
 await render('Dashboard')
 assert.equal(children('Workspace').hidden,false);assert.equal(children('Resources').hidden,true)
 assert.equal(category('Workspace'),undefined)
 assert.equal(workspace().textContent,'Workspace')
 assert.equal(workspace().querySelector('.category-chevron'),null)
 assert.match(category('Organization').textContent,/2/)
 await React.act(()=>category('Resources').click())
 assert.equal(children('Workspace').hidden,false);assert.equal(children('Resources').hidden,false)
 assert.equal(headers().filter(b=>b.getAttribute('aria-expanded')==='true').length,1)
 await React.act(()=>document.querySelector('[aria-label="Directory"]').click());assert.equal(selected,'Directory')
 await render('Team')
 assert.equal(children('Organization').hidden,false);assert.equal(children('Resources').hidden,true)
 assert.equal(children('Workspace').hidden,false)
 assert.equal(document.querySelector('[aria-label="Team"]').getAttribute('aria-current'),'page')
 await React.act(()=>category('Organization').click());assert.equal(headers().filter(b=>b.getAttribute('aria-expanded')==='true').length,0)
 assert.equal(children('Workspace').hidden,false)
 await render('Archive');assert.equal(children('Resources').hidden,false);assert.equal(children('Organization').hidden,true)
})
