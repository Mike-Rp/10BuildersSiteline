import {useEffect,useRef,useState} from 'react'
import {api} from './api/client'
import {Button,Field,Modal} from './ui'
import './admin-security.css'
import { startPolling } from "./refresh-interval"
export type RecoveryStatus={configured:boolean;generatedAt?:string;refreshRequired:boolean;remaining:number;used:number;codes:{number:number;state:'used'|'available';usedAt?:string}[]}
const updated=()=>window.dispatchEvent(new Event('admin-recovery-updated'))
function PasswordInput({label,value,onChange,disabled,newPassword=false}:{label:string;value:string;onChange:(value:string)=>void;disabled:boolean;newPassword?:boolean}) {
 const [show,setShow]=useState(false)
 return <Field label={label}><div className="security-password"><input aria-label={label} type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} autoComplete={newPassword?'new-password':'current-password'} disabled={disabled} required/><Button variant="icon-button" icon={show?'eye-off':'eye'} aria-label={`${show?'Hide':'Show'} ${label.toLowerCase()}`} onClick={()=>setShow(!show)} disabled={disabled}/></div></Field>
}
function passwordError(password:string,confirmation:string){return password.length<8||new TextEncoder().encode(password).length>72?'Use at least 8 characters and no more than 72 UTF-8 bytes.':password!==confirmation?'The new passwords do not match.':''}
export function AdminRecoveryNotice({onManage}:{onManage:()=>void}) {
 const [status,setStatus]=useState<RecoveryStatus>()
 useEffect(()=>{
  let active=true
  const read=()=>api<RecoveryStatus>('/auth/admin/recovery-codes').then(s=>{if(active)setStatus(s)}).catch(()=>{})
  void read();const stop=startPolling(read)
  window.addEventListener('focus',read);window.addEventListener('admin-recovery-updated',read)
  return()=>{active=false;stop();window.removeEventListener('focus',read);window.removeEventListener('admin-recovery-updated',read)}
 },[])
 if(!status?.refreshRequired)return null
 return <section className="admin-recovery-notice" role="status"><div><strong>{status.remaining?'A recovery code was used':'No recovery codes remaining'}</strong><p>{status.remaining?'Generate a new set and store it securely. Your remaining codes still work until replaced.':'Generate a new set to preserve account recovery.'}</p></div><Button onClick={onManage}>Manage recovery codes</Button></section>
}
export default function AdminAccountSecurity({onClose,onPasswordChanged,initialTab='codes'}:{onClose:()=>void;onPasswordChanged:()=>unknown;initialTab?:'password'|'codes'}) {
 const [tab,setTab]=useState<'password'|'codes'>(initialTab),[status,setStatus]=useState<RecoveryStatus>(),[pack,setPack]=useState<{number:number;code:string}[]>(),[saved,setSaved]=useState(false)
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false)
 async function load(){setStatus(await api<RecoveryStatus>('/auth/admin/recovery-codes'))}
 useEffect(()=>{let active=true;void api<RecoveryStatus>('/auth/admin/recovery-codes').then(s=>{if(active)setStatus(s)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 function close(){if(busy)return;if(pack&&!saved){setError('Save your new recovery codes and confirm that you have stored them before closing.');return}onClose()}
 function switchTab(next:'password'|'codes'){if(pack&&!saved){setError('Save your new recovery codes before switching screens.');return}setPack(undefined);setTab(next);setCurrent('');setPassword('');setConfirmation('');setError('')}
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current)return;setError('')
  if(tab==='password'){const message=passwordError(password,confirmation);if(message){setError(message);return}}
  lock.current=true;setBusy(true)
  try {
   if(tab==='codes') {
    const data=await api<{codes:{number:number;code:string}[]}>('/auth/admin/recovery-codes',{method:'POST',json:{currentPassword:current}})
    setPack(data.codes);setSaved(false);setCurrent('');updated();await load()
   }else{
    await api('/auth/admin/change-password',{method:'POST',json:{currentPassword:current,password}})
    setCurrent('');setPassword('');setConfirmation('');await onPasswordChanged();onClose()
   }
  }catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 function contents(){return '10BuildLine administrator recovery codes\nKeep these offline and separate from your password. Each code can be used once.\n\n'+pack?.map(c=>`${c.number}. ${c.code}`).join('\n')+'\n\nGenerating a replacement set invalidates these codes.\n'}
 function download(){const url=URL.createObjectURL(new Blob([contents()],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='10BuildLine-admin-recovery-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 function print(){const frame=document.createElement('iframe');frame.title='Print recovery codes';frame.style.position='fixed';frame.style.width='0';frame.style.height='0';frame.style.border='0';document.body.appendChild(frame);const doc=frame.contentDocument;if(doc){doc.title='10BuildLine recovery codes';const pre=doc.createElement('pre');pre.textContent=contents();pre.style.whiteSpace='pre-wrap';doc.body.appendChild(pre);frame.contentWindow?.focus();frame.contentWindow?.print()}setTimeout(()=>frame.remove(),1000)}
 return <Modal title="My profile · Security" onClose={close}><section className="admin-security"><div className="security-tabs"><Button disabled={busy} onClick={()=>switchTab('password')} variant={tab==='password'?'primary':''}>Change password</Button><Button disabled={busy} onClick={()=>switchTab('codes')} variant={tab==='codes'?'primary':''}>Recovery codes</Button></div>
 {pack?<><h3>Your new recovery codes</h3><p>Shown once. Download or print these codes and keep them securely outside this website.</p><ol className="recovery-secret-list">{pack.map(c=><li key={c.number}><code>{c.code}</code></li>)}</ol><div className="security-buttons"><Button onClick={download}>Download codes</Button><Button onClick={print}>Print codes</Button></div><label className="recovery-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I have saved my new recovery codes securely.</label><div className="modal-actions"><Button variant="primary" disabled={!saved} onClick={close}>Done</Button></div></>:<form onSubmit={submit}>
 {tab==='codes'?<><h3>Recovery codes</h3>{status?.refreshRequired&&<p className="security-warning">A recovery code was used. Generate a new set and store it securely.</p>}{status?.configured?<><div className="recovery-counts"><span>{status.remaining} available</span><span>{status.used} used</span></div><ol className="recovery-status-list">{status.codes.map(c=><li className={c.state==='used'?'recovery-used':''} aria-disabled={c.state==='used'} key={c.number}><strong>Recovery code {c.number}</strong><span>{c.state==='used'?'✓ Used':'Available'}</span><small>{c.usedAt?new Date(c.usedAt).toLocaleString():'Single use'}</small></li>)}</ol><p>Full codes cannot be displayed again. Use your saved copy for recovery.</p></>:<p>No recovery codes are configured. Generate a set now, while you can sign in.</p>}<p className="security-warning">Generating a new set invalidates every code in the previous set.</p></>:<><h3>Change password</h3><p>Confirm your current password. After saving, sign in again with your new password.</p></>}
 <PasswordInput label="Current password" value={current} onChange={setCurrent} disabled={busy}/>
 {tab==='password'&&<><PasswordInput label="New password" value={password} onChange={setPassword} disabled={busy} newPassword/><PasswordInput label="Confirm new password" value={confirmation} onChange={setConfirmation} disabled={busy} newPassword/></>}
 <div className="modal-actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy||!current}>{busy?'Saving…':tab==='codes'?'Generate new set':'Save new password'}</Button></div>
 </form>}{error&&<p className="error" role="alert">{error}</p>}</section></Modal>
}
export function AdminRecoveryForm({onClose}:{onClose:()=>void}) {
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[token,setToken]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false)
 const lock=useRef(false)
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current)return;setError('')
  if(token){const message=passwordError(password,confirmation);if(message){setError(message);return}}
  lock.current=true;setBusy(true)
  try{if(!token){const data=await api<{resetToken:string}>('/auth/admin/recovery/verify',{method:'POST',json:{email,code}});setToken(data.resetToken);setCode('')}else{await api('/auth/admin/recovery/reset',{method:'POST',json:{resetToken:token,password}});setToken('');setPassword('');setConfirmation('');setDone(true)}}catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 return <Modal title="Recover administrator access" onClose={()=>{if(!busy)onClose()}}><section className="admin-security">{done?<><p role="status">Password reset. Sign in with your new password. A reminder to refresh recovery codes will appear after sign-in.</p><Button variant="primary" onClick={onClose}>Return to sign in</Button></>:<form onSubmit={submit}>{!token?<><p>Use one code from your saved recovery-code set. No email or SMS is sent.</p><Field label="Administrator email"><input aria-label="Recovery administrator email" type="email" autoComplete="username" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></Field><Field label="Recovery code"><input aria-label="Recovery code" value={code} maxLength={80} onChange={e=>setCode(e.target.value)} autoComplete="off" spellCheck={false} required disabled={busy}/></Field><p>If you have no unused recovery codes, contact the authorized system maintainer. A reset request cannot be approved by the same locked-out administrator.</p></>:<><p>Recovery code verified. Set your new password within five minutes. The code is consumed only when the reset succeeds.</p><PasswordInput label="New password" value={password} onChange={setPassword} disabled={busy} newPassword/><PasswordInput label="Confirm new password" value={confirmation} onChange={setConfirmation} disabled={busy} newPassword/></>}{error&&<p className="error" role="alert">{error}</p>}<div className="modal-actions"><Button disabled={busy} onClick={onClose}>Cancel</Button>{token&&<Button disabled={busy} onClick={()=>{setToken('');setError('');setPassword('');setConfirmation('')}}>Use another code</Button>}<Button type="submit" variant="primary" disabled={busy}>{busy?'Checking…':token?'Reset password':'Verify recovery code'}</Button></div></form>}</section></Modal>
}
