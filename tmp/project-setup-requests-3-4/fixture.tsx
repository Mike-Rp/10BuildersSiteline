import React from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from '/src/RoleWorkspace.tsx';
import GroupedNumberInput from '/src/GroupedNumberInput.tsx';
import {initialState} from '/tests/fixtures/demo-state.ts';
import {assessInquiry} from '/Thesis-Backend/src/domain/inquiry-assessment.js';
import '/src/index.css';
import '/src/construction-daylight.css';
import '/src/workspace-theme.css';
import '/src/admin-ui-refinements.css';
import '/src/admin-navigation.css';
import '/src/header-controls.css';
const start='2080-01-12';
let inquiry={id:'setup-qa',status:'approved',details:{name:'QA Residence',project_type:'Residential',address:'Quezon City',lot_area:200,floor_area_sqm:400,floor_count:2,anticipated_start:start,client_name:'Ana Reyes',email:'ana@gmail.com',phone:'09123456789',consultation:30}};
window.qaRequests=[];window.qaSaves=[];
let uploadedName='';
window.fetch=async(url,init)=>{
 const path=String(url); const data=init?.body && typeof init.body==='string'?JSON.parse(init.body):undefined;
 if(data)window.qaRequests.push({path,data});
 if(path.endsWith('/files/upload-url'))return Response.json({data:{mode:'database'}});
 if(path.endsWith('/files')&&init?.body instanceof FormData){uploadedName=init.body.get('file').name;return Response.json({data:{}})}
 if(path.includes('/content'))return new Response('%PDF-1.4',{headers:{'Content-Type':'application/pdf'}});
 if(path.endsWith('/workflow')){
  if(data.action==='contract')inquiry={...inquiry,workflow:{...inquiry.workflow,signed_contract:{id:data.contract_file_id,name:uploadedName}}};
  if(data.action==='review'){
   window.qaSaves.push(data); inquiry={...inquiry,details:{...inquiry.details,...data.correction},workflow:{...inquiry.workflow,budget:Number(data.amount),review:{...data,version:1,estimate:{size:'Large',end:data.end}}}};
  }
  if(data.action==='assessment')inquiry={...inquiry,workflow:{...inquiry.workflow,assessment:{...assessInquiry(inquiry.details,inquiry.workflow.review.start,inquiry.workflow.review.end,data.technical,data.arrangement),id:'qa-assessment'}}};
  return Response.json({data:inquiry});
 }
 if(path.endsWith('/planning'))return Response.json({data:{phases:['Design','Foundation','Structure'],estimate:{size:'Large',end:inquiry.workflow.review.end}}});
 if(path.includes('/projects/inquiries'))return Response.json({data:[inquiry,{...inquiry,id:'harbor',status:'offered',details:{...inquiry.details,name:'Harbor shop',project_type:'Commercial'}},{...inquiry,id:'market',status:'consulting',details:{...inquiry.details,name:'Market annex',project_type:'Mixed-Use'}}]});
 return Response.json({data:[]});
};
const state=initialState();const actor=state.accounts.find(a=>a.role==='opm');actor.expiry='2099-01-01';
history.replaceState({},'', '/opm/project-intake');
createRoot(document.getElementById('root')).render(<Workspace state={state} actor={actor} onCommand={()=>({ok:true})} onRead={()=>{}} onMute={()=>{}} onReload={()=>{}} paused={false} onResume={()=>{}} onPause={()=>{}} idleWarning={false} onStayActive={()=>{}}/>);
