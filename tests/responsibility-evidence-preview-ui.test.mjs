import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("responsibility evidence previews sit beside downloads, use authorized files and clean up image/PDF previews", {timeout:60000}, async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost",pretendToBeVisual:true}),w=dom.window,saved=new Map()
  let mime="image/png",denied=false,canReview=true,downloads=0
  const requests=[],revoked=[]
  for(const [key,value] of Object.entries({window:w,document:w.document,HTMLElement:w.HTMLElement,Node:w.Node,IS_REACT_ACT_ENVIRONMENT:true,fetch:async url=>{
    requests.push(String(url))
    if(String(url).endsWith('/engineer-responsibilities'))return Response.json({data:{available:true,canReview,currentStage:1,lifecycle:"active",rows:[{id:"r1",user_id:"engineer",name:"Engineer One",phase:"Mobilization",project_stage_id:1,assigned_disciplines:["Civil"],status:"confirmed",complete:true,completion_status:"approved",completion_file_id:"f1"}]}})
    if(String(url).endsWith('/phase-files/f1'))return denied?Response.json({message:"Evidence access denied"},{status:403}):new Response("file",{headers:{"Content-Type":mime}})
    throw Error(`Unexpected request: ${url}`)
  }})) {saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  URL.createObjectURL=()=>"blob:evidence";URL.revokeObjectURL=url=>revoked.push(url)
  w.HTMLAnchorElement.prototype.click=function(){downloads++}
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import("react"),{createRoot}=await import("react-dom/client")
  const root=createRoot(document.getElementById("root"))
  try {
    const {default:Responsibilities}=await server.ssrLoadModule("/src/EngineerResponsibilities.tsx")
    let key=0
    const render=async actor=>act(async()=>root.render(React.createElement(Responsibilities,{key:++key,project:{id:"p1"},actor,onReload(){}})))
    await render({id:"admin",role:"admin"})
    const preview=()=>[...document.querySelectorAll('.responsibility-actions button')].find(button=>button.textContent==='Preview evidence')
    assert.equal(preview().previousElementSibling.textContent,"Download evidence")
    assert.equal(requests.filter(url=>url.endsWith('/phase-files/f1')).length,0,"Files load only after opening the preview")
    for(const type of ["image/png","application/pdf"]) {
      mime=type
      await act(async()=>preview().click())
      const modal=document.querySelector('[role="dialog"]')
      assert.match(modal.textContent,/Engineer One · Mobilization/)
      assert.ok(modal.querySelector(type==='image/png'?'img[src="blob:evidence"]':'object[type="application/pdf"]'))
      assert.equal(downloads,0,"Preview never triggers a download")
      await act(()=>[...modal.querySelectorAll('button')].find(button=>button.textContent==='Close').click())
      assert.equal(document.querySelector('[role="dialog"]'),null)
    }
    assert.equal(revoked.length,2)
    denied=true
    await act(async()=>preview().click())
    assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent,/unavailable|denied/i)
    assert.equal(document.querySelector('[role="dialog"] img, [role="dialog"] object'),null)
    canReview=false
    await render({id:"unrelated",role:"spm"})
    assert.equal(preview(),undefined)
    assert.equal(document.querySelector('[role="dialog"]'),null)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke
    for(const [key,descriptor] of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})
