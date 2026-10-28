import { useId } from "react"
import { companyTradeOptions } from "../Thesis-Backend/src/domain/company-trades.js"
import "./TradeAllocationPanel.css"

const GROUPS = [
  { title: "Civil & structure", trades: ["Civil", "Structural"] },
  { title: "Building services", trades: ["Mechanical", "Electrical", "Plumbing", "Fire Protection"] },
  { title: "Finishes & exterior", trades: ["Interior/Finishes", "Facade", "Waterproofing", "Landscape"] },
]

export default function CompanyTradePicker({ selected, recordedTrades = [], onChange, disabled = false, label = "Capabilities to verify" }: {
  selected: string[]
  recordedTrades?: string[]
  onChange: (selected: string[]) => void
  disabled?: boolean
  label?: string
}) {
  const headingId = useId()
  const disciplines = companyTradeOptions(recordedTrades)
  const known = new Set(GROUPS.flatMap(group => group.trades))
  const groups = [...GROUPS.map(group => ({ title: group.title, trades: group.trades.filter(trade => disciplines.includes(trade)) })),
    { title: "Previously recorded trades", trades: disciplines.filter(trade => !known.has(trade)) }].filter(group => group.trades.length)
  return <section className="company-trade-picker" aria-labelledby={headingId}>
    <div className="capability-section-heading"><h4 id={headingId}>{label}</h4><span className="capability-count" aria-live="polite">{selected.length} selected</span></div>
    <p className="capability-help">Verified company trades are matched to the required trades of each project phase during allocation.</p>
    {!groups.length && <p role="status">No trade catalog is available. Refresh the workspace before selecting trades.</p>}
    <div className="capability-group-grid">{groups.map(group => <fieldset key={group.title} disabled={disabled} className="capability-group">
      <legend>{group.title}</legend>
      {group.trades.map(trade => <label key={trade} className={`capability-choice${selected.includes(trade) ? " selected" : ""}`}>
        <input type="checkbox" checked={selected.includes(trade)} onChange={() => onChange(selected.includes(trade) ? selected.filter(value => value !== trade) : [...selected, trade])} />
        <span>{trade}</span>
      </label>)}
    </fieldset>)}</div>
  </section>
}
