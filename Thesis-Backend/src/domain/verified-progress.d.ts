export type VerifiedActivity = {
  id: string
  required: boolean
  weight: number
  status: string
  approvalValid?: boolean
}
export type VerifiedPhase = { id: string; configured: boolean; activities: VerifiedActivity[] }
export type ProgressTotals = {
  earned: number | null
  total: number | null
  percentage: number | null
  reason: string | null
}
export type VerifiedProgress = {
  project: ProgressTotals
  phases: (ProgressTotals & { id: string; name: string })[]
}
export function activityEarned(activity: VerifiedActivity): number | null
export function phaseProgress(phase: VerifiedPhase): ProgressTotals
export function projectProgress(phases: VerifiedPhase[], expectedPhaseIds: string[]): ProgressTotals
export function reworkImpact(phases: VerifiedPhase[], expectedPhaseIds: string[], affectedActivityIds: string[]): {
  before: ProgressTotals
  after: ProgressTotals
  loss: number | null
  reason: string | null
  phases: { id: string; before: ProgressTotals; after: ProgressTotals; loss: number }[]
}
