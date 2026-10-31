import { useEffect, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Button, Icon, Modal } from "./ui"
import { dismissActionResult, feedbackSnapshot, showActionResult, subscribeFeedback } from "./action-feedback"
import "./action-feedback.css"

// Existing action handlers supply specific messages instead of transient toasts.
export function useActionMessage(message: string, clear: () => void, error = false) {
  const clearRef = useRef(clear)
  clearRef.current = clear
  useEffect(() => {
    if (!message) return
    showActionResult(message, error, error ? "Action needs attention" : "System message")
    clearRef.current()
  }, [message, error])
}
export default function ActionFeedback() {
  const { uploads, result } = useSyncExternalStore(subscribeFeedback, feedbackSnapshot, feedbackSnapshot)
  const visible = uploads === 0 && !!result
  useEffect(() => {
    if (!visible) return
    const app = document.getElementById("root")
    if (!app) return
    const previous = app.inert
    app.inert = true
    return () => { app.inert = previous }
  }, [visible])
  if (!uploads && !result) return null
  return createPortal(<div className={`action-feedback${uploads ? " action-feedback-upload" : ""}`}>
    {uploads ? <section className="action-upload-progress" role="status" aria-live="polite" aria-busy="true">
      <strong>Uploading and saving your file…</strong>
      <progress aria-label="File submission progress" aria-valuetext="Uploading and saving; awaiting server confirmation" />
      <span>Keep this page open until submission finishes. You do not need to submit again.</span>
    </section> : result && <Modal key="result" title={result.title} onClose={dismissActionResult}>
      <div className={`action-result${result.error ? " action-result-error" : ""}`}>
        <Icon name={result.error ? "alert" : result.title === "System message" ? "bell" : "check"} size={32} />
        <p role={result.error ? "alert" : "status"}>{result.message}</p>
        <Button variant="primary" onClick={dismissActionResult}>OK</Button>
      </div>
    </Modal>}
  </div>, document.body)
}
