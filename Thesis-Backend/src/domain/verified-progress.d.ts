export type VerifiedActivity = {
  id: string
  required: boolean
  weight: number
  status: string
  approvalValid?: boolean
}
export type VerifiedPhase = { id: string; name?: string; configured: boolean; activities: VerifiedActivity[] }
export type ProgressOptions = { weighting?: string | null }
export const FOUNDATION_WEIGHTING: "foundation_15"
export const FOUNDATION_PROJECT_WEIGHT: 15
export type ProgressTotals = {
  earned: number | null
  total: number | null
  percentage: number | null
  reason: string | null
  complete?: boolean
}
export type VerifiedProgress = {
  project: ProgressTotals
  phases: (ProgressTotals & { id: string; name: string })[]
}
export function activityEarned(activity: VerifiedActivity): number | null
export function phaseProgress(phase: VerifiedPhase): ProgressTotals
export function projectProgress(phases: VerifiedPhase[], expectedPhaseIds: string[], options?: ProgressOptions): ProgressTotals
export function phaseProjectWeights(phases: VerifiedPhase[], expectedPhaseIds: string[], weighting?: string | null): Map<string, number> | null
export function projectPointsPerActivityPoint(phases: VerifiedPhase[], expectedPhaseIds: string[], weighting: string | null | undefined, phaseId: string): number
export function reworkImpact(phases: VerifiedPhase[], expectedPhaseIds: string[], affectedActivityIds: string[], options?: ProgressOptions): {
  before: ProgressTotals
  after: ProgressTotals
  loss: number | null
  reason: string | null
  phases: { id: string; before: ProgressTotals; after: ProgressTotals; loss: number }[]
}
