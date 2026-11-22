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
export const SPECIALTIES_BY_PROFESSION = {
  "Civil Engineer": [
    "Structural Engineering",
    "Geotechnical Engineering",
    "Foundation Engineering",
    "Construction Engineering",
    "Transportation Engineering",
    "Highway Engineering",
    "Hydraulic Engineering",
    "Water Resources Engineering",
    "Materials Engineering",
    "Earthquake/Seismic Engineering"
  ],
  "Mechanical Engineer": [
    "HVAC Engineering",
    "Air-Conditioning Engineering",
    "Refrigeration Engineering",
    "Ventilation Engineering",
    "Fire Protection Engineering (Mechanical Systems)",
    "Mechanical Building Services Engineering",
    "Energy Systems Engineering",
    "Elevator and Escalator Engineering"
  ],
  "Electrical Engineer": [
    "Power Systems Engineering",
    "Electrical Design Engineering",
    "Power Distribution Engineering",
    "Lighting Engineering",
    "Renewable Energy Engineering",
    "Electrical Protection Engineering",
    "Electrical Installation Engineering"
  ],
  "Electronics Engineer": [
    "Telecommunications Engineering",
    "Extra-Low Voltage (ELV) Systems Engineering",
    "Fire Detection and Alarm Systems Engineering",
    "Building Automation Engineering",
    "Instrumentation and Controls Engineering",
    "Data and Network Systems Engineering",
    "Security and Surveillance Systems Engineering"
  ],
  "Sanitary Engineer": [
    "Water Supply Engineering",
    "Sanitary Drainage Engineering",
    "Sewerage Engineering",
    "Wastewater Treatment Engineering",
    "Environmental Sanitation Engineering",
    "Plumbing Systems Engineering"
  ],
  "Geodetic Engineer": [
    "Land Surveying",
    "Construction Surveying",
    "Geomatics Engineering",
    "Mapping and Cartography",
    "Geographic Information Systems (GIS)",
    "Geospatial Data Engineering"
  ]
}
export const ENGINEER_JOB_TITLES = [
  "Office Project Manager (OPM)",
  "Site Project Manager (SPM)",
  "Project Engineer",
  "Site Engineer",
  "Field Engineer",
  "Resident Engineer",
  "Construction Engineer",
  "Planning Engineer",
  "Scheduling Engineer",
  "Cost Engineer",
  "Quantity Engineer",
  "Estimation Engineer",
  "QA/QC Engineer",
  "Safety Engineer",
  "MEP Engineer",
  "MEP Coordination Engineer",
  "Commissioning Engineer",
  "Testing and Commissioning Engineer",
  "BIM Engineer",
  "Project Controls Engineer"
]
export const CREDENTIAL_SPECIALIZATIONS = [
  ...ENGINEER_SPECIALIZATIONS,
  ...Object.values(SPECIALTIES_BY_PROFESSION).flat(),
]

export function credentialChoices(profession, saved = []) {
  const current = Object.hasOwn(SPECIALTIES_BY_PROFESSION, profession) ? SPECIALTIES_BY_PROFESSION[profession] : []
  const eligible = ENGINEER_SPECIALIZATIONS.filter(tag => SPECIALIZATION_PROFESSIONS[tag]?.includes(profession))
  return [...new Set([...current, ...eligible, ...saved])]
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
    !c.revoked_at &&
    !c.correction_required &&
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
  legacySpecializations = specializations,
) {
  return specializations.filter((tag) =>
    credentials.some(
      (c) =>
        credentialEligible(c, today, noticeDays) &&
        (SPECIALIZATION_PROFESSIONS[tag]?.includes(c.profession)
          ? (c.specializations == null ? legacySpecializations.includes(tag) : c.specializations.includes(tag))
          : !!c.specializations?.includes(tag) && !!SPECIALTIES_BY_PROFESSION[c.profession]?.includes(tag)),
    ),
  )
}
