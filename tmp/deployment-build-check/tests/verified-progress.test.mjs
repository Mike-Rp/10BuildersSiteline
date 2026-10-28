import assert from "node:assert/strict"
import test from "node:test"
import { activityEarned, phaseProgress, projectProgress, reworkImpact } from "../src/project-progress.ts"
import * as backend from "../Thesis-Backend/src/domain/verified-progress.js"

const activity = (id, status = "missing", weight = 10, required = true) => ({ id, status, weight, required })
const phase = (id, activities) => ({ id, configured: true, activities })

test("phase progress retains precision and gives full value only to approved required activities", () => {
  for (let count = 0; count <= 3; count++) {
    const input = phase("p", Array.from({length:3}, (_, i) => activity(String(i), i < count ? "approved" : "pending")))
    const value = phaseProgress(input)
    assert.equal(value.earned, count * 10)
    assert.equal(value.total, 30)
    assert.equal(value.percentage, count * 10 / 30 * 100)
    assert.equal(Number(value.percentage.toFixed(1)), [0,33.3,66.7,100][count])
  }
  for (const status of ["missing","pending","submitted","rejected","rework_required"]) assert.equal(activityEarned(activity("a",status)),0)
  assert.equal(activityEarned({...activity("a","approved"),approvalValid:false}),0)
  assert.equal(activityEarned(activity("a","approved",500,false)),0)
})

test("project totals sum activity values, never phase averages, floors, dates, or legacy progress", () => {
  const phases = Array.from({length:9}, (_, i) => phase(String(i), Array.from({length:3}, (_, n) =>
    activity(`${i}-${n}`, i*3+n<8 ? "approved" : "missing"))))
  const total = projectProgress(phases, phases.map(p=>p.id))
  assert.deepEqual([total.earned,total.total,Number(total.percentage.toFixed(1))],[80,270,29.6])
  assert.deepEqual(projectProgress(phases.map(p=>({...p,progress:100,stageFloor:100})),phases.map(p=>p.id)),total)
  const uneven = [phase("a",[activity("1","approved",20),activity("2","approved",30),activity("3","missing",50)]),
    phase("b",[activity("4","approved",10),activity("5","missing",900,false)])]
  assert.equal(phaseProgress(uneven[0]).percentage,50)
  assert.equal(projectProgress(uneven,["a","b"]).percentage,60/110*100)
})

test("invalid values and missing or duplicate scope return an explicit unavailable result", () => {
  const good = phase("a",[activity("1","approved")])
  for (const weight of [undefined,null,0,-1,NaN,Infinity,"10"]) {
    assert.equal(phaseProgress(phase("a",[{...activity("1","approved"),weight}])).percentage,null)
  }
  for (const input of [{...good,configured:false}, phase("a",[]),phase("a",[activity("1"),activity("1")])]) {
    assert.equal(phaseProgress(input).percentage,null)
  }
  for (const [phases,ids] of [[[good],[]],[[],["a"]],[[good],["a","b"]],[[good,good],["a"]],[[good],["a","a"]],
    [[good,phase("b",[activity("1")])],["a","b"]]]) {
    const value=projectProgress(phases,ids)
    assert.equal(value.percentage,null)
    assert.ok(value.reason)
    assert.equal(value.total,null)
  }
})

test("rework preview deducts distinct approved activities once, keeps the denominator, and never mutates inputs", () => {
  const phases = Array.from({length:9},(_,i)=>phase(String(i),Array.from({length:3},(_,n)=>activity(`${i}-${n}`,i*3+n<8?"approved":"pending"))))
  const original=structuredClone(phases),ids=phases.map(p=>p.id)
  const preview=reworkImpact(phases,ids,["2-0","2-0","2-2"])
  assert.deepEqual([preview.before.earned,preview.after.earned,preview.after.total],[80,70,270])
  assert.equal(Number(preview.after.percentage.toFixed(1)),25.9)
  assert.equal(preview.phases[2].before.earned,20)
  assert.equal(preview.phases[2].after.earned,10)
  assert.equal(preview.phases[2].loss,10/30*100)
  assert.deepEqual(phases,original)
  assert.equal(reworkImpact(phases,ids,["2-2"]).loss,0)
  assert.equal(reworkImpact(phases,ids,["outside"]).after.percentage,null)
  assert.equal(reworkImpact(phases,[],[]).after.percentage,null)
})

test("browser and server use the same implementation",()=>{
  assert.equal(activityEarned,backend.activityEarned)
  assert.equal(phaseProgress,backend.phaseProgress)
  assert.equal(projectProgress,backend.projectProgress)
  assert.equal(reworkImpact,backend.reworkImpact)
})
