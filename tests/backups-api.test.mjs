import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import express from '../Thesis-Backend/node_modules/express/index.js'
import { createBackupRouter } from '../Thesis-Backend/src/services/backups/routes.js'
import { sendError } from '../Thesis-Backend/src/common/utilities/access.utility.js'

test('backup metadata API enforces admin access, worker credentials, durable single requests and verified results', async () => {
  const db=new PGlite(),user={id:randomUUID(),full_name:'Patricia N. Domingo'}
  await db.exec('create table users(id uuid primary key)')
  await db.query('insert into users values($1)',[user.id])
  const migration=fs.readFileSync(new URL('../Thesis-Backend/migrations/029-backup-monitoring.sql',import.meta.url),'utf8')
  await db.exec(migration);await db.exec(migration)
  const app=express();app.use(express.json())
  let configured=true
  app.use('/backups',createBackupRouter({transaction:fn=>db.transaction(tx=>fn(tx)),secret:()=>configured?'worker-test-secret':'',authorize:async(req,res,roles)=>{
    if(!roles.includes(req.headers['x-test-role'])){sendError(res,'Forbidden',403);return null}return user
  }}))
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
  const url=`http://127.0.0.1:${server.address().port}/backups`
  async function call(path='',body,auth='admin'){
    const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth==='worker'?{Authorization:'Bearer worker-test-secret'}:{'x-test-role':auth})},body:body===undefined?undefined:JSON.stringify(body)})
    return {status:response.status,body:await response.json()}
  }
  try {
    for(const role of ['spm','opm','client',''])for(const [path,body] of [['',undefined],['/requests',{}]])assert.equal((await call(path,body,role)).status,403)
    assert.deepEqual((await call()).body.data.runs,[])
    configured=false;assert.equal((await call('/requests',{})).status,503);configured=true
    const requests=await Promise.all([call('/requests',{}),call('/requests',{})])
    assert.ok(requests.every(r=>r.status===200))
    assert.equal((await db.query('select count(*)::int as n from backup_runs')).rows[0].n,1)
    let snapshot=(await call()).body.data,id=snapshot.openRequest.id
    assert.equal(snapshot.runs[0].requested_by_name,user.full_name)
    assert.equal((await call('/worker/claim',{})).status,401)
    assert.equal((await call('/worker/claim',{},'wrong')).status,401)
    const claim=await call('/worker/claim',{},'worker');assert.equal(claim.body.data.id,id)
    assert.equal((await call('/worker/claim',{scheduled:true},'worker')).body.data,null)
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'success'},'worker')).status,400)
    const summary={protectedFiles:347,totalFiles:347,storageUsedBytes:9800000000,storageCapacityBytes:100000000000,oldestRestorableAt:new Date(Date.now()-38*86400000).toISOString(),privatePath:'must not be saved'}
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'success',databaseBytes:214000000,filesChanged:3,summary},'worker')).status,200)
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'success',databaseBytes:214000000,filesChanged:3,summary},'worker')).status,200,'result retry')
    snapshot=(await call()).body.data;assert.equal(snapshot.openRequest,null);assert.ok(snapshot.lastGood);assert.equal(snapshot.lastGood.summary.privatePath,undefined)
    assert.equal((await call('/worker/restore-tests',{passed:true},'worker')).status,200)
    assert.equal((await call()).body.data.lastTest.passed,true)
    id=(await call('/worker/claim',{scheduled:true},'worker')).body.data.id
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'failed',reason:'password=secret'},'worker')).status,400)
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'failed',reason:'toString'},'worker')).status,400)
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'failed',reason:'database'},'worker')).status,200)
    snapshot=(await call()).body.data
    assert.equal(snapshot.runs[0].status,'failed');assert.equal(snapshot.runs[0].failure_reason,'Could not connect to the database');assert.ok(snapshot.lastGood)
    // The last success remains available even when outside the recent-30 window.
    for(let i=0;i<31;i++)await db.query("insert into backup_runs(status,finished_at) values('failed',now())")
    snapshot=(await call()).body.data;assert.equal(snapshot.runs.length,30);assert.ok(snapshot.lastGood)
    assert.equal((await call('/worker/runs/'+id+'/result',{status:'success',databaseBytes:1,filesChanged:0,summary},'worker')).status,409)
  } finally {await new Promise(resolve=>server.close(resolve));await db.close()}
})
