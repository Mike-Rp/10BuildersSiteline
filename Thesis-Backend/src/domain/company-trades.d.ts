export const COMPANY_TRADES: readonly string[]
export const COMPANY_PHASE_TRADES: Record<string, Record<string, string[]>>
export function normalizeCompanyTrades(trades: string[]): string[]
export function companyTradeOptions(selected?: string[]): string[]
export function companyTradePhases(type: string, phases: { name: string }[]): { name: string; disciplines: string[] }[]
