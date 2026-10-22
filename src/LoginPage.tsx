import { api } from "./api/client"
import { useState, type FormEvent } from "react"
import WorkspaceSkeleton from "./LoadingSkeleton"
import type { Role } from "./model"
import { Button, Field, Icon, Modal } from "./ui"
import { SIGN_IN_MESSAGES, validateSignInFields } from "./signInPolicy"
import "./login-page.css"
import LoginBanner from "./LoginBanner"

export default function LoginPage({
  checkingSession = false,
  workspaceRole,
  onSignIn,
}: {
  checkingSession?: boolean
  workspaceRole?: Role
  onSignIn: (email: string, password: string) => Promise<void>
}) {
  const [resetOpen, setResetOpen] = useState(false)
  const [resetName, setResetName] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMessage, setResetMessage] = useState("")
  const [resetError, setResetError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [touched, setTouched] = useState({ email: false, password: false })
  const [submitted, setSubmitted] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  // Field errors appear on submit and when a field is left (blur).
  const fieldErrors = validateSignInFields(email, password)
  const emailError =
    submitted || touched.email ? fieldErrors.email : undefined
  const passwordError =
    submitted || touched.password ? fieldErrors.password : undefined
  const touch = (field: "email" | "password") =>
    setTouched((current) => ({ ...current, [field]: true }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSubmitted(true)
    if (fieldErrors.email || fieldErrors.password) return
    setLoading(true)
    try {
      await onSignIn(email.trim(), password)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : SIGN_IN_MESSAGES.mismatch,
      )
    } finally {
      setLoading(false)
    }
  }

  if (workspaceRole) return <WorkspaceSkeleton role={workspaceRole} />
  return (
    <main className="login-page login-redesign">
      {resetOpen && <Modal title="Request a password reset" onClose={() => { if (!resetBusy) setResetOpen(false) }}>
        {resetMessage ? <><p role="status">{resetMessage}</p><Button onClick={() => setResetOpen(false)}>Done</Button></> : <form onSubmit={async event => {
          event.preventDefault(); setResetBusy(true); setResetError("")
          try { await api("/auth/password-reset-request", { method: "POST", json: { name: resetName, email: resetEmail } }); setResetMessage("If your work email matches an account, your request has been sent to the administrator.") }
          catch (e) { setResetError((e as Error).message) } finally { setResetBusy(false) }
        }}>
          <Field label="Full name"><input required autoComplete="name" value={resetName} onChange={e => setResetName(e.target.value)} /></Field>
          <Field label="Work email"><input required type="email" autoComplete="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} /></Field>
          {resetError && <p className="error" role="alert">{resetError}</p>}
          <div className="modal-actions"><Button disabled={resetBusy} onClick={() => setResetOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={resetBusy}>{resetBusy ? "Sending?" : "Send to administrator"}</Button></div>
        </form>}
      </Modal>}
      <div className="login-card">
        <section className="login-panel" aria-label="Log in">
          <div className="login-brand">
            <span className="brand-mark">
              <Icon name="building" size={28} />
            </span>
            <span>
              <strong>SITELINE</strong>
              <small>10 Builders</small>
            </span>
          </div>

          <div className="login-content">
            <div className="login-heading">
              <h1>Welcome to SITELINE</h1>
              <p>Enter the credentials issued by your administrator.</p>
            </div>

            <form className="login-form" onSubmit={submit} noValidate>
              <Field
                label="Work Email or Username"
                error={emailError ? `⚠ ${emailError}` : undefined}
              >
                <input
                  type="text"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="username"
                  placeholder="name@10builders.com"
                  value={email}
                  disabled={loading || checkingSession}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setError("")
                  }}
                  onBlur={() => touch("email")}
                  aria-invalid={Boolean(error || emailError)}
                  required
                />
              </Field>
              <Field
                label="Password"
                error={passwordError ? `⚠ ${passwordError}` : undefined}
              >
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    aria-label="Password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    disabled={loading || checkingSession}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError("")
                    }}
                    onKeyDown={(event) =>
                      setCapsLock(event.getModifierState("CapsLock"))
                    }
                    onKeyUp={(event) =>
                      setCapsLock(event.getModifierState("CapsLock"))
                    }
                    onBlur={() => {
                      touch("password")
                      setCapsLock(false)
                    }}
                    aria-invalid={Boolean(error || passwordError)}
                    required
                  />
                  <Button
                    variant="text-button password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={`${showPassword ? "Hide" : "Show"} password`}
                    disabled={loading || checkingSession}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>
              </Field>
              {capsLock && (
                <small className="field-error caps-lock-warning" role="status">
                  ⚠ {SIGN_IN_MESSAGES.capsLock}
                </small>
              )}
              <p className="login-help">
                <a href="#password-reset" onClick={event => { event.preventDefault(); setResetOpen(true); setResetMessage(""); setResetError("") }}>Forgot password?</a>
              </p>
              {error && (
                <div className="login-error" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{error}</span>
                </div>
              )}
              <Button
                type="submit"
                variant="primary full-width login-submit"
                disabled={loading || checkingSession}
              >
                {checkingSession
                  ? "Checking session…"
                  : loading
                    ? "Signing in…"
                    : "Log In"}
              </Button>
            </form>
          </div>

        </section>

        <LoginBanner />
      </div>
    </main>
  )
}
