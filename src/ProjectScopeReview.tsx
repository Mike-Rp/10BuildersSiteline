import { MIXED_USE_USES, MIXED_USE_FEATURES, mixedUsePhaseReview, type MixedUseScope } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import { Button, Field, Icon } from "./ui"
import "./project-scope-review.css"

export default function ProjectScopeReview({ value, onChange, onConfirm, onBack, error }: {
  value: MixedUseScope; onChange: (scope: MixedUseScope) => void; onConfirm: () => void; onBack: () => void; error: string
}) {
  const rows = mixedUsePhaseReview(value)
  const update = (patch: Partial<MixedUseScope>) => onChange({ ...value, ...patch, confirmed: false })
  return <form className="project-scope-review" onSubmit={event => { event.preventDefault(); onConfirm() }}>
    <header><span className="eyebrow">Mixed-Use · New construction</span><h3>Review project scope</h3>
      <p>Identify the building uses and design features before allocating your workforce.</p></header>
    <div className="scope-review-columns"><div>
      <fieldset><legend>Building uses</legend><p>Select at least two. Mixed-Use describes a combination of uses.</p>
        <div className="scope-options">{MIXED_USE_USES.map(use => <label key={use.code} className={value.uses.includes(use.code) ? "selected" : ""}>
          <input type="checkbox" checked={value.uses.includes(use.code)} onChange={() => update({ uses: value.uses.includes(use.code) ? value.uses.filter(code => code !== use.code) : [...value.uses, use.code] })} />{use.label}
        </label>)}</div>
      </fieldset>
      <fieldset><legend>Construction features</legend><p>These describe the building design, independently of its uses.</p>
        <div className="scope-options">{MIXED_USE_FEATURES.map(feature => <label key={feature.code} className={value.features[feature.code] ? "selected" : ""}>
          <input type="checkbox" checked={value.features[feature.code]} onChange={() => update({ features: { ...value.features, [feature.code]: !value.features[feature.code] } })} />{feature.label}
        </label>)}</div>
      </fieldset>
      <div className="notice"><Icon name="shield" /><p>Essential work stays covered. General structure, enclosure and site works remain when a specific feature does not apply. Applicable services, fire safety and closeout stay included.</p></div>
    </div><section className="scope-phase-preview" aria-label="Proposed construction phases"><h4>Proposed construction phases</h4>
      <p>{rows.filter(row => row.included).length} included phases · only included phases receive allocations and checklists.</p>
      <div className="scope-phase-table"><table><thead><tr><th>Construction phase</th><th>Applicability</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name} className={row.included ? "" : "scope-not-applicable"}>
          <th scope="row">{row.name}{row.reason && <small>{row.reason}</small>}</th>
          <td><span className={`scope-applicability ${row.included ? "included" : ""}`}>{row.included ? row.required ? "Required" : "Included" : "Not applicable"}</span></td>
        </tr>)}</tbody></table></div>
    </section></div>
    <Field label="Scope basis and reasons *" hint="Describe the client brief, proposed design and why any work is not applicable. 20–2,000 characters.">
      <textarea required minLength={20} maxLength={2000} rows={3} value={value.basis} onChange={event => update({ basis: event.target.value })} placeholder="Example: Office and retail building without residential units or a tower. General structure, enclosure and site works remain included." />
    </Field>
    <label className="scope-confirmation"><input type="checkbox" checked={value.confirmed} onChange={event => onChange({ ...value, confirmed: event.target.checked })} />
      <span>I confirm this proposed scope for allocation. The responsible project professionals must verify applicability against the design, permits and contract; this review does not waive required work or approvals.</span></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><Button onClick={onBack}>Back to details</Button><Button type="submit" variant="primary" icon="arrow">Confirm scope & generate allocation</Button></div>
  </form>
}
