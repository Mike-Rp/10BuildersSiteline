import React from 'react'
import {renderToString} from 'react-dom/server'
import {createServer} from 'vite'
import {readdir,writeFile} from 'node:fs/promises'
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
try{
const {default:Login}=await server.ssrLoadModule('/src/LoginPage.tsx')
const css=(await readdir('dist/assets')).find(n=>/^index-.*\.css$/.test(n))
await writeFile('__sage-login-preview.html',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sage role button preview</title><link rel="stylesheet" href="/dist/assets/${css}"><style>body{margin:0}#root .admin-login .login-role-selector{background:#f0f4f0;border-color:#dfe7df}#root .admin-login .login-role-selector a{color:#637467}#root .admin-login .login-role-selector a[aria-current=page]{background:#607a68;color:white;box-shadow:0 2px 5px #354d3c20}#root .admin-login .login-role-selector a:not([aria-current=page]):hover{background:#e3ebe4;color:#425b49}</style></head><body><div id="root">${renderToString(React.createElement(Login,{portal:'staff',onSignIn:async()=>{}}))}</div><script>document.querySelector('form').addEventListener('submit',e=>e.preventDefault())</script></body></html>`)
}finally{await server.close()}
