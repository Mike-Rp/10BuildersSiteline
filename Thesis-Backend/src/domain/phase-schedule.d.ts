export type PhaseRange = { start: string; end: string }
type PhaseRule = { waitsFor: string[]; overlapWith?: string }
export function phaseWorkday(date: string, offset?: number): string
export function forecastPhaseDelay(dates: Record<string, PhaseRange>, phase: string, release: string, rules?: Record<string, PhaseRule>): Record<string, PhaseRange> | null
export function suggestPhaseSchedule(input: {
  phases: string[]; type: string; complexity?: string; arrangement?: string;
  start?: string; area: unknown; dates?: Record<string, PhaseRange>;
}): Record<string, PhaseRange & PhaseRule & { days: number }>
