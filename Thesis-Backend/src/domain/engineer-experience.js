export const EXPERIENCE_PROJECT_TYPES = ["Residential", "Commercial", "Mixed-Use"];
export function normalizeExperience(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter experience for each project type.");
  const result = {};
  for (const [type, entry] of Object.entries(value)) {
    const legacy = typeof entry === "number";
    const valid = legacy ? Number.isInteger(entry) && entry >= 0 && entry <= 80
      : entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 1 && Number.isInteger(entry.months) && entry.months >= 0 && entry.months <= 960;
    if (!EXPERIENCE_PROJECT_TYPES.includes(type) || !valid)
      throw new Error("Use whole years (0–80) and months (0–11), up to 80 years total, for Residential, Commercial or Mixed-Use.");
    result[type] = legacy ? entry : { months: entry.months };
  }
  return result;
}
export function experienceYears(experience, type) {
  return experienceMonths(experience, type) / 12;
}
export function experienceMonths(experience, type) {
  const entry = experience?.[type];
  if (typeof entry === "number") return Number.isInteger(entry) && entry >= 0 && entry <= 80 ? entry * 12 : 0;
  return entry && Number.isInteger(entry.months) && entry.months >= 0 && entry.months <= 960 ? entry.months : 0;
}
export function experienceText(experience, type) {
  if (!Object.hasOwn(experience || {}, type)) return `${type} experience not recorded`;
  const total = experienceMonths(experience, type), years = Math.floor(total / 12), months = total % 12;
  const parts = [];
  if (years || !months) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return `${parts.join(", ")} in ${type}`;
}
