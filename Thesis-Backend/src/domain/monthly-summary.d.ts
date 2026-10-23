export type SummaryProjection = "staff" | "site" | "client"
export type SummaryPending = { evidence: number; reports: number; rework: number }
export type SummaryRow = {
  id: string
  name: string
  type: string
  status: string
  opening: number | null
  closing: number | null
  change: number | null
  changeNote: string | null
  completedPhases: { phase: string; date: string; stillComplete: boolean }[] | null
  limited: boolean
  approvals?: number | null
  rework?: number | null
  pending?: SummaryPending | null
}
export type SummaryPeriod = { month: string; timezone: string; start: string; end: string; cutoff: string; monthToDate: boolean; generatedAt: string }
export type MonthlySummary = {
  period: SummaryPeriod
  projection: SummaryProjection
  inclusion: { included: number; excludedAfterCutoff: number; rule: string }
  rows: SummaryRow[]
}
export type SummaryFilters = { search: string; type: string; outstanding: "all" | "pending" | "none" }
export type SummaryTotal = { value: number | null; contributing: number; of: number; partial: boolean }
export type SummaryTotals = {
  projects: number
  completedPhases: SummaryTotal
  approvals: SummaryTotal | null
  rework: SummaryTotal | null
  pending: (SummaryTotal & SummaryPending) | null
}
export type SummaryHighlights = { during: string[]; outstanding: string[]; coverage: string[] }
export type SummaryView = { filters: SummaryFilters; rows: SummaryRow[]; totals: SummaryTotals; highlights: SummaryHighlights }
export const SUMMARY_FILTERS: SummaryFilters
export function formatPoints(value: number): string
export function summaryMetrics(projection: SummaryProjection): { approvals: boolean; rework: boolean; pending: boolean }
export function normalizeSummaryFilters(filters?: Partial<SummaryFilters>): SummaryFilters
export function filterSummaryRows(rows: SummaryRow[], filters: Partial<SummaryFilters>): SummaryRow[]
export function summarizeRows(rows: SummaryRow[], projection: SummaryProjection): SummaryTotals
export function summaryHighlights(rows: SummaryRow[], projection: SummaryProjection): SummaryHighlights
export function summaryView(summary: MonthlySummary, filters?: Partial<SummaryFilters>): SummaryView
