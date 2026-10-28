import { useId } from "react"
import { Icon } from "./ui"
import "./executive-summary.css"

export type ExecutiveMetric = {
  label: string
  value: number
  hint: string
  icon?: string
  onOpen: () => void
}

export default function ExecutiveSummary({ description, metrics }: {
  description: string
  metrics: ExecutiveMetric[]
}) {
  const title = useId()
  return <section className="executive-summary" aria-labelledby={title}>
    <header><h2 id={title}>Executive summary</h2><span>Current workspace</span></header>
    <p>{description}</p>
    <div className="executive-metrics">
      {metrics.map(metric => <button type="button" className="executive-metric" key={metric.label} onClick={metric.onOpen}>
        <span className="executive-metric-label">{metric.icon && <Icon name={metric.icon} size={17} />}{metric.label}</span>
        <strong>{metric.value}</strong><small>{metric.hint}<Icon name="arrow" size={15} /></small>
      </button>)}
    </div>
  </section>
}
