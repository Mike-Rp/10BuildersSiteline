// Pure helper for the Lead Site PM's "Suggest company" action. No React or DOM imports.
// A phase can only go to a company whose verified trades cover every discipline that phase requires.

export type SuggestionPhase = { name: string; disciplines: string[] }
export type SuggestionCompany = { id: string; name: string; disciplines: string[]; commitments: number }
export type SuggestedPair = { companyIds: [string, string]; rows: { phase: string; companyId: string }[] }

export const coversPhase = (company: SuggestionCompany, phase: SuggestionPhase) =>
  phase.disciplines.every((discipline) => company.disciplines.includes(discipline))

/**
 * When no single company covers every remaining phase, find two eligible companies that together do.
 * Prefers the pair with the fewest combined commitments, then the most balanced split, then name order.
 * Each phase goes to the first company that covers it, unless only the second one can.
 * Returns undefined when no pair covers every phase. Foremen are always assigned manually afterwards.
 */
export function suggestCompanyPair(
  companies: SuggestionCompany[],
  phases: SuggestionPhase[],
): SuggestedPair | undefined {
  if (!phases.length) return undefined
  let best: { pair: SuggestedPair; score: [number, number, string] } | undefined
  for (let i = 0; i < companies.length; i++) {
    for (let j = 0; j < companies.length; j++) {
      if (i === j) continue
      const first = companies[i], second = companies[j]
      if (!phases.every((phase) => coversPhase(first, phase) || coversPhase(second, phase))) continue
      const rows = phases.map((phase) => ({ phase: phase.name, companyId: coversPhase(first, phase) ? first.id : second.id }))
      const secondCount = rows.filter((row) => row.companyId === second.id).length
      // Both companies must own at least one phase; otherwise the single-company suggestion applies.
      if (secondCount === 0 || secondCount === rows.length) continue
      const score: [number, number, string] = [
        first.commitments + second.commitments,
        Math.abs(rows.length - 2 * secondCount),
        `${first.name}\u0000${second.name}`,
      ]
      if (!best || compare(score, best.score) < 0) best = { pair: { companyIds: [first.id, second.id], rows }, score }
    }
  }
  return best?.pair
}

function compare(a: [number, number, string], b: [number, number, string]) {
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])
}
