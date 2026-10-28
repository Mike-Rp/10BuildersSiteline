import assert from "node:assert/strict"
import test from "node:test"
import { emptyState, DOC_LABELS } from "../src/model.ts"
import { intakeGuidance, intakeViewCounts } from "../src/intake-guidance.ts"

const actor = (role,id=role) => ({id,role,status:"active",expiry:"2099-01-01"})
const project = extra => ({id:"p",name:"Project",type:"Residential",status:"pending",opmId:"opm",opmAccepted:false,clientId:"client",docs:[],team:[{phase:"Mobilization",accountId:"lead",status:"pending"},{phase:"Design",accountId:"spm",status:"pending"}],workflow:{checklist:{},responses:[],selections:[],notes:[],photos:[]},...extra})
const docs = () => DOC_LABELS.slice(0,6).map(label=>({label,uploaded:true}))
function workspace(p) {return {...emptyState(),projects:[p],accounts:[actor("admin"),actor("opm"),actor("spm","lead"),actor("spm"),actor("client")]}}

test("Administrator guidance edits only drafts and returned intake; counts are before filtering and refresh with records", () => {
  const p=project({}),state=workspace(p),admin=actor("admin")
  const before=structuredClone(state)
  assert.equal(intakeGuidance(state,p,admin).action,"view")
  assert.equal(intakeGuidance(state,p,admin).who,"Assigned Office PM")
  assert.deepEqual(state,before)
  p.status="draft"
  assert.equal(intakeGuidance(state,p,admin).label,"Continue setup")
  p.status="changes_requested"
  assert.equal(intakeGuidance(state,p,admin).action,"edit")
  const records=[p,project({id:"waiting"})]
  assert.deepEqual(intakeViewCounts(records,p=>intakeGuidance(state,p,admin)),{all:2,action:1,waiting:1})
  p.status="pending"
  assert.deepEqual(intakeViewCounts(records,p=>intakeGuidance(state,p,admin)),{all:2,action:0,waiting:2})
  assert.equal(intakeGuidance(state,project({status:"active"}),admin),null)
})

test("Office PM next step follows acceptance, documents, then reassignment; no action in another management scope", () => {
  const p=project({}),state=workspace(p),opm=actor("opm")
  assert.equal(intakeGuidance(state,p,opm).action,"confirm")
  p.opmAccepted=true
  p.team[1].status="declined"
  assert.equal(intakeGuidance(state,p,opm).action,"documents")
  p.docs=docs()
  assert.equal(intakeGuidance(state,p,opm).action,"reassign")
  p.status="changes_requested"
  assert.equal(intakeGuidance(state,p,opm).who,"Administrator")
  assert.equal(intakeGuidance(state,p,opm).kind,"waiting")
  assert.equal(intakeGuidance(state,p,actor("opm","other")),null)
})

test("Site PM guidance preserves independent responses and project-specific Lead gates", () => {
  const p=project({}),state=workspace(p),lead=actor("spm","lead"),spm=actor("spm")
  assert.equal(intakeGuidance(state,p,lead).action,"view")
  p.opmAccepted=true
  assert.equal(intakeGuidance(state,p,lead).stage,"Required documents")
  p.docs=docs()
  assert.equal(intakeGuidance(state,p,lead).action,"assignment")
  assert.equal(intakeGuidance(state,p,spm).kind,"waiting")
  p.team[0].status="confirmed"
  p.team.push({phase:"Structure",accountId:"spm",status:"pending"})
  const own=intakeGuidance(state,p,spm)
  assert.equal(own.action,"assignment")
  assert.match(own.next,/Design, Structure/)
  assert.deepEqual(intakeViewCounts([p],p=>intakeGuidance(state,p,spm)),{all:1,action:1,waiting:0})
  p.team.push({phase:"Closeout",accountId:"",status:"declined"})
  assert.equal(intakeGuidance(state,p,spm).action,"assignment") // another declined phase does not block this person's valid response
  assert.equal(intakeGuidance(state,p,actor("spm","unassigned")),null)
})

test("Activation guidance uses existing agreement, client and subcontractor checks and never grants Admin Lead actions", () => {
  const p=project({opmAccepted:true,docs:docs(),team:[{phase:"Mobilization",accountId:"lead",status:"confirmed"}]}),state=workspace(p),lead=actor("spm","lead")
  assert.equal(intakeGuidance(state,p,lead).stage,"Subcontractor coordination")
  assert.equal(intakeGuidance(state,p,actor("admin")).action,"view")
  state.companies=[{id:"company",status:"approved"}]
  p.workflow.selections=[{companyId:"company",status:"accepted"}]
  assert.equal(intakeGuidance(state,p,lead).stage,"Signed agreement")
  state.accounts.find(a=>a.id==="client").status="suspended"
  assert.equal(intakeGuidance(state,p,lead).action,"view")
  assert.equal(intakeGuidance(state,p,lead).stage,"Client account prerequisite")
  state.accounts.find(a=>a.id==="client").status="active"
  p.clientSubcon="Client company"
  p.clientSubconReview={issues:[{status:"open"}],acknowledgedAt:"2026-10-01"}
  assert.equal(intakeGuidance(state,p,lead).stage,"Client subcontractor review")
  p.clientSubconReview={issues:[],acknowledgedAt:"2026-10-01"}
  assert.equal(intakeGuidance(state,p,lead).label,"Review activation")
  assert.equal(intakeGuidance(state,p,actor("opm")).action,"view")
})

test("Missing assignments do not imply readiness, and clients or ineligible actors get no staff action", () => {
  const p=project({opmId:""}),state=workspace(p)
  assert.equal(intakeGuidance(state,p,actor("admin")).who,"Unassigned")
  p.opmId="opm";p.opmAccepted=true;p.docs=docs();p.team=[]
  assert.equal(intakeGuidance(state,p,actor("admin")).stage,"Phase assignments incomplete")
  assert.equal(intakeGuidance(state,p,actor("admin")).action,"view")
  assert.equal(intakeGuidance(state,p,actor("client")),null)
  p.status="draft"
  assert.equal(intakeGuidance(state,p,{...actor("admin"),status:"suspended"}).action,"view")
})
