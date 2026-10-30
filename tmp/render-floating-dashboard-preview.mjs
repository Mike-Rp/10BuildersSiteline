import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { default: Dashboard } = await server.ssrLoadModule("/src/AdminDashboard.tsx")
  const props = {
    overview: { activeProjects: 22, intakeProjects: 3, teamAccounts: 29, items: [
      {key:"project:1",id:"1",kind:"project",category:"updates",title:"Cedar Heights Residential",detail:"Progress update awaiting Office PM review",label:"Project update",icon:"activity"},
      {key:"project:2",id:"2",kind:"project",category:"intake",title:"Harbor Point Commercial",detail:"Awaiting Office PM response",label:"Intake follow-up",icon:"clock"},
    ] }, onNavigate(){}, onOpen(){}, onNewIntake(){}, onMonthlyReport(){}, onActivity(){},
    activity: React.createElement("div", {style:{padding:18}}, Array.from({length:12},(_,index)=>React.createElement("p",{key:index,style:{paddingBlock:20,borderBottom:"1px solid #d8e0e8"}},`Example project update ${index+1}`))),
  }
  const css = (await readdir("dist/assets")).find(name=>/^index-.*\.css$/.test(name))
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Floating dashboard title · Implementation preview</title><link rel="stylesheet" href="/dist/assets/${css}"></head><body><div id="root"><div class="app-shell admin-workspace sidebar-collapsed"><div class="main-shell"><header class="topbar"><div class="breadcrumb"><span>Workspace</span><span aria-hidden="true">›</span><strong>Dashboard</strong></div></header><main class="main-content"><div class="workspace-meta"><p>Implementation preview · Example data</p></div>${renderToString(React.createElement(Dashboard,props))}</main></div></div></div></body></html>`
  await writeFile("__floating-dashboard-title-preview.html",html)
} finally { await server.close() }
