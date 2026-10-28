import { useEffect, useRef, useState } from "react"

const COMPACT_NAVIGATION = "(max-width: 1000px)"

export default function useSidebarNavigation(enabled = true) {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && (window.matchMedia?.(COMPACT_NAVIGATION).matches ?? window.innerWidth <= 1000))
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const expanded = compact ? mobileOpen : !desktopCollapsed
  const previousExpanded = useRef(expanded)

  useEffect(() => {
    // Move focus after React has hidden or revealed the menu button.
    if (enabled && previousExpanded.current !== expanded) {
      if (expanded) sidebarRef.current?.querySelector<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')?.focus()
      else toggleRef.current?.focus()
    }
    previousExpanded.current = expanded
  }, [enabled, expanded])

  useEffect(() => {
    if (!enabled) setMobileOpen(false)
  }, [enabled])

  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_NAVIGATION)
    if (!media) return
    const resize = () => {
      setCompact(media.matches)
      setMobileOpen(false)
    }
    media.addEventListener("change", resize)
    return () => media.removeEventListener("change", resize)
  }, [])

  useEffect(() => {
    if (!enabled || !compact || !mobileOpen) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const controls = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])
    controls()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      // A subsequently opened dialog owns its own keyboard interaction.
      if (document.querySelector('[aria-modal="true"]')) return
      if (event.key === "Escape") {
        event.preventDefault()
        setMobileOpen(false)
      }
      if (event.key === "Tab") {
        const elements = controls(), first = elements[0], last = elements.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", keyboard)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", keyboard)
      toggleRef.current?.focus()
    }
  }, [enabled, compact, mobileOpen])

  return {
    compact, expanded, toggleRef, sidebarRef,
    toggle: () => compact ? setMobileOpen(open => !open) : setDesktopCollapsed(collapsed => !collapsed),
    close: () => {
      if (compact) setMobileOpen(false)
      else setDesktopCollapsed(true)
    },
    closeMobile: () => setMobileOpen(false),
  }
}
