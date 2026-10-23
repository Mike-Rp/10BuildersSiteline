import { useEffect, useMemo, useState } from "react"
import { WELCOME_FADE_MS, type LoginGreeting } from "./dashboard-greeting"

export default function DashboardWelcome({ greeting, onDismiss }: { greeting?: LoginGreeting; onDismiss?: () => void }) {
  const [expiredAt, setExpiredAt] = useState<number>()
  const fadeDelay = useMemo(() => Math.max(0, (greeting?.expiresAt || 0) - Date.now() - WELCOME_FADE_MS), [greeting])
  useEffect(() => {
    if (!greeting) return
    const dismiss = () => {
      setExpiredAt(greeting.expiresAt)
      onDismiss?.()
    }
    const timer = setTimeout(dismiss, Math.max(0, greeting.expiresAt - Date.now()))
    const events = ["click", "keydown", "input"] as const
    events.forEach(event => window.addEventListener(event, dismiss, true))
    return () => {
      clearTimeout(timer)
      events.forEach(event => window.removeEventListener(event, dismiss, true))
    }
  }, [greeting, onDismiss])
  const remaining = greeting ? greeting.expiresAt - Date.now() : 0
  if (!greeting || remaining <= 0 || expiredAt === greeting.expiresAt) return null
  return (
    <p className="dashboard-welcome" style={{ animationDelay: `${fadeDelay}ms` }}>
      {greeting.message}
    </p>
  )
}
