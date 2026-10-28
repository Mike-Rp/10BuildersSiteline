import type { OperatingLocation } from "./operating-location.js"
export type LocationRegion = { code: string; name: string }
export type LocationGroup = { code: string; name: string; regionCode: string; kind: string }
export type LocationCity = { code: string; name: string; regionCode: string; groupCode: string; legacyProvince?: string }
export const LOCATION_CATALOG_VERSION: string
export const LOCATION_REGIONS: LocationRegion[]
export const LOCATION_GROUPS: LocationGroup[]
export const LOCATION_CITIES: LocationCity[]
export function findRegion(name: unknown): LocationRegion | undefined
export function findProvince(regionCode: string, name: unknown): LocationGroup | undefined
export function provinceOptions(regionCode: string): LocationGroup[]
export function cityOptions(regionCode: string, groupCode: string): LocationCity[]
export function resolveLocation(value: unknown): LocationCity | undefined
export function locationForCity(code: string): OperatingLocation
