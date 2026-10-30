import React from 'react'
import {renderToString} from 'react-dom/server'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {readdir,writeFile} from 'node:fs/promises'
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
try{
const {CompanyForm}=await server.ssrLoadModule('/src/panels.tsx')
const css=(await readdir('dist/assets')).find(n=>/^index-.*\.css$/.test(n))
const doc=new JSDOM(renderToString(React.createElement(CompanyForm,{owner:'Sample Site PM',role:'spm',status:'pending',onSave(){},onClose(){}})))
doc.window.document.querySelector('.capability-proposal')?.remove()
const form=doc.window.document.querySelector('form')
const values=['Axis Construction Services','axis.crew@gmail.com','Juan Dela Cruz','09171234567','Maria Santos','09181234567']
for(const [i,input]of [...form.querySelectorAll('input:not([readonly])')].entries())if(values[i])input.setAttribute('value',values[i])
const shell=(title,sub,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Sample</title><link rel="stylesheet" href="/dist/assets/${css}"><style>body{margin:0;background:#edf1f5}main{max-width:1000px;margin:24px auto;background:white;border:1px solid #dbe3ed;border-radius:14px;padding:26px}h1{font-size:26px;margin:0 0 8px}.sample-subtitle{color:#526b87;margin-bottom:24px}.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.review-grid section{padding:20px;border:1px solid #dce3eb;border-radius:9px}.review-grid small{display:block;color:#526b87;margin-bottom:8px}.sample-status{display:inline-block;background:#fff5e3;color:#8d5c14;border:1px solid #eddbb8;padding:7px 12px;border-radius:6px;margin-bottom:20px}.review-note{margin:22px 0;color:#526b87}@media(max-width:760px){main{margin:12px;padding:16px}.review-grid{grid-template-columns:1fr}}</style></head><body><div id="root"><main><h1>${title}</h1><p class="sample-subtitle">${sub}</p>${body}</main></div><script>document.querySelector('form')?.addEventListener('submit',e=>e.preventDefault())</script></body></html>`
await writeFile('__directory-spm-request-sample.html',shell('Submit a subcontractor company','Site PM · Sample registration fields · Trade selection remains in the full form',form.outerHTML))
await writeFile('__directory-admin-review-sample.html',shell('Review subcontractor request','Administrator · Example request submitted by a Site PM',`<span class="sample-status">Pending Admin approval</span><div class="review-grid"><section><small>Company name</small><strong>Axis Construction Services</strong></section><section><small>Company email</small><strong>axis.crew@gmail.com</strong></section><section><small>Primary foreman</small><strong>Juan Dela Cruz</strong><p>09171234567</p></section><section><small>Backup foreman</small><strong>Maria Santos</strong><p>09181234567</p></section><section><small>Submitted by</small><strong>Sample Site PM</strong></section><section><small>Proposed trades</small><strong>Civil · Structural · Plumbing</strong></section></div><p class="review-note">Approving adds this company to the shared directory. Project acceptance is handled separately.</p><div class="modal-actions"><button class="button">Close</button><button class="button danger-ghost">Reject request</button><button class="button primary">Approve company</button></div>`))
doc.window.close()
}finally{await server.close()}
