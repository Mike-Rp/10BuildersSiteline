import {useEffect,useState,useRef} from 'react'
import type {Account,Project} from './model'
import {api,downloadBlob} from './api/client'
import {Button} from './ui'
import './phase-engineers.css'
type Responsibility={id:string;user_id:string;name:string;phase:string;project_stage_id:number;assigned_disciplines:string[];status:string;completion_status:string;completion_note?:string;completion_file_id?:string;review_note?:string;complete?:boolean;replacement_candidates?:{id:string;name:string}[]}
type Context={available:boolean;rows:Responsibility[];canReview:boolean;currentStage:number;lifecycle:string;availabilityLabel?:string}
export default function EngineerResponsibilities({project,actor,onReload}:{project:Project;actor:Account;onReload:()=>unknown}) {
 const [context,setContext]=useState<Context>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notes,setNotes]=useState<Record<string,string>>({}),[files,setFiles]=useState<Record<string,File>>({}),[replacements,setReplacements]=useState<Record<string,string>>({})
 const locked=useRef(false)
 async function load(){setContext(await api<Context>(`/projects/${project.id}/engineer-responsibilities`))}
 useEffect(()=>{let disposed=false;const read=()=>api<Context>(`/projects/${project.id}/engineer-responsibilities`).then(c=>{if(!disposed)setContext(c)}).catch(e=>{if(!disposed)setError(e.message)});void read();const timer=setInterval(()=>void read(),15000);return()=>{disposed=true;clearInterval(timer)}},[project.id])
 if(!context?.available||!context.rows.length)return null
 async function act(row:Responsibility,action:string) {
  if(locked.current)return;locked.current=true;setBusy(true);setError('')
  try {
   let fileId:string|undefined
   if(action==='submit_completion') {
    if(!files[row.id])throw new Error('Select supporting evidence for your responsibilities.')
    const form=new FormData();form.set('file',files[row.id]);form.set('stage',row.phase)
    const saved=await api<{id?:string;file?:{id:string}}>(`/projects/${project.id}/phase-files`,{method:'POST',body:form});fileId=saved.file?.id||saved.id
   }
   await api(`/projects/${project.id}/engineer-responsibilities/${row.id}`,{method:'POST',json:{action,note:notes[row.id],fileId,newUserId:replacements[row.id]}})
   await load();await onReload()
  }catch(e){setError((e as Error).message)}finally{locked.current=false;setBusy(false)}
 }
 async function evidence(row:Responsibility){try{const blob=await downloadBlob(`/projects/${project.id}/phase-files/${row.completion_file_id}`);if(!blob)throw new Error('Evidence unavailable.');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='responsibility-evidence'+(blob.type==='image/png'?'.png':blob.type==='image/jpeg'?'.jpg':'.pdf');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){setError((e as Error).message)}}
 const mine=context.rows.filter(r=>r.user_id===actor.id&&!r.complete&&['pending','confirmed'].includes(r.status))
 const label=context.availabilityLabel || (mine.some(r=>r.status==='confirmed')?'Committed to a project':mine.length?'Reserved — awaiting acceptance':'Available for allocation')
 return <section className="detail-section"><div className="phase-engineer-heading"><h3>Engineer responsibilities</h3>{actor.role==='spm'&&<span className={mine.length?'coverage-missing':'coverage-ready'}>{label}</span>}</div><p>Engineers may handle succeeding phases in this project. All assigned responsibilities must be completed or formally released before another project.</p>{context.rows.map(row=>{
 const own=row.user_id===actor.id&&actor.role==='spm'
 const status=row.complete?'Responsibilities completed':row.status==='pending'?'Reserved — awaiting acceptance':row.status==='confirmed'?'Committed to a project':row.status==='declined'?'Assignment declined':'Responsibility released'
 return <div className="responsibility-row" key={row.id}><div><strong>{row.name} · {row.phase}</strong><p>{row.assigned_disciplines.join(', ')}</p><span>{status}</span>{row.completion_note&&<p>Completion note: {row.completion_note}</p>}{row.review_note&&<p>Review: {row.review_note}</p>}</div><div className="responsibility-actions">
 {((own&&!row.complete)||context.canReview)&&<textarea aria-label={`${row.name} ${row.phase} note`} placeholder="Response, completion or handover note" value={notes[row.id]||''} onChange={e=>setNotes({...notes,[row.id]:e.target.value})} disabled={busy}/>}
 {own&&row.status==='pending'&&['spm_review','active'].includes(context.lifecycle)&&<><Button disabled={busy} onClick={()=>void act(row,'accept')}>Accept responsibility</Button><Button disabled={busy||!notes[row.id]?.trim()} onClick={()=>void act(row,'decline')}>Decline</Button></>}
 {own&&row.status==='confirmed'&&!row.complete&&context.lifecycle==='active'&&['unfinished','returned'].includes(row.completion_status)&&<><label>Completion evidence<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={e=>{if(e.target.files?.[0])setFiles({...files,[row.id]:e.target.files[0]})}}/></label><Button disabled={busy||!notes[row.id]?.trim()||!files[row.id]} onClick={()=>void act(row,'submit_completion')}>Submit my completed responsibilities</Button></>}
 {row.completion_status==='submitted'&&<span>Completion awaiting review</span>}
 {row.completion_file_id&&(context.canReview||own)&&<Button disabled={busy} onClick={()=>void evidence(row)}>Download evidence</Button>}
 {context.canReview&&row.completion_status==='submitted'&&<><Button disabled={busy} onClick={()=>void act(row,'approve_completion')}>Approve completion</Button><Button disabled={busy||!notes[row.id]?.trim()} onClick={()=>void act(row,'return_completion')}>Return for correction</Button></>}
 {context.canReview&&!row.complete&&<details><summary>Replace engineer</summary><label>Replacement engineer<select aria-label={`${row.name} replacement engineer`} value={replacements[row.id]||''} onChange={e=>setReplacements({...replacements,[row.id]:e.target.value})}><option value="">Select an eligible replacement</option>{row.replacement_candidates?.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><Button disabled={busy||!notes[row.id]?.trim()||!replacements[row.id]} onClick={()=>void act(row,'replace')}>Send replacement assignment</Button></details>}
 </div></div>
 })}{error&&<p role="alert">{error}</p>}</section>
}
