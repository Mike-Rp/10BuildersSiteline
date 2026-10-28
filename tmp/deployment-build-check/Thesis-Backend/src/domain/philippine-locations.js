import catalog from "./data/philippine-locations.json" with { type: "json" }

export const LOCATION_CATALOG_VERSION = catalog.version
export const LOCATION_REGIONS = catalog.regions
export const LOCATION_GROUPS = catalog.groups
export const LOCATION_CITIES = catalog.cities
const key = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("en-US") : ""
const regionAliases = region => {
  const aliases = [region.name, region.name.match(/\(([^)]+)\)/)?.[1], region.name.split(" (")[0]]
  if (region.code === "1300000000") aliases.push("NCR", "Metro Manila", "Metro Manila (NCR)")
  return aliases.filter(Boolean).map(key)
}
export function findRegion(name) {
  return LOCATION_REGIONS.find(region => regionAliases(region).includes(key(name)))
}
export function provinceOptions(regionCode) {
  return LOCATION_GROUPS.filter(group => group.regionCode === regionCode).sort((a, b) => a.name.localeCompare(b.name))
}
export function findProvince(regionCode, name) {
  return provinceOptions(regionCode).find(group => key(group.name) === key(name) || (group.kind === "ncr" && ["ncr", "national capital region (ncr)"].includes(key(name))))
}
export function cityOptions(regionCode, groupCode) {
  return LOCATION_CITIES.filter(city => city.regionCode === regionCode && city.groupCode === groupCode).sort((a, b) => a.name.localeCompare(b.name))
}
function cityAliases(city) {
  const aliases = [city.name]
  if (/^City of /i.test(city.name)) aliases.push(city.name.slice(8), city.name.slice(8) + " City")
  else if (/ City$/i.test(city.name)) aliases.push(city.name.slice(0, -5), "City of " + city.name.slice(0, -5))
  return aliases.map(key)
}
// Legacy names resolve only within the explicitly recorded region and parent
// area. No fuzzy matching, island-level matching, or free-address parsing.
export function resolveLocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const region = findRegion(value.region)
  if (!region) return undefined
  if (value.psgcCode !== undefined && (typeof value.psgcCode !== "string" || !/^\d{10}$/.test(value.psgcCode))) return undefined
  const matches = LOCATION_CITIES.filter(city => {
    if (city.regionCode !== region.code || !cityAliases(city).includes(key(value.city))) return false
    if (value.psgcCode !== undefined && city.code !== value.psgcCode) return false
    const group = findProvince(region.code, value.province)
    return group?.code === city.groupCode || (value.psgcCode === undefined && city.legacyProvince && key(city.legacyProvince) === key(value.province))
  })
  return matches.length === 1 ? matches[0] : undefined
}
export function locationForCity(code) {
  const city = LOCATION_CITIES.find(city => city.code === code)
  if (!city) throw new Error("Select a city or municipality from the location catalog.")
  return { region: LOCATION_REGIONS.find(region => region.code === city.regionCode).name,
    province: LOCATION_GROUPS.find(group => group.code === city.groupCode).name,
    city: city.name, psgcCode: city.code }
}
