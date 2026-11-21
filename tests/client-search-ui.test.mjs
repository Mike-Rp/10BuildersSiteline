import assert from "node:assert/strict"
import test from "node:test"
import { emptyState } from "../src/model.ts"

test("intake directs new clients to inquiries and Team stays staff-only for account creation", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }), previous = new Map(), w = dom.window
  for (const [key, value] of Object.entries({ window: w, document: w.document, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  try {
    const { IntakeForm, AccountForm } = await server.ssrLoadModule("/src/panels.tsx")
    const state = emptyState()
    const button = text => [...document.querySelectorAll("button")].find(element => element.textContent.trim() === text)
    const field = text => document.getElementById([...document.querySelectorAll("label")].find(label => label.textContent === text)?.htmlFor || "")
    await React.act(() => root.render(React.createElement(IntakeForm, { state, onSubmit() {}, onClose() {} })))
    assert.equal(button("Create a client account"), undefined)
    assert.match(document.body.textContent, /For a new client, start from Project inquiries/)
    const legacy = { id: "legacy-client", name: "Sample Client", email: "legacy@company.test", role: "client",
      status: "active", scope: [], projectTypes: [], docs: [], phone: "" }
    state.accounts.push(legacy)
    await React.act(() => root.render(React.createElement(AccountForm, { key: "existing", state, account: legacy, onSave() {}, onClose() {} })))
    assert.equal(field("Email address *").getAttribute("pattern"), null)
    // Client provisioning is outside the Team account form.
    await React.act(() => root.render(React.createElement(AccountForm, { key: "generated", state, onSave() { throw Error("No save expected") }, onClose() {} })))
    const roles = [...field("Account role").options].map(option => option.value)
    assert.ok(!roles.includes("client"), "Team cannot create Client accounts")
    assert.ok(!roles.includes("admin"), "Team cannot create Administrator accounts")
    assert.deepEqual(roles.sort(), ["opm", "spm"])
    assert.equal(field("Employee ID *"), null, "the administrator never enters an ID")
    assert.equal(field("Email address *"), null, "the system generates staff email addresses when saving")
  } finally {
    await React.act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  }
})

test("intake client search opens only after typing, paginates, selects real IDs, and preserves the selected account", async () => {
  const {JSDOM}=await import("jsdom")
  const {createServer}=await import("vite")
  const {default:React,act}=await import("react")
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"})
  const previous=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {IntakeForm}=await server.ssrLoadModule("/src/panels.tsx")
    const {Modal}=await server.ssrLoadModule("/src/ui.tsx")
    const {default:ClientSearch}=await server.ssrLoadModule("/src/ClientSearch.tsx")
    const state=emptyState()
    const names=["Adrian Aguilar","Bianca Aguilar","Carlo Aguilar","Diana Aguilar","Enzo Aguilar"]
    const clients=names.map((name,i)=>({id:`client-${i+1}`,role:"client",name,email:`client00${i+1}@example.test`,status:"active",phone:"09123456789",contactPerson:"Client Contact",scope:[],projectTypes:[],docs:[]}))
    clients[4].id="11111111-ad00-4000-8000-111111111111"
    state.accounts=[...clients,{...clients[0],id:"blocked",name:"Blocked Aguilar",status:"suspended"},{...clients[0],id:"inactive",name:"Inactive Aguilar",status:"deactivated"},{...clients[0],id:"staff",name:"Staff Aguilar",role:"opm"}]
    let closed=0
    await act(()=>root.render(React.createElement(Modal,{title:"New project intake",onClose:()=>closed++},React.createElement(IntakeForm,{state,onSubmit:()=>{},onClose:()=>closed++}))))
    const get=selector=>document.querySelector(selector)
    const search=()=>get('.client-search input')
    const type=async value=>act(()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(search(),value)
      search().dispatchEvent(new dom.window.Event("input",{bubbles:true}))
    })
    assert.equal(search().value,"")
    assert.equal(get('.client-search-results'),null)
    assert.equal(get('.client-search select'),null,"client field no longer uses the native dropdown")
    assert.equal(get('label[for="'+search().id+'"]')?.textContent,"Client *","existing field label names the search input")
    await act(()=>search().focus())
    assert.equal(get('.client-search-results'),null,"focus alone never lists every client")
    await type("a")
    assert.equal(search().getAttribute("aria-expanded"),"true")
    assert.equal(get('.client-search-count').textContent,"5 matching clients","staff and unavailable clients excluded")
    assert.equal(document.querySelectorAll('.client-search-row').length,3)
    await act(()=>get('[aria-label="Next client results"]').click())
    assert.equal(document.querySelectorAll('.client-search-row').length,2)
    assert.match(get('.client-search-pages').textContent,/Page 2 of 2/)
    await type(" Ad ")
    assert.equal(get('.client-search-count').textContent,"1 matching client","hidden ID fragments must not match unrelated names")
    assert.match(get('.client-search-person').textContent,/Adrian Aguilar/)
    assert.equal(get('.client-search-pages'),null,"narrowing search resets pagination")
    await type("Adrain")
    assert.match(get('.client-search-empty').textContent,/No clients found/,"misspellings are not fuzzy matched")
    await type(clients[4].id)
    assert.match(get('.client-search-empty').textContent,/No clients found/,"internal account IDs are not searchable")
    await type("CLIENT002@EXAMPLE.TEST")
    assert.equal(get('.client-search-count').textContent,"1 matching client")
    await act(()=>search().dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})))
    assert.equal(document.activeElement,get('[data-client-select]'))
    await act(()=>document.activeElement.click())
    assert.equal(search().value,"Bianca Aguilar")
    assert.equal(get('.client-search-results'),null)
    assert.match(get('.selected-client-details').textContent,/Client \/ Company Name/)
    assert.ok([...document.querySelectorAll('.selected-client-details input')].some(el=>el.value==='client002@example.test'),"actual selected account populates existing details")
    await type("Carlo")
    assert.equal(get('.selected-client-details'),null,"typing a replacement invalidates the previous selection")
    await act(()=>get('[data-client-select]').click())
    assert.equal(search().value,"Carlo Aguilar")
    assert.equal([...document.querySelectorAll('button')].some(b => b.textContent.includes('Create a client account')), false)
    assert.equal(document.querySelectorAll('[aria-modal="true"]').length, 1)
    assert.equal(search().value, "Carlo Aguilar")
    await act(()=>get('[aria-label="Change selected client"]').click())
    assert.equal(search().value,"")
    assert.equal(get('.client-search-results'),null)
    await type("  ")
    assert.equal(get('.client-search-results'),null)
    await type("unknown person")
    assert.match(get('.client-search-empty').textContent,/No clients found/)
    await act(()=>search().dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true})))
    assert.equal(get('.client-search-results'),null)
    assert.equal(closed,0,"Escape dismisses search before the containing project modal")
    await type("Aguilar")
    await act(()=>search().dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true})))
    await act(()=>search().dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})))
    assert.equal(document.activeElement,get('[data-client-select]'),"keyboard can reopen and enter results after Escape")
    await type("Aguilar")
    await act(()=>document.body.dispatchEvent(new dom.window.Event("pointerdown",{bubbles:true})))
    assert.equal(get('.client-search-results'),null)
    await type("Aguilar")
    await act(()=>get('[aria-label="Clear client search"]').click())
    assert.equal(search().value,"")
    assert.equal(get('.client-search-results'),null)
    await act(()=>root.render(React.createElement(ClientSearch,{clients:[...clients,{...clients[0],id:"new-client",name:"New Client"}],value:"new-client",onChange:()=>{}})))
    assert.equal(get('input').value,'New Client',"newly created accounts are reflected from the parent state")
    assert.equal(get('.client-search-results'),null)
    const selected=[]
    await act(()=>root.render(React.createElement(ClientSearch,{clients,value:clients[1].id,onChange:id=>selected.push(id),disabled:true})))
    assert.equal(get('input').value,'Bianca Aguilar')
    assert.equal(get('input').disabled,true)
    assert.equal(get('.client-search-results'),null)
    assert.deepEqual(selected,[],"locked client on existing projects stays unchanged")
  } finally {
    await act(()=>root.unmount())
    await server.close()
    dom.window.close()
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]
  }
})
