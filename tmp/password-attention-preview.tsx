import React from 'react'
import {createRoot} from 'react-dom/client'
import '../src/index.css'
import '../src/construction-daylight.css'
import AdminDashboard from '../src/AdminDashboard'
import PasswordResetRequests from '../src/PasswordResetRequests'
const now=new Date().toISOString()
let rows=[{id:'sample-carlo',full_name:'Carlo Bautista',email:'carlo@example.com',role:'opm',requested_at:now,status:'pending',read_at:null},{id:'sample-enzo',full_name:'Enzo Cruz',email:'enzo@example.com',role:'spm',requested_at:now,status:'pending',read_at:now},{id:'sample-vialh',full_name:'Vialh Gonzales',email:'vialh@example.com',role:'client',requested_at:now,status:'pending',read_at:now},{id:'sample-maria',full_name:'Maria Santos',email:'maria@example.com',role:'spm',requested_at:now,status:'completed',completed_at:now,read_at:now}]
window.fetch=async(url,init)=>{if(String(url).endsWith('/read')){const id=String(url).split('/accounts/')[1].split('/')[0];rows=rows.map(r=>r.id===id?{...r,read_at:now}:r);return Response.json({data:{read_at:now}})}return Response.json({data:rows})}
const items=['Harbor Point Commercial 002','Maple Grove Mixed-Use 003','Riverstone Commercial 004'].map((title,i)=>({key:'project:'+i,id:String(i),kind:'project',category:'updates',title,detail:'Progress update awaiting Office PM review',label:'Review project',icon:'alert',urgency:'overdue',due:Date.now()-86400000}))
function Preview(){return <main style={{maxWidth:1240,margin:'auto',padding:24}}><p style={{marginBottom:12}}>Implementation preview · Sample data · No live accounts are changed</p><PasswordResetRequests>{(requests,open)=><AdminDashboard overview={{completedProjects:14,activeProjects:22,intakeProjects:8,teamAccounts:166,items}} resetRequests={requests} onOpenReset={open} onNavigate={()=>{}} onOpen={()=>{}} onNewIntake={()=>{}} onMonthlyReport={()=>{}} onActivity={()=>{}} activity={<p style={{padding:20}}>Existing activity feed</p>}/>}</PasswordResetRequests></main>};createRoot(document.getElementById('root')!).render(<Preview/>);
