import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { default: Dashboard } = await server.ssrLoadModule("/src/AdminDashboard.tsx")
  const props = { overview: { activeProjects: 47, intakeProjects: 3, teamAccounts: 29, items: [
    {key:"project:1",id:"1",kind:"project",category:"updates",title:"Cedar Heights Residential",detail:"Progress update awaiting Office PM review",label:"Project update",icon:"activity"},
    {key:"project:2",id:"2",kind:"project",category:"intake",title:"Harbor Point Commercial",detail:"Awaiting Office PM response",label:"Intake follow-up",icon:"clock"},
  ] }, onNavigate(){}, onOpen(){}, onNewIntake(){}, onMonthlyReport(){}, onActivity(){}, activity:React.createElement("p", {style:{padding:18}}, "Cedar Heights Residential — New progress update received.") }
  const css = (await readdir("dist/assets")).find(name => /^index-.*\.css$/.test(name))
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard implementation preview</title><link rel="stylesheet" href="/dist/assets/${css}"></head><body>`
  const content = `<div id="root"><div style="max-width:1440px;margin:auto"><div style="padding:16px 22px;background:#193b59;color:white;border-bottom:3px solid #d5a459">Siteline · 10 BUILDERS</div><main class="main-content" style="padding:20px"><p style="margin-bottom:16px;color:#64748b">Rendered implementation · example data · visual preview</p>${renderToString(React.createElement(Dashboard,props))}</main></div></div>`
  await writeFile("__dashboard-summary-preview.html", head + content + "</body></html>")
  await writeFile("__dashboard-summary-mobile-preview.html", head + '<div style="padding:12px"><p>390px mobile layout · example data</p><iframe title="Dashboard mobile layout" src="/__dashboard-summary-preview.html" style="width:390px;height:1000px;border:1px solid #d8e0e8;background:white"></iframe></div></body></html>')
  console.log("Dashboard visual previews rendered")
} finally { await server.close() }
