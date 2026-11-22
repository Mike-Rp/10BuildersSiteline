import { useEffect, useState } from "react"
import { Badge, Button, Icon, Modal } from "./ui"
import { dateLabel } from "./model"
import { sortUrgentItems, type UrgentItem } from "./urgent-actions"
import "./urgent-action-banner.css"

export function useUrgencyNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  return now
}

export default function UrgentActionBanner({ items, title = "Priority items need your attention", label = "Priority action items", description, onOpen, className = "", note, soonLabel = "due soon", overdueLabel = "overdue / expired" }: {
  items: UrgentItem[]
  title?: string
  label?: string
  description?: string
  onOpen: (item: UrgentItem) => void
  className?: string
  note?: string
  soonLabel?: string
  overdueLabel?: string
}) {
  const [queueOpen, setQueueOpen] = useState(false)
  useEffect(() => {
    if (items.length < 2) setQueueOpen(false)
  }, [items.length])
  if (!items.length) return null
  const sorted = sortUrgentItems(items)
  const overdue = items.reduce((sum, item) => sum + (item.overdue ?? Number(item.urgency === "overdue")), 0)
  const soon = items.reduce((sum, item) => sum + (item.dueSoon ?? Number(item.urgency === "soon")), 0)
  const blocked = items.filter(item => item.urgency === "blocked").length
  const critical = overdue > 0 || blocked > 0
  const showQueue = queueOpen && items.length > 1
  const closeQueue = () => setQueueOpen(false)
  const renderItems = (rows: UrgentItem[]) => <div className="urgent-banner-items">{rows.map(item => <button key={item.key} type="button" className="urgent-banner-item"
    aria-label={item.actionLabel || (item.actionText ? `${item.actionText} for ${item.title}` : `Open priority item: ${item.title}`)}
    onClick={() => { closeQueue(); onOpen(item) }}>
    <span className="urgent-item-copy"><strong>{item.title}</strong><span>{item.detail}</span></span>
    <span className={`urgent-item-status ${item.urgency}`}><strong>{item.actionText ?? item.status}</strong>{item.actionText && item.status !== item.actionText && <span>{item.status}</span>}{item.due !== undefined && Number.isFinite(item.due) && <time dateTime={item.dateOnly ? new Date(item.due).toISOString().slice(0, 10) : new Date(item.due).toISOString()}>{item.dateOnly ? dateLabel(new Date(item.due).toISOString().slice(0, 10)) : new Date(item.due).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>}</span><Icon name="arrow" size={18} />
  </button>)}</div>
  return <><section className={`urgent-action-banner ${critical ? "urgent-critical" : "urgent-warning"} ${className}`} aria-label={label}>
    <div className="urgent-banner-heading">
      <span className="urgent-banner-icon" aria-hidden="true"><Icon name="alert" size={24} /></span>
      <div className="urgent-banner-copy"><span className="urgent-banner-eyebrow">{critical ? "Priority attention required" : "Your action required"}</span><h2>{title}</h2>
        <p>{description || `${items.length} ${items.length === 1 ? "item needs" : "items need"} attention in your current workspace.`}</p>
        <div className="urgent-banner-summary">{overdue > 0 && <Badge tone="red">{overdue} {overdueLabel}</Badge>}{soon > 0 && <Badge tone="amber">{soon} {soonLabel}</Badge>}{blocked > 0 && <Badge tone="red">{blocked} blocked</Badge>}{note && <span>{note}</span>}</div>
      </div>
      {items.length > 1 && <Button variant="primary" icon="arrow" aria-haspopup="dialog" onClick={() => setQueueOpen(true)}>View all priority items</Button>}
    </div>
    {renderItems(sorted.slice(0, 3))}
  </section>
    {showQueue && <Modal title="All priority items" subtitle={`${items.length} items need attention`} wide onClose={closeQueue}
      footer={<div className="modal-actions"><Button onClick={closeQueue}>Close</Button></div>}>
      {renderItems(sorted)}
    </Modal>}
  </>
}
