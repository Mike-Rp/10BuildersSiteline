import { useEffect, useRef, useState } from "react"
import { api } from "./api/client"
import { Icon } from "./ui"

type Details = Record<string, string | number>
type Client = { id: string; source: "account" | "inquiry"; client_type: string; client_name: string; company_name: string; primary_contact: string; designation: string; email: string; phone: string }
const identityKeys = ["client_name", "company_name", "primary_contact", "designation", "phone", "email", "existing_client_source", "existing_client_id", "existing_client_verified"]

export default function InquiryClientFields({ details, onChange, page, disabled, selectionError }: {
  details: Details; onChange: (details: Details) => void; page: "path" | "details"; disabled: boolean; selectionError?: string
}) {
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ query: string; clients?: Client[]; error?: string }>()
  const existing = details.client_record === "existing"
  const company = details.client_type === "company"
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const phone = String(details.phone ?? "")
  // Display both supported saved formats without rewriting existing client records.
  const mobileDigits = phone.startsWith("+63") ? phone.slice(3) : phone.startsWith("09") ? phone.slice(1) : phone
  const phoneError = mobileDigits && !mobileDigits.startsWith("9") ? "Mobile number must start with 9."
      : touched.phone && mobileDigits.length !== 10 ? (mobileDigits ? "Enter all 10 mobile digits." : "Enter a mobile number.") : ""
  const touch = (key: string) => setTouched(previous => ({ ...previous, [key]: true }))
  const selectedClient: Client | undefined = existing && details.existing_client_id ? {
    id: String(details.existing_client_id), source: details.existing_client_source === "account" ? "account" : "inquiry",
    client_type: String(details.client_type ?? ""), client_name: String(details.client_name ?? ""),
    company_name: String(details.company_name ?? ""), primary_contact: String(details.primary_contact ?? ""),
    designation: String(details.designation ?? ""), email: String(details.email ?? ""), phone: String(details.phone ?? ""),
  } : undefined
  const visibleClients = query.trim().length >= 2 && result?.query === query && !result.error ? result.clients ?? [] : []
  const selectedVisible = selectedClient && visibleClients.some(client => client.id === selectedClient.id && client.source === selectedClient.source)
  function clientRow(client: Client) {
    const selected = client.id === details.existing_client_id && client.source === details.existing_client_source
    return <li key={`${client.source}:${client.id}`}><button type="button" className="inquiry-client-result" disabled={disabled}
      aria-label={`Select ${client.client_name}`} aria-pressed={selected} onClick={() => {
        const { id, source, ...profile } = client
        onChange({ ...details, ...profile, client_record: "existing", existing_client_source: source, existing_client_id: id, existing_client_verified: "no", existing_client_phone_missing: profile.phone ? "no" : "yes" })
      }}>
      <Icon name={client.client_type === "company" ? "building" : "users"} size={20} />
      <span className="inquiry-client-result-copy"><strong>{client.client_name}</strong>
        <span>{client.client_type === "company" ? "Company" : "Individual"}{client.primary_contact ? ` · ${client.primary_contact}` : ""}</span>
        {client.email && <span>{client.email}</span>}{!client.primary_contact && client.phone && <span>{client.phone}</span>}
      </span>
      <span className="inquiry-client-result-indicator" aria-hidden="true">{selected && <Icon name="check" size={14} />}</span>
    </button></li>
  }
  useEffect(() => {
    if (!existing || query.trim().length < 2) return
    const abort = new AbortController()
    const timer = window.setTimeout(() => {
      void api<Client[]>(`/projects/inquiries/clients?q=${encodeURIComponent(query.trim())}`, { signal: abort.signal })
        .then(clients => { if (!abort.signal.aborted) setResult({ query, clients }) })
        .catch(error => { if (!abort.signal.aborted) setResult({ query, error: error.message }) })
    }, 250)
    return () => { clearTimeout(timer); abort.abort() }
  }, [query, existing])
  function choose(record: string, type = "") {
    const next: Details = { ...details, client_record: record, client_type: type }
    for (const key of identityKeys) delete next[key]
    onChange(next)
  }
  const patch = (key: string, value: string) => onChange({ ...details, [key]: value, ...(key === "company_name" ? { client_name: value } : {}) })
  function validateField(key: string, label: string, input: HTMLInputElement, showRequired: boolean) {
    const message = showRequired && input.validity.valueMissing ? `Enter ${label.toLowerCase()}.`
      : input.validity.typeMismatch ? "Enter a valid email address." : ""
    setFieldErrors(previous => ({ ...previous, [key]: message }))
  }
  const field = (key: string, label: string, required = true, type = "text") => {
    const value = String(details[key] ?? "")
    const message = fieldErrors[key]
    return <label>
    <span>{label}{required ? <span className="inquiry-required"> *</span> : " (optional)"}</span>
    <input aria-label={label} required={required} type={type} maxLength={150} value={value}
      aria-invalid={Boolean(message) || undefined} aria-describedby={message ? `inquiry-${key}-notice` : undefined}
      onBlur={event => { touch(key); validateField(key, label, event.currentTarget, true) }}
      onInvalid={event => { event.preventDefault(); touch(key); validateField(key, label, event.currentTarget, true) }}
      readOnly={existing} placeholder={key === "client_name" || key === "primary_contact" ? "Lastname, FirstName" : key === "email" ? "name@example.com" : undefined}
      onChange={event => { validateField(key, label, event.currentTarget, Boolean(touched[key])); patch(key, event.target.value) }} />
    {message && <small id={`inquiry-${key}-notice`} className="inquiry-input-notice" aria-live="polite">{message}</small>}
  </label>
  }
  return <div className="inquiry-client-fields">
    {page === "path" ? <>
      <header className="inquiry-client-details-heading"><h3>Client path</h3></header>
      <fieldset className="inquiry-client-choice"><legend>Choose a client record <span className="inquiry-required">*</span></legend>
        <div>{[["new", "New client", "plus"], ["existing", "Existing client", "search"]].map(([value, label, icon]) => <label key={value} className={`button${details.client_record === value ? " selected" : ""}`}>
          <input type="radio" name="inquiry-client-record" value={value} checked={details.client_record === value} required onChange={() => choose(value)} />
          <Icon name={icon} size={18} />{label}
        </label>)}</div>
      </fieldset>
      {details.client_record === "new" && <fieldset className="inquiry-client-choice"><legend>Who is the project for? <span className="inquiry-required">*</span></legend>
        <div>{[["individual", "Individual", "A personal project", "users"], ["company", "Company / organization", "On behalf of a company", "building"]].map(([value, title, subtitle, icon]) => <label key={value} className={`button${details.client_type === value ? " selected" : ""}`}>
          <input type="radio" required name="inquiry-client-type" value={value} checked={details.client_type === value} onChange={() => choose("new", value)} />
          <Icon name={icon} size={20} /><span><strong>{title}</strong><small>{subtitle}</small></span>
        </label>)}</div>
      </fieldset>}
      {existing && <div className="inquiry-existing-client">
        <label htmlFor="inquiry-client-search">Find an existing client</label>
        <div className="inquiry-client-search"><Icon name="search" size={18} />
          <input ref={searchRef} id="inquiry-client-search" type="search" aria-label="Find an existing client" value={query} placeholder="Search clients"
            aria-describedby="inquiry-client-search-status" onChange={event => setQuery(event.target.value)} />
          {query && <button type="button" className="inquiry-search-clear" aria-label="Clear client search" disabled={disabled}
            onClick={() => { setQuery(""); searchRef.current?.focus() }}><Icon name="close" size={16} /></button>}
        </div>
        {selectionError && !selectedClient && <p className="inquiry-path-error" role="alert">{selectionError}</p>}
        {selectedClient && !selectedVisible && <ul className="inquiry-client-results inquiry-selected-client">{clientRow(selectedClient)}</ul>}
        <div id="inquiry-client-search-status" role="status" aria-live="polite">{query.trim().length < 2 ? <p>Enter at least two characters to find a client.</p>
          : result?.query !== query ? <p className="inquiry-client-searching"><span className="inquiry-search-spinner" aria-hidden="true" />Searching clients…</p>
            : result.error ? <p role="alert">Unable to load clients.</p>
              : !result.clients?.length ? <p>No matching clients found.</p> : null}</div>
        {visibleClients.length > 0 && <ul className="inquiry-client-results" aria-label="Matching clients">{visibleClients.map(clientRow)}</ul>}
      </div>}
    </> : <>
      <header className="inquiry-client-details-heading"><h3>Client details</h3>
        <p>{company ? "Company / organization" : "Individual"}{existing ? " · Existing client" : " · New client"}</p>
      </header>
      {company && <div className="admin-inquiry-form-grid inquiry-company-fields">
        {field("company_name", "Company name")}{field("designation", "Position / designation", false)}
      </div>}
      <div className="admin-inquiry-form-grid inquiry-client-details-grid">
        {field(company ? "primary_contact" : "client_name", company ? "Primary contact (representative)" : "Client name")}
        <label><span>Mobile number <span className="inquiry-required">*</span></span>
          <span className="mobile-number-input inquiry-mobile-number">
            <span className="mobile-number-prefix" aria-hidden="true">+63</span>
            <input aria-label="Mobile number, +63" type="tel" inputMode="numeric" autoComplete="tel-national" required
              pattern="9[0-9]{9}" maxLength={10} placeholder="9XXXXXXXXX" value={mobileDigits}
              disabled={existing && details.existing_client_phone_missing !== "yes"}
              aria-invalid={Boolean(phoneError) || undefined} aria-describedby="inquiry-phone-hint inquiry-phone-notice"
              onBlur={() => touch("phone")} onInvalid={event => { event.preventDefault(); touch("phone") }}
              onChange={event => {
                const digits = event.target.value
                if (/^[0-9]{0,10}$/.test(digits)) patch("phone", digits ? "+63" + digits : "")
              }}
              onPaste={event => {
                const pasted = event.clipboardData.getData("text").trim().replace(/[\s()-]/g, "")
                const complete = pasted.match(/^(?:\+63|63|0)?(9[0-9]{9})$/)
                if (complete) { event.preventDefault(); patch("phone", "+63" + complete[1]) }
              }} />
          </span>
          <span className="inquiry-mobile-feedback"><small id="inquiry-phone-notice" className="inquiry-input-notice" aria-live="polite">{phoneError}</small>
            <small className="inquiry-mobile-counter">{mobileDigits.length}/10</small></span>
          <span id="inquiry-phone-hint" className="sr-only">Philippine mobile number: enter ten digits beginning with 9 after +63.</span>
        </label>
        {field("email", "Email address", true, "email")}
      </div>
      {existing && <label className="inquiry-client-verification"><input type="checkbox" required checked={details.existing_client_verified === "yes"}
        onChange={event => patch("existing_client_verified", event.target.checked ? "yes" : "no")} />I verified this client's identity and contact details.</label>}
    </>}
  </div>
}
