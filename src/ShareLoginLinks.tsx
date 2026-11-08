import { useRef, useState } from "react"
import { shareLoginPath, type LoginPortal } from "./login-portal"
import { Button, Modal } from "./ui"
import "./share-login-links.css"

const portals: { portal: LoginPortal; title: string; description: string }[] = [
  { portal: "admin", title: "Administrator", description: "Administrator sign-in" },
  { portal: "staff", title: "Staff — Office PM & Site PM", description: "Staff sign in and open the workspace assigned to their account." },
  { portal: "client", title: "Client", description: "Client sign-in" },
]

function LoginLink({ portal, title, description }: typeof portals[number]) {
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState("")
  const url = new URL(shareLoginPath(portal), window.location.origin).href
  async function copy() {
    try {
      await window.navigator.clipboard.writeText(url)
      setMessage("Link copied.")
    } catch {
      input.current?.focus()
      input.current?.select()
      setMessage("Copy is unavailable. Copy the selected link manually.")
    }
  }
  return <section className="share-login-link" aria-labelledby={`share-${portal}-title`}>
    <h3 id={`share-${portal}-title`}>{title}</h3>
    <p>{description}</p>
    <div className="share-login-link-actions">
      <input ref={input} aria-label={`${title} login link`} readOnly value={url} onFocus={event => event.currentTarget.select()} />
      <Button onClick={copy} aria-label={`Copy ${title} login link`}>Copy link</Button>
    </div>
    <span role="status">{message}</span>
  </section>
}

export default function ShareLoginLinks({ onClose }: { onClose: () => void }) {
  return <Modal title="Share login links" onClose={onClose}>
    <div className="share-login-links">
      <p>Copy the appropriate link and share it with the account holder. Each person signs in with their own account.</p>
      {portals.map(item => <LoginLink key={item.portal} {...item} />)}
      <p className="share-login-links-note">These links open the login page. Access depends on the role assigned to the account.</p>
      <div className="share-login-links-footer"><Button onClick={onClose}>Close</Button></div>
    </div>
  </Modal>
}
