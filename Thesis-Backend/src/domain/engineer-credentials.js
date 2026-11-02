// Independent of company capabilities. This catalog does not certify legal scope or competence.
export const PROFESSIONS = [
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Sanitary Engineer",
  "Electronics Engineer",
  "Geodetic Engineer",
]
export const ENGINEER_SPECIALIZATIONS = [
  "Civil",
  "Structural",
  "Geotechnical",
  "Mechanical",
  "Electrical",
  "Sanitary",
  "Electronics",
  "Surveying",
  "Fire Protection",
  "Facade",
  "Acoustic",
]
export const SPECIALIZATION_PROFESSIONS = {
  Civil: ["Civil Engineer"],
  Structural: ["Civil Engineer"],
  Geotechnical: ["Civil Engineer"],
  Mechanical: ["Mechanical Engineer"],
  Electrical: ["Electrical Engineer"],
  Sanitary: ["Sanitary Engineer"],
  Electronics: ["Electronics Engineer"],
  Surveying: ["Geodetic Engineer"],
  "Fire Protection": [],
  Facade: [],
  Acoustic: [],
}
// Company validation remains necessary for systems that cross professions. Civil matches below mean site coordination only.
export const REQUIREMENT_SPECIALIZATIONS = {
  Civil: ["Civil"],
  Structural: ["Structural"],
  Geotechnical: ["Geotechnical"],
  Mechanical: ["Mechanical"],
  Electrical: ["Electrical"],
  Plumbing: ["Sanitary"],
  "Interior/Finishes": ["Civil"],
  Landscape: ["Civil"],
  "Fire Protection": [],
  Facade: [],
  Acoustic: [],
}
export const LICENSE_NUMBER_MAX = 7
export function licenseNumberError(value) {
  return typeof value === "string" && /^[0-9]{7}$/.test(value)
    ? ""
    : "Enter exactly 7 digits for the PRC license number. Keep any leading zeros."
}
export function isoDateValid(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const d = new Date(value + "T00:00:00Z")
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}
export function credentialEligible(c, today, noticeDays = 30) {
  const threshold = new Date(
    Date.parse(today + "T00:00:00Z") + noticeDays * 86400000,
  )
    .toISOString()
    .slice(0, 10)
  return (
    c.verification_status === "verified" &&
    !!c.verified_by &&
    !!c.verified_at &&
    PROFESSIONS.includes(c.profession) &&
    !licenseNumberError(c.license_number) &&
    !c.superseded_at &&
    !!c.upload_file_ref &&
    c.upload_status === "uploaded" &&
    c.license_expiry > threshold
  )
}
export function qualifyingSpecializations(
  credentials,
  specializations,
  today,
  noticeDays = 30,
) {
  return specializations.filter((tag) =>
    credentials.some(
      (c) =>
        credentialEligible(c, today, noticeDays) &&
        (SPECIALIZATION_PROFESSIONS[tag] || []).includes(c.profession),
    ),
  )
}
