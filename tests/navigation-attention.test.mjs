import assert from "node:assert/strict"
import test from "node:test"
import { emptyState, DOC_LABELS } from "../src/model.ts"
import { navigationAttention } from "../src/navigation-attention.ts"
import { intakeGuidance, intakeViewCounts, isIntake } from "../src/intake-guidance.ts"

const actor = (role, id = role) => ({ role, id, status:"active" })
const project = (id, extra = {}) => ({
  id, name:id, status:"active", phase:"Mobilization", opmId:"opm", opmAccepted:true,
  docs:DOC_LABELS.slice(0,6).map(label=>({label,uploaded:true})),
  team:[{phase:"Mobilization",accountId:"spm",status:"confirmed"}],
  workflow:{checklist:{},responses:[],selections:[],notes:[],photos:[]}, ...extra,
})

test("Administrator intake badge counts their actionable records and other badges keep their existing queues", () => {
  const state = emptyState()
  state.projects = [project("review",{workflow:{pendingUpdate:{},pendingRework:{}}}),project("draft",{status:"draft"}),project("waiting",{status:"pending",opmAccepted:false}),project("historical",{status:"completed",workflow:{pendingUpdate:{}}})]
  state.companies = [{id:"request",status:"pending"},{id:"old",status:"approved"}]
  state.accounts = [{id:"staff",role:"spm",status:"active",expiry:"2020-01-01"},{id:"client",role:"client",status:"active",expiry:"2020-01-01"}]
  const before = structuredClone(state)
  const counts = navigationAttention(state,actor("admin"))
  assert.equal(counts["Active sites"].count,1)
  assert.equal(counts["Project intake"].count,1,"Office PM acceptance belongs to waiting for others")
  assert.equal(counts.Directory.count,1)
  assert.equal(counts.Team.count,1)
  assert.deepEqual(state,before)
  state.events = [{read:true,type:"notice",readBy:["admin"]}]
  state.userPreferences = {admin:["request","approval","progress"]}
  assert.deepEqual(navigationAttention(state,actor("admin")),counts)
  state.projects[0].workflow = {}
  state.projects[1].status = "active"
  state.projects[2].opmAccepted = true
  state.companies[0].status = "approved"
  const resolved = navigationAttention(state,actor("admin"))
  assert.equal(resolved["Active sites"].count,0)
  assert.equal(resolved["Project intake"].count,0)
  assert.equal(resolved.Directory.count,0)
})

test("intake badge matches Needs your action before filters, excludes waiting records, and updates as tasks resolve", () => {
  const state=emptyState()
  const admin=actor("admin")
  state.projects=[
    project("draft-1",{status:"draft"}),
    project("draft-2",{status:"draft"}),
    project("returned",{status:"changes_requested"}),
    ...Array.from({length:4},(_,i)=>project(`opm-${i}`,{status:"pending",opmAccepted:false})),
    ...Array.from({length:6},(_,i)=>project(`documents-${i}`,{status:"pending",docs:[]})),
    project("active"),project("completed",{status:"completed"}),
  ]
  const pageCounts=()=>intakeViewCounts(state.projects.filter(isIntake),p=>intakeGuidance(state,p,admin))
  assert.deepEqual(pageCounts(),{all:13,action:3,waiting:10})
  assert.equal(navigationAttention(state,admin)["Project intake"].count,pageCounts().action)
  state.projects[0].status="pending"
  state.projects[0].opmAccepted=false
  assert.equal(pageCounts().action,2)
  assert.equal(navigationAttention(state,admin)["Project intake"].count,2)
  assert.equal(navigationAttention(state,{...admin,status:"suspended"})["Project intake"].count,0)
})

test("Office PM badges separate actionable confirmations, documents and review items within managed projects", () => {
  const state = emptyState()
  state.projects = [
    project("confirm",{status:"pending",opmAccepted:false,docs:[]}),
    project("documents",{status:"pending",docs:[]}),
    project("waiting",{status:"pending",team:[{phase:"Mobilization",accountId:"spm",status:"pending"}]}),
    project("returned",{status:"changes_requested",opmAccepted:false}),
    project("review",{workflow:{pendingUpdate:{},pendingRework:{},checklist:{Mobilization:[{status:"submitted"}]}}}),
    project("restricted",{opmId:"other",workflow:{pendingUpdate:{},checklist:{}}}),
  ]
  const counts = navigationAttention(state,actor("opm"))
  assert.equal(counts["Confirmation queue"].count,1)
  assert.equal(counts.Documents.count,1)
  assert.equal(counts["Rework & approvals"].count,3)
  state.projects[0].opmAccepted = true
  const refreshed = navigationAttention(state,actor("opm"))
  assert.equal(refreshed["Confirmation queue"].count,0)
  assert.equal(refreshed.Documents.count,2)
})

test("Site PM badges respect independent assignments and lead gates; client gets no staff queues", () => {
  const state = emptyState()
  state.projects = [project("response",{status:"pending",team:[{phase:"Mobilization",accountId:"spm",status:"pending"}]}),project("blocked",{status:"pending",opmAccepted:false,team:[{phase:"Mobilization",accountId:"spm",status:"pending"}]}),project("review",{workflow:{pendingUpdate:{},pendingRework:{}}}),project("other",{team:[{phase:"Mobilization",accountId:"other",status:"pending"}],workflow:{pendingUpdate:{}}})]
  assert.equal(navigationAttention(state,actor("spm")).Assignments.count,1)
  assert.equal(navigationAttention(state,actor("spm"))["Active sites"].count,1)
  assert.equal(navigationAttention(state,actor("spm","other"))["Active sites"].count,1)
  assert.equal(navigationAttention(state,actor("spm","unassigned")).Assignments.count,0)
  assert.equal(navigationAttention(state,actor("spm","unassigned"))["Active sites"].count,0)
  assert.deepEqual(navigationAttention(state,actor("client")),{})
})
