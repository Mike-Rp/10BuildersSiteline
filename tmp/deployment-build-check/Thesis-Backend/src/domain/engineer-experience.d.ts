export type EngineerExperience = Partial<Record<"Residential" | "Commercial" | "Mixed-Use", number>>
export const EXPERIENCE_PROJECT_TYPES: ("Residential" | "Commercial" | "Mixed-Use")[]
export function normalizeExperience(value: unknown): EngineerExperience
export function experienceYears(experience: EngineerExperience | undefined, type: string): number
export function experienceText(experience: EngineerExperience | undefined, type: string): string
