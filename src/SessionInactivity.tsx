import { useEffect, useRef, useState } from "react"
import { api, getToken, setToken, SESSION_REPLACED_EVENT } from "./api/client"
import { Button, Modal } from "./ui"

type Timing = { expiresAt:number; warningAt:number; serverNow:number; lastActivityAt:number }

export default function SessionInactivity() {
  const [warning,setWarning]=useState(false)
  const [seconds,setSeconds]=useState(300)
  const [error,setError]=useState("")
  const [busy,setBusy]=useState(false)
  const state=useRef<{token:string;timing?:Timing;offset:number;lastSent:number;pending:boolean}>({token:"",offset:0,lastSent:0,pending:false})
  const warnRef=useRef(false)
  const send=useRef<(activity:boolean)=>Promise<void>>(async()=>{})
  useEffect(()=>{
    let disposed=false
    const expire=()=>{
      const current=state.current
      if(!current.token || getToken()!==current.token)return
      setToken("");setWarning(false);warnRef.current=false
      window.dispatchEvent(new window.CustomEvent(SESSION_REPLACED_EVENT,{detail:"Your session expired due to inactivity. Please sign in again."}))
    }
    const sync=async(activity:boolean)=>{
      const current=state.current,token=getToken()
      if(!token || token!==current.token || current.pending)return
      current.pending=true
      current.lastSent=Date.now()
      try {
        const timing=await api<Timing>(activity?"/auth/activity":"/auth/session",activity?{method:"POST"}:{})
        if(disposed || getToken()!==token || state.current!==current)return
        current.timing=timing;current.offset=timing.serverNow-Date.now();current.lastSent=Date.now()
        setError("")
        if(activity){warnRef.current=false;setWarning(false)}
      } catch(e) {
        if(!disposed && activity)setError(e instanceof Error?e.message:"Unable to extend the session. Try again before the timer ends.")
      } finally {current.pending=false}
    }
    send.current=sync
    const tick=()=>{
      const token=getToken()
      if(token!==state.current.token){state.current={token,offset:0,lastSent:0,pending:false};warnRef.current=false;setWarning(false);setError("");if(token)void sync(false)}
      const current=state.current,timing=current.timing
      if(!token)return
      if(!timing){if(!current.pending && Date.now()-current.lastSent>=15000)void sync(false);return}
      const now=Date.now()+current.offset
      if(now>=timing.expiresAt){expire();return}
      const show=now>=timing.warningAt
      warnRef.current=show;setWarning(show)
      if(show)setSeconds(Math.max(0,Math.ceil((timing.expiresAt-now)/1000)))
    }
    const activity=(event:Event)=>{
      if(!event.isTrusted || document.visibilityState==='hidden' || warnRef.current)return
      tick()
      const current=state.current
      if(getToken() && current.timing && Date.now()-current.lastSent>=15000)void sync(true)
    }
    const resume=()=>{tick();if(getToken())void sync(false)}
    // Browser-generated scroll events can come from programmatic scrolling.
    // Track the deliberate input instead, so auto-refresh cannot keep a login alive.
    const events=['pointerdown','keydown','touchstart','touchmove','wheel']
    events.forEach(name=>document.addEventListener(name,activity,{capture:true,passive:true}))
    document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume)
    const timer=window.setInterval(tick,1000)
    tick()
    return ()=>{disposed=true;state.current={token:"",offset:0,lastSent:0,pending:false};clearInterval(timer);events.forEach(name=>document.removeEventListener(name,activity,true));document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume)}
  },[])
  if(!warning)return null
  return <Modal title="Your session will expire soon" onClose={()=>{}}>
    <p>You have been inactive. You’ll be signed out in {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}.</p>
    <p>Choose Stay signed in to continue and save any unfinished work. Otherwise, unsaved changes may be lost when the session ends.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="modal-actions"><Button variant="primary" disabled={busy} onClick={async()=>{setBusy(true);try{await send.current(true)}finally{setBusy(false)}}}>{busy?'Checking…':'Stay signed in'}</Button></div>
  </Modal>
}
