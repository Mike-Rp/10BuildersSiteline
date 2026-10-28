import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { emptyState, localToday, addDays } from "../src/model.ts"
import { initialState } from "./fixtures/demo-state.ts"
import { locationForCity, resolveLocation } from "../Thesis-Backend/src/domain/philippine-locations.js"

test("Mixed-Use intake reviews uses and features before allocation, preserves essential packages and confirms scope",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"}),w=dom.window,previous=new Map()
  for(const [key,value] of Object.entries({window:w,document:w.document,Node:w.Node,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom",logLevel:"silent",optimizeDeps:{noDiscovery:true,include:[]}})
  const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
  try {
    const {IntakeForm}=await server.ssrLoadModule("/src/panels.tsx")
    const {default:ScopeReview}=await server.ssrLoadModule("/src/ProjectScopeReview.tsx")
    const state=emptyState();state.accounts=initialState().accounts.map(account=>({...account,expiry:["opm","spm"].includes(account.role)?"2099-01-01":account.expiry}));state.projects=[]
    const saved=[]
    const button=text=>[...document.querySelectorAll("button")].find(element=>element.textContent.trim()===text)
    const click=async text=>act(async()=>{assert.ok(button(text),text);button(text).click()})
    const field=text=>document.getElementById([...document.querySelectorAll("label")].find(element=>element.textContent===text)?.htmlFor||"")
    const type=async(input,value)=>act(()=>{
      Object.getOwnPropertyDescriptor(input.tagName==="TEXTAREA"?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,"value").set.call(input,value)
      input.dispatchEvent(new w.Event("input",{bubbles:true}))
    })
    await act(()=>root.render(React.createElement(IntakeForm,{state,onSubmit:project=>saved.push(project),onClient:account=>account,onClose(){}})))
    await type(field("Project name *"),"Office and retail scope test")
    await act(()=>document.querySelector('[role="radio"][aria-checked="false"]')?.focus())
    const mixed=[...document.querySelectorAll('[role="radio"]')].find(element=>element.textContent.includes("Mixed-Use"))
    await act(()=>mixed.click())
    await type(field("Floor area (sqm) *"),"100")
    await type(field("Number of floors *"),"3")
    await type(field("Estimated completion date *"),addDays(localToday(),100))
    const location=locationForCity(resolveLocation({region:"Metro Manila (NCR)",province:"Metro Manila",city:"Manila"}).code)
    for(const [label,choice] of [["Project region *",location.region],["Project province / NCR *",location.province],["Project city / municipality *",location.city]]){
      const input=field(label)
      await act(()=>input.focus())
      const root=input.closest(".location-search")
      const option=[...root.querySelectorAll('[role="option"]')].find(element=>element.textContent===choice)
      assert.ok(option,`${choice}: available options ${[...root.querySelectorAll('[role="option"]')].map(row=>row.textContent).join(", ")}`);await act(()=>option.click())
    }
    const client=state.accounts.find(account=>account.role==="client")
    await type(document.querySelector('.client-search input'),client.name)
    await act(()=>document.querySelector('[data-client-select]').click())
    await click("Review project scope")
    assert.ok(document.querySelector(".project-scope-review"),JSON.stringify({error:document.querySelector('.error')?.textContent,invalid:[...document.querySelectorAll('input:invalid')].map(input=>({value:input.value,message:input.validationMessage,id:input.id}))}))
    assert.equal(document.querySelector('.allocation-rows'),null)
    await type(field("Scope basis and reasons *"),"Proposed project scope based on the client brief and design requirements.")
    const check=async text=>act(()=>{
      const label=[...document.querySelectorAll('.scope-options label')].find(element=>element.textContent===text)
      assert.ok(label,text);label.querySelector("input").click()
    })
    await check("Residential spaces")
    await click("Confirm scope & generate allocation")
    assert.match(document.querySelector('[role="alert"]').textContent,/at least two/)
    await check("Office spaces")
    for(const feature of ["Podium","Tower","Curtain-wall façade","Landscaping"])await check(feature)
    await type(field("Scope basis and reasons *"),"Office and retail project without residential units, podium, tower, curtain wall or decorative landscaping.")
    await click("Confirm scope & generate allocation")
    assert.match(document.querySelector('[role="alert"]').textContent,/Confirm/)
    const includedRows=()=>[...document.querySelectorAll('.scope-phase-preview tbody tr')].filter(row=>!row.classList.contains("scope-not-applicable")).map(row=>row.querySelector("th").childNodes[0].textContent)
    for(const name of ["Structure","Envelope","Site Works","Fire & Life Safety","Office Fit-Out","Closeout"])assert.ok(includedRows().includes(name),name)
    assert.ok(!includedRows().includes("Residential Fit-Out"))
    await act(()=>document.querySelector('.scope-confirmation input').click())
    await click("Confirm scope & generate allocation")
    assert.ok(document.querySelector('.allocation-rows'))
    assert.ok(document.querySelector('[aria-label="Office Fit-Out Site PM"]'))
    assert.equal(document.querySelector('[aria-label="Residential Fit-Out Site PM"]'),null)
    assert.equal(document.querySelector('[aria-label="Tower Structure Site PM"]'),null)
    const selection=document.querySelector('[aria-label="Office Fit-Out Site PM"]')
    assert.ok(selection.value,"new fit-out phase selects a qualified candidate")
    assert.ok([...selection.options].filter(option=>option.value).every(option=>state.accounts.find(account=>account.id===option.value).scope.some(tag=>["Interior/Finishes","Acoustic","Electrical"].includes(tag))))
    assert.match(document.querySelector('[aria-label="Confirmed project scope"]').textContent,/Office spaces/)
    await click("Re-run allocation")
    assert.ok(document.querySelector('[aria-label="Office Fit-Out Site PM"]'))
    await click("Review scope")
    assert.equal(field("Scope basis and reasons *").value,"Office and retail project without residential units, podium, tower, curtain wall or decorative landscaping.")
    assert.equal(document.querySelector('.scope-confirmation input').checked,true)
    await check("Hotel / hospitality")
    assert.equal(document.querySelector('.scope-confirmation input').checked,false,"changing the scope requires reconfirmation")
    await act(()=>document.querySelector('.scope-confirmation input').click())
    await click("Confirm scope & generate allocation")
    assert.ok(document.querySelector('[aria-label="Hotel Fit-Out Site PM"]'))
    assert.equal(saved.length,0,"scope review alone never submits a project")
    // Existing projects keep their saved sequence and cannot edit scope here.
    const existing={...initialState().projects[0],id:"legacy",type:"Mixed-Use",team:[{phase:"Mobilization",accountId:"a4",status:"pending",sequence:0},{phase:"Closeout",accountId:"a4",status:"pending",sequence:1}]}
    await act(()=>root.render(React.createElement(IntakeForm,{key:"legacy",state,project:existing,onSubmit(){},onClient:account=>account,onClose(){}})))
    assert.equal(button("Review scope"),undefined)
    assert.equal(document.querySelectorAll('.allocation-row').length,2)
    // Review component is also usable without relying on client-side form validation.
    assert.ok(ScopeReview)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]
  }
})
