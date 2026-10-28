import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { default: Allocation } = await server.ssrLoadModule("/src/TradeAllocationPanel.tsx")
  const { default: Review } = await server.ssrLoadModule("/src/CompanyCapabilities.tsx")
  const { activeFixture, currentProject } = await server.ssrLoadModule("/tests/fixtures.mjs")
  const { DISCIPLINES } = await server.ssrLoadModule("/src/model.ts")
  const { LOCATION_CITIES, locationForCity } = await server.ssrLoadModule("/Thesis-Backend/src/domain/philippine-locations.js")
  const city = name => locationForCity(LOCATION_CITIES.find(city => city.name.includes(name)).code)
  const imus = city("Imus"), bacoor = city("Bacoor")
  const state = activeFixture(), project = currentProject(state)
  project.type = "Residential"; project.status = "pending"; project.workflow.activation = undefined; project.workflow.selections = []; project.subcontractorAllocationVersion = 1
  project.name = "Example Imus Residential Project"
  project.siteLocation = { ...imus, coordinates: { latitude: 14.43, longitude: 120.94 } }
  const names = ["Nearby Construction Services", "Imus Building Specialists", "Cavite Trade Partners"]
  state.companies = state.companies.slice(0,3).map((company,index) => ({ ...company, name:names[index], status:"approved", commitmentCount:0, activeProjectIds:[], documents:[{id:"proof",name:"Company records.pdf",uploaded:true}],
    capabilityReview:{operatingLocation:index===0?{...bacoor,coordinates:{latitude:14.435,longitude:120.945}}:imus,serviceAreas:[{scope:"province",location:imus}],disciplines:DISCIPLINES,reviewedAt:"2026-10-28T02:00:00Z",reviewedBy:"Example Site PM",note:"Confirmed operating base, crew dispatch point and Cavite service coverage.",documentIds:["proof"],unavailable:false} }))
  const css = (await readdir("dist/assets")).find(name => /^index-.*\.css$/.test(name))
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Combined allocation implementation preview</title><link rel="stylesheet" href="/dist/assets/${css}"><style>.preview-panel{border:1px solid #d8e0e8;border-radius:8px;padding:18px;background:white;margin-top:16px;min-width:0}.preview-main{max-width:1100px;margin:auto;padding:18px}.preview-main li{margin:10px 0}.preview-main ul{padding-left:20px}</style></head><body>`
  const allocation = renderToString(React.createElement(Allocation,{state,project,actor:state.accounts.find(account=>account.id==="a4"),onAction(){},onNewCompany(){},onPreview(){},onActivated(){},onOpenActive(){}})).replace('class="allocation-proximity-preview"','open class="allocation-proximity-preview"')
  const review = renderToString(React.createElement(Review,{company:state.companies[0],disciplines:DISCIPLINES,role:"spm",onSave:async()=>{}})).replaceAll('class="location-coordinates"','open class="location-coordinates"')
  await writeFile("__proximity-allocation-preview.html",head+`<div id="root"><div style="padding:16px 22px;background:#193b59;color:white;border-bottom:3px solid #d5a459">Siteline · Subcontractor allocation</div><main class="preview-main"><p>Rendered implementation · example data · visual preview</p><section class="preview-panel">${allocation}</section><section class="preview-panel">${review}</section></main></div></body></html>`)
  await writeFile("__proximity-allocation-mobile-preview.html",head+'<main style="padding:12px"><p>390px mobile layout · example data</p><iframe title="Allocation mobile layout" src="/__proximity-allocation-preview.html" style="width:390px;height:1100px;border:1px solid #d8e0e8;background:white"></iframe></main></body></html>')
  console.log("Combined allocation previews rendered")
} finally { await server.close() }
