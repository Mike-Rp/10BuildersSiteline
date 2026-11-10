import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "./ui"

export type TourStep = { title: string; detail: string; page: string; selector?: string; control?: string; readySelector?: string; prerequisite?: { selector: string; readySelector: string; detail: string }; emptySelector?: string; emptyMessage?: string; group?: string }

export function findTourTarget(step: TourStep): HTMLElement | undefined {
  const visible = (el: HTMLElement) => !el.closest('[inert], [hidden], .contextual-tour, .workspace-guide-content') && el.getClientRects().length > 0
  if (step.selector) return [...document.querySelectorAll<HTMLElement>(step.selector)].find(visible)
  return [...document.querySelectorAll<HTMLElement>('button, input, select, [role="tab"]')].find(el => visible(el) &&
    (el.getAttribute("aria-label") || el.textContent || "").trim() === (step.control || step.page))
}

export default function ContextualTour({ steps, index, title, onIndex, onClose, onTopics, onNavigate }: {
  steps: TourStep[]; index: number; title: string; onIndex: (index: number) => void;
  onClose: () => void; onTopics: () => void; onNavigate: (page: string) => void
}) {
  const step = steps[index]
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate
  const lastPage = useRef("")
  const card = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLElement>()
  const [waiting, setWaiting] = useState(false)
  const [prerequisiteWaiting, setPrerequisiteWaiting] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number }>()
  const [position, setPosition] = useState({ left: 16, top: 16, below: true })
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight })
  useEffect(() => {
    if (lastPage.current !== step.page) {
      navigateRef.current(step.page)
      lastPage.current = step.page
    }
    setTarget(undefined)
    setRect(undefined)
    let previous: HTMLElement | undefined
    const update = () => {
      setViewport(old => old.width === innerWidth && old.height === innerHeight ? old : { width: innerWidth, height: innerHeight })
      const prerequisite = step.prerequisite && !document.querySelector(step.prerequisite.readySelector)
      setPrerequisiteWaiting(!!prerequisite)
      const found = findTourTarget(prerequisite ? { ...step, selector: step.prerequisite!.selector } : step)
      setWaiting(!!prerequisite || !!step.readySelector && !document.querySelector(step.readySelector))
      setEmpty(!prerequisite && !!step.emptySelector && !!document.querySelector(step.emptySelector))
      if (found !== previous) {
        previous = found
        found?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
        setTarget(found)
      }
      const box = found?.getBoundingClientRect()
      const next = box ? { left: Math.max(4, box.left - 6), top: Math.max(4, box.top - 6), width: Math.min(innerWidth - 8, box.width + 12), height: Math.min(innerHeight - 8, box.height + 12) } : undefined
      setRect(old => JSON.stringify(old) === JSON.stringify(next) ? old : next)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-expanded", "aria-selected", "style"] })
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true) }
  }, [step])
  useLayoutEffect(() => {
    const box = card.current?.getBoundingClientRect()
    const width = box?.width || 420, height = box?.height || 320
    const below = !!rect && rect.top + rect.height + height + 24 <= innerHeight
    setPosition({ left: rect ? Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) : Math.max(12, (innerWidth - width) / 2), top: rect ? Math.max(12, Math.min(innerHeight - height - 12, below ? rect.top + rect.height + 14 : rect.top - height - 14)) : Math.max(12, (innerHeight - height) / 2), below })
  }, [rect, step, target, viewport, waiting, empty, prerequisiteWaiting])
  useEffect(() => { card.current?.focus() }, [index])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose() } }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [onClose])
  const shade = (style: React.CSSProperties, key: string) => <div key={key} className="tour-shade" style={style} />
  return createPortal(<div className="contextual-tour">
    {rect ? <>
      {shade({ inset: `0 0 auto 0`, height: rect.top }, "top")}
      {shade({ top: rect.top, left: 0, width: rect.left, height: rect.height }, "left")}
      {shade({ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }, "right")}
      {shade({ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }, "bottom")}
      <div className="tour-spotlight" style={rect} />
    </> : shade({ inset: 0 }, "all")}
    <div ref={card} tabIndex={-1} role="dialog" aria-label={`${title}: ${step.title}`} aria-describedby="tour-description" className="tour-tooltip" style={{ left: position.left, top: position.top }} onKeyDown={event => {
      if (event.key !== "Tab") return
      const buttons = [...(card.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      event.stopPropagation()
    }}>
      {rect && <span aria-hidden="true" className={`tour-pointer ${position.below ? "below" : "above"}`} style={{ position: "fixed", top: position.below ? position.top - 6 : position.top + (card.current?.offsetHeight || 320) - 6, bottom: "auto", left: position.left + Math.max(20, Math.min((card.current?.offsetWidth || 420) - 30, rect.left + rect.width / 2 - position.left)) }} />}
      <div className="tour-heading"><small aria-live="polite">{title} · Step {index + 1} of {steps.length}</small><Button variant="icon-button" icon="close" aria-label="Exit walkthrough" onClick={onClose} /></div>
      <h3>{step.title}</h3><p id="tour-description">{prerequisiteWaiting && step.prerequisite ? step.prerequisite.detail : step.detail}</p>
      {empty ? <p className="tour-unavailable" role="status">{step.emptyMessage || "No evidence is awaiting review. You can skip this section."}</p> : !target && <p className="tour-unavailable" role="status">This step needs an open project or form. You can return to the previous step, skip this step, or exit and open the relevant record.</p>}
      {waiting && target && <p role="status">Click the highlighted control to continue.</p>}
      {target && <p className="workspace-guide-note">Use the highlighted control when ready. The guide stays open.</p>}
      <div className="workspace-guide-controls"><Button onClick={onClose}>Exit tour</Button><Button disabled={index === 0} onClick={() => onIndex(index - 1)}>Back</Button>{empty ? <Button variant="primary" onClick={() => { const next = steps.findIndex((s, i) => i > index && s.group !== step.group); next < 0 ? onClose() : onIndex(next) }}>Skip this section</Button> : <Button disabled={waiting && !!target} variant="primary" onClick={() => index + 1 === steps.length ? onClose() : onIndex(index + 1)}>{index + 1 === steps.length ? "Finish" : target ? "Next" : "Skip this step"}</Button>}</div>
      <button className="tour-topics" onClick={onTopics}>All guide topics</button>
    </div>
  </div>, document.body)
}
