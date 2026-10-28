import { MIXED_USE_USES, MIXED_USE_FEATURES, type MixedUseScope } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import "./project-scope-review.css"

export default function ProjectScopeSummary({ scope }: { scope?: MixedUseScope }) {
  if (!scope) return null
  return <section className="scope-saved-summary" aria-label="Confirmed project scope">
    <h3>Confirmed Mixed-Use scope</h3>
    <p><strong>Building uses: </strong>{MIXED_USE_USES.filter(use => scope.uses.includes(use.code)).map(use => use.label).join(" · ")}</p>
    <p><strong>Construction features: </strong>{MIXED_USE_FEATURES.filter(feature => scope.features[feature.code]).map(feature => feature.label).join(" · ") || "General building structure, enclosure and site works"}</p>
    <p><strong>Scope basis: </strong>{scope.basis}</p>
    {!!scope.notApplicable?.length && <details><summary>Work marked not applicable</summary><ul>{scope.notApplicable.map(row => <li key={row.name}><strong>{row.name}: </strong>{row.reason}</li>)}</ul></details>}
    <p>Scope confirmed for allocation. Design, permit and contract requirements still apply.</p>
  </section>
}
