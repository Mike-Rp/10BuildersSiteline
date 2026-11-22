import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("deep links survive login, temporary password replacement and transient session failures for every role", {timeout:60000}, async t => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost/admin/documents',pretendToBeVisual:true})
  // The first-visit workspace guide is a modal; tests that exercise the app itself treat it as already seen.
  { const getItem = dom.window.Storage.prototype.getItem; dom.window.Storage.prototype.getItem = function (key) { return String(key).startsWith('10buildline:workspace-guide:') ? 'seen' : getItem.call(this, key) } }
  const w = dom.window, previous = new Map()
  for (const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,sessionStorage:w.sessionStorage,localStorage:w.localStorage,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  w.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}})
  w.HTMLElement.prototype.scrollIntoView = () => {}
  w.scrollTo = () => {}
  let user, restoreStatus = 200, resetCalls = 0
  const token = () => `test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString('base64url')}.test`
  t.mock.method(globalThis,'fetch',async (url,init) => {
    const path = new URL(String(url),'http://localhost').pathname.replace(/^\/api\/v1/,'')
    if (path === '/auth/me') return restoreStatus === 200 ? Response.json(user) : Response.json({error:{message:'Session unavailable'}},{status:restoreStatus})
    if (['/auth/login','/auth/admin/login','/auth/staff/login'].includes(path)) {
      assert.equal(path,user.role==='admin'?'/auth/admin/login':user.role==='client'?'/auth/login':'/auth/staff/login')
      return Response.json({user,token:token()})
    }
    if (path === '/auth/reset-password') {
      assert.equal(JSON.parse(init.body).password,'Replacement@123')
      resetCalls++
      user.temp_password_issued = false
      return Response.json({ok:true})
    }
    if (path === '/auth/logout') return Response.json({ok:true})
    if (path === '/accounts') return Response.json([user])
    if (path === `/accounts/${user.id}`) return Response.json(user)
    if (path === '/workspace') return Response.json({accounts:{},projects:{},preferences:{}})
    if (!init?.method || init.method === 'GET' || path === '/workspace/reconcile-phase-handoffs') return Response.json([])
    throw Error(`Unexpected request ${path}`)
  })
  const server = await createServer({cacheDir:`node_modules/.vite-tests/routing-session-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act} = await import('react'), {createRoot} = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  try {
    const {default:App} = await server.ssrLoadModule('/src/App.tsx')
    const client = await server.ssrLoadModule('/src/api/client.ts')
    const until = async (fn,description) => {
      for (let n=0;n<150&&!fn();n++) await act(()=>new Promise(resolve=>setTimeout(resolve,10)))
      assert.ok(fn(),description + ': ' + document.body.textContent.slice(0,150))
    }
    const mount = async () => act(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(App))))
    const clear = async () => act(()=>root.render(null))
    const type = async (input,value) => act(()=>{
      assert.ok(input)
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value)
      input.dispatchEvent(new w.Event('input',{bubbles:true}))
    })
    const submit = async () => act(()=>document.querySelector('form.login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})))
    for (const role of ['admin','opm','spm','client']) {
      user = {id:`routing-${role}`,role,full_name:`Routing ${role}`,email:`${role}@example.test`,status:'active',date_added:'2026-01-01'}
      const label = role === 'spm' ? 'Resources' : role === 'client' ? 'Project Documents' : 'Documents'
      const path = `/${role}/${role==='spm'?'resources':'documents'}`
      const active = () => document.querySelector(`.sidebar [aria-label="${label}"][aria-current="page"]`)
      // A protected deep link remembers its destination through credential entry.
      client.setToken('')
      w.history.replaceState(null,'',path)
      await mount()
      await until(()=>document.querySelector('form.login-form'),'Signed-out login form')
      assert.equal(w.location.pathname,role==='client'?'/client/login':'/login')
      assert.equal(w.history.state.returnTo,path)
      await type(document.querySelector('form.login-form input'),user.email)
      await type(document.querySelector('input[type=password]'),'Password@123')
      await submit()
      await until(active,'Login returns to the requested module')
      assert.equal(w.location.pathname,path)
      await clear()

      // Password replacement stays in front of the workspace, even on a deep link.
      user.temp_password_issued = true
      w.history.replaceState(null,'',path)
      client.setToken(token())
      await mount()
      await until(()=>document.querySelector('.password-reset-page'),'Temporary password gate')
      assert.equal(document.querySelector('.sidebar'),null)
      assert.equal(w.location.pathname,path)
      await type(document.querySelector('[aria-label="New password"]'),'Replacement@123')
      await type(document.querySelector('[aria-label="Confirm password"]'),'Mismatch@123')
      const before = resetCalls
      await submit()
      assert.equal(resetCalls,before,'Mismatching passwords never reach the API')
      await type(document.querySelector('[aria-label="Confirm password"]'),'Replacement@123')
      await submit()
      await until(active,'Password replacement returns to the requested module')
      assert.equal(w.location.pathname,path)
      await clear()

      restoreStatus = 503
      await mount()
      await until(()=>document.querySelector('.session-restore [role=alert]'),'Transient restore error')
      assert.equal(client.getToken(),token(),'A temporary outage keeps the saved session')
      assert.equal(w.location.pathname,path)
      restoreStatus = 200
      await act(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Retry').click())
      await until(active,'Retry restores the requested page')
      assert.equal(w.location.pathname,path)
      await clear()

      restoreStatus = 401
      await mount()
      await until(()=>document.querySelector('form.login-form'),'Expired session login')
      assert.equal(client.getToken(),'')
      assert.equal(document.querySelector('.sidebar'),null)
      assert.equal(w.location.pathname,role==='client'?'/client/login':'/login')
      restoreStatus = 200
      await clear()
    }
    assert.equal(resetCalls,4)
  } finally {
    await act(()=>root.unmount()); await server.close(); dom.window.close()
    for (const [key,value] of previous) value ? Object.defineProperty(globalThis,key,value) : delete globalThis[key]
  }
})
