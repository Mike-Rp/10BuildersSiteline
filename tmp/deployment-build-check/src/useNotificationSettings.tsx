import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { api, getToken } from "./api/client"
import type { State } from "./model"
import { clientProjectViews } from "./client-access"

export type NotificationSaveState = { pending: boolean; error: string }
export function NotificationSaveStatus({ pending, error }: NotificationSaveState) {
  if (error) return <div className="role-error" role="alert">{error}</div>
  return pending ? <p role="status">Saving notification changes…</p> : null
}

export default function useNotificationSettings(accountId: string, stateRef: MutableRefObject<State>, setState: Dispatch<SetStateAction<State>>, signedOut: boolean) {
  const current = useRef({ accountId, signedOut })
  current.current = { accountId, signedOut }
  const queue = useRef(Promise.resolve())
  const queueSession = useRef({ accountId: "", token: "" })
  const activeToken = getToken()
  const [status, setStatus] = useState<{ accountId: string; token: string; count: number; error: string }>({ accountId: "", token: "", count: 0, error: "" })
  const enqueue = (save: () => Promise<(state: State) => State>) => {
    const token = getToken()
    const valid = () => !!accountId && !!token && !current.current.signedOut && current.current.accountId === accountId && getToken() === token
    if (!valid()) return
    if (queueSession.current.accountId !== accountId || queueSession.current.token !== token) {
      queue.current = Promise.resolve()
      queueSession.current = { accountId, token }
    }
    setStatus(previous => ({ accountId, token, count: (previous.accountId === accountId && previous.token === token ? previous.count : 0) + 1, error: "" }))
    queue.current = queue.current.then(async () => {
      if (!valid()) return
      try {
        const apply = await save()
        if (!valid()) return
        const next = apply(stateRef.current)
        stateRef.current = next
        setState(next)
        setStatus(previous => ({ ...previous, error: "" }))
      } catch (error) {
        if (valid()) setStatus(previous => ({ ...previous, error: `Notification changes could not be saved. Your previous settings were kept. Try again. ${error instanceof Error ? error.message : ""}` }))
      } finally {
        if (valid()) setStatus(previous => ({ ...previous, count: Math.max(0, previous.count - 1) }))
      }
    })
  }
  return {
    pending: status.accountId === accountId && status.token === activeToken && status.count > 0,
    error: status.accountId === accountId && status.token === activeToken ? status.error : "",
    toggleMute(type: string) {
      if (!["request", "approval", "progress", "notice"].includes(type)) return
      enqueue(async () => {
        const muted = stateRef.current.userPreferences?.[accountId] || stateRef.current.muted
        const next = muted.includes(type) ? muted.filter(value => value !== type) : [...muted, type]
        await api("/workspace/preferences", { method: "POST", json: { muted: next } })
        return state => ({ ...state, muted: next, userPreferences: { ...state.userPreferences, [accountId]: next } })
      })
    },
    markRead(ids: string[], client = false) {
      enqueue(async () => {
        const allowed = new Set(client ? clientProjectViews(stateRef.current, accountId).flatMap(project => project.history.map(item => item.id)) : stateRef.current.events.map(event => event.id))
        const requested = [...new Set(ids.filter(id => allowed.has(id)))]
        if (!requested.length) return state => state
        const saved = await api<{ ids: string[] }>("/notifications/read", { method: "POST", json: { ids: requested } })
        if (!Array.isArray(saved?.ids)) throw new Error("The server did not confirm the saved notification reads.")
        const accepted = saved.ids.filter(id => requested.includes(id))
        const read = new Set(accepted)
        return state => client ? ({ ...state, portalReads: { ...state.portalReads, [accountId]: [...new Set([...(state.portalReads?.[accountId] || []), ...accepted])] } }) : ({
          ...state, events: state.events.map(event => read.has(event.id) ? { ...event, read: true, readBy: [...new Set([...(event.readBy || []), accountId])] } : event),
        })
      })
    },
  }
}
