// Structured location matching shared by the browser and API. Never infer a
// service area from a free-text address or a company's willingness to travel.
import { resolveLocation, locationForCity, LOCATION_GROUPS } from "./philippine-locations.js"
export function coordinatesError(value) {
  if (value === undefined) return ""
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Enter both latitude and longitude, or leave both blank."
  for (const [key, limit] of [["latitude", 90], ["longitude", 180]]) {
    const raw = value[key]
    if (!((typeof raw === "number" && Number.isFinite(raw)) || (typeof raw === "string" && /^[-+]?\d+(\.\d+)?$/.test(raw.trim()))) || Math.abs(Number(raw)) > limit)
      return `Enter a valid ${key} between -${limit} and ${limit}. Both coordinates are required for distance ranking.`
  }
  return ""
}
export function normalizeCoordinates(value) {
  if (value === undefined) return undefined
  const error = coordinatesError(value)
  if (error) throw new Error(error)
  return { latitude: Number(value.latitude), longitude: Number(value.longitude) }
}
export function locationError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Enter the region, province/NCR, and city/municipality."
  for (const [key, label] of [["region", "region"], ["province", "province/NCR"], ["city", "city/municipality"]])
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].trim().length > 100 || /[\p{Cc}]/u.test(value[key]))
      return `Enter a valid ${label} (up to 100 characters).`
  if (!resolveLocation(value)) return "Select a valid region, province/NCR or independent-city area, and city/municipality from the location catalog."
  return coordinatesError(value.coordinates)
}
export function normalizeLocation(value) {
  const error = locationError(value)
  if (error) throw new Error(error)
  const location = value.psgcCode !== undefined ? locationForCity(value.psgcCode)
    : Object.fromEntries(["region", "province", "city"].map(key => [key, value[key].trim().replace(/\s+/g, " ")]))
  const coordinates = normalizeCoordinates(value.coordinates)
  return { ...location, ...(coordinates ? { coordinates } : {}) }
}
export function locationLabel(value) {
  return !value || typeof value !== "object" || ![value.city, value.province, value.region].every(part => typeof part === "string" && part.trim()) ? "Location not recorded" : `${value.city}, ${value.province} · ${value.region}`
}
export function sameLocation(a, b) {
  if (locationError(a) || locationError(b)) return false
  return resolveLocation(a).code === resolveLocation(b).code
}
export function sameLocationRecord(a, b) {
  return sameLocation(a, b) && JSON.stringify(normalizeCoordinates(a.coordinates)) === JSON.stringify(normalizeCoordinates(b.coordinates))
}
export function serviceAreasError(areas) {
  if (areas === undefined) return ""
  if (!Array.isArray(areas) || areas.length > 30) return "Use up to 30 additional service areas."
  const keys = new Set()
  for (const area of areas) {
    if (!area || !["city", "province", "region"].includes(area.scope) || locationError(area.location)) return "Select a valid city, province/NCR, or region for every service area."
    const city = resolveLocation(area.location)
    if (area.scope === "province" && LOCATION_GROUPS.find(group => group.code === city.groupCode)?.kind === "independent") return "Independent cities have no province. Choose city coverage or region coverage."
    const key = `${area.scope}:${area.scope === "region" ? city.regionCode : area.scope === "province" ? city.groupCode : city.code}`
    if (keys.has(key)) return "Remove duplicate service areas."
    keys.add(key)
  }
  return ""
}
export function normalizeServiceAreas(areas) {
  const error = serviceAreasError(areas)
  if (error) throw new Error(error)
  return (areas || []).map(area => ({ scope: area.scope, location: locationForCity(resolveLocation(area.location).code) }))
}
export function serviceAreaLabel(area) {
  return area.scope === "region" ? area.location.region : area.scope === "province" ? area.location.province : area.location.city
}
export function servesLocation(projectLocation, reviewedLocation, serviceAreas) {
  if (locationError(projectLocation) || locationError(reviewedLocation) || serviceAreasError(serviceAreas)) return false
  if (sameLocation(projectLocation, reviewedLocation)) return true
  const project = resolveLocation(projectLocation)
  return (serviceAreas || []).some(area => {
    const base = resolveLocation(area.location)
    return area.scope === "region" ? base.regionCode === project.regionCode
      : area.scope === "province" ? base.groupCode === project.groupCode : base.code === project.code
  })
}
export function allocationLocationIssue(projectLocation, reviewedLocation, serviceAreas) {
  if (locationError(projectLocation)) return "Project site location required"
  if (locationError(reviewedLocation)) return "Site PM operating-area review required"
  if (serviceAreasError(serviceAreas)) return "Site PM service-area review required"
  return servesLocation(projectLocation, reviewedLocation, serviceAreas) ? "" : "Outside project operating area"
}

// Great-circle distance (Haversine), mean Earth radius in kilometres. This is
// straight-line proximity, never road distance or travel time. See turfjs.org/docs/api/distance.
export function distanceKm(a, b) {
  if (a === undefined || b === undefined || coordinatesError(a) || coordinatesError(b)) return null
  const from = normalizeCoordinates(a), to = normalizeCoordinates(b), rad = degrees => degrees * Math.PI / 180
  const h = Math.sin(rad(to.latitude - from.latitude) / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(rad(to.longitude - from.longitude) / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))))
}
export function locationProximity(projectLocation, reviewedLocation) {
  const project = !locationError(projectLocation) && resolveLocation(projectLocation)
  const base = !locationError(reviewedLocation) && resolveLocation(reviewedLocation)
  if (!project || !base) return { distanceKm: null, areaRank: 4, areaLabel: "Location unavailable" }
  const sameProvince = project.groupCode === base.groupCode && ["province", "ncr"].includes(LOCATION_GROUPS.find(group => group.code === project.groupCode)?.kind)
  const areaRank = project.code === base.code ? 0 : sameProvince ? 1 : project.regionCode === base.regionCode ? 2 : 3
  return { distanceKm: distanceKm(projectLocation.coordinates, reviewedLocation.coordinates), areaRank,
    areaLabel: ["Same city/municipality", "Same province/NCR", "Same region", "Different region"][areaRank] }
}
export function proximityLabel(proximity) {
  if (!proximity || proximity.distanceKm === null || !Number.isFinite(proximity.distanceKm) || proximity.distanceKm < 0)
    return `Distance unavailable · ${proximity?.areaLabel || "Location unavailable"} · Area fallback`
  return `${proximity.distanceKm > 0 && proximity.distanceKm < 0.1 ? "<0.1" : proximity.distanceKm.toFixed(1)} km straight-line · ${proximity.areaLabel}`
}
