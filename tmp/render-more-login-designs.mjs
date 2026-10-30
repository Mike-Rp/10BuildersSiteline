import React from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { readdir, writeFile } from 'node:fs/promises'

const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
const lineStyle=`
#root .admin-login .login-role-selector{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:0;margin-bottom:22px;border-radius:0;border-bottom:1px solid #dce3eb;background:transparent}#root .admin-login .login-role-selector a{position:relative;min-height:50px;padding:10px 12px 16px;border:0;border-radius:0;background:transparent;box-shadow:none;color:#718198;font-size:15px;font-weight:500}#root .admin-login .login-role-selector a[aria-current=page]{color:#173555;background:transparent;font-weight:650}#root .admin-login .login-role-selector a[aria-current=page]:after{content:'';position:absolute;bottom:-1px;height:3px;inset-inline:0;background:#c9a564;border-radius:3px 3px 0 0}#root .admin-login .login-role-selector a:hover{background:#f5f7fa;color:#173555}
@media(max-height:740px){#root .admin-login .login-role-selector{margin-bottom:8px}#root .admin-login .login-role-selector a{min-height:44px;padding-bottom:12px}}
`
const listStyle=`
#root .admin-login .login-role-selector{display:flex;flex-direction:column;gap:8px;padding:0;margin-bottom:20px;background:transparent;border-radius:0}#root .admin-login .login-role-selector a{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:61px;padding:10px 14px;border:1px solid #dce3eb;border-radius:9px;background:#fff;box-shadow:none;color:#4b617c;text-align:left}#root .admin-login .login-role-selector a[aria-current=page]{color:#172b4d;border-color:#c9a564;background:#fbf8f1;box-shadow:none}#root .admin-login .login-role-selector a:hover{border-color:#9caec4}#root .admin-login .login-role-selector .role-list-copy{display:flex;flex-direction:column;gap:4px}#root .admin-login .login-role-selector .role-list-copy strong{color:inherit;font-size:14px;line-height:1.2;font-weight:600}#root .admin-login .login-role-selector .role-list-copy small{color:#718198;font-size:11px;line-height:1.3;font-weight:400}#root .admin-login .role-choice-circle{display:grid;place-items:center;flex:none;width:19px;height:19px;border:1.5px solid #b9c6d6;border-radius:50%;background:#fff}#root .admin-login [aria-current=page] .role-choice-circle{border-color:#b38b4d}#root .admin-login [aria-current=page] .role-choice-circle:after{content:'';width:9px;height:9px;background:#b38b4d;border-radius:50%}
@media(max-height:740px){#root .admin-login .login-role-selector{gap:6px;margin-bottom:8px}#root .admin-login .login-role-selector a{min-height:44px;padding:7px 12px}#root .admin-login .login-role-selector .role-list-copy small{display:none}}
`
try{
  const {default:Login}=await server.ssrLoadModule('/src/LoginPage.tsx')
  const css=(await readdir('dist/assets')).find(name=>/^index-.*\.css$/.test(name))
  for(const design of ['underline','list'])for(const portal of ['staff','admin']){
    const dom=new JSDOM(renderToString(React.createElement(Login,{portal,onSignIn:async()=>{}})))
    const doc=dom.window.document
    for(const role of ['staff','admin']){
      const link=doc.querySelector(`.login-role-selector a[href="/${role}/login"]`)
      link.setAttribute('href',`/__login-${design}-${role}-preview.html`)
      if(design==='list')link.innerHTML=`<span class="role-list-copy"><strong>${role==='staff'?'Staff':'Administrator'}</strong><small>${role==='staff'?'Office and Site Project Managers':'Workspace administration'}</small></span><span class="role-choice-circle" aria-hidden="true"></span>`
    }
    await writeFile(`__login-${design}-${portal}-preview.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${design==='underline'?'Underlined tabs':'Stacked role selection'} · Login preview</title><link rel="icon" href="/images/10-builders-logo.png"><link rel="stylesheet" href="/dist/assets/${css}"><style>body{margin:0}${design==='underline'?lineStyle:listStyle}</style></head><body><div id="root">${doc.body.innerHTML}</div><script>document.querySelector('form').addEventListener('submit',event=>event.preventDefault());document.querySelector('.password-toggle').addEventListener('click',()=>{const field=document.querySelector('.password-field input');field.type=field.type==='password'?'text':'password'});const photos=[...document.querySelectorAll('.login-banner-image')];let active=1;if(!matchMedia('(prefers-reduced-motion:reduce)').matches)setInterval(()=>{if(!document.hidden){active=(active+1)%3;photos.forEach((photo,i)=>photo.classList.toggle('is-active',i===active))}},6000)</script></body></html>`)
    dom.window.close()
  }
  console.log('Underline and stacked-list design previews ready. Application files unchanged.')
}finally{await server.close()}
