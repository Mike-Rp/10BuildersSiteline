// Phase ownership is manual. Company suggestions never assign foremen.
export function validatePhaseAssignments(
  phases,
  assignments,
  companies,
  { draft = false } = {},
) {
  if (
    !Array.isArray(assignments) ||
    assignments.length !== phases.length ||
    assignments.length > 100
  )
    throw new Error("Assign every remaining phase exactly once.")
  const seen = new Set()
  for (const row of assignments) {
    const phase = phases.find((p) => p.name === row?.phase)
    if (!phase || seen.has(row.phase))
      throw new Error("A phase must have exactly one responsible foreman.")
    seen.add(row.phase)
    if (draft && row.companyId === "" && row.foremanId === "") continue
    const company = companies.find((c) => c.id === row.companyId)
    if (
      !company ||
      company.status !== "approved" ||
      !company.reviewed ||
      company.unavailable
    )
      throw new Error(
        "Choose an approved company with verified, available capabilities.",
      )
    if (!phase.disciplines.every((d) => company.disciplines.includes(d)))
      throw new Error(
        `${company.name} does not cover all required trades for ${phase.name}.`,
      )
    if (
      !(draft && row.foremanId === "") &&
      !company.foremen?.some((f) => f.id === row.foremanId)
    )
      throw new Error(
        "Choose a current foreman contact belonging to the assigned company.",
      )
  }
  return assignments.map(({ phase, companyId, foremanId }) => ({
    phase,
    companyId,
    foremanId,
  }))
}
export function changedCompanies(previous, next) {
  const ids = new Set([...previous, ...next].map((r) => r.companyId))
  const scope = (rows, id) =>
    JSON.stringify(
      rows
        .filter((r) => r.companyId === id)
        .map((r) => [r.phase, r.foremanId])
        .sort(),
    )
  return [...ids].filter((id) => scope(previous, id) !== scope(next, id))
}
