import { useCallback, useEffect, useRef, useState } from "react"

// Local organization timeout; the server remains authoritative about session validity.
export default function useIdleWarning(enabled: boolean, minutes: number, onExpire: () => void, sessionKey: string) {
  const [warning, setWarning] = useState(false)
  const expire = useRef(onExpire)
  expire.current = onExpire
  const restart = useRef<() => void>(() => {})
  useEffect(() => {
    setWarning(false)
    if (!enabled || !sessionKey) {
      restart.current = () => {}
      return
    }
    const timeout = Math.max(1, Number.isFinite(minutes) ? minutes : 15) * 60000
    // Short settings need time before the warning too: 1 minute warns at 48 seconds.
    const warningLead = Math.min(60000, timeout * 0.2)
    let warningTimer: number, expiryTimer: number
    let disposed = false
    const reset = () => {
      if (disposed) return
      window.clearTimeout(warningTimer)
      window.clearTimeout(expiryTimer)
      setWarning(false)
      warningTimer = window.setTimeout(() => setWarning(true), timeout - warningLead)
      expiryTimer = window.setTimeout(() => { setWarning(false); expire.current() }, timeout)
    }
    restart.current = reset
    const activity = (event: Event) => {
      if (event.isTrusted && document.visibilityState !== "hidden") reset()
    }
    const events = ["pointerdown", "keydown", "touchstart", "wheel"]
    events.forEach(name => window.addEventListener(name, activity, { passive: true }))
    reset()
    return () => {
      disposed = true
      restart.current = () => {}
      window.clearTimeout(warningTimer)
      window.clearTimeout(expiryTimer)
      events.forEach(name => window.removeEventListener(name, activity))
    }
  }, [enabled, minutes, sessionKey])
  const stayActive = useCallback(() => restart.current(), [])
  return { idleWarning: enabled && warning, stayActive }
}
