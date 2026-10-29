import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { loginPortalForPath } from "../src/login-portal.ts"

test("only the admin path selects the administrator login", () => {
  for (const path of ["/admin", "/admin/", "/admin/login"]) assert.equal(loginPortalForPath(path), "admin")
  for (const path of ["/", "/login", "/administrator", "/projects/admin"]) assert.equal(loginPortalForPath(path), "workspace")
})

test("explicit sign-in pages wait for credentials even when this tab has a saved session", {timeout:30000}, async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost/admin/login",pretendToBeVisual:true})
  const w=dom.window, previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Node:w.Node,sessionStorage:w.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})
  }
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  const originalFetch=globalThis.fetch, requests=[]
  globalThis.fetch=async(url)=>{requests.push(String(url));return Response.json({message:"No automatic sign-in expected"},{status:503})}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import("react"),{createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {default:App}=await server.ssrLoadModule("/src/App.tsx")
    const client=await server.ssrLoadModule("/src/api/client.ts")
    for(const role of ["admin","opm","spm","client"]) {
      const token=`test.${Buffer.from(JSON.stringify({sub:`saved-${role}`,details:{id:`saved-${role}`,role}})).toString("base64url")}.test`
      for(const path of ["/login","/admin/login","/admin/login/?source=switch"]) {
        w.history.replaceState(null,"",path)
        client.setToken(token)
        await act(()=>root.render(React.createElement(App,{key:role+path})))
        assert.equal(requests.length,0,"Visiting a sign-in page must not fetch or restore a cached account")
        assert.ok(document.querySelector('form.login-form'),`Expected a form at ${path} for saved ${role}`)
        assert.equal(document.querySelector('.login-heading h1').textContent,path.startsWith('/admin/')?'Administrator sign-in':'Welcome to SITELINE')
        assert.equal(w.location.pathname,new URL(path,w.location.origin).pathname)
        for(const input of document.querySelectorAll('form.login-form input')) assert.equal(input.value,"")
        assert.equal(client.getToken(),token,"Opening a login form must not revoke an existing session")
        await act(()=>root.render(null))
      }
    }
    client.setToken("")
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close();globalThis.fetch=originalFetch
    for(const [key,value]of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]
  }
})

test("both login pages use the approved branding and submit to their own server entry point", {timeout:30000}, async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost/login",pretendToBeVisual:true})
  const w=dom.window, previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})
  }
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  const originalFetch=globalThis.fetch, requests=[]
  globalThis.fetch=async(url,init)=>{requests.push({url:String(url),body:JSON.parse(init.body)});return Response.json({message:"Use the correct sign-in page.",error:{code:"LOGIN_PORTAL_MISMATCH"}},{status:403})}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import("react"),{createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {default:App}=await server.ssrLoadModule("/src/App.tsx")
    const client=await server.ssrLoadModule("/src/api/client.ts")
    const type=async(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new w.Event("input",{bubbles:true}))})
    for(const admin of [false,true]) {
      w.history.replaceState(null,"",admin?"/admin/login":"/login")
      client.setToken("")
      await act(()=>root.render(React.createElement(App,{key:String(admin)})))
      assert.match(document.title,admin?/SITELINE Admin/:/SITELINE \| 10 Builders/)
      assert.equal(document.querySelector('.login-brand img').getAttribute('src'),'/images/10-builders-logo.png')
      assert.equal(document.querySelector('.login-brand small').textContent,'10 Builders and Development Corporation')
      assert.equal(document.querySelector('.login-heading h1').textContent,admin?'Administrator sign-in':'Welcome to SITELINE')
      assert.equal(!!document.querySelector('.admin-access-badge'),admin)
      assert.equal(document.querySelectorAll('.admin-login-background picture').length,admin?3:0)
      if(admin) {
        assert.equal(document.querySelectorAll('.login-banner-footer,.carousel-controls,.slide-count').length,0)
        assert.equal(document.querySelector('.admin-login-background').getAttribute('aria-hidden'),'true')
      }
      const switchPage=document.querySelector('.login-portal-switch')
      assert.equal(switchPage.getAttribute('href'),admin?'/login':'/admin/login')
      assert.equal(switchPage.textContent.trim(),admin?'Back to regular sign-in':'Administrator sign-in')
      const inputs=document.querySelectorAll('form.login-form input')
      await type(inputs[0],'person@example.test');await type(inputs[1],'ExamplePassword@123')
      await act(()=>document.querySelector('form.login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})))
      assert.ok(requests.at(-1).url.endsWith(admin?'/auth/admin/login':'/auth/login'))
      assert.equal(requests.at(-1).body.email,'person@example.test')
      assert.match(document.querySelector('.login-error').textContent,/correct sign-in page/)
      assert.equal(client.getToken(),'')
      await act(()=>document.querySelector('.login-help a').click())
      assert.ok(document.querySelector('[role="dialog"][aria-label="Request a password reset"]'))
      await act(()=>root.render(null))
    }
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close();globalThis.fetch=originalFetch
    for(const [key,value]of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]
  }
})
