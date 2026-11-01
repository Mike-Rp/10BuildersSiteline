import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

test('monitoring overview preserves trusted totals and renders only passed project records',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]}})
  try{
    const {default:Overview}=await server.ssrLoadModule('/src/ProjectMonitoringOverview.tsx')
    const {initialState}=await server.ssrLoadModule('/tests/fixtures/demo-state.ts')
    const {workflowFor}=await server.ssrLoadModule('/src/workflows.ts')
    const state=initialState(),project=state.projects.find(p=>p.status==='active')
    project.verifiedProgress=undefined;project.progress=92;project.workflow={...workflowFor(project),photos:[]}
    const html=renderToStaticMarkup(React.createElement(Overview,{project,state,onPreview(){}}))
    assert.match(html,/Construction phases/);assert.match(html,/Assigned team/)
    assert.match(html,/No site photographs recorded yet/)
    assert.match(html,/Complete activity totals for all phases are needed/)
    assert.doesNotMatch(html,/92%|58%|sample approved|mailto:/i,'no cached percentages, mock numbers or invented contact actions')
    assert.match(html,/Phase sequence is separate/)
    const {clientProjectViews}=await server.ssrLoadModule('/src/client-access.ts')
    const {default:ClientOverview}=await server.ssrLoadModule('/src/ClientOverview.tsx')
    const actor=state.accounts.find(a=>a.role==='client'),view=clientProjectViews(state,actor.id)[0]
    assert.ok(view)
    const client=renderToStaticMarkup(React.createElement(ClientOverview,{project:view,photos:React.createElement('p',null,'Shared photos only'),onNavigate(){},onDetails(){}}))
    assert.match(client,/Shared project details/);assert.match(client,/Project contacts/)
    assert.doesNotMatch(client,/Pending review|Verified company trades|Prepare replacement|Release to client/)
  }finally{await server.close()}
})
