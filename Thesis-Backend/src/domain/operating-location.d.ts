export type OperatingLocation = { region: string; province: string; city: string }
export function locationError(value: unknown): string
export function normalizeLocation(value: unknown): OperatingLocation
export function locationLabel(value: unknown): string
export function sameLocation(a: unknown, b: unknown): boolean
export function allocationLocationIssue(projectLocation: unknown, reviewedLocation: unknown): string
