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
type Gesture = { id: number; x: number; y: number; started: number; page: string; identity: string; direction: number; target: Element }
const excluded = "input,textarea,select,a,form,[contenteditable]:not([contenteditable=false]),[role=slider],[role=tablist],[aria-roledescription=carousel],[data-no-swipe],nav,aside,.notification-container"
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
    let mouse: Gesture | undefined
    let wheel: {x:number;y:number;page:string;identity:string;target:Element;blocked:boolean} | undefined
    let wheelTimer: ReturnType<typeof setTimeout> | undefined
    let suppressClick: {target:Element;until:number} | undefined
    const baseline=new Map<Element,string>()
    const priorOverscroll=surface.style.overscrollBehaviorX
    surface.style.overscrollBehaviorX="contain"
    const cancel=()=>{gesture=undefined;mouse=undefined;wheel=undefined;if(wheelTimer)clearTimeout(wheelTimer)}
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
    const insideEdge=(x:number)=>x<=24 || x>=window.innerWidth-24
    const rememberClick=(target:Element)=>{suppressClick={target:target.closest('button,[role="button"]') || target,until:performance.now()+500}}
    const navigateDirection=(dx:number,from:string,identity:string,target:Element,suppress=true)=>{
      const current=latest.current,dashboard=current.dashboard || "Dashboard"
      if(!current.enabled || current.blocked || hasDialog() || from!==current.page || identity!==current.identity)return
      if(suppress && target.closest('button,[role="button"]'))rememberClick(target)
      let destination: Destination | undefined
      if(dx>0)destination={identity,from,...(current.page!==dashboard?{page:dashboard}:{})}
      else if(current.page===dashboard && previous.current?.identity===identity && current.allowedPages.includes(previous.current.page))destination={identity,from,page:previous.current.page}
      if(!destination)return
      for(const el of dirty.current.keys())if(!el.isConnected || !surface.contains(el) || valueOf(el as HTMLInputElement)===dirty.current.get(el))dirty.current.delete(el)
      if(dirty.current.size)setPending(destination);else execute(destination)
    }
    const finish=(completed:Gesture,x:number,y:number,time:number,maxDuration=1500)=>{
      const dx=x-completed.x,dy=y-completed.y,duration=time-completed.started
      if(Math.abs(dx)<64 || Math.abs(dx)<Math.abs(dy)*1.5 || Math.abs(dy)>70 || duration<30 || duration>maxDuration || (completed.direction && completed.direction!==Math.sign(dx)))return
      navigateDirection(dx,completed.page,completed.identity,completed.target)
    }
    const start=(event: TouchEvent)=>{
      cancel()
      if(event.touches.length!==1 || hasDialog() || ignore(event.target))return
      const touch=event.touches[0]
      // Native edge gestures stay browser-owned; never add a second navigation.
      if(insideEdge(touch.clientX))return
      gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,started:event.timeStamp,page:latest.current.page,identity:latest.current.identity,direction:0,target:event.target as Element}
    }
    const move=(event: TouchEvent)=>{
      if(!gesture)return
      if(event.touches.length!==1 || hasDialog()){cancel();return}
      const touch=Array.from(event.touches).find(t=>t.identifier===gesture!.id)
      if(!touch){cancel();return}
      const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y
      if(Math.abs(dy)>70 || (Math.abs(dy)>20 && Math.abs(dy)>Math.abs(dx)*1.2)){cancel();return}
      if(Math.abs(dx)>=18 && Math.abs(dx)>Math.abs(dy)*1.5) {
        gesture.direction ||= Math.sign(dx)
        if(event.cancelable)event.preventDefault()
      }
    }
    const end=(event: TouchEvent)=>{
      const completed=gesture;gesture=undefined
      if(!completed || event.touches.length)return
      const touch=Array.from(event.changedTouches).find(t=>t.identifier===completed.id)
      if(touch)finish(completed,touch.clientX,touch.clientY,event.timeStamp)
    }
    const pointerStart=(event:PointerEvent)=>{
      if(event.pointerType!=="mouse" || event.button!==0 || event.isPrimary===false || hasDialog() || ignore(event.target) || insideEdge(event.clientX))return
      mouse={id:event.pointerId,x:event.clientX,y:event.clientY,started:event.timeStamp,page:latest.current.page,identity:latest.current.identity,direction:0,target:event.target as Element}
    }
    const pointerMove=(event:PointerEvent)=>{
      if(!mouse || event.pointerId!==mouse.id)return
      if(hasDialog() || event.buttons!==1){mouse=undefined;return}
      const dx=event.clientX-mouse.x,dy=event.clientY-mouse.y
      if(Math.abs(dy)>70 || (Math.abs(dy)>20 && Math.abs(dy)>Math.abs(dx)*1.2)){mouse=undefined;return}
      if(Math.abs(dx)>=18 && Math.abs(dx)>Math.abs(dy)*1.5){mouse.direction ||= Math.sign(dx);if(event.cancelable)event.preventDefault()}
    }
    const pointerEnd=(event:PointerEvent)=>{
      if(!mouse || event.pointerId!==mouse.id)return
      const completed=mouse;mouse=undefined
      if(window.getSelection()?.isCollapsed===false)return
      finish(completed,event.clientX,event.clientY,event.timeStamp,2500)
    }
    const pointerCancel=(event:PointerEvent)=>{if(mouse?.id===event.pointerId)mouse=undefined}
    const wheelMove=(event:WheelEvent)=>{
      if(gesture || mouse)return
      const scale=event.deltaMode===1?16:event.deltaMode===2?window.innerWidth:1
      if(!wheel)wheel={x:0,y:0,page:latest.current.page,identity:latest.current.identity,target:event.target as Element,blocked:event.ctrlKey || hasDialog() || ignore(event.target) || insideEdge(event.clientX)}
      wheel.x+=event.deltaX*scale;wheel.y+=Math.abs(event.deltaY*scale)
      if(event.ctrlKey || hasDialog() || (wheel.y>20 && wheel.y>Math.abs(wheel.x)*1.2))wheel.blocked=true
      if(!wheel.blocked && Math.abs(event.deltaX)>Math.abs(event.deltaY)*1.5 && event.cancelable)event.preventDefault()
      if(wheelTimer)clearTimeout(wheelTimer)
      // Wait for the whole trackpad stream, including momentum, to finish.
      wheelTimer=setTimeout(()=>{
        const completed=wheel;wheel=undefined
        if(completed && !completed.blocked && Math.abs(completed.x)>=100 && Math.abs(completed.x)>completed.y*1.5)
          navigateDirection(-completed.x,completed.page,completed.identity,completed.target,false)
      },220)
    }
    const click=(event:MouseEvent)=>{
      if(!suppressClick || performance.now()>suppressClick.until)return
      const target=event.target as Element
      if(target===suppressClick.target || suppressClick.target.contains(target) || target.contains(suppressClick.target)) {
        suppressClick=undefined;event.preventDefault();event.stopImmediatePropagation()
      }
    }
    surface.addEventListener('touchstart',start,{passive:true})
    surface.addEventListener('touchmove',move,{passive:false})
    surface.addEventListener('touchend',end,{passive:true})
    surface.addEventListener('touchcancel',cancel)
    surface.addEventListener('pointerdown',pointerStart)
    window.addEventListener('pointermove',pointerMove,{passive:false})
    window.addEventListener('pointerup',pointerEnd)
    window.addEventListener('pointercancel',pointerCancel)
    surface.addEventListener('wheel',wheelMove,{passive:false})
    surface.addEventListener('click',click,true)
    surface.addEventListener('focusin',focus)
    surface.addEventListener('input',change)
    surface.addEventListener('change',change)
    window.addEventListener('blur',cancel)
    document.addEventListener('visibilitychange',cancel)
    return ()=>{
      cancel()
      surface.style.overscrollBehaviorX=priorOverscroll
      surface.removeEventListener('pointerdown',pointerStart);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerEnd);window.removeEventListener('pointercancel',pointerCancel)
      surface.removeEventListener('wheel',wheelMove);surface.removeEventListener('click',click,true)
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
