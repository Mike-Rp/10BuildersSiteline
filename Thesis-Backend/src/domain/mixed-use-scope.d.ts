export type MixedUseScope = {
  version: number; uses: string[]; features: { podium: boolean; tower: boolean; curtainWall: boolean; landscaping: boolean };
  basis: string; confirmed: boolean; phases?: string[]; notApplicable?: {name: string; reason: string}[];
  confirmedBy?: string; confirmedAt?: string
}
export const MIXED_USE_USES: readonly {code: string; label: string}[]
export const MIXED_USE_FEATURES: readonly {code: keyof MixedUseScope["features"]; label: string}[]
export function defaultMixedUseScope(): MixedUseScope
export function mixedUsePhaseReview(scope: MixedUseScope): {name: string; disciplines: string[]; included: boolean; reason: string; required: boolean}[]
export function mixedUseScopeError(scope: unknown, requireConfirmation?: boolean): string
export function normalizeMixedUseScope(scope: unknown): MixedUseScope & {phases: string[]; notApplicable: {name: string; reason: string}[]}
