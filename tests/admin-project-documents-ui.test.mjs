import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Admin document folder popup preserves document actions and nested-dialog focus", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({cacheDir:`node_modules/.vite-tests/admin-project-documents-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  try {
    const {default:Documents}=await server.ssrLoadModule('/src/AdminProjectDocuments.tsx')
    const {Modal}=await server.ssrLoadModule('/src/ui.tsx')
    const project={id:'project',name:'Commercial — Hotel De Luna',docs:[
      {id:'notice',label:'Notice to Proceed',name:'Notice to Proceed.pdf',uploaded:true,date:'2026-10-28',clientVisible:true},
      {id:'agreement',label:'Site PM–Subcontractor Agreement',name:'Signed agreement.pdf',uploaded:true,date:'2026-10-28',clientVisible:false},
      {id:'permit',label:'Approved Building Permit',uploaded:false,owner:'Office PM'}
    ]}
    let selected
    function Harness(){
      const [open,setOpen]=React.useState(false),[preview,setPreview]=React.useState()
      return React.createElement(React.Fragment,null,
        React.createElement(Modal,{title:'Project Details',onClose(){}},React.createElement('button',{onClick:()=>setOpen(true)},'Open Folder')),
        open&&React.createElement(Documents,{project,onClose:()=>setOpen(false),onPreview:doc=>{selected=doc;setPreview(doc)},onDownloadsRequested(){}}),
        preview&&React.createElement(Modal,{title:'Document Preview',onClose:()=>setPreview(undefined)},preview.name))
    }
    const click=async element=>act(()=>{assert.ok(element);element.focus();element.click()})
    const escape=async()=>act(()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
    await act(()=>root.render(React.createElement(Harness)))
    const folder=[...document.querySelectorAll('button')].find(button=>button.textContent==='Open Folder')
    await click(folder)
    const popup=document.querySelector('[role="dialog"][aria-label="Project Documents"]')
    assert.ok(popup)
    assert.equal(document.querySelectorAll('[role="dialog"]').length,2)
    assert.equal(popup.querySelectorAll('.document-row').length,3)
    assert.equal(popup.querySelectorAll('input[type="file"]').length,0,'Admin document browsing has no upload controls')
    assert.match(popup.textContent,/Client visible/)
    assert.match(popup.textContent,/Internal/)
    assert.match(popup.textContent,/Not uploaded/)
    assert.ok([...popup.querySelectorAll('button')].some(button=>button.textContent==='Download all'))
    assert.equal(popup.querySelectorAll('button[aria-label^="Download "]').length,2)
    const preview=popup.querySelector('button[aria-label="Preview Notice to Proceed"]')
    await click(preview)
    assert.equal(selected,project.docs[0])
    assert.equal(document.querySelectorAll('[role="dialog"]').length,3)
    await escape()
    assert.ok(document.querySelector('[aria-label="Project Documents"]'))
    assert.ok(document.activeElement===preview)
    assert.equal(document.body.style.overflow,'hidden')
    await escape()
    assert.equal(document.querySelector('[aria-label="Project Documents"]'),null)
    assert.ok(document.querySelector('[aria-label="Project Details"]'))
    assert.ok(document.activeElement===folder)
    assert.equal(document.body.style.overflow,'hidden')
    const {default:Agreements,appointmentStaff}=await server.ssrLoadModule('/src/SitePmAppointmentAgreements.tsx')
    const accounts=[{id:'one',name:'Juan Dela Cruz',role:'spm'},{id:'two',name:'Faith Fajardo',role:'spm'},{id:'opm',name:'Office PM',role:'opm'}]
    const agreementProject={...project,status:'active',team:[{phase:'Design',accountId:'one',engineers:[{accountId:'one'},{accountId:'two'}]},{phase:'Foundation',accountId:'one'}],docs:[
      {id:'appointment-one',label:'Juan Dela Cruz — Engagement Agreement',name:'Juan appointment.pdf',subjectId:'one',uploaded:true},
      {id:'appointment-two',label:'Faith Fajardo — Engagement Agreement',subjectId:'two',uploaded:false}
    ]}
    assert.equal(appointmentStaff(agreementProject,accounts).length,2,'Supporting engineers are included once across all phases')
    const renderAgreements=async()=>act(()=>root.render(React.createElement(Agreements,{project:agreementProject,accounts,onPreview:doc=>{selected=doc},onUpload(){},onClose(){}})))
    await renderAgreements()
    assert.equal(document.querySelectorAll('.appointment-agreement-row').length,2)
    assert.equal(document.querySelectorAll('input[type="file"]').length,1,'Only the missing agreement has an upload control')
    assert.match(document.querySelector('[role="dialog"]').textContent,/Agreement on file/)
    await click(document.querySelector('button[aria-label="View appointment agreement for Juan Dela Cruz"]'))
    assert.equal(selected,agreementProject.docs[0])
    assert.ok(document.querySelector('button[aria-label="Download appointment agreement for Juan Dela Cruz"]'))
    agreementProject.status='completed'
    await renderAgreements()
    assert.equal(document.querySelectorAll('input[type="file"]').length,0,'Completed projects remain read-only')
    assert.match(document.querySelector('[role="dialog"]').textContent,/Not on file/)
    agreementProject.team=[]
    await renderAgreements()
    assert.match(document.querySelector('[role="dialog"]').textContent,/No Site PM appointments/)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})
