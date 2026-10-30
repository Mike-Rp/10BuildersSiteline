import React from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost',pretendToBeVisual:true})
for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
dom.window.HTMLElement.prototype.scrollIntoView=()=>{}
const {createRoot}=await import('react-dom/client')
const root=createRoot(document.getElementById('root'))
try {
  const {default:Portal} = await server.ssrLoadModule('/src/ClientPortal.tsx')
  const {initialState} = await server.ssrLoadModule('/tests/fixtures/demo-state.ts')
  const {clientProjectViews} = await server.ssrLoadModule('/src/client-access.ts')
  const state=initialState(),actor=state.accounts.find(account=>account.role==='client')
  const props={actor,projects:clientProjectViews(state,actor.id),readNoticeIds:[],mutedTypes:[],onMute(){},onResolve(){},onReport(){},onRecord(){},onRead(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}}
  const css=(await readdir('dist/assets')).find(name=>/^index-.*\.css$/.test(name))
  await React.act(()=>root.render(React.createElement(Portal,props)))
  const html=()=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Siteline sidebar close placement</title><link rel="stylesheet" href="/dist/assets/${css}"></head><body>${document.body.innerHTML}</body></html>`
  await writeFile('__sidebar-close-preview.html',html())
  await React.act(()=>document.querySelector('.client-nav-close').click())
  await writeFile('__sidebar-closed-preview.html',html())
  const {default:Workspace}=await server.ssrLoadModule('/src/RoleWorkspace.tsx')
  const staffActor={...state.accounts.find(account=>account.role==='spm'),expiry:'2099-01-01'}
  await React.act(()=>root.render(React.createElement(Workspace,{state,actor:staffActor,onCommand:async()=>({ok:true}),onRead(){},onMute(){},onReload(){},paused:false,onResume(){},onPause(){},idleWarning:false,onStayActive(){}})))
  await writeFile('__staff-sidebar-open-preview.html',html())
  await React.act(()=>document.querySelector('.role-nav-close').click())
  await writeFile('__staff-sidebar-closed-preview.html',html())
  console.log('Actual client sidebar layout preview ready')
} finally {await React.act(()=>root.unmount());await server.close();dom.window.close()}
