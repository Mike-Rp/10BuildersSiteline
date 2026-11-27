import { MIXED_USE_USES, MIXED_USE_FEATURES, type MixedUseScope } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import "./project-scope-review.css"
import InfoPopover from "./InfoPopover"

export default function ProjectScopeSummary({ scope, compact = false }: { scope?: MixedUseScope; compact?: boolean }) {
  if (compact) {
    const uses=scope?.uses ? MIXED_USE_USES.filter(use=>scope.uses.includes(use.code)).map(use=>use.label) : []
    const features=scope?.features ? MIXED_USE_FEATURES.filter(feature=>scope.features[feature.code]).map(feature=>feature.label) : []
    return <section className="scope-saved-summary" aria-label="Confirmed project scope"><h3>Confirmed project scope</h3>
      {scope?.uses && scope.features ? <dl className="scope-compact-facts"><div><dt>Building uses</dt><dd className="tag-list">{uses.length ? uses.map(label=><span key={label}>{label}</span>) : "Not recorded"}</dd></div><div><dt>Construction features</dt><dd className="tag-list">{features.length ? features.map(label=><span key={label}>{label}</span>) : <span>General building structure, enclosure and site works</span>}</dd></div></dl> : scope?.phases?.length ? <div className="tag-list">{scope.phases.map(phase=><span key={phase}>{phase}</span>)}</div> : <p>Scope information unavailable.</p>}
      {scope?.notApplicable?.length ? <details><summary>Work marked not applicable</summary><ul>{scope.notApplicable.map(row=><li key={row.name}><strong>{row.name}: </strong>{row.reason}</li>)}</ul></details> : scope && scope.notApplicable === undefined ? <p className="scope-data-note">Not-applicable work records are not available.</p> : null}
      <div className="scope-conditions"><span>Design, permit and contract requirements apply.</span><span>Scope conditions <InfoPopover title="Scope conditions" label="Scope conditions">{scope?.basis && <p><strong>Scope basis: </strong>{scope.basis}</p>}<p>{scope ? "Scope confirmed for allocation. " : ""}Design, permit and contract requirements still apply.</p></InfoPopover></span></div>
    </section>
  }
  if (!scope) return null
  if (!scope.uses || !scope.features) return <section className="scope-saved-summary" aria-label="Confirmed project scope">
    <h3>{compact ? "Confirmed project scope" : "Confirmed construction phases"}</h3><ul>{scope.phases?.map(phase => <li key={phase}>{phase}</li>)}</ul>
  </section>
  return <section className="scope-saved-summary" aria-label="Confirmed project scope">
    <h3>{compact ? "Confirmed project scope" : "Confirmed Mixed-Use scope"}</h3>
    <p><strong>Building uses: </strong>{MIXED_USE_USES.filter(use => scope.uses.includes(use.code)).map(use => use.label).join(" · ")}</p>
    <p><strong>Construction features: </strong>{MIXED_USE_FEATURES.filter(feature => scope.features[feature.code]).map(feature => feature.label).join(" · ") || "General building structure, enclosure and site works"}</p>
    {scope.basis && <p><strong>Scope basis: </strong>{scope.basis}</p>}
    {!!scope.notApplicable?.length && <details><summary>Work marked not applicable</summary><ul>{scope.notApplicable.map(row => <li key={row.name}><strong>{row.name}: </strong>{row.reason}</li>)}</ul></details>}
    <p>Scope confirmed for allocation. Design, permit and contract requirements still apply.</p>
  </section>
}
