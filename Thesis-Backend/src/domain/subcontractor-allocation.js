// Shared, deterministic allocation rules. No database, UI, dates or worker counts.
export const COMPANY_REQUIREMENTS = Object.freeze({
  Residential: 2,
  Commercial: 3,
  "Mixed-Use": 3,
})
export function requiredCompanies(type) {
  const count = COMPANY_REQUIREMENTS[type]
  if (!count)
    throw new Error("This project type has no company allocation policy.")
  return count
}
export function eligibility(company) {
  if (!company || company.status !== "approved")
    return "Company approval required"
  if (!company.reviewed || !company.disciplines.length)
    return "Site PM capability review required"
  if (company.locationIssue) return company.locationIssue
  if (company.declined) return "Already declined this project"
  if (company.unavailable) return "Company marked unavailable"
  if (company.commitments >= 2)
    return "Two project commitments already reserved"
  return ""
}
export function scopeFor(plan, companyId) {
  return plan.coverage.filter((row) => row.companyId === companyId)
}
export function requirementsFor(phases) {
  return phases.flatMap((phase) =>
    [...new Set(phase.disciplines)].map((discipline) => ({
      phase: phase.name,
      discipline,
    })),
  )
}
const key = (row) => JSON.stringify([row.phase, row.discipline])
const rank = (a, b) =>
  a.commitments - b.commitments ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id)
export function buildCoverage(phases, companies) {
  return requirementsFor(phases).map((row) => {
    const phase = phases.find((p) => p.name === row.phase)
    const candidates = companies
      .filter((c) => c.disciplines.includes(row.discipline))
      .sort(
        (a, b) =>
          phase.disciplines.filter((d) => b.disciplines.includes(d)).length -
            phase.disciplines.filter((d) => a.disciplines.includes(d)).length ||
          rank(a, b),
      )
    return { ...row, companyId: candidates[0]?.id || "" }
  })
}
export function validatePlan(type, phases, plan, companies) {
  if (!plan || !Array.isArray(plan.companyIds) || !Array.isArray(plan.coverage))
    throw new Error("An allocation plan is required.")
  if (
    plan.companyIds.length !== requiredCompanies(type) ||
    new Set(plan.companyIds).size !== plan.companyIds.length
  )
    throw new Error(
      `Choose ${requiredCompanies(type)} different companies for this project type.`,
    )
  const needed = requirementsFor(phases)
  if (!needed.length || phases.some((p) => !p.disciplines.length))
    throw new Error(
      "Project phase requirements are incomplete. Ask Admin to review the phase catalog.",
    )
  if (
    plan.coverage.length !== needed.length ||
    new Set(plan.coverage.map(key)).size !== needed.length ||
    needed.some((r) => !plan.coverage.some((c) => key(c) === key(r)))
  )
    throw new Error(
      "Cover every required discipline in every project phase exactly once.",
    )
  for (const id of plan.companyIds) {
    const company = companies.find((c) => c.id === id),
      reason = eligibility(company)
    if (reason) throw new Error(`${company?.name || "Company"}: ${reason}.`)
    if (!scopeFor(plan, id).length)
      throw new Error("Every selected company must have an agreed scope.")
  }
  for (const row of plan.coverage) {
    if (
      !plan.companyIds.includes(row.companyId) ||
      !companies
        .find((c) => c.id === row.companyId)
        ?.disciplines.includes(row.discipline)
    )
      throw new Error(
        `Verified capability required for ${row.phase}: ${row.discipline}.`,
      )
  }
  return true
}
export function protectScope(oldPlan, nextPlan, protectedIds) {
  for (const id of protectedIds) {
    if (
      !nextPlan.companyIds.includes(id) ||
      JSON.stringify(scopeFor(oldPlan, id).map(key).sort()) !==
        JSON.stringify(scopeFor(nextPlan, id).map(key).sort())
    )
      throw new Error(
        "Contacted and accepted company scopes are locked. Replace only a declined or uncontacted company.",
      )
  }
}
export function replacementCandidates(plan, companyId, companies) {
  const scope = scopeFor(plan, companyId)
  return companies
    .filter(
      (c) =>
        c.id !== companyId &&
        !plan.companyIds.includes(c.id) &&
        !eligibility(c) &&
        scope.every((row) => c.disciplines.includes(row.discipline)),
    )
    .sort(rank)
}
export function replaceCompany(plan, companyId, replacementId) {
  return {
    ...plan,
    companyIds: plan.companyIds.map((id) =>
      id === companyId ? replacementId : id,
    ),
    coverage: plan.coverage.map((row) =>
      row.companyId === companyId
        ? { ...row, companyId: replacementId }
        : { ...row },
    ),
  }
}
export function recommendTeam(type, phases, companies) {
  const count = requiredCompanies(type),
    candidates = companies.filter((c) => !eligibility(c)).sort(rank)
  const disciplines = [
    ...new Set(requirementsFor(phases).map((row) => row.discipline)),
  ]
  let best = null,
    bestScore = Infinity
  function visit(start, selected, score) {
    if (score > bestScore || (best && score === bestScore)) return
    if (selected.length === count) {
      if (
        disciplines.some(
          (d) => !selected.some((c) => c.disciplines.includes(d)),
        )
      )
        return
      const coverage = buildCoverage(phases, selected)
      // Reserve real scope for every partner using bipartite matching. Moving a
      // previous reservation avoids rejecting feasible teams with nested capabilities.
      const reserved = new Map()
      function reserve(company, visited) {
        for (let index = 0; index < coverage.length; index++) {
          if (visited.has(index) || !company.disciplines.includes(coverage[index].discipline)) continue
          visited.add(index)
          const previous = reserved.get(index)
          if (!previous || reserve(previous, visited)) {
            reserved.set(index, company)
            return true
          }
        }
        return false
      }
      const matchingCount = company => coverage.filter(row => company.disciplines.includes(row.discipline)).length
      for (const company of [...selected].sort((a, b) => matchingCount(a) - matchingCount(b) || rank(a, b)))
        if (!reserve(company, new Set())) return
      for (const [index, company] of reserved) coverage[index].companyId = company.id
      if (score < bestScore) {
        best = { companyIds: selected.map((c) => c.id), coverage }
        bestScore = score
      }
      return
    }
    for (let i = start; i <= candidates.length - (count - selected.length); i++)
      visit(
        i + 1,
        [...selected, candidates[i]],
        score + candidates[i].commitments,
      )
  }
  visit(0, [], 0)
  if (best) validatePlan(type, phases, best, companies)
  return best
}
