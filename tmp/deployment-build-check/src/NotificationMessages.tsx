import { useMemo, useState, type ReactNode } from "react"
import { Button } from "./ui"

const BATCH_SIZE = 8
const timestamp = (date: string) => {
  const value = Date.parse(date)
  return Number.isFinite(value) ? value : -Infinity
}

// Mounted only while the bell is open: closing discards the expanded history and scroll position.
// These are pages of the account's already-loaded messages, not a new server notification API.
export default function NotificationMessages<T extends { id: string; date: string }>({ items, renderItems, empty }: {
  items: T[]
  renderItems: (items: T[]) => ReactNode
  empty: ReactNode
}) {
  const [limit, setLimit] = useState(BATCH_SIZE)
  const ordered = useMemo(() => items.slice().sort((a, b) => {
    const first = timestamp(a.date), second = timestamp(b.date)
    return (first === second ? 0 : first > second ? -1 : 1) || b.id.localeCompare(a.id, undefined, { numeric: true })
  }), [items])
  const shown = Math.min(limit, ordered.length)
  const more = shown < ordered.length
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const item of ordered.slice(0, shown)) {
    const date = new Date(item.date)
    const valid = Number.isFinite(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown"
    const label = valid ? date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Date unavailable"
    const group = groups[groups.length - 1]
    if (group?.key === key) group.items.push(item)
    else groups.push({ key, label, items: [item] })
  }
  const showOlder = () => setLimit(previous => Math.min(previous + BATCH_SIZE, ordered.length))
  return <div className="notification-scroll" role="region" aria-label="Notification messages" tabIndex={0}
    onScroll={event => {
      const container = event.currentTarget
      if (more && container.scrollTop > 0 && container.scrollHeight - container.clientHeight - container.scrollTop <= 80) showOlder()
    }}>
    {groups.length ? groups.map(group => <section className="notification-date-group" key={group.key} aria-label={group.label}>
      <h4 className="notification-date-heading">{group.label}</h4>
      {renderItems(group.items)}
    </section>) : empty}
    {!!ordered.length && <div className="notification-history-status">
      <p role="status">Showing {shown} of {ordered.length} notifications</p>
      {more ? <Button onClick={showOlder}>Show older notifications</Button> : <p>You’ve reached the oldest available notification.</p>}
    </div>}
  </div>
}
