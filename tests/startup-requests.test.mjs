import assert from "node:assert/strict"
import test from "node:test"
import { createInFlight } from "../src/api/in-flight.ts"
import { api, ApiError, getToken, setToken, setApiBase } from "../src/api/client.ts"

test("startup shares only unfinished work for the same session; finished and failed loads retry", async () => {
  const loads = createInFlight()
  let calls = 0, finish
  const load = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const first = loads.run("session-a",load)
  assert.equal(loads.run("session-a",load),first)
  await Promise.resolve()
  assert.equal(calls,1)
  const other = loads.run("session-b",async()=>"other account")
  assert.equal(await other,"other account")
  finish("first account")
  assert.equal(await first,"first account")
  await assert.rejects(loads.run("session-a",async()=>{throw new Error("Offline")}),/Offline/)
  assert.equal(await loads.run("session-a",async()=>"fresh"),"fresh")
  assert.equal(await loads.run("session-a",async()=>"new load"),"new load")
})

function mockNetwork(t, fetch) {
  t.mock.timers.enable({apis:["setTimeout"]})
  t.mock.method(globalThis,"fetch",fetch)
  setApiBase("http://127.0.0.1:3000/api/v1")
  setToken("local-test-session")
  t.after(()=>setToken(""))
}
const timeoutError = error => error instanceof ApiError && error.status===0 && error.code==="REQUEST_TIMEOUT"

test("a stalled API request aborts after 30 seconds and keeps the session available for retry", async t => {
  let signal
  mockNetwork(t,async(_url,init)=>{signal=init.signal;return new Promise(()=>{})})
  const pending = api("/workspace/project-data")
  t.mock.timers.tick(30_000)
  await assert.rejects(pending,timeoutError)
  assert.equal(signal.aborted,true)
  assert.ok(getToken())
})

test("the deadline also bounds an incomplete response body", async t => {
  mockNetwork(t,async()=>({status:200,ok:true,json:()=>new Promise(()=>{})}))
  const pending = api("/workspace/project-data")
  await Promise.resolve()
  await Promise.resolve()
  t.mock.timers.tick(30_000)
  await assert.rejects(pending,timeoutError)
})

test("caller cancellation stays an AbortError instead of a connection failure", async t => {
  mockNetwork(t,async()=>new Promise(()=>{}))
  const controller = new AbortController()
  const pending = api("/accounts",{signal:controller.signal})
  controller.abort()
  await assert.rejects(pending,error=>error.name==="AbortError")
  assert.ok(getToken())
})

test("file uploads get a longer deadline and are never automatically retried", async t => {
  let calls = 0, settled = false
  mockNetwork(t,async()=>{calls++;return new Promise(()=>{})})
  const pending = api("/files",{method:"POST",body:new FormData()})
  void pending.then(()=>{settled=true},()=>{settled=true})
  t.mock.timers.tick(30_000)
  await Promise.resolve()
  assert.equal(settled,false)
  t.mock.timers.tick(90_000)
  await assert.rejects(pending,timeoutError)
  assert.equal(calls,1)
})
