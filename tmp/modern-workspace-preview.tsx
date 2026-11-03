import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import '../src/index.css'
import '../src/construction-daylight.css'
import '../src/workspace-theme.css'
import AdminDashboard from '../src/AdminDashboard'
import RoleWorkspace from '../src/RoleWorkspace'
import ClientPortal from '../src/ClientPortal'
import ProjectMonitoringOverview from '../src/ProjectMonitoringOverview'
import {initialState} from '../tests/fixtures/demo-state'
import {clientProjectViews} from '../src/client-access'
import {adminDashboardOverview} from '../src/admin-dashboard'
import {Button,Icon,Modal} from '../src/ui'
import useSidebarNavigation from '../src/useSidebarNavigation'
const state=initialState()
window.fetch=async()=>Response.json({data:[]})
const role=new URLSearchParams(location.search).get('role') || 'admin'
function AdminPreview(){
  const nav=useSidebarNavigation(),[page,setPage]=useState('Dashboard'),[project,setProject]=useState(false)
  const items=[['Dashboard','home'],['Active sites','building'],['Project intake','plus'],['Documents','doc'],['Directory','users'],['Team','users'],['Archive','archive']]
  return <div className={`app-shell admin-workspace ${nav.expanded?'sidebar-expanded':'sidebar-collapsed'}`}>
    <aside className="sidebar" inert={!nav.expanded} aria-hidden={!nav.expanded}>
      <div className="brand"><span className="brand-mark"><img src="/images/10-builders-logo.png" alt="10 Builders"/></span><div>10BuildLine<small>10 BUILDERS</small></div><Button className="sidebar-close" icon="close" variant="icon-button" aria-label="Close navigation" onClick={nav.close}/></div>
      <nav>{items.map(([label,icon])=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>{setPage(label);nav.closeMobile()}}><Icon name={icon} size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button>Workspace guide</button><div className="sidebar-person"><span className="avatar">MA</span><span><strong>Mark Angelo Miculob</strong><small>Administrator</small></span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">{!nav.expanded&&<Button icon="menu" className="sidebar-toggle" variant="icon-button" aria-label="Open navigation" onClick={nav.toggle}/>}Workspace<Icon name="chevron" size={14}/><strong>{page}</strong></div><div className="topbar-actions"><button className="global-search-trigger"><Icon name="search" size={18}/>Search workspace</button><Button icon="bell" variant="icon-button" aria-label="Notifications"/><span className="avatar">MA</span></div></header>
    <main className="main-content"><div className="workspace-meta">Implementation preview · Example data only · No live records changed</div>{page==='Dashboard'?<AdminDashboard overview={adminDashboardOverview(state)} onNavigate={setPage} onOpen={()=>setProject(true)} onNewIntake={()=>{}} onMonthlyReport={()=>{}} onActivity={()=>{}} activity={<p style={{padding:18}}>Existing project activity appears here.</p>}/>:<><h1>{page}</h1><Button onClick={()=>setProject(true)}>Open project monitoring</Button></>}</main></div>
    {project&&<Modal wide title="Project monitoring" onClose={()=>setProject(false)}><ProjectMonitoringOverview project={state.projects.find(p=>p.status==='active')!} state={state} onPreview={()=>{}}/></Modal>}
  </div>
}
function Preview(){
  const actor={...state.accounts.find(a=>a.role===(role==='monitor'?'spm':role))!,expiry:'2099-01-01'}
  return <>{role==='admin'?<AdminPreview/>:role==='client'?<ClientPortal actor={actor} projects={clientProjectViews(state,actor.id)} readNoticeIds={[]} mutedTypes={[]} onMute={()=>{}} onResolve={()=>{throw Error('Preview only')}} onReport={()=>''} onRecord={()=>{}} onRead={()=>{}} paused={false} onResume={()=>{}} onPause={()=>{}} idleWarning={false} onStayActive={()=>{}}/>:<RoleWorkspace state={state} actor={actor} onCommand={async()=>({ok:false})} onRead={()=>{}} onMute={()=>{}} onReload={()=>{}} paused={false} onResume={()=>{}} onPause={()=>{}} idleWarning={false} onStayActive={()=>{}}/>}<div style={{position:'fixed',bottom:2,right:8,zIndex:999,background:'#fff',padding:'4px 8px',borderRadius:8,fontSize:11}}>Preview: {['admin','opm','spm','client'].map(r=><a style={{marginInline:5}} key={r} href={`?role=${r}`}>{r.toUpperCase()}</a>)} · Example data</div></>
}
createRoot(document.getElementById('root')!).render(<Preview/>);
