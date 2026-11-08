import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("Shared OPM/SPM history pages preserve records and evidence, clamp changes and reset between projects", async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const previous=new Map()
  for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({cacheDir:`node_modules/.vite-tests/spm-history-${process.pid}`,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  try {
    const {default:Pages}=await server.ssrLoadModule('/src/ProgressHistoryPages.tsx')
    let evidence
    const rows=Array.from({length:7},(_,index)=>React.createElement('div',{key:index,className:'history-row'},`Record ${index+1} · ${index*10}%`,React.createElement('button',{onClick:()=>{evidence=index+1}},`Evidence ${index+1}`)))
    const render=async(key,items=rows)=>act(()=>root.render(React.createElement(Pages,{key,rows:items})))
    const click=async(label)=>act(()=>document.querySelector(`[aria-label="${label}"]`).click())
    const records=()=>[...document.querySelectorAll('.history-row')].map(row=>row.textContent)
    await render('project-one')
    assert.equal(records().length,3)
    assert.match(records()[0],/Record 1 · 0%/)
    assert.equal(document.querySelector('[role="status"]').textContent,'Page 1 of 3')
    assert.equal(document.querySelector('[aria-label="Previous progress history page"]').disabled,true)
    await click('Next progress history page')
    assert.equal(records().length,3);assert.match(records()[0],/Record 4 · 30%/)
    await act(()=>document.querySelector('.history-row button').click())
    assert.equal(evidence,4,'Original evidence callback stays attached to the correct record')
    await click('Next progress history page')
    assert.equal(records().length,1);assert.match(records()[0],/Record 7 · 60%/)
    assert.equal(document.querySelector('[aria-label="Next progress history page"]').disabled,true)
    await click('Previous progress history page')
    assert.match(records()[0],/Record 4/)
    await render('project-two')
    assert.equal(document.querySelector('[role="status"]').textContent,'Page 1 of 3')
    await click('Next progress history page')
    await click('Next progress history page')
    await render('project-two',rows.slice(0,4))
    assert.equal(document.querySelector('[role="status"]').textContent,'Page 2 of 2')
    assert.match(records()[0],/Record 4/)
    await render('project-two',rows.slice(0,2))
    assert.equal(records().length,2);assert.equal(document.querySelector('nav'),null)
    await render('project-two',[])
    assert.equal(records().length,0);assert.equal(document.querySelector('nav'),null)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]
  }
})
