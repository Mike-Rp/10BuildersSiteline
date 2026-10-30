import React from 'react'
import {renderToString} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import {readdir,writeFile} from 'node:fs/promises'
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
try {
  const {default:Login}=await server.ssrLoadModule('/src/LoginPage.tsx')
  const sample=new JSDOM(renderToString(React.createElement(Login,{onSignIn:async()=>{}})))
  const document=sample.window.document
  const mark=document.querySelector('.login-brand .brand-mark')
  mark.classList.add('preview-company-mark')
  mark.innerHTML='<img src="/tmp/10-builders-mark-preview.png" alt="10 Builders company logo" width="50" height="76">'
  const company=document.querySelector('.login-brand small')
  company.textContent='10 Builders and Development Corporation'
  company.classList.add('preview-company-name')
  // These changes exist only in this separate rendered sample.
  const css=(await readdir('dist/assets')).find(name=>/^index-.*\.css$/.test(name))
  const styles=`body{margin:0;background:#edf1f5}.preview-heading{padding:16px 28px 10px;color:#52637a;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:12px}.preview-heading strong{color:#172b4d;font-size:15px}.preview-browser-strip{margin:0 28px;padding:8px 12px 0;border:1px solid #cbd6e3;border-bottom:0;border-radius:12px 12px 0 0;background:#dce5ef}.preview-browser-tab{width:305px;max-width:100%;display:flex;align-items:center;gap:10px;background:white;border-radius:9px 9px 0 0;padding:10px 15px;font-size:15px;color:#1f2937}.preview-browser-tab img{width:22px;height:22px;object-fit:contain;flex:none}.preview-browser-tab span:last-child{margin-left:auto;font-size:20px;color:#637387}.preview-login{margin:0 28px 24px;border:1px solid #cbd6e3;border-top:0;border-radius:0 0 12px 12px;overflow:hidden}#root .login-redesign{min-height:calc(100svh - 118px);padding:24px}#root .login-redesign .login-brand .preview-company-mark{width:50px;height:76px;min-width:50px;background:transparent;border:0;border-radius:0;flex:none}#root .preview-company-mark img{width:50px;height:76px;object-fit:contain;display:block}#root .login-redesign .login-brand{gap:15px;align-items:center}#root .login-redesign .login-brand>span:last-child{min-width:0}#root .login-redesign .login-brand .preview-company-name{max-width:300px;font-size:13px;line-height:1.5;letter-spacing:0;color:#526b87}#root .login-redesign .login-panel{padding-top:26px}#root .login-redesign .login-content{margin-top:26px}@media(max-width:760px){.preview-heading{padding:12px 14px;align-items:flex-start;flex-direction:column;gap:4px}.preview-browser-strip{margin:0 12px;padding-inline:8px}.preview-browser-tab{font-size:13px;gap:7px}.preview-login{margin:0 12px 12px}#root .login-redesign{padding:12px;min-height:calc(100svh - 130px)}#root .login-redesign .login-panel{padding:24px 18px}#root .login-redesign .login-brand .preview-company-name{font-size:12px}}
`
  const header='<div class="preview-heading"><strong>Proposed company branding</strong><span>Sample only · Login logo and browser-tab identity</span></div><div class="preview-browser-strip" aria-label="Proposed browser tab"><div class="preview-browser-tab"><img src="/tmp/10-builders-mark-preview.png" alt=""><span>SITELINE | 10 Builders</span><span aria-hidden="true">×</span></div></div>'
  await writeFile('__login-company-logo-preview.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SITELINE | 10 Builders</title><link rel="icon" type="image/png" href="/tmp/10-builders-mark-preview.png"><link rel="stylesheet" href="/dist/assets/${css}"><style>${styles}</style></head><body>${header}<div class="preview-login"><div id="root">${document.body.innerHTML}</div></div><script>document.querySelectorAll('link[rel="icon"]').forEach(link=>{if(link.getAttribute('href')!='/tmp/10-builders-mark-preview.png')link.remove()});document.addEventListener('submit',event=>event.preventDefault())</script></body></html>`)
  sample.window.close()
  console.log('Logo and browser tab preview ready; application files unchanged')
} finally {await server.close()}
