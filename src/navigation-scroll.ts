import { useLayoutEffect, useRef } from "react"

function scrollToSection(target: Element) {
  const dialogBody = target.closest<HTMLElement>(".modal-body")
  if (dialogBody) {
    if (target === dialogBody) dialogBody.scrollTop = 0
    else dialogBody.scrollTop += target.getBoundingClientRect().top - dialogBody.getBoundingClientRect().top
  } else target.scrollIntoView?.({ block: "start", behavior: "instant" })
}

// CSS scroll-padding keeps section headings clear of the sticky mobile header.
export function useScrollOnChange(key: string, list = false) {
  const ref = useRef<HTMLElement>(null)
  const previous = useRef(key)
  useLayoutEffect(() => {
    if (previous.current !== key && ref.current) {
      if (list) scrollListAfterChange(ref.current)
      else scrollToSection(ref.current)
    }
    previous.current = key
  }, [key, list])
  return ref
}

export function scrollListAfterChange(control: HTMLElement) {
  const target = control.closest("section, .panel, .ao-panel, .modal-body") ?? control.parentElement
  const scroll = () => { if (target?.isConnected) scrollToSection(target) }
  if (window.requestAnimationFrame) window.requestAnimationFrame(scroll)
  else window.setTimeout(scroll, 0)
}
