import {useEffect,useState,useRef} from 'react'
import {uid} from './model'
import {assignmentBlock} from './workflows'
import type {Account,Project} from './model'
import {api,downloadBlob} from './api/client'
import {uploadFile} from './api/actions'
import {Button} from './ui'
import './phase-engineers.css'
import { startPolling } from "./refresh-interval"
import ResponsibilityEvidencePreview from "./ResponsibilityEvidencePreview"
type Responsibility={id:string;user_id:string;name:string;phase:string;project_stage_id:number;assigned_disciplines:string[];status:string;completion_status:string;completion_note?:string;completion_file_id?:string;review_note?:string;offer_deadline_at?:string;complete?:boolean;progress?:number;requirements?:number;approved?:number;missing?:{title:string;status:string}[];replacement_candidates?:{id:string;name:string}[]}
type Context={available:boolean;rows:Responsibility[];canReview:boolean;currentStage:number;lifecycle:string;availabilityLabel?:string}
export default function EngineerResponsibilities({project,actor,onReload}:{project:Project;actor:Account;onReload:()=>unknown}) {
 const [context,setContext]=useState<Context>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notes,setNotes]=useState<Record<string,string>>({}),[files,setFiles]=useState<Record<string,File>>({}),[replacements,setReplacements]=useState<Record<string,string>>({})
 const locked=useRef(false)
 const [previewId,setPreviewId]=useState<string>()
 useEffect(()=>setPreviewId(undefined),[project.id])
 async function load(){setContext(await api<Context>(`/projects/${project.id}/engineer-responsibilities`))}
 useEffect(()=>{let disposed=false;const read=()=>api<Context>(`/projects/${project.id}/engineer-responsibilities`).then(c=>{if(!disposed)setContext(c)}).catch(e=>{if(!disposed)setError(e.message)});void read();const stop=startPolling(read);return()=>{disposed=true;stop()}},[project.id])
 if(!context?.available||!context.rows.length)return null
 async function act(row:Responsibility,action:string) {
  if(action==='accept'){const block=assignmentBlock(project,actor.id);if(block){setError(block);return}}
  if(locked.current)return;locked.current=true;setBusy(true);setError('')
  try {
   let fileId:string|undefined
   if(action==='submit_completion') {
    if(!files[row.id])throw new Error('Select supporting evidence for your responsibilities.')
    // Upload first (direct to storage, or in chunks), then send only the file id. Posting the
    // file itself here is what hit the serverless 4.5 MB request cap.
    const uploadId=uid();await uploadFile(uploadId,files[row.id],'document','evidence')
    const saved=await api<{id?:string;file?:{id:string}}>(`/projects/${project.id}/phase-files`,{method:'POST',json:{file_id:uploadId,stage:row.phase,request_id:uploadId}});fileId=saved.file?.id||saved.id
   }
   await api(`/projects/${project.id}/engineer-responsibilities/${row.id}`,{method:'POST',json:{action,note:notes[row.id],fileId,newUserId:replacements[row.id]}})
   await load();await onReload()
  }catch(e){setError((e as Error).message)}finally{locked.current=false;setBusy(false)}
 }
 async function evidence(row:Responsibility){try{const blob=await downloadBlob(`/projects/${project.id}/phase-files/${row.completion_file_id}`);if(!blob)throw new Error('Evidence unavailable.');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='responsibility-evidence'+(blob.type==='image/png'?'.png':blob.type==='image/jpeg'?'.jpg':'.pdf');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){setError((e as Error).message)}}
 // Only reviewers see everyone; an engineer sees their own responsibilities, one row per phase.
 const visibleRows=context.canReview?context.rows:context.rows.filter(r=>r.user_id===actor.id)
 const previewRow=visibleRows.find(row=>row.id===previewId && row.completion_file_id && (context.canReview || (row.user_id===actor.id && actor.role==='spm')))
 const mine=context.rows.filter(r=>r.user_id===actor.id&&!r.complete&&['pending','confirmed'].includes(r.status))
 const label=context.availabilityLabel || (mine.some(r=>r.status==='confirmed')?'Committed to a project':mine.length?'Reserved — awaiting acceptance':'Available for allocation')
 return <section className="detail-section"><div className="phase-engineer-heading"><h3>Engineer responsibilities</h3>{actor.role==='spm'&&<span className={mine.length?'coverage-missing':'coverage-ready'}>{label}</span>}</div><p>Engineers may handle succeeding phases in this project. All assigned responsibilities must be completed or formally released before another project.</p>{visibleRows.map(row=>{
 const own=row.user_id===actor.id&&actor.role==='spm'
 const status=row.complete?'Responsibilities completed':row.status==='pending'?'Reserved — awaiting acceptance':row.status==='confirmed'?'Committed to a project':row.status==='declined'?'Assignment declined':'Responsibility released'
 return <div className="responsibility-row" key={row.id}><div><strong>{row.name} · {row.phase}</strong><p>{row.assigned_disciplines.join(', ')}</p><span>{status}</span><p>{row.approved ?? 0}/{row.requirements ?? 0} requirements approved · {row.progress ?? 0}% · {row.completion_status}</p>{context.canReview&&!!row.missing?.length&&<details><summary>Requirements needing attention ({row.missing.length})</summary>{row.missing.map(item=><p key={item.title}>{item.title} — {item.status.replace(/_/g,' ')}</p>)}</details>}{row.status==='pending'&&row.offer_deadline_at&&<p>Respond by: {new Date(row.offer_deadline_at).toLocaleString('en-PH')}</p>}{row.completion_note&&<p>Completion note: {row.completion_note}</p>}{row.review_note&&<p>Review: {row.review_note}</p>}</div><div className="responsibility-actions">
 {((own&&!row.complete)||context.canReview)&&<textarea aria-label={`${row.name} ${row.phase} note`} placeholder="Response note" value={notes[row.id]||''} onChange={e=>setNotes({...notes,[row.id]:e.target.value})} disabled={busy}/>}
 {own&&row.status==='pending'&&['spm_review','active'].includes(context.lifecycle)&&<><Button disabled={busy||!!assignmentBlock(project,actor.id)} title={assignmentBlock(project,actor.id)||undefined} onClick={()=>void act(row,'accept')}>Accept responsibility</Button>{assignmentBlock(project,actor.id)&&<p role="status">{assignmentBlock(project,actor.id)}</p>}<Button disabled={busy||!notes[row.id]?.trim()} onClick={()=>void act(row,'decline')}>Decline</Button></>}
 {row.completion_file_id&&(context.canReview||own)&&<><Button disabled={busy} onClick={()=>void evidence(row)}>Download evidence</Button><Button disabled={busy} onClick={()=>setPreviewId(row.id)}>Preview evidence</Button></>}
 {context.canReview&&!row.complete&&<details><summary>Replace engineer</summary><label>Replacement engineer<select aria-label={`${row.name} replacement engineer`} value={replacements[row.id]||''} onChange={e=>setReplacements({...replacements,[row.id]:e.target.value})}><option value="">Select an eligible replacement</option>{row.replacement_candidates?.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><Button disabled={busy||!notes[row.id]?.trim()||!replacements[row.id]} onClick={()=>void act(row,'replace')}>Send replacement assignment</Button></details>}
 </div></div>
 })}{error&&<p role="alert">{error}</p>}{previewRow&&<ResponsibilityEvidencePreview key={`${project.id}:${previewRow.completion_file_id}`} path={`/projects/${project.id}/phase-files/${previewRow.completion_file_id}`} title={`${previewRow.name} · ${previewRow.phase}`} onClose={()=>setPreviewId(undefined)} onDownload={()=>void evidence(previewRow)}/>}</section>
}
