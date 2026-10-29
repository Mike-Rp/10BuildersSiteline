import assert from "node:assert/strict"
import test from "node:test"
import { normalizeClientCompany } from "../Thesis-Backend/src/domain/client-company.js"
const profile=()=>({name:"  Client Crew  ",email:"CREW@GMAIL.COM",foremen:[{name:" Juan Cruz ",phone:"09171234567"},{name:"",phone:""}],note:"Site contact",documents:[]})
test("client company registration validates primary and optional backup contacts without an agreement",()=>{
  const saved=normalizeClientCompany(profile())
  assert.equal(saved.name,"Client Crew")
  assert.equal(saved.email,"crew@gmail.com")
  assert.deepEqual(saved.foremen,[{name:"Juan Cruz",phone:"09171234567"}])
  assert.equal(saved.availability,"available")
  assert.throws(()=>normalizeClientCompany({...profile(),foremen:undefined}),/primary foreman/)
  assert.throws(()=>normalizeClientCompany({...profile(),foremen:[{name:"Juan",phone:"123"}]}),/11-digit/)
  assert.throws(()=>normalizeClientCompany({...profile(),foremen:[profile().foremen[0],{name:"Backup",phone:""}]}),/backup foreman/)
  assert.throws(()=>normalizeClientCompany({...profile(),email:"crew@example.com"}),/@gmail.com/)
})
test("intake uses the same company fields as registration and no longer renders an agreement upload",async()=>{
  const {createServer}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server')
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  try{
    const {IntakeForm}=await server.ssrLoadModule('/src/panels.tsx')
    const {initialState}=await server.ssrLoadModule('/tests/fixtures/demo-state.ts')
    const state=initialState(),project={...state.projects[0],clientSubcon:'Client Crew',clientSubconCompany:normalizeClientCompany(profile())}
    const html=renderToStaticMarkup(React.createElement(IntakeForm,{state,project,onSubmit(){},onClient(a){return a},onClose(){}}))
    for(const text of ['Company name','Company email','Primary foreman','Company availability','Company notes']) assert.ok(html.includes(text),text)
    assert.doesNotMatch(html,/Supporting documents|Company Supporting Document/)
    assert.doesNotMatch(html,/Client–Subcontractor Agreement|Upload agreement/)
  }finally{await server.close()}
})
