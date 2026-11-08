import { useLayoutEffect, useRef } from "react"
import { tokenUser } from "./api/client"
import { isLandingPath, loginBackNavigation } from "./login-portal"

type LoginNavigateEvent = Event & {
  navigationType: string
  canIntercept: boolean
  destination: { url: string; index: number; sameDocument: boolean }
}

export default function useLoginBackConfirmation(enabled: boolean, accountId: string, onRequest: () => void) {
  const request = useRef(onRequest)
  request.current = onRequest
  useLayoutEffect(() => {
    const navigation = loginBackNavigation()
    if (!enabled || !navigation) return
    const navigating = (event: Event) => {
      const next = event as LoginNavigateEvent
      const currentIndex = navigation.currentEntry?.index
      if (next.defaultPrevented || !next.cancelable || !next.canIntercept || next.navigationType !== "traverse") return
      if (!next.destination.sameDocument || currentIndex === undefined || next.destination.index < 0 || next.destination.index >= currentIndex) return
      // Read the token at navigation time, not just when the listener mounted.
      // Expiry/logout must never be blocked by a stale authenticated render.
      if (tokenUser()?.id !== accountId) return
      const destination = new URL(next.destination.url)
      if (destination.origin !== window.location.origin || !isLandingPath(destination.pathname)) return
      next.preventDefault()
      if (next.defaultPrevented && !document.querySelector('[role="dialog"][aria-label="Are you sure you want to log out?"]')) request.current()
    }
    navigation.addEventListener("navigate", navigating)
    return () => navigation.removeEventListener("navigate", navigating)
  }, [enabled, accountId])
}
