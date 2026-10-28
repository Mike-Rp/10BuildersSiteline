export type Coordinates = { latitude: number | string; longitude: number | string }
export type OperatingLocation = { region: string; province: string; city: string; psgcCode?: string; coordinates?: Coordinates }
export type ServiceArea = { scope: "city" | "province" | "region"; location: OperatingLocation }
export type Proximity = { distanceKm: number | null; areaRank: number; areaLabel: string }
export function coordinatesError(value: unknown): string
export function normalizeCoordinates(value: unknown): { latitude: number; longitude: number } | undefined
export function locationError(value: unknown): string
export function normalizeLocation(value: unknown): OperatingLocation
export function locationLabel(value: unknown): string
export function sameLocation(a: unknown, b: unknown): boolean
export function sameLocationRecord(a: unknown, b: unknown): boolean
export function serviceAreasError(value: unknown): string
export function normalizeServiceAreas(value: unknown): ServiceArea[]
export function serviceAreaLabel(value: ServiceArea): string
export function servesLocation(projectLocation: unknown, reviewedLocation: unknown, serviceAreas?: unknown): boolean
export function allocationLocationIssue(projectLocation: unknown, reviewedLocation: unknown, serviceAreas?: unknown): string
export function distanceKm(a: unknown, b: unknown): number | null
export function locationProximity(projectLocation: unknown, reviewedLocation: unknown): Proximity
export function proximityLabel(value?: Proximity): string
