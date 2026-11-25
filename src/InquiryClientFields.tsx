import { useEffect, useState } from "react"
import { api } from "./api/client"
import { Icon } from "./ui"
import MobileNumberInput from "./MobileNumberInput"
import { isPhilippineMobile, PH_MOBILE_ERROR } from "../Thesis-Backend/src/domain/mobile-number.js"

type Details = Record<string, string | number>
type Client = { id: string; source: "account" | "inquiry"; client_type: string; client_name: string; company_name: string; primary_contact: string; designation: string; email: string; phone: string }
const identityKeys = ["client_name", "company_name", "primary_contact", "designation", "phone", "email", "existing_client_source", "existing_client_id", "existing_client_verified"]

export default function InquiryClientFields({ details, onChange, page, disabled }: {
  details: Details; onChange: (details: Details) => void; page: "path" | "details"; disabled: boolean
}) {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<{ query: string; clients?: Client[]; error?: string }>()
  const existing = details.client_record === "existing"
  const company = details.client_type === "company"
  const invalidPhone = Boolean(details.phone && !isPhilippineMobile(String(details.phone)))
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
  const field = (key: string, label: string, required = true, type = "text") => <label>
    <span>{label}{required ? <span className="inquiry-required"> *</span> : " (optional)"}</span>
    <input aria-label={label} required={required} type={type} maxLength={150} value={String(details[key] ?? "")}
      readOnly={existing} placeholder={key === "client_name" || key === "primary_contact" ? "Lastname, FirstName" : key === "email" ? "name@example.com" : undefined}
      onChange={event => patch(key, event.target.value)} />
  </label>
  return <div className="inquiry-client-fields">
    {page === "path" ? <>
      <fieldset className="inquiry-client-choice"><legend>Choose a client record <span className="inquiry-required">*</span></legend>
        <div>{[["new", "New client", "plus"], ["existing", "Existing client", "search"]].map(([value, label, icon]) => <label key={value} className={`button${details.client_record === value ? " selected" : ""}`}>
          <input type="radio" name="inquiry-client-record" value={value} checked={details.client_record === value} required onChange={() => choose(value)} />
          <Icon name={icon} size={18} />{label}
        </label>)}</div>
      </fieldset>
      {details.client_record === "new" && <fieldset className="inquiry-client-choice"><legend>Who is the project for? <span className="inquiry-required">*</span></legend>
        <div>{[["individual", "Individual", "A personal project", "users"], ["company", "Company / organization", "A project on behalf of a company", "building"]].map(([value, title, subtitle, icon]) => <label key={value} className={`button${details.client_type === value ? " selected" : ""}`}>
          <input type="radio" required name="inquiry-client-type" value={value} checked={details.client_type === value} onChange={() => choose("new", value)} />
          <Icon name={icon} size={20} /><span><strong>{title}</strong><small>{subtitle}</small></span>
        </label>)}</div>
      </fieldset>}
      {existing && <div className="inquiry-existing-client">
        <label>Find an existing client<input type="search" aria-label="Find an existing client" value={query} placeholder="Search by name, company, email or phone"
          onChange={event => setQuery(event.target.value)} /></label>
        {details.existing_client_id && <div className="inquiry-sent-notice"><strong>Selected: {details.client_name}</strong><span>{details.email}</span></div>}
        <div aria-live="polite">{query.trim().length < 2 ? <p>Enter at least two characters to find a client.</p>
          : result?.query !== query ? <p>Searching clients…</p> : result.error ? <p role="alert">{result.error}</p>
            : !result.clients?.length ? <p>No matching clients. Choose New client to enter a new record.</p>
              : <ul className="inquiry-client-results">{result.clients.map(client => <li key={`${client.source}:${client.id}`}>
                <div><strong>{client.client_name}</strong><small>{client.client_type === "company" ? "Company" : "Individual"} · {client.email}</small><small>{client.primary_contact || client.phone}</small></div>
                <button type="button" className="button" disabled={disabled} aria-label={`Select ${client.client_name}`} onClick={() => {
                  const { id, source, ...profile } = client
                  onChange({ ...details, ...profile, client_record: "existing", existing_client_source: source, existing_client_id: id, existing_client_verified: "no", existing_client_phone_missing: profile.phone ? "no" : "yes" })
                }}>Select</button>
              </li>)}</ul>}</div>
      </div>}
    </> : <>
      <p>{company ? "Company / organization" : "Individual"}{existing ? " · Existing client details" : " · New client details"}</p>
      {company && <div className="admin-inquiry-form-grid inquiry-company-fields">
        {field("company_name", "Company name")}{field("designation", "Position / designation", false)}
      </div>}
      <div className="admin-inquiry-form-grid">
        {field(company ? "primary_contact" : "client_name", company ? "Primary contact (representative)" : "Client name")}
        <label><span>Contact number <span className="inquiry-required">*</span></span><MobileNumberInput required value={String(details.phone ?? "")}
          disabled={existing && details.existing_client_phone_missing !== "yes"} aria-invalid={invalidPhone || undefined}
          aria-describedby={invalidPhone ? "inquiry-phone-notice" : undefined} onValueChange={value => patch("phone", value)} />
          <small id="inquiry-phone-notice" className="inquiry-input-notice" aria-live="polite">{invalidPhone ? PH_MOBILE_ERROR : ""}</small></label>
        {field("email", "Email address", true, "email")}
      </div>
      {existing && <label className="inquiry-client-verification"><input type="checkbox" required checked={details.existing_client_verified === "yes"}
        onChange={event => patch("existing_client_verified", event.target.checked ? "yes" : "no")} />I verified this client's identity and contact details.</label>}
    </>}
  </div>
}
