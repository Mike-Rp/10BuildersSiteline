import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

test('backup settings render real states and record one request without simulating completion', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' })
  const previous = new Map()
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const vite = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  const { createRoot } = await import('react-dom/client')
  let root = createRoot(document.getElementById('root'))
  const now = Date.now(), date = delta => new Date(now+delta).toISOString()
  const empty = {runs:[],openRequest:null,lastGood:null,lastTest:null,workerConfigured:true,serverTime:date(0)}
  const good = {...empty,lastGood:{finished_at:date(-6*3600000),database_bytes:214000000,summary:{protectedFiles:347,totalFiles:347,storageUsedBytes:9800000000,storageCapacityBytes:100000000000,oldestRestorableAt:date(-38*86400000)}},lastTest:{passed:true,tested_at:date(-86400000)}}
  const row = {id:'one',status:'success',requested_by_name:null,requested_at:date(-6*3600000),started_at:date(-6*3600000),finished_at:date(-6*3600000+240000),database_bytes:214000000,files_changed:3,failure_reason:null}
  try {
    const {default:Backups} = await vite.ssrLoadModule('/src/Backups.tsx')
    let resolvePost, posts=0, snapshot=empty
    const client = async (path,options={}) => {
      if(options.method==='POST'){posts++;return new Promise(resolve=>{resolvePost=resolve})}
      return snapshot
    }
    async function mount(next, custom=client){await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));snapshot=next;await act(async()=>root.render(React.createElement(Backups,{client:custom})))}
    await mount(empty)
    assert.match(document.body.textContent,/No backups recorded yet/)
    assert.equal(document.querySelector('details').open,false)
    const request = () => [...document.querySelectorAll('button')].find(b=>/Run backup request|Sending request|Request sent|Backup running/.test(b.textContent))
    await act(async()=>request().click());assert.equal(request().disabled,true)
    await act(async()=>request().click());assert.equal(posts,1)
    const requested={...row,status:'requested',requested_by_name:'Patricia N. Domingo',requested_at:date(-16*60000),started_at:null,finished_at:null,database_bytes:null,files_changed:null}
    await act(async()=>resolvePost({...empty,runs:[requested],openRequest:requested}))
    assert.match(request().textContent,/Request sent/)
    assert.match(document.body.textContent,/Waiting for the backup computer/)
    assert.match(document.body.textContent,/has not picked up this request/)
    assert.match(document.querySelector('tbody').textContent,/Requested by Patricia/)
    assert.equal(request().disabled,true)
    await mount({...good,runs:[{...requested,status:'running',started_at:date(-60000)}],openRequest:{...requested,status:'running'}})
    assert.match(request().textContent,/Backup running/);assert.equal(request().disabled,true)
    await mount({...good,runs:[{...row,requested_by_name:'Patricia',finished_at:date(-1000)}]})
    assert.match(document.body.textContent,/Backup finished/);assert.equal(request().disabled,false)
    assert.match(document.querySelector('.backup-badge.large').textContent,/Healthy/)
    await mount({...good,lastGood:{...good.lastGood,finished_at:date(-26*3600000)}})
    assert.match(document.querySelector('.backup-badge.large').textContent,/Late/)
    await mount({...good,runs:[{...row,status:'failed',failure_reason:'Could not connect to the database'}]})
    assert.match(document.querySelector('.backup-badge.large').textContent,/Failed/)
    assert.match(document.body.textContent,/Last successful backup/)
    assert.equal(document.querySelectorAll('th[scope="col"]').length,5)
    await mount({...good,runs:Array.from({length:30},(_,i)=>({...row,id:String(i)}))})
    assert.equal(document.querySelectorAll('tbody tr').length,10)
    await act(async()=>document.querySelector('[aria-label="Next page"]').click())
    assert.match(document.body.textContent,/Showing 11–20 of 30 runs/)
    let reject=true
    const retryClient=async()=>{if(reject)throw Error('Offline');return empty}
    await mount(empty,retryClient)
    assert.match(document.querySelector('[role="alert"]').textContent,/could not be read/)
    assert.equal(request().disabled,true)
    reject=false;await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Try again').click())
    assert.match(document.body.textContent,/No backups recorded yet/)
    assert.equal(request().disabled,false)
    let reconciled=empty
    const uncertainClient=async(path,options={})=>{if(options.method==='POST')throw Error('The connection timed out');return reconciled}
    await mount(empty,uncertainClient)
    await act(async()=>request().click())
    assert.equal(request().disabled,true,'An uncertain write must be reconciled before another request')
    reconciled={...empty,runs:[requested],openRequest:requested}
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Try again').click())
    assert.match(request().textContent,/Request sent/)
    assert.equal(document.querySelector('[role="alert"]'),null,'A successful re-read clears the ambiguous write error')
    await mount(empty,()=>new Promise(()=>{}))
    assert.ok(document.querySelector('[aria-busy="true"]'))
  } finally {
    await act(async()=>root.unmount());await vite.close();dom.window.close()
    for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}
  }
})
