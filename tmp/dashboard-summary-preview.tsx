import React from "react"
import { createRoot } from "react-dom/client"
import AdminDashboard from "../src/AdminDashboard"
import "../src/index.css"
import "../src/construction-daylight.css"
const mode = new URLSearchParams(location.search).get("screen")
const root = createRoot(document.getElementById("root")!)
const overview = { activeProjects: 47, intakeProjects: 3, teamAccounts: 29, items: [
  {key:"project:1",id:"1",kind:"project" as const,category:"updates" as const,title:"Cedar Heights Residential",detail:"Progress update awaiting Office PM review",label:"Project update",icon:"activity"},
  {key:"project:2",id:"2",kind:"project" as const,category:"intake" as const,title:"Harbor Point Commercial",detail:"Awaiting Office PM response",label:"Intake follow-up",icon:"clock"},
] }
if (mode === "mobile") {
  root.render(<div style={{padding:16}}><p style={{marginBottom:12}}>Mobile layout · example data</p><iframe title="Dashboard mobile preview" src="?screen=frame" style={{width:390,height:950,border:"1px solid #d8e0e8",background:"white"}} /></div>)
} else {
  root.render(<div style={{maxWidth:1440,margin:"auto"}}>
    <div style={{background:"#193b59",color:"white",padding:"16px 22px",borderBottom:"3px solid #d5a459"}}>Siteline · 10 BUILDERS <span style={{float:"right"}}>Dashboard</span></div>
    <main className="main-content" style={{padding:mode === "frame" ? 14 : 24}}>
      <p style={{color:"#64748b",marginBottom:16}}>Implementation preview · example data</p>
      <AdminDashboard overview={overview} onNavigate={()=>{}} onOpen={()=>{}} onNewIntake={()=>{}} onMonthlyReport={()=>{}} onActivity={()=>{}} activity={<p style={{padding:18}}>Cedar Heights Residential — New progress update received.</p>} />
    </main>
  </div>)
}
