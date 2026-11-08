import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("new account details use the role login, copy individual or combined values and support manual copying", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://site.example/admin?session=must-not-be-shared" }), previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const writes = []
  let fail = false, closed = 0
  Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async value => { if(fail) throw Error('Clipboard unavailable'); writes.push(value) } } })
  const server = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
  try {
    const {default:Details}=await server.ssrLoadModule('/src/AccountSignInDetails.tsx')
    const button = text => [...document.querySelectorAll('button')].find(element=>element.textContent===text)
    const click = async text => act(async()=>{assert.ok(button(text),text);button(text).click()})
    const details={name:'Sample Account',email:'sample@company.test',password:'DEMO-ONLY-123'}
    for(const [role,path] of [['admin','/login?tab=admin'],['opm','/login'],['spm','/login'],['client','/client/login']]) {
      await act(()=>root.render(React.createElement(Details,{key:role,details:{...details,role},onClose:()=>closed++})))
      const values=[...document.querySelectorAll('input')].map(input=>input.value)
      assert.deepEqual(values,[`https://site.example${path}`,details.email,details.password])
      assert.ok([...document.querySelectorAll('input')].every(input=>input.readOnly))
      assert.ok(!values[0].includes(details.password) && !values[0].includes('session='))
      await click('Copy Link'); assert.equal(writes.at(-1),values[0])
      await click('Copy Email'); assert.equal(writes.at(-1),details.email)
      await click('Copy Password'); assert.equal(writes.at(-1),details.password)
      await click('Copy All Sign-In Details')
      assert.ok(writes.at(-1).includes(values[0]) && writes.at(-1).includes(details.email) && writes.at(-1).includes(details.password))
      if(role==='client')assert.match(document.body.textContent,/Sign-in remains blocked until project activation/)
    }
    fail=true
    await click('Copy Password')
    const password=document.querySelector('input[value="DEMO-ONLY-123"]')
    assert.equal(document.activeElement,password)
    assert.equal(password.selectionEnd-password.selectionStart,details.password.length)
    await click('Copy All Sign-In Details')
    const manual=document.querySelector('textarea')
    assert.ok(manual.readOnly)
    assert.match(manual.value,/Role: Client/)
    assert.equal(document.activeElement,manual)
    assert.equal(manual.selectionEnd-manual.selectionStart,manual.value.length)
    await click('Done');assert.equal(closed,1)
    assert.equal(dom.window.localStorage.length,0)
    assert.equal(dom.window.sessionStorage.length,0,'Temporary credentials must not be persisted in browser storage')
    await act(()=>root.render(null))
    assert.ok(!document.body.textContent.includes(details.password))
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor] of previous) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key] }
  }
})
