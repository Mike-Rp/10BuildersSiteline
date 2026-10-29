import { useEffect, useRef, useState } from "react"
import { Button, Modal } from "./ui"

type Options = {
  identity: string
  page: string
  dashboard?: string
  allowedPages: readonly string[]
  enabled: boolean
  blocked?: boolean
  navigate: (page: string) => void
  requestSignOut: () => void
}
type Destination = { page?: string; identity: string; from: string }
type Gesture = { id: number; x: number; y: number; started: number; page: string; identity: string; direction: number }
const excluded = "input,textarea,select,button,a,form,[contenteditable]:not([contenteditable=false]),[role=slider],[role=tablist],[aria-roledescription=carousel],[data-no-swipe],nav,aside,.notification-container"
const hasDialog = () => !!document.querySelector('[role="dialog"],dialog[open],[aria-modal="true"]')
const valueOf = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) =>
  element instanceof element.ownerDocument.defaultView!.HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? String(element.checked) : element.value

/** Workspace navigation only: never pushes browser history or guesses an external route. */
export default function useSwipeNavigation(options: Options) {
  const [surface,setSurface] = useState<HTMLDivElement | null>(null)
  const [pending,setPending] = useState<Destination>()
  const latest = useRef(options)
  latest.current = options
  const previous = useRef<{identity:string;page:string} | undefined>(undefined)
  const dirty = useRef(new Map<Element,string>())
  const origin = useRef({identity:options.identity,page:options.page})

  useEffect(()=>{
    if(origin.current.identity !== options.identity || !options.enabled) previous.current=undefined
    if(origin.current.page !== options.page || origin.current.identity !== options.identity || !options.enabled) {
      dirty.current.clear();setPending(undefined)
    }
    origin.current={identity:options.identity,page:options.page}
    if(options.enabled && options.page !== (options.dashboard || "Dashboard") && options.allowedPages.includes(options.page)) previous.current={identity:options.identity,page:options.page}
  },[options.identity,options.page,options.enabled,options.dashboard,options.allowedPages])

  function execute(destination: Destination) {
    const current=latest.current
    if(!current.enabled || current.blocked || current.identity!==destination.identity || current.page!==destination.from) return
    if(destination.page) {
      if(current.allowedPages.includes(destination.page)) current.navigate(destination.page)
    } else if(current.page===(current.dashboard || "Dashboard")) current.requestSignOut()
  }
  useEffect(()=>{
    if(!surface || !options.enabled || options.blocked) return
    let gesture: Gesture | undefined
    const baseline=new Map<Element,string>()
    const priorOverscroll=surface.style.overscrollBehaviorX
    surface.style.overscrollBehaviorX="contain"
    const cancel=()=>{gesture=undefined}
    const editable=(target: EventTarget | null) => {
      const el=target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
      if(!el?.matches?.("input,textarea,select") || el.closest('[role="dialog"],dialog,[role="search"],.filter-bar,.list-toolbar') || el.matches('input[type="search"],[role="searchbox"],[readonly],[disabled]')) return null
      return el.closest('form') || el.matches('textarea,input[type="file"],[data-unsaved-field]') ? el : null
    }
    const focus=(event: Event)=>{const el=editable(event.target);if(el && !baseline.has(el))baseline.set(el,valueOf(el))}
    const change=(event: Event)=>{
      const el=editable(event.target);if(!el)return
      const initial=baseline.get(el) ?? (el instanceof el.ownerDocument.defaultView!.HTMLSelectElement ? "" : el.defaultValue)
      if(valueOf(el)!==initial)dirty.current.set(el,initial);else dirty.current.delete(el)
    }
    const ignore=(target: EventTarget | null) => {
      let el=target as HTMLElement | null
      if(!el?.closest || el.closest(excluded)) return true
      while(el && el!==surface) {
        const overflow=el.ownerDocument.defaultView!.getComputedStyle(el).overflowX
        if(el.scrollWidth>el.clientWidth+2 && ["auto","scroll","hidden"].includes(overflow))return true
        el=el.parentElement
      }
      return false
    }
    const start=(event: TouchEvent)=>{
      cancel()
      if(event.touches.length!==1 || hasDialog() || ignore(event.target))return
      const touch=event.touches[0]
      // Native browser edge gestures own their entire gesture; never navigate twice.
      if(touch.clientX<=24 || touch.clientX>=window.innerWidth-24)return
      gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,started:event.timeStamp,page:latest.current.page,identity:latest.current.identity,direction:0}
    }
    const move=(event: TouchEvent)=>{
      if(!gesture)return
      if(event.touches.length!==1 || hasDialog()){cancel();return}
      const touch=Array.from(event.touches).find(t=>t.identifier===gesture!.id)
      if(!touch){cancel();return}
      const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y
      if(Math.abs(dy)>50 || (Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)*1.2)){cancel();return}
      if(Math.abs(dx)>=18 && Math.abs(dx)>Math.abs(dy)*1.7) {
        gesture.direction ||= Math.sign(dx)
        if(event.cancelable) event.preventDefault()
      }
    }
    const end=(event: TouchEvent)=>{
      const completed=gesture;cancel()
      if(!completed || event.touches.length || hasDialog() || completed.page!==latest.current.page || completed.identity!==latest.current.identity)return
      const touch=Array.from(event.changedTouches).find(t=>t.identifier===completed.id)
      if(!touch)return
      const dx=touch.clientX-completed.x,dy=touch.clientY-completed.y,duration=event.timeStamp-completed.started
      if(Math.abs(dx)<80 || Math.abs(dx)<Math.abs(dy)*1.7 || Math.abs(dy)>50 || duration<70 || duration>900 || (completed.direction && completed.direction!==Math.sign(dx)))return
      const current=latest.current,dashboard=current.dashboard || "Dashboard"
      let destination: Destination | undefined
      if(dx>0) destination={identity:current.identity,from:current.page,...(current.page!==dashboard?{page:dashboard}:{})}
      else if(current.page===dashboard && previous.current?.identity===current.identity && current.allowedPages.includes(previous.current.page)) destination={identity:current.identity,from:current.page,page:previous.current.page}
      if(!destination)return
      for(const el of dirty.current.keys())if(!el.isConnected || !surface.contains(el) || valueOf(el as HTMLInputElement)===dirty.current.get(el))dirty.current.delete(el)
      if(dirty.current.size)setPending(destination);else execute(destination)
    }
    surface.addEventListener('touchstart',start,{passive:true})
    surface.addEventListener('touchmove',move,{passive:false})
    surface.addEventListener('touchend',end,{passive:true})
    surface.addEventListener('touchcancel',cancel)
    surface.addEventListener('focusin',focus)
    surface.addEventListener('input',change)
    surface.addEventListener('change',change)
    window.addEventListener('blur',cancel)
    document.addEventListener('visibilitychange',cancel)
    return ()=>{
      surface.style.overscrollBehaviorX=priorOverscroll
      surface.removeEventListener('touchstart',start);surface.removeEventListener('touchmove',move);surface.removeEventListener('touchend',end);surface.removeEventListener('touchcancel',cancel)
      surface.removeEventListener('focusin',focus);surface.removeEventListener('input',change);surface.removeEventListener('change',change)
      window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel)
    }
  },[surface,options.enabled,options.blocked])
  return {ref:setSurface,dialog:pending ? <Modal title="Leave this module?" onClose={()=>setPending(undefined)}>
    <p>You have edited fields on this page. Leaving may discard changes that have not been saved.</p>
    <div className="modal-actions"><Button onClick={()=>setPending(undefined)}>Stay here</Button><Button variant="primary" onClick={()=>{dirty.current.clear();setPending(undefined);execute(pending)}}>Leave page</Button></div>
  </Modal> : null}
}
