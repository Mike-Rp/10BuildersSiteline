import type { Company } from "./model"
import "./company-foremen.css"

export default function CompanyForemen({ company }: { company: Company }) {
  if (!company.foremen?.length) return null
  return <section className="detail-section company-foremen" aria-label="Foreman contacts">
    <h3>Foreman contacts</h3>
    <div className="company-foreman-grid">{company.foremen.map((foreman, index) => <article key={index} className={`foreman-contact-card${index === 0 ? " primary" : ""}`}>
      <h4>{index === 0 ? "Primary foreman" : "Backup foreman"}</h4>
      <strong>{foreman.name}</strong>
      <a className="foreman-call" href={`tel:${foreman.phone}`} aria-label={`Call ${index === 0 ? "primary" : "backup"} foreman ${foreman.name}`}>{foreman.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3")}</a>
    </article>)}</div>
  </section>
}
