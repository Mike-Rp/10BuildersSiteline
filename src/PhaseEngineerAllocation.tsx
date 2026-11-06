import type {Project,State} from './model'
import {spmCandidates} from './model'
import {Button} from './ui'
import './phase-engineers.css'
import {allocatePhaseCoverage} from '../Thesis-Backend/src/domain/engineer-phase-coverage.js'
type Row=Project['team'][number]
export function recommendPhaseEngineers(state:State,type:string,phase:string,tags:string[],projectId:string) {
 const candidates=spmCandidates(state,type,phase,projectId,tags)
 return allocatePhaseCoverage(tags,candidates.map(c=>({id:c.account.id,qualifiedTags:c.availableTags}))).engineers.map(e=>({accountId:e.id,assignedDisciplines:e.tags,status:'pending' as const}))
}
export function phaseCoverageMissing(row:Row,tags:string[]) {
 return tags.filter(tag=>!row.engineers?.some(e=>e.assignedDisciplines.includes(tag)))
}
export default function PhaseEngineerAllocation({state,type,row,required,projectId,team,onChange}:{state:State;type:string;row:Row;required:string[];projectId:string;team:Row[];onChange:(row:Row)=>void}) {
 const engineers=row.engineers||[],candidates=spmCandidates(state,type,row.phase,projectId,required)
 const missing=phaseCoverageMissing(row,required)
 function update(list:NonNullable<Row['engineers']>) {onChange({...row,engineers:list,accountId:list[0]?.accountId||'',assignedDisciplines:list[0]?.assignedDisciplines})}
 return <section className="phase-engineer-allocation"><div className="phase-engineer-heading"><strong>{row.phase}</strong><span className={missing.length?'coverage-missing':'coverage-ready'}>{required.length-missing.length} of {required.length} areas covered</span></div><div className="tag-list">{required.map(tag=><span key={tag}>{tag}</span>)}</div><div className="phase-engineer-grid">{engineers.map((engineer,index)=>{
 const account=state.accounts.find(a=>a.id===engineer.accountId)
 const allowed=candidates.find(c=>c.account.id===engineer.accountId)?.availableTags||[]
 const succeeding=team.slice(team.findIndex(t=>t.phase===row.phase)+1).filter(t=>t.engineers?.some(e=>e.accountId===engineer.accountId))
 return <article key={index}><label>Assigned engineer {index===0?'· Phase coordinator':''}<select aria-label={`${row.phase} engineer ${index+1}`} value={engineer.accountId} onChange={e=>update(engineers.map((item,i)=>i===index?{accountId:e.target.value,assignedDisciplines:[],status:'pending'}:item))}><option value="">Select an eligible engineer</option>{candidates.filter(c=>c.account.id===engineer.accountId||!engineers.some(e=>e.accountId===c.account.id)).map(c=><option key={c.account.id} value={c.account.id}>{c.account.name}</option>)}</select></label><fieldset><legend>Responsibilities in {row.phase}</legend>{required.map(tag=>{
 const taken=engineers.some((e,i)=>i!==index&&e.assignedDisciplines.includes(tag))
 const selected=engineer.assignedDisciplines.includes(tag)
 return <label key={tag}><input type="checkbox" checked={selected} disabled={!allowed.includes(tag)||taken||(!selected&&engineer.assignedDisciplines.length>=3)} onChange={()=>update(engineers.map((e,i)=>i===index?{...e,assignedDisciplines:selected?e.assignedDisciplines.filter(t=>t!==tag):[...e.assignedDisciplines,tag]}:e))}/>{tag}</label>
 })}</fieldset>{succeeding.length>0&&<p>Also assigned to succeeding phases: {succeeding.map(t=>t.phase).join(', ')}</p>}<small>Available for allocation · {account?.name||'No engineer selected'}</small><Button onClick={()=>update(engineers.filter((_,i)=>i!==index))}>Remove engineer</Button></article>
 })}</div><Button onClick={()=>update([...engineers,{accountId:'',assignedDisciplines:[],status:'pending'}])}>Add engineer</Button>{missing.length>0&&<p role="status">Uncovered areas: {missing.join(', ')}. Add qualified engineers before sending.</p>}<p className="role-muted">Once sent: Reserved — awaiting acceptance. After acceptance: Committed to a project. Engineers remain unavailable elsewhere until all their responsibilities are completed or formally released.</p></section>
}
