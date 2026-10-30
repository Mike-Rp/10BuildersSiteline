import React from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost/admin",pretendToBeVisual:true})
for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
dom.window.scrollTo=()=>{}
dom.window.HTMLElement.prototype.scrollIntoView=()=>{}
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
const {createRoot}=await import("react-dom/client")
const root=createRoot(document.getElementById("root"))
try {
  const {initialState}=await server.ssrLoadModule("/tests/fixtures/demo-state.ts")
  const {clientProjectViews}=await server.ssrLoadModule("/src/client-access.ts")
  const {default:Workspace}=await server.ssrLoadModule("/src/RoleWorkspace.tsx")
  const {default:Portal}=await server.ssrLoadModule("/src/ClientPortal.tsx")
  const css=(await readdir("dist/assets")).find(name=>/^index-.*\.css$/.test(name))
  const state=initialState()
  const save=async(name)=>{
    if(document.querySelectorAll('main .page-title-panel').length!==1)throw Error(`Expected exactly one module title: ${name}`)
    await writeFile(`__title-panels-${name}-preview.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Title panels · ${name} · Example data</title><link rel="stylesheet" href="/dist/assets/${css}"></head><body>${document.body.innerHTML}</body></html>`)
  }
  const navigate=async(label)=>{
    const button=[...document.querySelectorAll('.sidebar nav button')].find(element=>element.getAttribute('aria-label')===label)
    if(!button)throw Error(`Missing module: ${label}`)
    await React.act(()=>button.click())
  }
  for(const role of ["opm","spm"]) {
    const actor={...state.accounts.find(account=>account.role===role),expiry:"2099-01-01"}
    await React.act(()=>root.render(React.createElement(Workspace,{key:role,state,actor,onCommand:async()=>({ok:true}),onRead(){},onMute(){},onReload(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
    await React.act(()=>document.querySelector('.role-nav-close').click())
    await navigate(role==='opm'?'Documents':'Document repository');await save(role+'-documents')
    await React.act(()=>root.render(null))
  }
  const actor=state.accounts.find(account=>account.id==='a9')
  await React.act(()=>root.render(React.createElement(Portal,{actor,projects:clientProjectViews(state,actor.id),readNoticeIds:[],mutedTypes:[],onMute(){},onResolve(){},onReport(){},onRecord(){},onRead(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
  await React.act(()=>document.querySelector('.client-nav-close').click())
  await save('client-overview')
  await navigate('Active sites');await save('client-active-sites')
  await navigate('Project Documents');await save('client-documents')
  await React.act(()=>root.render(null))
  const admin={id:"title-preview-admin",full_name:"Title Panel Preview Admin",email:"preview@example.invalid",role:"admin",status:"active",date_added:"2026-01-01"}
  globalThis.fetch=async(url)=>{
    const path=new URL(String(url),'http://localhost').pathname.replace(/^\/api\/v1/,'')
    if(path==='/auth/me')return Response.json(admin)
    if(path==='/accounts')return Response.json([admin])
    if(path===`/accounts/${admin.id}`)return Response.json(admin)
    if(path==='/workspace')return Response.json({accounts:{},projects:{},preferences:{}})
    return Response.json([])
  }
  const {default:App}=await server.ssrLoadModule('/src/App.tsx')
  const client=await server.ssrLoadModule('/src/api/client.ts')
  client.setToken(`test.${Buffer.from(JSON.stringify({sub:admin.id,details:{id:admin.id,role:'admin'}})).toString('base64url')}.test`)
  await React.act(()=>root.render(React.createElement(App)))
  for(let n=0;n<100&&!document.querySelector('.admin-workspace');n++)await React.act(()=>new Promise(resolve=>setTimeout(resolve,10)))
  await React.act(()=>document.querySelector('.admin-nav-close').click())
  await save('admin-dashboard')
  await navigate('Documents');await save('admin-documents')
  client.setToken('')
} finally {await React.act(()=>root.unmount());await server.close();dom.window.close()}
