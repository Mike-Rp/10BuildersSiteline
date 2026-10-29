import { Field } from "./ui"
import type { Company } from "./model"
import { COMPANY_EMAIL_PATTERN, COMPANY_PHONE_PATTERN, type CompanyRegistrationErrors } from "../Thesis-Backend/src/domain/company-registration.js"
import "./company-foremen.css"
export default function CompanyRegistrationFields({draft, patch, fieldErrors = {}, busy = false}: {draft: Pick<Company,"name"|"email"|"foremen">; patch: (values: Partial<Company>) => void; fieldErrors?: CompanyRegistrationErrors; busy?: boolean}) {
const patchForeman=(index:number, values: Partial<{name:string;phone:string}>)=>{const foremen=(draft.foremen || [{name:"",phone:""},{name:"",phone:""}]).map((foreman,position)=>position===index?{...foreman,...values}:foreman);patch({foremen,contact:foremen[0].name,phone:foremen[0].phone})}
return <>
      <div className="form-grid">
        <Field label="Company name *" error={fieldErrors.name}>
          <input
            required
            maxLength={150}
            disabled={busy}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Company email *" error={fieldErrors.email} hint="Use an @gmail.com address.">
          <input
            type="email"
            required
            maxLength={254}
            pattern={COMPANY_EMAIL_PATTERN}
            disabled={busy}
            value={draft.email}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>
      </div>
      <section className="company-foremen" aria-label="Foreman contacts">
        <h3>Foreman contacts</h3>
        <p>Provide a primary contact and an optional backup.</p>
        <div className="company-foreman-grid">{(draft.foremen || []).map((foreman, index) => {
          const label = index === 0 ? "Primary foreman" : "Backup foreman"
          const required = index === 0 || !!foreman.name.trim() || !!foreman.phone
          const nameError = index === 0 ? fieldErrors.foreman1Name : fieldErrors.foreman2Name
          const phoneError = index === 0 ? fieldErrors.foreman1Phone : fieldErrors.foreman2Phone
          return <section key={index} className={`foreman-contact-card${index === 0 ? " primary" : ""}`} role="group" aria-label={label}>
            <div className="foreman-contact-heading"><h4>{label}</h4><span>{index === 0 ? "Required" : "Optional"}</span></div>
            <Field label={index === 0 ? "Full name *" : "Full name"} error={nameError}><input aria-label={`${label} full name`} required={required} maxLength={150} disabled={busy} value={foreman.name} placeholder={index === 0 ? "Enter full name" : "Enter backup foreman name"} onChange={event => patchForeman(index, { name: event.target.value })} /></Field>
            <Field label={index === 0 ? "Mobile number *" : "Mobile number"} error={phoneError} hint={index === 0 ? "Enter exactly 11 digits." : undefined}><input aria-label={`${label} mobile number`} required={required} type="tel" inputMode="numeric" maxLength={11} pattern={COMPANY_PHONE_PATTERN} disabled={busy} value={foreman.phone} placeholder="09XXXXXXXXX" onChange={event => patchForeman(index, { phone: event.target.value.replace(/\D/g, "").slice(0, 11) })} /></Field>
            {index === 1 && <p>Leave both blank, or complete both fields.</p>}
          </section>
        })}</div>
        {fieldErrors.foremen && <p className="error" role="alert">{fieldErrors.foremen}</p>}
      </section>
</>
}
