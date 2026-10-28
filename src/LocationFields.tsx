import { Field } from "./ui"
import LocationSearch from "./LocationSearch"
import { LOCATION_REGIONS, findRegion, findProvince, provinceOptions, cityOptions, resolveLocation, locationForCity } from "../Thesis-Backend/src/domain/philippine-locations.js"
import type { OperatingLocation } from "../Thesis-Backend/src/domain/operating-location.js"
import { coordinatesError } from "../Thesis-Backend/src/domain/operating-location.js"

export default function LocationFields({ value, onChange, disabled = false, prefix = "Operating", error, allowCoordinates = true }: {
  value?: OperatingLocation; onChange: (location: OperatingLocation) => void; disabled?: boolean; prefix?: string; error?: string; allowCoordinates?: boolean
}) {
  const location = value || { region: "", province: "", city: "" }
  const resolved = resolveLocation(location)
  const region = findRegion(location.region)
  const province = resolved ? provinceOptions(resolved.regionCode).find(group => group.code === resolved.groupCode) : region ? findProvince(region.code, location.province) : undefined
  const provinces = region ? provinceOptions(region.code) : []
  const cities = region && province ? cityOptions(region.code, province.code) : []
  const needsSelection = !!location.city && !resolved
  function changeCoordinate(key: "latitude" | "longitude", value: string) {
    const coordinates = { latitude: location.coordinates?.latitude ?? "", longitude: location.coordinates?.longitude ?? "", [key]: value }
    onChange({ ...location, coordinates: coordinates.latitude === "" && coordinates.longitude === "" ? undefined : coordinates })
  }
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
    {allowCoordinates && <details className="location-coordinates">
      <summary>{prefix === "Project" ? "Exact project site" : "Exact operating base"} coordinates (optional)</summary>
      <p className="capability-help">Copy the latitude and longitude from the confirmed site or operating-base map pin. Confirm that the pin is within the selected city. Leave both blank to use city, province and region matching.</p>
      <div className="form-grid">
        <Field label={`${prefix} latitude`}><input aria-label={`${prefix} latitude`} type="text" inputMode="decimal" placeholder="e.g. 14.5995" value={location.coordinates?.latitude ?? ""} disabled={disabled || !resolved} onChange={event => changeCoordinate("latitude", event.target.value)} /></Field>
        <Field label={`${prefix} longitude`}><input aria-label={`${prefix} longitude`} type="text" inputMode="decimal" placeholder="e.g. 120.9842" value={location.coordinates?.longitude ?? ""} disabled={disabled || !resolved} onChange={event => changeCoordinate("longitude", event.target.value)} /></Field>
      </div>
      {coordinatesError(location.coordinates) && <p role="alert" className="error">{coordinatesError(location.coordinates)}</p>}
    </details>}
    {error && <p role="alert" className="error">{error}</p>}
    <p className="capability-help">{prefix === "Project" ? "Select the project site. Eligible companies must have Site PM-reviewed service coverage for this location." : prefix === "Operating" ? "Select the company’s operating base. Site PM review confirms its base and additional service areas before allocation." : "Choose a catalog location within the area the company can serve."}</p>
  </section>
}
