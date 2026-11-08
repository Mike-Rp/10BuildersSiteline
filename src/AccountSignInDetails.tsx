import { useEffect, useRef, useState } from "react"
import { initials, ROLE_NAMES, type Role } from "./model"
import { shareLoginPath, loginPortalForRole } from "./login-portal"
import { Badge, Button, Icon, Modal } from "./ui"
import "./account-sign-in-details.css"

export type CreatedAccountDetails = {
  name: string
  email: string
  password: string
  role: Role
  credentialDecision?: "pending" | "verified"
}

export default function AccountSignInDetails({ details, onClose }: { details: CreatedAccountDetails; onClose: () => void }) {
  const url = new URL(shareLoginPath(loginPortalForRole(details.role)), window.location.origin).href
  const [message, setMessage] = useState("")
  const [manualCopy, setManualCopy] = useState("")
  const manual = useRef<HTMLTextAreaElement>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const rows = [
    { label: "Site Login Link", value: url, button: "Copy Link" },
    { label: details.role === "client" ? "Email Address" : "Work Email", value: details.email, button: "Copy Email" },
    { label: "Temporary Password", value: details.password, button: "Copy Password" },
  ]
  const allDetails = [
    `Name: ${details.name}`, `Role: ${ROLE_NAMES[details.role]}`,
    ...rows.map(row => `${row.label}: ${row.value}`),
    "Change the temporary password on first sign-in.",
    ...(details.role === "client" ? ["Client sign-in requires project activation."] : []),
  ].join("\n")
  useEffect(() => { if (manualCopy) { manual.current?.focus(); manual.current?.select() } }, [manualCopy])
  async function copy(value: string, label?: string) {
    try {
      await window.navigator.clipboard.writeText(value)
      setManualCopy(""); setMessage(label ? `${label} copied.` : "All sign-in details copied.")
    } catch {
      if (label) { inputs.current[label]?.focus(); inputs.current[label]?.select() }
      else setManualCopy(value)
      setMessage("Copy is unavailable. Copy the selected text manually.")
    }
  }
  return <Modal title="Account Created — Sign-In Details" onClose={onClose}>
    <div className="account-sign-in-details">
      <p className="account-created-success"><Icon name="check" size={20} />Account created successfully</p>
      <div className="created-account-identity"><span className="avatar">{initials(details.name)}</span><h3>{details.name}</h3><Badge>{ROLE_NAMES[details.role]}</Badge></div>
      {details.credentialDecision && <p className="created-account-note">{details.credentialDecision === "verified" ? "Credentials verified. Account activation and allocation eligibility checks still apply." : "Credentials are awaiting Admin verification."}</p>}
      {rows.map(row => <div className="created-account-field" key={row.label}>
        <label htmlFor={`created-${row.button.replace(/ /g, "-")}`}>{row.label}</label>
        <div><input id={`created-${row.button.replace(/ /g, "-")}`} ref={element => { inputs.current[row.label] = element }} readOnly value={row.value} onFocus={event => event.currentTarget.select()} autoComplete="off" spellCheck={false} />
          <Button onClick={() => void copy(row.value, row.label)}>{row.button}</Button></div>
      </div>)}
      <p className="created-account-note">Temporary password is shown once. The user must change it on first sign-in.</p>
      <div className="notice neutral"><Icon name="shield" size={18} /><p>{details.role === "client" ? "This link opens Client login. Sign-in remains blocked until project activation." : `This link opens ${details.role === "admin" ? "Administrator" : "Staff"} login. The account role determines the workspace.`}</p></div>
      <p role="status" className="created-account-copy-status">{message}</p>
      {manualCopy && <textarea ref={manual} readOnly value={manualCopy} aria-label="Sign-in details for manual copying" rows={7} />}
      <div className="modal-actions"><Button onClick={onClose}>Done</Button><Button variant="primary" onClick={() => void copy(allDetails)}>Copy All Sign-In Details</Button></div>
    </div>
  </Modal>
}
