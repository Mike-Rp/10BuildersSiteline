import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import "./intake-guidance.css"

export default function InfoPopover({ title, label, children }: { title: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (!open || !panel.current) return
    const el = panel.current
    // Native popovers enter the top layer, escaping scrolling/clipping inside modals,
    // while remaining DOM descendants of their modal's existing focus trap.
    if (typeof el.showPopover === "function") el.showPopover()
    else el.removeAttribute("popover")
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      if (!anchor) return
      const rect = el.getBoundingClientRect()
      const width = window.innerWidth, height = window.innerHeight
      el.style.left = `${Math.max(12, Math.min(anchor.left, width - rect.width - 12))}px`
      el.style.top = `${Math.max(12, Math.min(anchor.bottom + 8 + rect.height <= height - 12 ? anchor.bottom + 8 : anchor.top - rect.height - 8, height - rect.height - 12))}px`
    }
    position()
    closeButton.current?.focus({ preventScroll: true })
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, true)
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) => target instanceof Node && (panel.current?.contains(target) || trigger.current?.contains(target))
    const outside = (event: PointerEvent) => { if (!inside(event.target)) setOpen(false) }
    const focus = (event: FocusEvent) => { if (!inside(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault(); event.stopImmediatePropagation()
      setOpen(false); trigger.current?.focus()
    }
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("focusin", focus)
    document.addEventListener("keydown", escape, true)
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", focus); document.removeEventListener("keydown", escape, true) }
  }, [open])
  return <span className="intake-info">
    <button type="button" ref={trigger} className="intake-info-trigger" aria-label={label || `Help: ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10.5v6M12 7v1" /></svg>
    </button>
    {open && <div id={id} ref={panel} popover="manual" className="intake-info-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
      <div className="intake-info-heading"><strong id={`${id}-title`}>{title}</strong><button type="button" ref={closeButton} aria-label={`Close help: ${title}`} onClick={() => { setOpen(false); trigger.current?.focus() }}>×</button></div>
      <div>{children}</div>
    </div>}
  </span>
}
