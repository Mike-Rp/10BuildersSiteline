import { Field } from "./ui"
import type { OperatingLocation } from "../Thesis-Backend/src/domain/operating-location.js"

export default function LocationFields({ value, onChange, disabled = false, prefix = "Operating", error }: {
  value?: OperatingLocation; onChange: (location: OperatingLocation) => void; disabled?: boolean; prefix?: string; error?: string
}) {
  const location = value || { region: "", province: "", city: "" }
  return <section className="location-fields" aria-label={`${prefix} location`}>
    <div className="form-grid">
      {([ ["region", "region", "Central Visayas"], ["province", "province / NCR", "Cebu"], ["city", "city / municipality", "Cebu City"] ] as const).map(([key, label, placeholder]) =>
        <Field key={key} label={`${prefix} ${label} *`}><input required maxLength={100} disabled={disabled} value={location[key]} placeholder={placeholder} onChange={event => onChange({ ...location, [key]: event.target.value })} /></Field>)}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="capability-help">Use the same region, province/NCR and city names as the project. Each operating area covers one city or municipality; no travel or deployment override applies.</p>
  </section>
}
