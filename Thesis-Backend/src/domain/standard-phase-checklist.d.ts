export const STANDARD_PHASE_ACTIVITIES: readonly Readonly<{ code: string; title: string; weight: number }>[]
export const MOBILIZATION_ACTIVITIES: typeof STANDARD_PHASE_ACTIVITIES
export const CLOSEOUT_ACTIVITIES: typeof STANDARD_PHASE_ACTIVITIES
export function standardActivities(position: number, count: number): typeof STANDARD_PHASE_ACTIVITIES
