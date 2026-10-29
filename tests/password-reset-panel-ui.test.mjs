import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'

test('dashboard switches panels and distinguishes unread, read/pending and completed requests',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const previous=new Map()
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root')),savedFetch=globalThis.fetch
  let reads=0,resets=0
  let rows=[{id:'test-account',full_name:'Carlo Bautista',email:'carlo@example.com',role:'opm',status:'pending',requested_at:'2026-10-30T01:00:00Z',read_at:null}]
  try{
    globalThis.fetch=async(url,init={})=>{
      if(String(url).endsWith('/read')){reads++;rows=rows.map(r=>({...r,read_at:'2026-10-30T02:00:00Z'}));return Response.json({data:{read_at:rows[0].read_at}})}
      if(String(url).endsWith('/regenerate-password')){resets++;return Response.json({data:{temp_password:'TestOnly123'}})}
      return Response.json({data:rows})
    }
    const {default:AdminDashboard}=await server.ssrLoadModule('/src/AdminDashboard.tsx')
    const {default:Requests}=await server.ssrLoadModule('/src/PasswordResetRequests.tsx')
    const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text)
    const props={overview:{activeProjects:0,intakeProjects:0,teamAccounts:1,items:[]},onNavigate(){},onOpen(){},onNewIntake(){},onMonthlyReport(){},onActivity(){},activity:null}
    await act(async()=>{root.render(React.createElement(Requests,null,(requests,open)=>React.createElement(AdminDashboard,{...props,resetRequests:requests,onOpenReset:open})));await new Promise(r=>setTimeout(r,30))})
    const passwordTab=document.querySelector('#password-requests-tab')
    assert.equal(passwordTab.getAttribute('aria-selected'),'false')
    assert.match(passwordTab.textContent,/\(1\)/)
    assert.ok(passwordTab.querySelector('.reset-unread-dot'))
    await act(()=>passwordTab.click())
    assert.equal(document.querySelector('#priority-items-panel').hidden,true)
    assert.equal(document.querySelector('#password-requests-panel').hidden,false)
    assert.equal(reads,0,'switching tabs does not mark a request read')
    assert.ok(document.querySelector('.reset-request-row.is-unread'))
    await act(async()=>button('Review request').click())
    assert.equal(reads,1)
    assert.equal(resets,0)
    assert.equal(document.querySelector('.reset-request-row.is-unread'),null)
    assert.match(passwordTab.textContent,/\(1\)/,'read requests remain pending')
    assert.equal(passwordTab.querySelector('.reset-unread-dot'),null)
    await act(()=>button('Cancel').click())
    await act(async()=>button('Review request').click())
    assert.equal(reads,1,'reopening a read request does not issue another read write')
    const input=document.querySelector('input[type=password]')
    await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'DummyAdminPassword');input.dispatchEvent(new window.Event('input',{bubbles:true}))})
    await act(async()=>button('Reset password').click())
    assert.equal(resets,1)
    assert.match(document.body.textContent,/TestOnly123/)
    await act(()=>button('Done').click())
    assert.match(document.querySelector('.reset-request-row').textContent,/Completed/)
    assert.match(passwordTab.textContent,/\(0\)/)
    await act(()=>button('View details').click())
    assert.match(document.body.textContent,/temporary password is not retained/)
    assert.doesNotMatch(document.body.textContent,/TestOnly123/)
    await act(()=>button('Close').click())
    await act(()=>document.querySelector('#priority-items-tab').click())
    assert.equal(document.querySelector('#password-requests-panel').hidden,true)
  }finally{
    await act(()=>root.unmount());globalThis.fetch=savedFetch;await server.close();dom.window.close()
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
