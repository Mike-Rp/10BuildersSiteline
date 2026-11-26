import type { PhaseRange } from "./phase-schedule.js"
export type PhaseScheduleImpact = { phase: string; release: string; dates: Record<string, PhaseRange>; completion: string; requiresExtension: boolean }
export type PhaseScheduleRevision = PhaseScheduleImpact & { id: string; reason: string; submittedAt: string; approvedAt?: string }
export type MixedUseScope = {
  version: number; uses: string[]; features: { podium: boolean; tower: boolean; curtainWall: boolean; landscaping: boolean };
  basis: string; confirmed: boolean; phases?: string[]; notApplicable?: {name: string; reason: string}[];
  confirmedBy?: string; confirmedAt?: string
  phase_dates?: Record<string, PhaseRange>; phase_schedule_baseline?: Record<string, PhaseRange>;
  pending_phase_revision?: PhaseScheduleRevision; phase_schedule_history?: PhaseScheduleRevision[];
}
export const MIXED_USE_USES: readonly {code: string; label: string}[]
export const MIXED_USE_FEATURES: readonly {code: keyof MixedUseScope["features"]; label: string}[]
export type MixedUseSelections = Pick<MixedUseScope, "version" | "uses" | "features">
export function mixedUseSelectionsError(scope: unknown): string
export function normalizeMixedUseSelections(scope: unknown): MixedUseSelections
export function defaultMixedUseScope(): MixedUseScope
export function mixedUsePhaseReview(scope: MixedUseSelections): {name: string; disciplines: string[]; included: boolean; reason: string; required: boolean}[]
export function mixedUseScopeError(scope: unknown, requireConfirmation?: boolean): string
export function normalizeMixedUseScope(scope: unknown): MixedUseScope & {phases: string[]; notApplicable: {name: string; reason: string}[]}
