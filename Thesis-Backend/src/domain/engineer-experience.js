export const EXPERIENCE_PROJECT_TYPES = ["Residential", "Commercial", "Mixed-Use"];
export function normalizeExperience(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter experience as years for each project type.");
  const result = {};
  for (const [type, years] of Object.entries(value)) {
    if (!EXPERIENCE_PROJECT_TYPES.includes(type) || typeof years !== "number" || !Number.isInteger(years) || years < 0 || years > 80)
      throw new Error("Experience must be whole years from 0 to 80 for Residential, Commercial or Mixed-Use.");
    result[type] = years;
  }
  return result;
}
export function experienceYears(experience, type) {
  const years = experience?.[type];
  return typeof years === "number" && Number.isInteger(years) && years >= 0 && years <= 80 ? years : 0;
}
export function experienceText(experience, type) {
  return Object.hasOwn(experience || {}, type) ? `${experienceYears(experience, type)} ${experienceYears(experience, type) === 1 ? "year" : "years"} in ${type}` : `${type} experience not recorded`;
}
