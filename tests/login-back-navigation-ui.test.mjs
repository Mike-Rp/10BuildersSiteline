import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'

test('Back confirmation requires a live token, a backward same-document login traversal and a cancelable browser event',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://10buildline.site/client/overview'})
  const w=dom.window,previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Node:w.Node,sessionStorage:w.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const navigation=new w.EventTarget()
  navigation.currentEntry={index:2}
  Object.defineProperty(w,'navigation',{value:navigation,configurable:true})
  const server=await createServer({cacheDir:`node_modules/.vite-tests/login-back-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  try {
    const {default:useLoginBackConfirmation}=await server.ssrLoadModule('/src/useLoginBackConfirmation.ts')
    const client=await server.ssrLoadModule('/src/api/client.ts')
    let requested=0
    const token=exp=>`test.${Buffer.from(JSON.stringify({sub:'active-client',details:{id:'active-client',role:'client'},exp})).toString('base64url')}.test`
    const liveToken=token(Math.floor(Date.now()/1000)+600)
    const Fixture=({enabled=true})=>{useLoginBackConfirmation(enabled,'active-client',()=>requested++);return null}
    const fire=({cancelable=true,...overrides}={})=>{
      const event=Object.assign(new w.Event('navigate',{cancelable}),{navigationType:'traverse',canIntercept:true,destination:{url:'https://10buildline.site/',index:1,sameDocument:true},...overrides})
      navigation.dispatchEvent(event)
      return event
    }
    client.setToken(liveToken)
    await act(()=>root.render(React.createElement(Fixture)))
    assert.equal(fire().defaultPrevented,true)
    assert.equal(requested,1)
    for(const options of [
      {cancelable:false},{canIntercept:false},{navigationType:'replace'},
      {destination:{url:'https://10buildline.site/client/documents',index:1,sameDocument:true}},
      {destination:{url:'https://staff.10buildline.site/',index:1,sameDocument:true}},
      {destination:{url:'https://10buildline.site/',index:1,sameDocument:false}},
      {destination:{url:'https://10buildline.site/',index:3,sameDocument:true}},
    ])assert.equal(fire(options).defaultPrevented,false)
    assert.equal(requested,1,'Ordinary navigation and unsupported events are not blocked')
    for(const saved of ['',token(Math.floor(Date.now()/1000)-1)]) {
      client.setToken(saved)
      assert.equal(fire().defaultPrevented,false,'Logged-out or expired sessions have no confirmation')
    }
    client.setToken(liveToken)
    await act(()=>root.render(React.createElement(Fixture,{enabled:false})))
    assert.equal(fire().defaultPrevented,false)
    await act(()=>root.render(null))
    assert.equal(fire().defaultPrevented,false,'Unmount removes the listener')
    client.setToken('')
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,value] of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]
  }
})
