// Structured location matching shared by the browser and API. Never infer a
// service area from a free-text address or a company's willingness to travel.
import { resolveLocation, locationForCity } from "./philippine-locations.js"
export function locationError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Enter the region, province/NCR, and city/municipality."
  for (const [key, label] of [["region", "region"], ["province", "province/NCR"], ["city", "city/municipality"]])
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].trim().length > 100 || /[\p{Cc}]/u.test(value[key]))
      return `Enter a valid ${label} (up to 100 characters).`
  if (!resolveLocation(value)) return "Select a valid region, province/NCR or independent-city area, and city/municipality from the location catalog."
  return ""
}
export function normalizeLocation(value) {
  const error = locationError(value)
  if (error) throw new Error(error)
  if (value.psgcCode !== undefined) return locationForCity(value.psgcCode)
  return Object.fromEntries(["region", "province", "city"].map(key => [key, value[key].trim().replace(/\s+/g, " ")]))
}
export function locationLabel(value) {
  return !value || typeof value !== "object" || ![value.city, value.province, value.region].every(part => typeof part === "string" && part.trim()) ? "Location not recorded" : `${value.city}, ${value.province} · ${value.region}`
}
export function sameLocation(a, b) {
  if (locationError(a) || locationError(b)) return false
  return resolveLocation(a).code === resolveLocation(b).code
}
export function allocationLocationIssue(projectLocation, reviewedLocation) {
  if (locationError(projectLocation)) return "Project site location required"
  if (locationError(reviewedLocation)) return "Site PM operating-area review required"
  return sameLocation(projectLocation, reviewedLocation) ? "" : "Outside project operating area"
}
