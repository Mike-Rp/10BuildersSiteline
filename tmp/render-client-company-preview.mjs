import React from 'react'
import {renderToString} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import {readdir,writeFile} from 'node:fs/promises'
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
try{
const {IntakeForm}=await server.ssrLoadModule('/src/panels.tsx'),{initialState}=await server.ssrLoadModule('/tests/fixtures/demo-state.ts')
const state=initialState(),project={...state.projects[0],clientSubcon:'',clientSubconCompany:{name:'',email:'',foremen:[{name:'',phone:''},{name:'',phone:''}],contact:'',phone:'',note:'',availability:'available',documents:[]}}
project.clientSubcon='Sample company'
const dom=new JSDOM(renderToString(React.createElement(IntakeForm,{state,project,onSubmit(){},onClient(a){return a},onClose(){}})))
const section=dom.window.document.querySelector('.subcontractor-agreement')
section.querySelectorAll('[disabled]').forEach(input=>input.removeAttribute('disabled'))
const css=(await readdir('dist/assets')).find(n=>/^index-.*\.css$/.test(n))
await writeFile('__client-company-intake-preview.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Client subcontractor · Intake form</title><link rel="stylesheet" href="/dist/assets/${css}"><style>body{margin:0;background:#edf1f5}main{max-width:1060px;margin:24px auto;padding:24px;background:#fff;border-radius:12px}h1{font-size:26px;margin:0 0 8px}main>p{margin-bottom:24px;color:#526b87}.subcontractor-agreement{margin:0}@media(max-width:760px){main{margin:12px;padding:16px}}</style></head><body><div id="root"><main><h1>Client-provided subcontractor</h1><p>Project intake · Company details and foreman contacts</p>${section.outerHTML}</main></div></body></html>`)
dom.window.close()
}finally{await server.close()}
