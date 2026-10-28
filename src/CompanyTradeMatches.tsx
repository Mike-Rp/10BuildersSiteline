import { COMPANY_PHASE_TRADES } from "../Thesis-Backend/src/domain/company-trades.js"
import "./TradeAllocationPanel.css"

export default function CompanyTradeMatches({ trades, verified = false }: { trades: string[]; verified?: boolean }) {
  if (!trades.length) return null
  const matches = Object.entries(COMPANY_PHASE_TRADES).map(([type, phases]) => ({
    type,
    phases: Object.entries(phases).flatMap(([name, required]) => {
      const matching = required.filter(trade => trades.includes(trade))
      return matching.length ? [{ name, matching, total: required.length }] : []
    }),
  })).filter(group => group.phases.length)
  return <details className="company-trade-matches">
    <summary>How these trades connect</summary>
    <p>{verified ? "Verified trades" : "Selected trades · Site PM verification required"}</p>
    {!matches.length ? <p>No phase matches in the current company trade catalog.</p> : <>
      <p>Each match shows the work this company can cover within a phase. Other companies can cover the remaining trades.</p>
      <div className="company-trade-match-grid">{matches.map(group => <section key={group.type} aria-label={`${group.type} trade matches`}>
        <h4>{group.type}</h4>
        <ul>{group.phases.map(phase => <li key={phase.name}>
          <strong>{phase.name}</strong>
          <span>{phase.matching.join(" · ")}</span>
          <small>{phase.matching.length} of {phase.total} required trade{phase.total === 1 ? "" : "s"}</small>
        </li>)}</ul>
      </section>)}</div>
      <p className="capability-help">Mixed-Use alternatives apply only when included in the project scope. Allocation also checks company approval, verified capabilities and availability.</p>
    </>}
  </details>
}
