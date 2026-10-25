import type { Event } from "./model"
import { Button, Modal } from "./ui"
import type { NotificationAction } from "./notification-action"
import { NotificationSaveStatus, type NotificationSaveState } from "./useNotificationSettings"

export default function NotificationDetail({ notification, action, onOpen, onClose, saveState }: {
  notification: Event
  action?: NotificationAction
  onOpen: (action: NotificationAction) => void
  onClose: () => void
  saveState?: NotificationSaveState
}) {
  const time = new Date(notification.date)
  return <Modal title="Notification details" subtitle={Number.isNaN(time.getTime()) ? undefined : time.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} onClose={onClose}>
    <h3>{notification.title}</h3>
    <p className="notification-detail-message">{notification.detail.trim() || "No additional details were provided."}</p>
    {saveState && <NotificationSaveStatus {...saveState} />}
    <div className="modal-actions">
      <Button onClick={onClose}>Close</Button>
      {action && <Button variant="primary" icon="arrow" onClick={() => onOpen(action)}>{action.label}</Button>}
    </div>
  </Modal>
}
