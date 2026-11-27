import { useEffect, useState, type RefObject } from "react"
import { createPortal } from "react-dom"

export default function SidebarRailTooltip({ sidebar, enabled, page }: { sidebar: RefObject<HTMLElement | null>; enabled: boolean; page: string }) {
  const [tip, setTip] = useState<{ label: string; left: number; top: number }>()
  useEffect(() => {
    setTip(undefined)
    const rail = sidebar.current
    if (!enabled || !rail) return
    let activeTarget: HTMLElement | null = null
    const clear = () => { activeTarget = null; setTip(undefined) }
    const position = (target: HTMLElement | null) => {
      if (!target || !rail.contains(target)) { clear(); return }
      activeTarget = target
      const rect = target.getBoundingClientRect()
      setTip({ label: target.dataset.sidebarTooltip!, left: rail.getBoundingClientRect().right + 8, top: Math.min(window.innerHeight - 20, Math.max(20, rect.top + rect.height / 2)) })
    }
    const show = (event: Event) => position((event.target as Element).closest<HTMLElement>("[data-sidebar-tooltip]"))
    const scroll = () => { if (activeTarget && document.activeElement === activeTarget) position(activeTarget); else clear() }
    rail.addEventListener("mouseover", show)
    rail.addEventListener("focusin", show)
    rail.addEventListener("mouseleave", clear)
    rail.addEventListener("mouseout", clear)
    rail.addEventListener("focusout", clear)
    rail.addEventListener("click", clear)
    window.addEventListener("scroll", scroll, true)
    window.addEventListener("resize", clear)
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") clear() }
    document.addEventListener("keydown", keyboard)
    return () => {
      rail.removeEventListener("mouseover", show)
      rail.removeEventListener("focusin", show)
      rail.removeEventListener("mouseleave", clear)
      rail.removeEventListener("mouseout", clear)
      rail.removeEventListener("focusout", clear)
      rail.removeEventListener("click", clear)
      window.removeEventListener("scroll", scroll, true)
      window.removeEventListener("resize", clear)
      document.removeEventListener("keydown", keyboard)
    }
  }, [sidebar, enabled, page])
  return enabled && tip ? createPortal(<div role="tooltip" className="sidebar-rail-tooltip" style={{ left: tip.left, top: tip.top }}>{tip.label}</div>, document.body) : null
}
