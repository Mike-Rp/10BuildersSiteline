import { useEffect, useRef, useState, type FormEvent } from "react"
import { api, ApiError, tokenUser } from "./api/client"
import { activationErrors } from "./client-activation"
import { loginPath } from "./login-portal"
import { Button, Icon } from "./ui"
import "./client-owned-activation.css"

type Challenge = { verification_id: string; same_email: boolean; delivery: "local_capture" }
export default function ClientOwnedActivation({ embedded = false, onLinked, onLegacy, serviceAvailable = true, availabilityMessage }: {
  embedded?: boolean; onLinked?: () => void; onLegacy?: () => void; serviceAvailable?: boolean; availabilityMessage?: string
}) {
  const existing = tokenUser()?.role === "client"
  const [draft, setDraft] = useState({ code: "", email: "", password: "", confirmation: "" })
  const [codes, setCodes] = useState({ recipient_code: "", email_code: "" })
  const [challenge, setChallenge] = useState<Challenge>()
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (challenge || done) heading.current?.focus() }, [challenge, done])
  const computed = activationErrors(draft)
  const errors: Record<string, string | undefined> = challenge ? {
    recipient_code: codes.recipient_code.trim() ? undefined : "Enter the project recipient code.",
    email_code: challenge.same_email || codes.email_code.trim() ? undefined : "Enter the login email code.",
  } : existing ? { code: computed.code } : computed
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || done || !serviceAvailable) return
    setSubmitted(true)
    const first = fields.map(field => field.name).find(key => errors[key])
    if (first) { event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus(); return }
    lock.current = true; setBusy(true); setError(""); setFieldErrors({})
    try {
      if (!challenge) {
        const result = await api<Challenge & { status: string }>("/auth/client/register/start", { method: "POST", json: { ...draft, existing_account: existing } })
        if (["active", "linked"].includes(result.status)) {
          setDone(true); setDraft({ code: "", email: "", password: "", confirmation: "" }); return
        }
        if (result.status !== "verification_required" || !result.verification_id) throw new Error("Verification could not be confirmed.")
        setChallenge(result); setDraft(current => ({ ...current, password: "", confirmation: "" })); setSubmitted(false); setTouched({})
      } else {
        const result = await api<{ status: string }>("/auth/client/register/verify", { method: "POST", json: {
          code: draft.code.trim(), verification_id: challenge.verification_id, ...codes,
          email_code: challenge.same_email ? codes.recipient_code : codes.email_code, existing_account: existing,
        } })
        if (!["active", "linked"].includes(result.status)) throw new Error("Account access could not be confirmed.")
        setDone(true); setDraft({ code: "", email: "", password: "", confirmation: "" }); setCodes({ recipient_code: "", email_code: "" })
      }
    } catch (reason) {
      const failure = reason instanceof Error ? reason.message : "Could not complete this request. Try again."
      if (reason instanceof ApiError && reason.code === "CLIENT_EMAIL_UNAVAILABLE" && !challenge) setFieldErrors({ email: failure })
      else if (reason instanceof ApiError && ["ACTIVATION_CODE_INVALID", "ACTIVATION_CODE_EXPIRED", "ACTIVATION_CODE_USED"].includes(reason.code ?? "") && !challenge) setFieldErrors({ code: failure })
      else if (reason instanceof ApiError && reason.code === "VERIFICATION_CODE_INVALID") setFieldErrors({ recipient_code: failure, ...(challenge?.same_email ? {} : { email_code: "Check the code sent to your login email." }) })
      else setError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  const fields = challenge ? [
    { name: "recipient_code", label: "Project recipient verification code", type: "text" },
    ...(!challenge.same_email ? [{ name: "email_code", label: "Login email verification code", type: "text" }] : []),
  ] : [{ name: "code", label: "Activation code", type: "text" }, ...(!existing ? [
    { name: "email", label: "Email address", type: "email" },
    { name: "password", label: "Create password", type: "password" },
    { name: "confirmation", label: "Confirm password", type: "password" },
  ] : [])]
  const content = <div className="owned-activation-content">
    <h1 ref={heading} tabIndex={-1}>{done ? existing ? "Project linked" : "Account activated" : existing ? "Link another project" : "Activate your account"}</h1>
    {done ? <>
      <p role="status">{existing ? "The authorized project is linked to your account." : "Sign in with your email and 10BuildLine password."}</p>
      {existing && onLinked ? <Button variant="primary" onClick={onLinked}>View my projects</Button> : <a href={loginPath("client")}>Sign in</a>}
    </> : <>
      <p>{challenge ? "Verify the authorized project contact and your login email before access is granted." : existing ? "Redeem the code provided by 10 Builders using your current account." : "Use your own email and create a password for 10BuildLine."}</p>
      {!serviceAvailable && <p className="owned-activation-availability" role="status">{availabilityMessage || "Account registration is currently unavailable."}</p>}
      {challenge && <p className="owned-activation-local" role="status">Local test mode: verification messages were captured by the local mail service. No email was sent to a real inbox.</p>}
      <form noValidate onSubmit={submit} aria-busy={busy}>
        {fields.map(field => {
          const message = fieldErrors[field.name] || ((submitted || touched[field.name]) ? errors[field.name] : undefined)
          const password = field.type === "password"
          const value = challenge ? codes[field.name as keyof typeof codes] : draft[field.name as keyof typeof draft]
          return <div className="field" key={field.name}>
            <label htmlFor={`owned-${field.name}`}>{field.label}</label>
            <div className="owned-activation-input">
              <input id={`owned-${field.name}`} name={field.name} required disabled={busy || !serviceAvailable} value={value}
                type={password && visible[field.name] ? "text" : field.type} maxLength={password ? 128 : 254}
                autoComplete={password ? "new-password" : field.name === "email" ? "email" : "one-time-code"}
                aria-invalid={!!message} aria-describedby={message ? `owned-${field.name}-error` : undefined}
                onBlur={() => setTouched(current => ({ ...current, [field.name]: true }))}
                onChange={event => {
                  const next = event.target.value
                  if (challenge) setCodes(current => ({ ...current, [field.name]: next }))
                  else setDraft(current => ({ ...current, [field.name]: next }))
                  setFieldErrors(current => ({ ...current, [field.name]: "" })); setError("")
                }} />
              {password && <button type="button" className="owned-password-toggle" aria-label={`${visible[field.name] ? "Hide" : "Show"} ${field.label.toLowerCase()}`} onClick={() => setVisible(current => ({ ...current, [field.name]: !current[field.name] }))}><Icon name={visible[field.name] ? "eye-off" : "eye"} size={18} /></button>}
            </div>
            {message && <small id={`owned-${field.name}-error`} className="field-error" role="alert">{message}</small>}
          </div>
        })}
        {error && <p className="owned-activation-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || !serviceAvailable}>{busy ? "Please wait…" : challenge ? existing ? "Verify and link project" : "Verify and activate account" : existing ? "Verify project invitation" : "Activate account"}</Button>
        {challenge && <Button disabled={busy} onClick={() => { setChallenge(undefined); setCodes({ recipient_code: "", email_code: "" }); setError(""); setFieldErrors({}); setSubmitted(false); setTouched({}) }}>Start again</Button>}
      </form>
      {!existing && <p>Already have an account? <a href={loginPath("client")}>Sign in</a></p>}
      {onLegacy && <p><button type="button" className="owned-activation-legacy" onClick={onLegacy}>Use an earlier account activation code</button></p>}
    </>}
  </div>
  return embedded ? content : <main className="owned-activation-page"><section aria-label="Client activation">
    <div className="owned-activation-brand"><img src="/images/10-builders-logo.png" width="32" height="48" alt="" /><div><strong>10BuildLine</strong><span>10 Builders and Development Corporation</span></div></div>
    {content}</section></main>
}
