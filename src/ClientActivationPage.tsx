import { useEffect, useRef, useState, type FormEvent } from "react"
import { api, ApiError } from "./api/client"
import { activationErrors } from "./client-activation"
import { loginPath } from "./login-portal"
import { Button, Field, Icon } from "./ui"
import "./login-page.css"
import ClientOwnedActivation from "./ClientOwnedActivation"

const empty = { email: "", code: "", password: "", confirmation: "" }
const fields = [
  { name: "email", label: "Registered email address", type: "email", autoComplete: "username", maxLength: 254 },
  { name: "code", label: "One-time activation code", type: "text", autoComplete: "one-time-code", maxLength: 128 },
  { name: "password", label: "New SiteLine password", type: "password", autoComplete: "new-password" },
  { name: "confirmation", label: "Confirm SiteLine password", type: "password", autoComplete: "new-password" },
] as const

export default function ClientActivationPage() {
  const [configuration, setConfiguration] = useState<{ client_owned: boolean }>()
  const [failure, setFailure] = useState(false)
  const [legacy, setLegacy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<{ client_owned: boolean }>("/auth/client/activation-config", { signal: controller.signal }).then(setConfiguration).catch(() => { if (!controller.signal.aborted) setFailure(true) })
    return () => controller.abort()
  }, [])
  if (!legacy) return <ClientOwnedActivation serviceAvailable={configuration?.client_owned === true}
    availabilityMessage={failure ? "Registration is temporarily unavailable. Please try again later." : !configuration ? "Checking registration availability…" : "New account registration is not enabled yet. Existing activation codes can still be used below."}
    onLegacy={() => setLegacy(true)} />
  return <LegacyClientActivation />
}

function LegacyClientActivation() {
  const [draft, setDraft] = useState(empty)
  const [showValidation, setShowValidation] = useState(false)
  const [serverError, setServerError] = useState("")
  const [codeError, setCodeError] = useState("")
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<"activated" | "existing">()
  const request = useRef<AbortController | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (outcome) heading.current?.focus() }, [outcome])
  const errors = activationErrors(draft)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current || outcome) return
    setShowValidation(true)
    setServerError("")
    setCodeError("")
    const first = fields.find(field => errors[field.name])
    if (first) {
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus()
      return
    }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const result = await api<{ status: "active" }>("/auth/client/activate", {
        method: "POST", signal: controller.signal,
        json: { email: draft.email.trim(), code: draft.code.trim(), password: draft.password },
      })
      if (result?.status !== "active") throw new Error("Activation could not be confirmed.")
      setDraft(empty)
      setOutcome("activated")
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiError) {
        if (error.code === "CLIENT_ALREADY_ACTIVE") {
          setDraft(empty)
          setOutcome("existing")
          return
        }
        if (error.code === "ACTIVATION_CODE_EXPIRED") {
          setCodeError("This code has expired. Contact 10 Builders for a new activation code.")
          return
        }
        if (error.code === "ACTIVATION_CODE_INVALID") {
          setCodeError("This code is invalid for the registered email. Check both and try again.")
          return
        }
        if (error.code === "CLIENT_VERIFICATION_REQUIRED") {
          setServerError("Account ownership needs verification. Contact 10 Builders to continue.")
          return
        }
        if ([404, 405, 501, 503].includes(error.status)) {
          setServerError("Account activation is currently unavailable. Contact 10 Builders for help.")
          return
        }
        if (error.status === 429) {
          setServerError("Too many activation attempts. Try again later.")
          return
        }
      }
      setServerError("We could not confirm activation. Try again or contact 10 Builders for help.")
    } finally {
      request.current = undefined
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <main className="login-page login-redesign client-login client-activation">
    <section className="login-card" aria-labelledby="activation-heading">
      <div className="login-panel">
        <div className="login-brand">
          <span className="brand-mark company-logo-mark"><img src="/images/10-builders-logo.png" alt="" width="36" height="54" /></span>
          <span><strong>10BuildLine</strong><small>10 Builders and Development Corporation</small></span>
        </div>
        <div className="login-heading">
          <h1 id="activation-heading" tabIndex={-1} ref={heading}>{outcome === "activated" ? "Account activated" : outcome === "existing" ? "Account already active" : "Activate your client account"}</h1>
          <p>{outcome ? "Sign in with your registered email and SiteLine password." : "Use the email registered for your project and the one-time code provided by 10 Builders. Create a password for SiteLine that is different from your email password."}</p>
        </div>
        {!outcome && <form className="login-form" noValidate onSubmit={submit} aria-busy={busy}>
          {fields.map(({ label, ...field }) => {
            const error = (field.name === "code" && codeError) || (showValidation ? errors[field.name] : undefined)
            return <Field key={field.name} label={label} error={error}>
              <input {...field} required disabled={busy} value={draft[field.name]}
                spellCheck={false} autoCapitalize="none" onChange={event => {
                  setDraft({ ...draft, [field.name]: event.target.value })
                  setServerError("")
                  if (field.name === "code" || field.name === "email") setCodeError("")
                }} />
            </Field>
          })}
          {serverError && <div className="login-error" role="alert"><Icon name="alert" size={18} />{serverError}</div>}
          <Button type="submit" variant="primary full-width login-submit" disabled={busy}>{busy ? "Activating…" : "Activate Account"}</Button>
        </form>}
        <p className="client-login-note"><a href={loginPath("client")}>{outcome ? "Continue to client sign-in" : "Back to client sign-in"}</a></p>
      </div>
    </section>
  </main>
}
