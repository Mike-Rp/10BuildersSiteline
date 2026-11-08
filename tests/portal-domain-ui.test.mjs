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
  let user, serverRoleOverride, releaseLogout, authCalls = [], logoutCalls = 0, requestCalls = 0, logoutStatus = 200
  const token = () => `test.${Buffer.from(JSON.stringify({sub:user.id,details:{id:user.id,role:user.role}})).toString('base64url')}.test`
  t.mock.method(globalThis,'fetch',async (url,init) => {
    requestCalls++
    const path = new URL(String(url),'https://10buildline.site').pathname.replace(/^\/api\/v1/,'')
    if (path === '/auth/me') {
      assert.equal(init.headers.get('Authorization'), `Bearer ${token()}`)
      return Response.json(serverRoleOverride || user)
    }
    if (['/auth/login','/auth/admin/login','/auth/staff/login'].includes(path)) {
      authCalls.push(path)
      assert.equal(path,user.role==='admin'?'/auth/admin/login':user.role==='client'?'/auth/login':'/auth/staff/login')
      return Response.json({user,token:token()})
    }
    if (path === '/auth' && init?.method === 'DELETE') {
      logoutCalls++
      assert.equal(init.headers.get('Authorization'), `Bearer ${token()}`)
      if (logoutStatus === 'pending') return new Promise(resolve=>{releaseLogout=resolve})
      return logoutStatus === 200 ? Response.json({ok:true}) : Response.json({error:{message:'Logout temporarily unavailable'}},{status:logoutStatus})
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
    const workspaceReady = () => document.querySelector('.sidebar') && !document.querySelector('.workspace-skeleton, .workspace-loading')
    const type = async (input,value) => act(()=>{
      assert.ok(input)
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value)
      input.dispatchEvent(new w.Event('input',{bubbles:true}))
    })
    // Signed-out visitors stay at the correct login, even with stale tab state.
    user = {id:'saved-client',role:'client'}
    for (const host of ['10buildline.site','www.10buildline.site']) {
      dom.reconfigure({url:`https://${host}/`})
      for (const path of ['/admin','/admin/','/admin/dashboard','/admin/login?tab=admin','/staff','/staff/login','/login?tab=admin','/opm/documents','/spm/resources','/unknown','/client/unknown']) {
        w.history.replaceState({loginPortal:'admin'},'',path)
        client.setToken('')
        await mount()
        await until(()=>document.querySelector('form.login-form'),'Rejected public-domain internal path')
        assert.equal(w.location.origin,`https://${host}`)
        assert.equal(w.location.pathname,'/')
        assert.equal(w.location.search,'')
        assert.equal(document.querySelector('.login-heading h1').textContent,'Welcome to 10BuildLine')
        assert.equal(document.querySelector('.login-role-selector'),null)
        assert.equal(document.querySelector('.sidebar'),null)
        assert.equal(client.getToken(),'')
        assert.equal(requestCalls,0,'Rejected entry paths must not restore or start an internal session')
        await clear()
      }
    }
    // The staff domain applies the same rule to Client entry points.
    dom.reconfigure({url:'https://staff.10buildline.site/'})
    user = {id:'saved-staff',role:'opm'}
    for (const savedToken of ['']) {
      for (const path of ['/client','/client/','/client/login','/client/login?tab=admin','/client/overview','/client/projects/123/documents?source=link#document','/unknown','/admin/unknown']) {
        w.history.replaceState({loginPortal:'client'},'',path)
        client.setToken(savedToken)
        await mount()
        await until(()=>document.querySelector('form.login-form'),'Rejected staff-domain Client path')
        assert.equal(w.location.origin,'https://staff.10buildline.site')
        assert.equal(w.location.pathname,'/')
        assert.equal(w.location.search,'')
        assert.equal(w.location.hash,'')
        assert.equal(document.querySelector('.login-heading h1').textContent,'Staff sign-in')
        assert.equal(document.querySelectorAll('.login-role-selector a').length,2)
        assert.equal(document.querySelector('.client-access-badge'),null)
        assert.equal(document.querySelector('.sidebar'),null)
        assert.equal(client.getToken(),savedToken)
        assert.equal(requestCalls,0,'Rejected Client paths must not restore or start a session')
        await clear()
      }
    }
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
      const entriesBeforeLogin = w.history.length
      await act(()=>document.querySelector('form.login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})))
      await until(()=>document.querySelector('.sidebar') && w.location.pathname === dashboard,'Role workspace')
      assert.equal(w.location.hostname,host)
      assert.equal(w.history.length,entriesBeforeLogin,'Successful login replaces the login entry')
      // Remount simulates a browser refresh and exercises the server-verified restore.
      await clear()
      await mount()
      await until(workspaceReady,'Restored workspace')
      assert.equal(w.location.pathname,dashboard)
      // A full visit to a login URL verifies the saved session and redirects
      // without rendering the credential form or ending the session.
      for (const login of ['/',host === '10buildline.site' ? '/client/login' : '/admin/login']) {
        await clear()
        w.history.replaceState(null,'',login)
        await mount()
        await until(workspaceReady,'Authenticated manual login visit')
        assert.equal(w.location.pathname,dashboard)
        assert.equal(client.getToken(),token())
        assert.equal(document.querySelector('form.login-form'),null)
      }
      // Arrange an older login entry to exercise sessions created before the
      // new replace-on-login behavior. Application code adds no such entry.
      w.history.replaceState(null,'','/')
      w.history.pushState(null,'',dashboard)
      const historyLength = w.history.length
      for (const direction of ['back','forward']) {
        await act(async()=>{
          const moved = new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}))
          w.history[direction]()
          await moved
        })
        await until(workspaceReady,'Browser '+direction)
        assert.equal(w.location.pathname,dashboard)
        assert.equal(document.querySelector('form.login-form'),null)
        assert.equal(client.getToken(),token())
        assert.equal(w.location.hostname,host)
        assert.equal(w.history.length,historyLength)
      }
      await act(()=>document.querySelector('.sidebar [aria-label="Active sites"]').click())
      assert.equal(w.location.pathname,`/${role}/active-sites`)
      await clear()
      await mount()
      await until(workspaceReady,'Refreshed sidebar module')
      assert.equal(w.location.pathname,`/${role}/active-sites`)
      await act(()=>document.querySelector(`.sidebar [aria-label="${role === 'client' ? 'Project Overview' : 'Dashboard'}"]`).click())
      assert.equal(w.location.pathname,dashboard)
      // Same-domain cross-role navigation must resolve only the verified role.
      const otherPath = role === 'client' ? '/client/unknown' : role === 'admin' ? '/opm/dashboard' : '/admin/team'
      await act(()=>{w.history.pushState(null,'',otherPath);w.dispatchEvent(new w.PopStateEvent('popstate'))})
      await until(()=>w.location.pathname === dashboard,'Unauthorized route correction')
      // Invalid paths return to root; authenticated root visits then resolve
      // to the authorized dashboard instead of showing the login form.
      for (const path of ['/unknown', role === 'client' ? '/admin/team' : '/client/login']) {
        await act(()=>{w.history.pushState(null,'',path);w.dispatchEvent(new w.PopStateEvent('popstate'))})
        await until(()=>w.location.pathname === dashboard && workspaceReady(),'Invalid authenticated URL')
        assert.equal(w.location.hostname,host)
        assert.equal(document.querySelector('form.login-form'),null)
        await act(()=>{w.history.replaceState(null,'',dashboard);w.dispatchEvent(new w.PopStateEvent('popstate'))})
        await until(workspaceReady,'Authorized navigation after fallback')
      }
      await act(()=>document.querySelector('[aria-label="Sign out"]').click())
      await until(()=>document.querySelector('[role="dialog"]'),'Sign-out confirmation')
      await act(()=>[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Log Out').click())
      await until(()=>document.querySelector('form.login-form') && !client.getToken(),'Signed out')
      assert.equal(w.location.pathname,'/')
      assert.equal(w.location.hostname,host)
      assert.equal(document.querySelector('.sidebar'),null)
      for (const direction of ['back','forward']) {
        await act(async()=>{
          const moved = new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}))
          w.history[direction]()
          await moved
        })
        await until(()=>document.querySelector('form.login-form'),'Post-logout '+direction)
        assert.equal(w.location.pathname,'/')
        assert.equal(w.location.hostname,host)
        assert.equal(client.getToken(),'')
        assert.equal(document.querySelector('.sidebar'),null)
      }
      await clear()
      w.history.replaceState(null,'',dashboard)
      client.setToken(token())
      await mount()
      await until(workspaceReady,'Session before expiry')
      await act(async()=>{
        client.setToken('')
        w.dispatchEvent(new w.CustomEvent(client.SESSION_REPLACED_EVENT,{detail:'Your session expired due to inactivity.'}))
        await new Promise(resolve=>setTimeout(resolve,0))
      })
      await until(()=>document.querySelector('form.login-form'),'Expired session login')
      assert.equal(w.location.pathname,'/')
      assert.equal(w.location.hostname,host)
      assert.equal(client.getToken(),'')
      assert.equal(document.querySelector('.sidebar'),null)
      assert.match(document.querySelector('form.login-form').textContent,/session expired due to inactivity/)
      await clear()
    }
    assert.equal(authCalls.length,4)
    assert.equal(logoutCalls,4)
    // Opposite-portal sessions are rejected locally, before loading modules.
    // A forged decoded role is also rejected if /auth/me returns a different portal.
    for (const host of ['10buildline.site','staff.10buildline.site']) {
      const allowedRole = host === '10buildline.site' ? 'client' : 'admin'
      const wrongRole = host === '10buildline.site' ? 'admin' : 'client'
      const path = host === '10buildline.site' ? '/client/documents' : '/admin/team'
      for (const verifiedMismatch of [false,true]) {
        dom.reconfigure({url:`https://${host}${path}`})
        w.history.replaceState(null,'',path)
        user = {id:'mismatched-session',role:verifiedMismatch ? allowedRole : wrongRole}
        serverRoleOverride = verifiedMismatch ? {...user,role:wrongRole} : undefined
        client.setToken(token())
        const before = requestCalls
        await mount()
        await until(()=>w.location.pathname === '/' && document.querySelector('form.login-form'),'Rejected opposite-portal session')
        assert.equal(w.location.hostname,host)
        assert.equal(client.getToken(),'')
        assert.equal(document.querySelector('.sidebar'),null)
        assert.equal(document.querySelector('.login-heading h1').textContent,host === '10buildline.site' ? 'Welcome to 10BuildLine' : 'Staff sign-in')
        assert.equal(requestCalls-before,verifiedMismatch ? 1 : 0,'No workspace data may be fetched for the opposite portal')
        await clear()
      }
    }
    serverRoleOverride = undefined
    // A failed revocation still signs out locally and explicitly warns the user.
    dom.reconfigure({url:'https://10buildline.site/client/overview'})
    w.history.replaceState(null,'','/client/overview')
    user = {id:'logout-error',role:'client',full_name:'Logout Error',email:'logout@example.test',status:'active',date_added:'2026-01-01'}
    client.setToken(token())
    await mount()
    await until(workspaceReady,'Workspace before failed revocation')
    logoutStatus = 'pending'
    await act(()=>document.querySelector('[aria-label="Sign out"]').click())
    await act(()=>[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Log Out').click())
    assert.equal(client.getToken(),'','Local access ends while server revocation is pending')
    assert.equal(document.querySelector('form.login-form'),null,'New credentials wait until logout finishes')
    assert.ok(document.querySelector('[aria-busy="true"]'),'Logout shows loading feedback')
    assert.ok(releaseLogout)
    await act(async()=>{
      releaseLogout(Response.json({error:{message:'Logout temporarily unavailable'}},{status:503}))
      await new Promise(resolve=>setTimeout(resolve,0))
    })
    await until(()=>document.querySelector('form.login-form'),'Local logout after server failure')
    assert.equal(client.getToken(),'')
    assert.equal(w.location.href,'https://10buildline.site/')
    assert.match(document.querySelector('form.login-form').textContent,/server could not confirm logout/)
  } finally {
    await act(()=>root.unmount()); await server.close(); dom.window.close()
    for (const [key,value] of previous) value ? Object.defineProperty(globalThis,key,value) : delete globalThis[key]
  }
})
