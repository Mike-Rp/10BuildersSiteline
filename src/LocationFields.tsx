import { Field } from "./ui"
import LocationSearch from "./LocationSearch"
import { LOCATION_REGIONS, findRegion, findProvince, provinceOptions, cityOptions, resolveLocation, locationForCity } from "../Thesis-Backend/src/domain/philippine-locations.js"
import type { OperatingLocation } from "../Thesis-Backend/src/domain/operating-location.js"

export default function LocationFields({ value, onChange, disabled = false, prefix = "Operating", error }: {
  value?: OperatingLocation; onChange: (location: OperatingLocation) => void; disabled?: boolean; prefix?: string; error?: string
}) {
  const location = value || { region: "", province: "", city: "" }
  const resolved = resolveLocation(location)
  const region = findRegion(location.region)
  const province = resolved ? provinceOptions(resolved.regionCode).find(group => group.code === resolved.groupCode) : region ? findProvince(region.code, location.province) : undefined
  const provinces = region ? provinceOptions(region.code) : []
  const cities = region && province ? cityOptions(region.code, province.code) : []
  const needsSelection = !!location.city && !resolved
  return <section className="location-fields" aria-label={`${prefix} location`}>
    <div className="form-grid">
      <Field label={`${prefix} region *`}><LocationSearch label={`${prefix} region`} disabled={disabled} value={region?.code || ""}
        options={LOCATION_REGIONS.map(region => ({ ...region, searchText: region.code === "1300000000" ? "Metro Manila" : "" }))}
        placeholder="Type or select region" onChange={code => onChange({ region: LOCATION_REGIONS.find(region => region.code === code)?.name || "", province: "", city: "" })} /></Field>
      <Field label={`${prefix} province / NCR *`} hint="Independent cities have no province."><LocationSearch key={region?.code || "no-region"} label={`${prefix} province / NCR`} disabled={disabled || !region} value={province?.code || ""} options={provinces.map(group => ({ ...group, name: group.kind === "independent" ? "Independent cities" : group.name, searchText: group.name }))}
        placeholder={region ? "Type or select province / area" : "Select region first"} onChange={code => onChange({ region: region?.name || "", province: provinces.find(province => province.code === code)?.name || "", city: "" })} /></Field>
      <Field label={`${prefix} city / municipality *`}><LocationSearch key={`${region?.code}:${province?.code}`} label={`${prefix} city / municipality`} disabled={disabled || !region || !province} value={resolved?.code || ""} options={cities}
        placeholder={province ? "Type or select city / municipality" : "Select province / area first"} onChange={code => onChange(code ? locationForCity(code) : { region: region?.name || "", province: province?.name || "", city: "" })} /></Field>
    </div>
    {needsSelection && <p className="capability-help" role="status">Saved location: {location.city}, {location.province} · {location.region}. Select its matching catalog entry before saving or allocating.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <p className="capability-help">{prefix === "Project" ? "Select the exact project site. Only subcontractors reviewed for this city or municipality qualify." : "Select the company’s actual operating area. Site PM review is required before allocation."}</p>
  </section>
}
