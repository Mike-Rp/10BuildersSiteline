import { projectProgress, phaseProgress } from "./verified-progress.js";

export const REPORT_TIMEZONE = "Asia/Manila";
export const HISTORY_UNAVAILABLE = "Unavailable — historical approval or scope records are incomplete.";
export const unavailable = () => ({ earned: null, total: null, percentage: null, reason: HISTORY_UNAVAILABLE });

export function reportingMonth(now = new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:REPORT_TIMEZONE,year:"numeric",month:"2-digit"}).formatToParts(now).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}`;
}
export function reportPeriod(month, now = new Date()) {
  // en-CA ordering differs across ICU installations: formatToParts is stable.
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:REPORT_TIMEZONE,year:"numeric",month:"2-digit"}).formatToParts(now).map(p=>[p.type,p.value]));
  const current=`${parts.year}-${parts.month}`;
  if(typeof month!=="string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month<"2000-01" || month>current) throw new Error("Select a valid reporting month that is not in the future.");
  const [year,m]=month.split("-").map(Number);
  const start=new Date(Date.UTC(year,m-1,1,-8)),end=new Date(Date.UTC(year,m,1,-8));
  return {month,timezone:REPORT_TIMEZONE,start:start.toISOString(),end:end.toISOString(),cutoff:(month===current?now:end).toISOString(),monthToDate:month===current,generatedAt:now.toISOString()};
}
const key=(table,row)=>table==="project_type_stages"?`${row.project_type_id}:${row.project_stage_id}`:table==="project_phase_checklists"?`${row.project_id}:${row.project_stage_id}`:String(row.id);
export function applyReportEvent(state,event) {
  const rows=state[event.source_table] ??= [];
  const row=event.after_row||event.before_row;
  const index=rows.findIndex(r=>key(event.source_table,r)===key(event.source_table,row));
  if(index>=0)rows.splice(index,1);
  if(event.after_row)rows.push(structuredClone(event.after_row));
}
export function reportBalance(state) {
  const project=state.projects?.[0];
  if(!project)return {project:unavailable(),phases:[]};
  const workflow=(state.project_type_stages||[]).filter(w=>String(w.project_type_id)===String(project.project_type_id)).sort((a,b)=>a.sort_order-b.sort_order);
  const phases=workflow.map(w=>{
    const phaseId=String(w.project_stage_id);
    const items=(state.project_phase_checklist_items||[]).filter(i=>String(i.project_stage_id)===phaseId);
    return {id:phaseId,name:(state.project_stages||[]).find(s=>String(s.id)===phaseId)?.code||"Phase",configured:(state.project_phase_checklists||[]).some(c=>String(c.project_stage_id)===phaseId),
      activities:items.map(item=>{
        const evidence=(state.project_phase_evidence||[]).filter(e=>String(e.checklist_item_id)===String(item.id)).sort((a,b)=>Number(b.id)-Number(a.id))[0];
        return {id:String(item.id),required:item.required,weight:Number(item.weight),status:evidence?.status||"missing",approvalValid:!!evidence?.reviewed_by&&!!evidence?.reviewed_at};
      })};
  });
  const expected=new Set(workflow.map(w=>String(w.project_stage_id)));
  const additional=[...(state.project_phase_checklists||[]),...(state.project_phase_team||[])].map(r=>String(r.project_stage_id));
  if(project.current_stage_id)additional.push(String(project.current_stage_id));
  return {project:additional.some(id=>!expected.has(id))?unavailable():projectProgress(phases,[...expected]),phases:phases.map(p=>({id:p.id,name:p.name,...phaseProgress(p)}))};
}
const inPeriod=(at,period)=>at>=period.start&&at<period.cutoff;
const scopeSignature=state=>JSON.stringify({workflow:(state.project_type_stages||[]).filter(w=>String(w.project_type_id)===String(state.projects?.[0]?.project_type_id)).map(w=>[String(w.project_stage_id),w.sort_order]).sort(),
  items:(state.project_phase_checklist_items||[]).filter(i=>i.required!==false).map(i=>[String(i.id),String(i.project_stage_id),i.required,Number(i.weight)]).sort()});
const phaseName=(state,id)=>(state.project_stages||[]).find(s=>String(s.id)===String(id))?.code||"Project";

export function buildMonthlyReport({baseline,events=[],period,project,role,visiblePhaseIds=[]}) {
  const coverage=baseline?new Date(baseline.covered_from).toISOString():null;
  const covered=!!coverage&&coverage<=period.start;
  const state=structuredClone(baseline?.data||{});
  const rows=events.filter(e=>new Date(e.occurred_at).toISOString()>=coverage).sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at)||Number(a.id)-Number(b.id));
  let opening=unavailable(),closing=unavailable(),awarded=0,withdrawn=0,scopeDelta=0,scopeChanges=0,approvalEvents=0,withdrawals=0;
  const approvedIds=new Set(),reworks=new Set(),completions=new Map(),activity=[];
  let openingSet=false;
  let incompleteBalances=false;
  const phaseVisible=id=>role!=="spm"||visiblePhaseIds.includes(String(id));
  // Every transaction is observed atomically, including checklist initialization/handoff.
  const grouped=new Map();
  for(const event of rows){
    const id=String(event.transaction_id),at=new Date(event.occurred_at).toISOString();
    const transaction=grouped.get(id)||{id,at,events:[]};
    if(at>transaction.at)transaction.at=at;
    transaction.events.push(event);grouped.set(id,transaction);
  }
  const transactions=[...grouped.values()].sort((a,b)=>a.at.localeCompare(b.at)||Number(a.events.at(-1).id)-Number(b.events.at(-1).id));
  for(const transaction of transactions) {
    if(transaction.at>=period.cutoff)break;
    if(transaction.at>=period.start&&!openingSet){if(covered)opening=reportBalance(state).project;openingSet=true;}
    const before=reportBalance(state),beforeScope=scopeSignature(state);
    for(const event of transaction.events) {
      if(event.project_id===null && event.source_table==="project_type_stages") {
        const row=event.after_row||event.before_row;
        if(String(row.project_type_id)!==String(state.projects?.[0]?.project_type_id))continue;
      }
      const prior=reportBalance(state),priorScope=scopeSignature(state);
      const tracked=inPeriod(transaction.at,period)&&covered;
      const oldEvidence=event.before_row,newEvidence=event.after_row;
      applyReportEvent(state,event);
      const next=reportBalance(state);
      if(!tracked)continue;
      if(prior.project.percentage===null||next.project.percentage===null)incompleteBalances=true;
      if(event.source_table==="pending_rework_requests"&&newEvidence?.status==="approved"&&oldEvidence?.status!=="approved")reworks.add(String(newEvidence.id));
      if(priorScope!==scopeSignature(state)){scopeChanges++;if(prior.project.earned!==null&&next.project.earned!==null)scopeDelta+=next.project.earned-prior.project.earned;}
      if(event.source_table==="project_phase_evidence"&&prior.project.earned!==null&&next.project.earned!==null){
        const delta=next.project.earned-prior.project.earned;
        if(delta>0&&newEvidence?.status==="approved") {awarded+=delta;approvalEvents++;approvedIds.add(String(newEvidence.checklist_item_id));}
        else if(delta<0&&newEvidence?.rework_request_id){withdrawn-=delta;withdrawals++;}
        if(delta&&phaseVisible((newEvidence||oldEvidence).project_stage_id)) activity.push({date:transaction.at,phase:phaseName(state,(newEvidence||oldEvidence).project_stage_id),kind:delta>0?"approval":"withdrawal",record:delta>0?"Activity approved":"Activity credit withdrawn",change:delta});
      }
      if(event.source_table==="project_progress_history"&&newEvidence&&event.operation==="INSERT"&&phaseVisible(newEvidence.project_stage_id)&&role!=="client") {
        if(newEvidence.entry_type==="handoff")activity.push({date:transaction.at,phase:phaseName(state,newEvidence.project_stage_id),kind:"handoff",record:"Workflow handoff recorded",change:null});
      }
    }
    if(inPeriod(transaction.at,period)&&covered){
      const after=reportBalance(state);
      for(const phase of after.phases)if(phase.percentage===100&&before.phases.find(p=>p.id===phase.id)?.percentage!==100)completions.set(phase.id,{phase:phase.name,date:transaction.at,id:phase.id});
      if(beforeScope!==scopeSignature(state))activity.push({date:transaction.at,phase:"Project",kind:"scope",record:"Required checklist scope revised",change:null});
    }
  }
  if(!openingSet&&covered)opening=reportBalance(state).project;
  if(coverage&&coverage<=period.cutoff)closing=reportBalance(state).project;
  const reliableMovement=covered&&!incompleteBalances&&opening.percentage!==null&&closing.percentage!==null;
  const completedPhases=covered?[...completions.values()].map(p=>({...p,stillComplete:reportBalance(state).phases.find(phase=>phase.id===p.id)?.percentage===100})):null;
  const pending=covered?{
    evidence:(state.project_phase_checklist_items||[]).filter(i=>i.required&&phaseVisible(i.project_stage_id)).filter(i=>{
      const e=(state.project_phase_evidence||[]).filter(e=>String(e.checklist_item_id)===String(i.id)).sort((a,b)=>Number(b.id)-Number(a.id))[0];
      return e?.status==="pending";
    }).length,
    reports:(state.project_phase_updates||[]).filter(r=>r.status==="pending"&&phaseVisible(r.selected_stage_id)).length,
    rework:(state.pending_rework_requests||[]).filter(r=>r.status==="pending"&&phaseVisible(r.project_stage_id)).length,
  }:null;
  const result={project:{id:project.id,name:project.name,type:project.type,status:project.status},period,coverageFrom:coverage,
    opening,closing,netChange:opening.percentage!==null&&closing.percentage!==null&&opening.total===closing.total&&!scopeChanges?closing.percentage-opening.percentage:null,
    completedPhases,limitations:covered&&opening.percentage!==null&&closing.percentage!==null&&!incompleteBalances?[]:[HISTORY_UNAVAILABLE],createdAfterPeriod:new Date(project.created_at)>=new Date(period.cutoff)};
  if(role==="client")return {...result,projection:"client",updates:(state.project_progress_history||[]).filter(h=>h.is_client_visible===true&&["update","handoff"].includes(h.entry_type)&&h.recorded_at&&inPeriod(new Date(h.recorded_at).toISOString(),period)).map(h=>({date:new Date(h.recorded_at).toISOString(),phase:phaseName(state,h.project_stage_id),record:"Shared project update",text:h.note||""}))};
  const detailRestricted=role==="spm";
  return {...result,projection:detailRestricted?"site":"staff",scopeLabel:detailRestricted?"Project progress; activity details and pending reviews limited to your assigned phases.":"All authorized project activity.",
    approvals:reliableMovement&&!detailRestricted?{events:approvalEvents,distinctActivities:approvedIds.size,earned:awarded}:null,
    rework:covered&&!detailRestricted?{confirmed:reworks.size,withdrawals:reliableMovement?withdrawals:null,withdrawn:reliableMovement?withdrawn:null}:null,pending,
    movement:reliableMovement&&!detailRestricted?{awarded,withdrawn,scopeDelta,scopeChanges}:null,
    activity:activity.filter(a=>!detailRestricted||a.kind!=="scope"),
  };
}
