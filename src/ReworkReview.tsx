import {useEffect,useState} from "react"
import {api} from "./api/client"
import {Button,Field,Modal} from "./ui"
import {progressLabel,type ProgressTotals} from "./project-progress"

type Impact={request_id:string;reason:string;activities:{id:string;label:string;status:string}[];selected:string[];
  before:{phase:ProgressTotals;project:ProgressTotals};after:{phase:ProgressTotals;project:ProgressTotals};
  loss:{phase:number|null;project:number|null};review_token:string}
const value=(p:ProgressTotals)=>p.percentage===null ? "Unavailable" : `${p.earned} / ${p.total} · ${progressLabel(p.percentage)}%`

export default function ReworkReview({requestId,confirm,onClose,onConfirm}:{requestId:string;confirm:boolean;onClose:()=>void;
  onConfirm:(token:string,ids:string[],reason:string)=>Promise<boolean>}){
  const [selection,setSelection]=useState<string[]>()
  const [impact,setImpact]=useState<Impact>()
  const [reason,setReason]=useState("")
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("")
  const [failedSave,setFailedSave]=useState(false)
  useEffect(()=>{
    let active=true;setLoading(true);setError("")
    api<Impact>(`/rework-requests/${requestId}/preview`,{method:"POST",json:selection===undefined?{}:{selected_activity_ids:selection}})
      .then(value=>{if(active)setImpact(value)}).catch(error=>{if(active){setImpact(undefined);setError(error.message)}})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[requestId,selection])
  return <Modal title={confirm?"Confirm targeted rework":"Dismiss rework request"} onClose={()=>{if(!busy)onClose()}}>
    {loading&&<p role="status">Calculating rework impact…</p>}
    {error&&<p role="alert">{error}</p>}
    {impact&&<>
      <p>{impact.reason}</p>
      {confirm&&<fieldset disabled={busy||loading}><legend>Activities requiring correction</legend>
        {impact.activities.map(item=><label className="qa-checklist-row" key={item.id}>
          <input type="checkbox" checked={impact.selected.includes(item.id)} onChange={()=>setSelection(impact.selected.includes(item.id)?impact.selected.filter(id=>id!==item.id):[...impact.selected,item.id])}/>
          <span>{item.label} · {item.status.replace(/_/g," ")}</span>
        </label>)}
        {!impact.activities.length&&<p>No activities are linked. Dismiss this legacy request or ask for a targeted report.</p>}
      </fieldset>}
      <div className="notice subsection"><div><strong>{confirm?"Impact if confirmed":"Progress remains unchanged"}</strong>
        {(["phase","project"] as const).map(scope=><div key={scope}>
          <p>{scope==="phase"?"Phase":"Project"}: {value(impact.before[scope])} → {value(confirm?impact.after[scope]:impact.before[scope])}</p>
          {confirm&&impact.loss[scope]!==null&&<p>Loss: {progressLabel(impact.loss[scope]!)} percentage points</p>}
          {impact.before[scope].reason&&<p>{impact.before[scope].reason}</p>}
        </div>)}
      </div></div>
    </>}
    <Field label="Decision reason *"><textarea rows={3} maxLength={10000} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
    <div className="modal-actions"><Button disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={busy||loading||failedSave||!reason.trim()||(confirm&&(!impact||!impact.selected.length))} onClick={async()=>{
        setBusy(true)
        try{if(await onConfirm(impact?.review_token||"",impact?.selected||[],reason.trim()))onClose()
          else{setFailedSave(true);setImpact(undefined);setError("Decision was not saved. Close this panel and reopen the request for a fresh preview.")}}
        catch(error){setFailedSave(true);setImpact(undefined);setError((error as Error).message)}finally{setBusy(false)}
      }}>{busy?"Saving…":confirm?"Confirm rework":"Dismiss request"}</Button>
    </div>
  </Modal>
}
