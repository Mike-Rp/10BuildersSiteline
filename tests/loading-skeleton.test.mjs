import assert from "node:assert/strict"
import test from "node:test"

test("skeletons cover workspace/list loading without fabricated counts, enabled actions, or loss of error handling", async () => {
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
    const {default:WorkspaceSkeleton} = await server.ssrLoadModule("/src/LoadingSkeleton.tsx")
    for (const role of [undefined,"admin","opm","spm","client"]) {
      await act(()=>root.render(React.createElement(WorkspaceSkeleton,{role})))
      assert.ok(document.querySelector('main[aria-busy="true"]'))
      assert.equal(document.querySelectorAll('.nav-count').length,0)
      assert.equal(document.querySelectorAll('button:not(:disabled),a,input').length,0)
      assert.equal(document.querySelectorAll('.skeleton-metric').length,role === "admin" ? 3 : 0)
      if(role !== "admin") assert.ok(!document.body.textContent.includes("Needs attention"))
    }
    await act(()=>root.render(React.createElement(WorkspaceSkeleton,{role:"admin"})))
    assert.equal(document.querySelectorAll('.skeleton-metric')[1].querySelector('.skeleton-metric-icon'),null)
    assert.ok(document.querySelector('.skeleton-intake:disabled'))

    const {ListSection,remoteList} = await server.ssrLoadModule("/src/ListControls.tsx")
    const list = (items,status) => remoteList("skeleton-test",{},items,items.length,status)
    const render = (items,status) => React.createElement(ListSection,{list:list(items,status),render:rows=>React.createElement("p",{className:"loaded-record"},rows.join(","))})
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
    await act(()=>showWorkspace("admin"))
    assert.ok(document.querySelector('.workspace-skeleton'))
    await act(async()=>{showWorkspace(undefined);rejectSignIn(new Error("Workspace could not be loaded"));await Promise.resolve()})
    assert.equal(document.querySelector('.workspace-skeleton'),null)
    assert.ok(document.querySelector('form.login-form'))
    assert.match(document.body.textContent,/Workspace could not be loaded/)
    assert.equal(document.querySelector('input').value,"admin@example.com")
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for (const [key,descriptor] of previous) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
