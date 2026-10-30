import React from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { readdir, writeFile } from 'node:fs/promises'

const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
const icons={
  staff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V7l9-4v18M12 10h8v11M1 21h22M6 9h2m-2 4h2m-2 4h2m7-3h2m-2 4h2"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8.5 12l2.5 2.5 4.5-5"/></svg>'
}
const styles=`
body{margin:0}#root .admin-login .login-role-selector{gap:10px;padding:0;background:transparent;border-radius:0;margin-bottom:20px}#root .admin-login .login-role-selector a{position:relative;min-height:82px;justify-content:flex-start;gap:10px;padding:13px 12px;border:1px solid #dce3eb;border-radius:10px;background:#fff;color:#183555;text-align:left;box-shadow:none}#root .admin-login .login-role-selector a[aria-current=page]{background:#172f4e;border-color:#172f4e;color:white;box-shadow:inset 0 -3px #c9a564}#root .admin-login .login-role-selector a:hover{border-color:#c9a564}#root .role-card-icon{display:grid;place-items:center;flex:none;width:32px;height:36px;border-radius:7px;background:#eff3f8;color:#436280}#root .role-card-icon svg{width:22px;height:22px}#root [aria-current=page] .role-card-icon{background:#ffffff17;color:#e8cd98}#root .role-card-copy{display:flex;flex-direction:column;gap:5px;min-width:0}#root .admin-login .login-role-selector .role-card-copy strong{color:inherit;font-size:14px;line-height:1.2;font-weight:650}#root .admin-login .login-role-selector .role-card-copy small{font-size:10px;line-height:1.3;color:#718198;font-weight:400}#root .admin-login .login-role-selector [aria-current=page] .role-card-copy small{color:#d1dfed}#root .role-card-selected{position:absolute;top:8px;right:8px;width:5px;height:5px;border-radius:50%;background:#ddbc7e}
@media(max-width:360px){#root .admin-login .login-role-selector a{gap:7px;padding-inline:9px}#root .role-card-icon{width:24px}#root .admin-login .login-role-selector .role-card-copy strong{color:inherit;font-size:13px}#root .admin-login .login-role-selector .role-card-copy small{font-size:9px}}
@media(max-height:740px){#root .admin-login .login-role-selector{margin-bottom:8px}#root .admin-login .login-role-selector a{min-height:58px;padding-block:8px}#root .role-card-copy{gap:3px}#root .role-card-icon{height:30px}}
`
try{
  const {default:Login}=await server.ssrLoadModule('/src/LoginPage.tsx')
  const css=(await readdir('dist/assets')).find(name=>/^index-.*\.css$/.test(name))
  for(const portal of ['staff','admin']){
    const dom=new JSDOM(renderToString(React.createElement(Login,{portal,onSignIn:async()=>{}})))
    const doc=dom.window.document
    for(const role of ['staff','admin']){
      const link=doc.querySelector(`.login-role-selector a[href="/${role}/login"]`)
      link.setAttribute('href',`/__login-role-cards-${role}-preview.html`)
      link.innerHTML=`<span class="role-card-icon" aria-hidden="true">${icons[role]}</span><span class="role-card-copy"><strong>${role==='staff'?'Staff':'Admin'}</strong><small>${role==='staff'?'Office & Site PMs':'Administration'}</small></span>${portal===role?'<span class="role-card-selected" aria-hidden="true"></span>':''}`
    }
    await writeFile(`__login-role-cards-${portal}-preview.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${portal==='staff'?'Staff':'Administrator'} sign-in · Alternative design</title><link rel="icon" href="/images/10-builders-logo.png"><link rel="stylesheet" href="/dist/assets/${css}"><style>${styles}</style></head><body><div id="root">${doc.body.innerHTML}</div><script>document.querySelector('form').addEventListener('submit',event=>event.preventDefault());document.querySelector('.password-toggle').addEventListener('click',()=>{const field=document.querySelector('.password-field input');field.type=field.type==='password'?'text':'password'});const photos=[...document.querySelectorAll('.login-banner-image')];let active=1;if(!matchMedia('(prefers-reduced-motion:reduce)').matches)setInterval(()=>{if(!document.hidden){active=(active+1)%3;photos.forEach((photo,i)=>photo.classList.toggle('is-active',i===active))}},6000)</script></body></html>`)
    dom.window.close()
  }
  console.log('Alternative role-card previews ready; application files unchanged.')
}finally{await server.close()}

