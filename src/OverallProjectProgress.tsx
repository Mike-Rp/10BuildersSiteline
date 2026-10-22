import type { VerifiedProgress } from "./project-progress"
import { progressLabel } from "./project-progress"
import "./overall-project-progress.css"

export default function OverallProjectProgress({ name, verifiedProgress }: {
  name: string
  verifiedProgress?: VerifiedProgress
}) {
  const raw = verifiedProgress?.project.percentage
  const value = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null
  return <section className="overall-project-progress" aria-label={name + " overall project progress"}>
    <div className="overall-progress-heading"><span>Overall project progress</span><strong>{value === null ? "Unavailable" : progressLabel(value) + "%"}</strong></div>
    {value !== null ? <progress aria-label={name + " overall approved completion"} max={100} value={value} /> : <div className="overall-progress-empty" aria-hidden="true" />}
    {value === null && <p>Complete activity totals for all phases are needed.</p>}
  </section>
}
