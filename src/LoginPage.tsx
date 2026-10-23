import { api, ApiError } from "./api/client"
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
  sessionMessage,
  onSignIn,
}: {
  checkingSession?: boolean
  workspaceRole?: Role
  sessionMessage?: string
  onSignIn: (email: string, password: string, replaceSession?: boolean) => Promise<void>
}) {
  const [resetOpen, setResetOpen] = useState(false)
  const [resetFirstName, setResetFirstName] = useState("")
  const [resetMiddleName, setResetMiddleName] = useState("")
  const [resetLastName, setResetLastName] = useState("")
  const [resetStep, setResetStep] = useState<"name" | "confirm" | "contact">("name")
  const [resetEmail, setResetEmail] = useState("")
  const [resetAccounts, setResetAccounts] = useState<{ name: string; email: string }[]>([])
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMessage, setResetMessage] = useState("")
  const [resetError, setResetError] = useState("")
  const capitalizeName = (value: string) => value.replace(/(^|[\s'’-])\p{L}/gu, letter => letter.toLocaleUpperCase())
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [deviceChoice, setDeviceChoice] = useState(false)
  const [deviceNotice, setDeviceNotice] = useState("")
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
    if (loading || deviceChoice) return
    setError("")
    setSubmitted(true)
    if (fieldErrors.email || fieldErrors.password) return
    await attemptSignIn(false)
  }
  async function attemptSignIn(replaceSession: boolean) {
    setError("")
    setDeviceNotice("")
    setLoading(true)
    try {
      await onSignIn(email.trim(), password, replaceSession)
      setDeviceChoice(false)
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "ACCOUNT_ALREADY_SIGNED_IN") {
        setDeviceChoice(true)
        return
      }
      setDeviceChoice(false)
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
  const keepCurrentDevice = () => {
    if (loading) return
    setDeviceChoice(false)
    setPassword("")
    setSubmitted(false)
    setTouched(current => ({ ...current, password: false }))
    setDeviceNotice("Your current device will stay signed in.")
  }
  return (
    <main className="login-page login-redesign">
      {deviceChoice && <Modal title="Account already signed in" onClose={keepCurrentDevice}>
        <p>Your account is already logged in on another device.</p>
        <p className="subsection">Choose where you want to continue. Logging in on this device will sign out the other device.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button disabled={loading} onClick={keepCurrentDevice}>Keep current device signed in</Button>
          <Button variant="primary" disabled={loading} onClick={() => { void attemptSignIn(true) }}>{loading ? "Signing in…" : "Log in on this device"}</Button>
        </div>
      </Modal>}
      {resetOpen && <Modal title="Request a password reset" onClose={() => { if (!resetBusy) setResetOpen(false) }}>
        {resetMessage ? <><p role="status">{resetMessage}</p><Button onClick={() => setResetOpen(false)}>Done</Button></> : <form onSubmit={async event => {
          event.preventDefault(); setResetBusy(true); setResetError("")
          try {
            const names = { firstName: resetFirstName.trim(), middleName: resetMiddleName.trim(), lastName: resetLastName.trim() }
            if (resetStep === "name") {
              const result = await api<{ accounts: { name: string; email: string }[] }>("/auth/password-reset-lookup", { method: "POST", json: names })
              setResetAccounts(result.accounts)
              if (result.accounts.length) { setResetEmail(result.accounts.length === 1 ? result.accounts[0].email : ""); setResetStep("confirm") }
              else setResetStep("contact")
            } else if (resetStep === "confirm") {
              await api("/auth/password-reset-request", { method: "POST", json: { ...names, email: resetEmail } })
              setResetMessage("Your password reset request has been sent to the administrator.")
            }
          }
          catch (e) { setResetError((e as Error).message) } finally { setResetBusy(false) }
        }}>
          {resetStep === "name" && <>
            <Field label="First name"><input required maxLength={100} autoComplete="given-name" autoCapitalize="words" value={resetFirstName} onChange={e => setResetFirstName(capitalizeName(e.target.value))} /></Field>
            <Field label="Middle name (optional)"><input maxLength={100} autoComplete="additional-name" autoCapitalize="words" value={resetMiddleName} onChange={e => setResetMiddleName(capitalizeName(e.target.value))} /></Field>
            <Field label="Last name"><input required maxLength={100} autoComplete="family-name" autoCapitalize="words" value={resetLastName} onChange={e => setResetLastName(capitalizeName(e.target.value))} /></Field>
          </>}
          {resetStep === "confirm" && <div><p>{resetAccounts.length > 1 ? "More than one account matches your name. Select your work email." : "Is this your work email?"}</p>{resetAccounts.length > 1 ? <Field label="Your work email"><select required value={resetEmail} onChange={e => setResetEmail(e.target.value)}><option value="" disabled>Select your account</option>{resetAccounts.map(account => <option key={account.email} value={account.email}>{account.email} — {account.name}</option>)}</select></Field> : <p><strong>{resetEmail}</strong></p>}<p>Confirm to send your password reset request to the administrator.</p></div>}
          {resetStep === "contact" && <div role="status"><h3>Contact your administrator</h3><p>We could not find an account matching your name. Please contact your workplace administrator to verify your registered name and work email and request a password reset.</p></div>}
          {resetError && <p className="error" role="alert">{resetError}</p>}
          <div className="modal-actions"><Button disabled={resetBusy} onClick={() => setResetOpen(false)}>Cancel</Button>{resetStep !== "name" && <Button disabled={resetBusy} onClick={() => { setResetStep("name"); setResetError(""); setResetEmail("") }}>Edit name</Button>}{resetStep !== "contact" && <Button type="submit" variant="primary" disabled={resetBusy}>{resetBusy ? (resetStep === "name" ? "Searching…" : "Sending…") : resetStep === "name" ? "Find my account" : "Confirm and send to administrator"}</Button>}</div>
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
              <p>Enter the work email and password issued by your administrator.</p>
            </div>

            <form className="login-form" onSubmit={submit} noValidate>
              {(deviceNotice || sessionMessage) && <p className="notice" role="status">{deviceNotice || sessionMessage}</p>}
              <Field
                label="Work Email"
                error={emailError ? `⚠ ${emailError}` : undefined}
              >
                <input
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  // "username" is the standard token that lets password managers fill the sign-in identifier, which is an email here.
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
                    type="button"
                    variant="text-button password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={`${showPassword ? "Hide" : "Show"} password`}
                    aria-pressed={showPassword}
                    disabled={loading || checkingSession}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} />
                  </Button>
                </div>
              </Field>
              {capsLock && (
                <small className="field-error caps-lock-warning" role="status">
                  ⚠ {SIGN_IN_MESSAGES.capsLock}
                </small>
              )}
              <p className="login-help">
                <a href="#password-reset" onClick={event => { event.preventDefault(); setResetOpen(true); setResetStep("name"); setResetFirstName(""); setResetMiddleName(""); setResetLastName(""); setResetEmail(""); setResetMessage(""); setResetError("") }}>Forgot password?</a>
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
