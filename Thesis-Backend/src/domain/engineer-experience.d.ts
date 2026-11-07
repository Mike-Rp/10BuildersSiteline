// Numeric values are legacy whole years. New values explicitly store total months.
export type EngineerExperience = Partial<Record<"Residential" | "Commercial" | "Mixed-Use", number | { months: number }>>
export const EXPERIENCE_PROJECT_TYPES: ("Residential" | "Commercial" | "Mixed-Use")[]
export function normalizeExperience(value: unknown): EngineerExperience
export function experienceYears(experience: EngineerExperience | undefined, type: string): number
export function experienceMonths(experience: EngineerExperience | undefined, type: string): number
export function experienceText(experience: EngineerExperience | undefined, type: string): string
