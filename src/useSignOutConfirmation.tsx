import { useRef, useState } from "react"
import { Button, Modal } from "./ui"

export default function useSignOutConfirmation(onConfirm: () => void) {
  const [open, setOpen] = useState(false)
  const confirmed = useRef(false)
  return {
    request: () => { confirmed.current = false; setOpen(true) },
    dialog: open ? <Modal title="Log out of your account?" onClose={() => setOpen(false)}>
      <p>Are you sure you want to log out? You will need to sign in again to access your account.</p>
      <div className="modal-actions">
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" icon="logout" onClick={() => {
          if (confirmed.current) return
          confirmed.current = true
          setOpen(false)
          onConfirm()
        }}>Log Out</Button>
      </div>
    </Modal> : null,
  }
}
