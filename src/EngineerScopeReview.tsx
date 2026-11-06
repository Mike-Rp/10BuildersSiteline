import {useState} from "react"
import type {Project,State} from "./model"
import {projectPhaseDisciplines} from "./model"
import {api} from "./api/client"
import {Button} from "./ui"

export default function EngineerScopeReview({project,state,onReload}:{project:Project;state:State;onReload:()=>Promise<unknown>}) {
 const [chosen,setChosen]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState("")
 const rows=project.team.filter(row=>state.accounts.find(a=>a.id===row.accountId)?.engineerCommitments?.some(c=>c.project_id===project.id&&c.phase===row.phase&&c.tags===null))
 if(!rows.length)return null
 async function save(phase:string,userId:string) {
  setBusy(true);setError("")
  try {await api(`/projects/${project.id}/engineer-scope`,{method:"POST",json:{phase,userId,tags:[chosen[phase]]}});await onReload()}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="detail-section"><h3>Review existing assignment specializations</h3><p>These older assignments have no recorded specialization. Confirm the tag actually used. Until reviewed, the same phase is conservatively reserved. This records existing responsibility; it does not create a new assignment.</p>{rows.map(row=>{
 const account=state.accounts.find(a=>a.id===row.accountId)
 const tags=projectPhaseDisciplines(project,row.phase).filter(tag=>(account?.qualifiedRequirements||[]).includes(tag))
 return <div className="form-grid" key={row.phase}><label>{row.phase} · {account?.name}<select aria-label={`${row.phase} existing specialization`} disabled={busy} value={chosen[row.phase]||""} onChange={e=>setChosen({...chosen,[row.phase]:e.target.value})}><option value="">Confirm existing specialization</option>{tags.map(tag=><option key={tag}>{tag}</option>)}</select></label><Button disabled={busy||!chosen[row.phase]} onClick={()=>void save(row.phase,row.accountId)}>Record specialization</Button></div>
 })}{error&&<p role="alert">{error}</p>}</section>
}
