import { useState } from "react"
import { Button, Field } from "./ui"
import LocationFields from "./LocationFields"
import { locationError, serviceAreaLabel, normalizeServiceAreas, serviceAreasError, type OperatingLocation, type ServiceArea } from "../Thesis-Backend/src/domain/operating-location.js"
import { resolveLocation, locationForCity } from "../Thesis-Backend/src/domain/philippine-locations.js"

export default function ServiceAreaFields({ value, onChange, base, disabled }: {
  value: ServiceArea[]; onChange: (areas: ServiceArea[]) => void; base?: OperatingLocation; disabled?: boolean
}) {
  const [location, setLocation] = useState<OperatingLocation | undefined>(() => {
    const resolved = resolveLocation(base)
    return resolved ? locationForCity(resolved.code) : undefined
  })
  const [scope, setScope] = useState<ServiceArea["scope"]>("city")
  const [error, setError] = useState("")
  return <section className="form-section" aria-label="Additional service areas">
    <h4>Additional service areas</h4>
    <p>The operating-base city is included. Add other areas only after confirming the company can supply workers there. Proximity alone does not qualify a company.</p>
    {value.map((area, index) => <div className="service-area-row" key={index}>
      <span><strong>{area.scope === "city" ? "City/municipality" : area.scope === "province" ? "Province/NCR" : "Region"}:</strong> {serviceAreaLabel(area)}</span>
      <Button disabled={disabled} aria-label={`Remove service area ${index + 1}`} onClick={() => { onChange(value.filter((_, position) => position !== index)); setError("") }}>Remove</Button>
    </div>)}
    <details>
      <summary>Add a service area</summary>
      <Field label="Service coverage"><select disabled={disabled} value={scope} onChange={event => { setScope(event.target.value as ServiceArea["scope"]); setError("") }}>
        <option value="city">Selected city / municipality</option><option value="province">Entire province / NCR area</option><option value="region">Entire region</option>
      </select></Field>
      <LocationFields prefix="Service area" allowCoordinates={false} value={location} onChange={setLocation} disabled={disabled} />
      <Button disabled={disabled || !!locationError(location) || value.length >= 30} onClick={() => {
        const next = [...value, { scope, location: location! }]
        const error = serviceAreasError(next)
        setError(error)
        if (!error) onChange(normalizeServiceAreas(next))
      }}>Add reviewed area</Button>
    </details>
    {error && <p className="error" role="alert">{error}</p>}
    <p>Service-area changes take effect when you save this capability review.</p>
  </section>
}
