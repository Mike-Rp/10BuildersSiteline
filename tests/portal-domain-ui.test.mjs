import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("production host simulation: roots, toggle, all role logins, refresh, authorization and logout", {timeout:60000}, async t => {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://10buildline.site/',pretendToBeVisual:true})
  const w = dom.window, previous = new Map()
  for (const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,sessionStorage:w.sessionStorage,localStorage:w.localStorage,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  w.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}})
  w.HTMLElement.prototype.scrollIntoView = () => {}
  w.scrollTo = () => {}
  let user, authCalls = [], logoutCalls = 0
  const token = () => `test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString('base64url')}.test`
  t.mock.method(globalThis,'fetch',async (url,init) => {
    const path = new URL(String(url),'https://10buildline.site').pathname.replace(/^\/api\/v1/,'')
    if (path === '/auth/me') {
      assert.equal(init.headers.get('Authorization'), `Bearer ${token()}`)
      return Response.json(user)
    }
    if (['/auth/login','/auth/admin/login','/auth/staff/login'].includes(path)) {
      authCalls.push(path)
      assert.equal(path,user.role==='admin'?'/auth/admin/login':user.role==='client'?'/auth/login':'/auth/staff/login')
      return Response.json({user,token:token()})
    }
    if (path === '/auth' && init?.method === 'DELETE') {
      logoutCalls++
      assert.equal(init.headers.get('Authorization'), `Bearer ${token()}`)
      return Response.json({ok:true})
    }
    if (path === '/accounts') return Response.json([user])
    if (path === `/accounts/${user.id}`) return Response.json(user)
    if (path === '/workspace') return Response.json({accounts:{},projects:{},preferences:{}})
    if (!init?.method || init.method === 'GET' || path === '/workspace/reconcile-phase-handoffs') return Response.json([])
    throw Error(`Unexpected request ${path}`)
  })
  const server = await createServer({cacheDir:`node_modules/.vite-tests/portal-domain-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act} = await import('react'), {createRoot} = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  try {
    const {default:App} = await server.ssrLoadModule('/src/App.tsx')
    const client = await server.ssrLoadModule('/src/api/client.ts')
    const until = async (fn,description) => {
      for (let n=0;n<200&&!fn();n++) await act(()=>new Promise(resolve=>setTimeout(resolve,10)))
      assert.ok(fn(),description + ': ' + document.body.textContent.slice(0,200))
    }
    const mount = async () => act(()=>root.render(React.createElement(App)))
    const clear = async () => act(()=>root.render(null))
    const type = async (input,value) => act(()=>{
      assert.ok(input)
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value)
      input.dispatchEvent(new w.Event('input',{bubbles:true}))
    })
    for (const role of ['client','admin','opm','spm']) {
      const host = role === 'client' ? '10buildline.site' : 'staff.10buildline.site'
      dom.reconfigure({url:`https://${host}/`})
      w.history.replaceState(null,'','/')
      client.setToken('')
      user = {id:`domain-${role}`,role,full_name:`Domain ${role}`,email:`${role}@example.test`,status:'active',date_added:'2026-01-01'}
      await mount()
      await until(()=>document.querySelector('form.login-form'),'Root login form')
      assert.equal(w.location.pathname,'/')
      assert.equal(document.querySelector('.login-heading h1').textContent,role === 'client' ? 'Welcome to 10BuildLine' : 'Staff sign-in')
      if (role !== 'client') {
        const length = w.history.length
        for (const tab of ['Administrator','Staff',...(role === 'admin' ? ['Administrator'] : [])]) {
          await act(()=>document.querySelector(`[aria-label="${tab} sign-in"]`).click())
          assert.equal(document.querySelector('.login-heading h1').textContent,`${tab} sign-in`)
          assert.equal(w.location.pathname,'/')
          assert.equal(w.history.length,length)
        }
      }
      const dashboard = `/${role}/${role === 'client' ? 'overview' : 'dashboard'}`
      await clear()
      w.history.replaceState(null,'',dashboard)
      await mount()
      await until(()=>document.querySelector('form.login-form') && w.location.pathname === '/','Signed-out direct URL')
      assert.equal(w.history.state.returnTo,dashboard,'The root sign-in remembers a protected deep link')
      await type(document.querySelector('form.login-form input'),user.email)
      await type(document.querySelector('input[type=password]'),'Password@123')
      await act(()=>document.querySelector('form.login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})))
      await until(()=>document.querySelector('.sidebar') && w.location.pathname === dashboard,'Role workspace')
      assert.equal(w.location.hostname,host)
      // Remount simulates a browser refresh and exercises the server-verified restore.
      await clear()
      await mount()
      await until(()=>document.querySelector('.sidebar'),'Restored workspace')
      assert.equal(w.location.pathname,dashboard)
      // Same-domain cross-role navigation must resolve only the verified role.
      const otherPath = role === 'client' ? '/client/unknown' : `/${role === 'admin' ? 'opm' : 'admin'}/team`
      await act(()=>{w.history.pushState(null,'',otherPath);w.dispatchEvent(new w.PopStateEvent('popstate'))})
      await until(()=>w.location.pathname === dashboard,'Unauthorized route correction')
      await act(()=>document.querySelector('[aria-label="Sign out"]').click())
      await until(()=>document.querySelector('[role="dialog"]'),'Sign-out confirmation')
      await act(()=>[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Sign out').click())
      await until(()=>document.querySelector('form.login-form') && !client.getToken(),'Signed out')
      assert.equal(w.location.pathname,'/')
      assert.equal(w.location.hostname,host)
      assert.equal(document.querySelector('.sidebar'),null)
      await clear()
    }
    assert.equal(authCalls.length,4)
    assert.equal(logoutCalls,4)
  } finally {
    await act(()=>root.unmount()); await server.close(); dom.window.close()
    for (const [key,value] of previous) value ? Object.defineProperty(globalThis,key,value) : delete globalThis[key]
  }
})
