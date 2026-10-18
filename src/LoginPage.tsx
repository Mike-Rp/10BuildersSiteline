import { useState, type FormEvent } from "react"
import { Button, Field, Icon } from "./ui"
import { SIGN_IN_MESSAGES, validateSignInFields } from "./signInPolicy"

export default function LoginPage({
  checkingSession = false,
  onSignIn,
}: {
  checkingSession?: boolean
  onSignIn: (email: string, password: string) => Promise<void>
}) {
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

  return (
    <main className="login-page">
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

          <div className="login-heading">
            <h1>Log in to your account</h1>
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
              Forgot your password? Contact your administrator.
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

          <div className="login-foot">
            <p>Accounts are provided by an administrator.</p>
          </div>
        </section>

        <aside className="login-info" aria-label="About SITELINE">
          <p className="login-company">
            10 Builders Development and Construction Corporation
          </p>
          <h2>Every site. One source of truth.</h2>
          <p className="login-info-desc">
            Track crews, documents, and construction progress across every
            active project.
          </p>
          <ul className="login-highlights">
            <li>
              <Icon name="shield" size={20} />
              <span>Role-based access</span>
            </li>
            <li>
              <Icon name="doc" size={20} />
              <span>Centralized document management</span>
            </li>
            <li>
              <Icon name="trend" size={20} />
              <span>Project progress monitoring</span>
            </li>
          </ul>
        </aside>
      </div>
    </main>
  )
}
