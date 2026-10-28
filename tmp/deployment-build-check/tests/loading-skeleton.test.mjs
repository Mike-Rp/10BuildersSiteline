import assert from "node:assert/strict"
import test from "node:test"

test("only Clients get workspace, list and report skeletons; staff retain plain loading and error handling", async t => {
  const {JSDOM} = await import("jsdom")
  const {createServer} = await import("vite")
  const {default:React,act} = await import("react")
  const dom = new JSDOM('<div id="root"></div>',{url:"http://localhost"})
  const previous = new Map()
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot} = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default:WorkspaceSkeleton,LoadingRoleProvider} = await server.ssrLoadModule("/src/LoadingSkeleton.tsx")
    for (const role of [undefined,"admin","opm","spm","client"]) {
      await act(()=>root.render(React.createElement(WorkspaceSkeleton,{role})))
      assert.ok(document.querySelector('main[aria-busy="true"]'))
      assert.equal(document.querySelectorAll('.nav-count').length,0)
      assert.equal(document.querySelectorAll('button:not(:disabled),a,input').length,0)
      assert.equal(document.querySelectorAll('.skeleton-metric').length,0)
      assert.ok(!document.body.textContent.includes("Needs attention"))
      if (role === "client") assert.ok(document.querySelector('.workspace-skeleton .skeleton-block'))
      else {
        assert.ok(!document.querySelector('.workspace-skeleton, .skeleton-block'))
        assert.match(document.querySelector('.loading-status').textContent,/Loading workspace/)
      }
    }

    const {ListSection,remoteList} = await server.ssrLoadModule("/src/ListControls.tsx")
    const list = (items,status) => remoteList("skeleton-test",{},items,items.length,status)
    const render = (items,status,role="client") => React.createElement(LoadingRoleProvider,{role},React.createElement(ListSection,{list:list(items,status),render:rows=>React.createElement("p",{className:"loaded-record"},rows.join(","))}))
    for (const role of ["admin","opm","spm"]) {
      await act(()=>root.render(render([],{state:"loading"},role)))
      assert.ok(!document.querySelector('.skeleton-block'))
      assert.match(document.querySelector('.loading-status').textContent,/Loading records/)
      assert.ok(document.querySelector('[aria-busy="true"]'))
      assert.ok(!document.body.textContent.includes("No records yet"))
    }
    await act(()=>root.render(React.createElement(ListSection,{list:list([],{state:"loading"}),render:()=>null})))
    assert.ok(!document.querySelector('.skeleton-block'), "unknown role defaults to a plain loading message")
    await act(()=>root.render(render([],{state:"loading"})))
    assert.equal(document.querySelectorAll('.skeleton-row').length,6)
    assert.equal(document.querySelector('.loaded-record'),null)
    assert.ok(!document.body.textContent.includes("No records yet"))
    assert.equal(document.querySelector('.list-pager'),null)
    await act(()=>root.render(render(["Authorized record"],{state:"loading"})))
    assert.equal(document.querySelector('.skeleton-row'),null)
    assert.equal(document.querySelector('.loaded-record').textContent,"Authorized record")
    await act(()=>root.render(render(["Authorized record"],{state:"ready"})))
    assert.equal(document.querySelector('[aria-busy="true"]'),null)
    let retries = 0
    await act(()=>root.render(render([],{state:"error",message:"Network unavailable",onRetry:()=>retries++})))
    assert.equal(document.querySelector('.skeleton-row'),null)
    assert.match(document.querySelector('[role="alert"]').textContent,/Network unavailable/)
    await act(()=>[...document.querySelectorAll('button')].find(el=>el.textContent === "Retry").click())
    assert.equal(retries,1)
    await act(()=>root.render(render([],{state:"ready"})))
    assert.match(document.body.textContent,/No records yet/)

    // Shared Reports can be rendered by any role without accidentally enabling staff skeletons.
    t.mock.method(globalThis,"fetch",()=>new Promise(()=>{}))
    const {default:Reports} = await server.ssrLoadModule("/src/Reports.tsx")
    for (const role of ["admin","opm","spm","client"]) {
      await act(()=>root.render(React.createElement(LoadingRoleProvider,{role},React.createElement(Reports))))
      assert.equal(document.querySelectorAll('.skeleton-row').length,role === "client" ? 4 : 0)
      assert.match(document.querySelector('[aria-label="Loading monthly summary"]').textContent,/Loading monthly summary/)
    }

    const {default:LoginPage} = await server.ssrLoadModule("/src/LoginPage.tsx")
    let rejectSignIn, showWorkspace
    function LoginHarness() {
      const [role,setRole] = React.useState()
      showWorkspace = setRole
      return React.createElement(LoginPage,{workspaceRole:role,onSignIn:()=>new Promise((_,reject)=>{rejectSignIn=reject})})
    }
    await act(()=>root.render(React.createElement(LoginHarness)))
    const inputs = document.querySelectorAll('form input')
    for (const [input,value] of [[inputs[0],"admin@example.com"],[inputs[1],"Password@123"]]) {
      await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}))})
    }
    await act(()=>document.querySelector('form').dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})))
    assert.ok(rejectSignIn)
    await act(()=>showWorkspace("client"))
    assert.ok(document.querySelector('.workspace-skeleton'))
    for (const role of ["admin","opm","spm"]) {
      await act(()=>showWorkspace(role))
      assert.ok(!document.querySelector('.workspace-skeleton, .skeleton-block'))
      assert.ok(document.querySelector('.workspace-loading'))
    }
    await act(async()=>{showWorkspace(undefined);rejectSignIn(new Error("Workspace could not be loaded"));await Promise.resolve()})
    assert.equal(document.querySelector('.workspace-skeleton'),null)
    assert.ok(document.querySelector('form.login-form'))
    assert.match(document.body.textContent,/Workspace could not be loaded/)
    assert.equal(document.querySelector('input').value,"admin@example.com")

    // Refreshing a cached Client session keeps its skeleton while verification is pending;
    // rejected sessions must still return to login rather than leaving a stuck loader.
    const {default:App} = await server.ssrLoadModule("/src/App.tsx")
    const client = await server.ssrLoadModule("/src/api/client.ts")
    let resolveSession
    t.mock.method(globalThis,"fetch",url => {
      if (String(url).endsWith("/auth/me")) return new Promise(resolve => { resolveSession = resolve })
      return Promise.resolve(Response.json({ok:true}))
    })
    for (const role of ["admin","opm","spm","client"]) {
      const token = `test.${Buffer.from(JSON.stringify({sub:`loading-${role}`,details:{id:`loading-${role}`,role}})).toString("base64url")}.test`
      client.setToken(token)
      await act(()=>root.render(React.createElement(App,{key:role})))
      assert.equal(!!document.querySelector('.workspace-skeleton'),role === "client")
      if (role !== "client") assert.ok(!document.querySelector('.skeleton-block'))
      assert.ok(resolveSession)
      await act(async()=>{resolveSession(Response.json({message:"Expired session"},{status:401}));await new Promise(resolve=>setTimeout(resolve,10))})
      assert.ok(document.querySelector('form.login-form'))
      assert.ok(!document.querySelector('.workspace-skeleton, .workspace-loading'))
      await act(()=>root.render(null))
    }
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for (const [key,descriptor] of previous) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
