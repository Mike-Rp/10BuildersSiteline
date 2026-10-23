import assert from "node:assert/strict"
import test from "node:test"
import {currentReportMonth} from "../src/monthly-report.ts"

test("monthly report modal keeps parent context, hides client staff fields, rejects stale loads and exports the preview snapshot",async()=>{
  const {JSDOM}=await import("jsdom"),{createServer}=await import("vite"),{default:React,act}=await import("react")
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"}),saved=new Map()
  const report={project:{id:"p1",name:"First Project",type:"Residential",status:"active"},period:{month:currentReportMonth(),timezone:"Asia/Manila",start:"2026-09-30T16:00:00Z",end:"2026-10-31T16:00:00Z",cutoff:"2026-10-22T00:00:00Z",generatedAt:"2026-10-22T00:00:00Z",monthToDate:true},coverageFrom:null,opening:{earned:null,total:null,percentage:null,reason:"Unavailable"},closing:{earned:80,total:290,percentage:80/290*100,reason:null},netChange:null,projection:"client",limitations:["Unavailable — historical approval or scope records are incomplete."],completedPhases:null,updates:[]}
  const requests=[],pending=[];let exportedBlob
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,fetch:(url,init)=>{
    requests.push({url:String(url),init})
    if(String(url).endsWith('/export'))return Promise.resolve(new Response(JSON.stringify({data:{csv:'"First Project"'}}),{status:200}))
    return new Promise(resolve=>pending.push(resolve))
  }})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  URL.createObjectURL=blob=>{exportedBlob=blob;return 'blob:sample'};URL.revokeObjectURL=()=>{}
  dom.window.HTMLAnchorElement.prototype.click=function(){}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try{
    const {default:MonthlyReport}=await server.ssrLoadModule("/src/MonthlyReport.tsx"),{Modal}=await server.ssrLoadModule("/src/ui.tsx")
    let parentClosed=0
    function Harness(){const [open,setOpen]=React.useState(false);return React.createElement(React.Fragment,null,
      React.createElement(Modal,{title:"Project monitoring",onClose:()=>parentClosed++},React.createElement('button',{id:'open',onClick:()=>setOpen(true)},'Monthly report')),
      open?React.createElement(MonthlyReport,{projects:[{id:"p1",name:"First Project"},{id:"p2",name:"Second Project"}],initialProjectId:"p1",onClose:()=>setOpen(false)}):null)}
    await act(()=>root.render(React.createElement(Harness)))
    const trigger=document.getElementById('open'),parent=document.querySelector('.modal-body');parent.scrollTop=160
    await act(()=>{trigger.focus();trigger.click()})
    assert.equal(document.querySelectorAll('[aria-modal=true]').length,2)
    assert.match(requests[0].url,/p1\/monthly-report\?month=/)
    const selector=[...document.querySelectorAll('.monthly-report .report-project-results button')].find(b=>b.textContent.includes('Second Project'))
    await act(()=>selector.click())
    await act(()=>pending[1](new Response(JSON.stringify({data:{report:{...report,project:{...report.project,id:'p2',name:'Second Project'}},snapshot:'second-snapshot'}}),{status:200})))
    await act(()=>pending[0](new Response(JSON.stringify({data:{report,snapshot:'stale-snapshot'}}),{status:200})))
    const modal=[...document.querySelectorAll('[aria-modal=true]')].at(-1)
    assert.equal(modal.querySelector('.modal-header p').textContent,'Second Project')
    assert.doesNotMatch(modal.textContent,/Rework confirmed|Approvals withdrawn|Pending reviews/)
    assert.match(modal.textContent,/Month to date|Asia\/Manila/)
    await act(()=>[...modal.querySelectorAll('button')].find(b=>b.textContent==='Export CSV').click())
    assert.deepEqual(JSON.parse(requests.at(-1).init.body),{snapshot:'second-snapshot',format:'csv'})
    assert.equal(await exportedBlob.text(),'"First Project"')
    await act(()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
    assert.equal(document.querySelectorAll('[aria-modal=true]').length,1)
    assert.equal(document.activeElement,trigger)
    assert.equal(parent.scrollTop,160)
    assert.equal(parentClosed,0)
  }finally{
    await act(()=>root.unmount());await server.close();dom.window.close();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]
  }
})
