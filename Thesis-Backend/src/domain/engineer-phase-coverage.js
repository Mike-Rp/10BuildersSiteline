// Capacity-limited bipartite matching: a required area gets exactly one owner,
// and an engineer receives at most three areas in a phase. Augmenting paths avoid
// losing a valid team when the first engineer shares another engineer's only tag.
function allocate(required, candidates) {
  const tags = [...new Set(required)],
    slots = candidates.flatMap((person) =>
      Array.from({ length: 3 }, (_, index) => ({ person, index })),
    ),
    assigned = new Map()
  function place(tag, visited) {
    for (let i = 0; i < slots.length; i++) {
      if (visited.has(i) || !slots[i].person.qualifiedTags.includes(tag))
        continue
      visited.add(i)
      const previous = assigned.get(i)
      if (previous === undefined || place(previous, visited)) {
        assigned.set(i, tag)
        return true
      }
    }
    return false
  }
  const ordered = [...tags].sort(
    (a, b) =>
      candidates.filter((p) => p.qualifiedTags.includes(a)).length -
      candidates.filter((p) => p.qualifiedTags.includes(b)).length,
  )
  for (const tag of ordered) place(tag, new Set())
  const engineers = candidates
    .map((person) => ({
      id: person.id,
      tags: tags.filter((tag) =>
        [...assigned].some(
          ([slot, value]) =>
            value === tag && slots[slot].person.id === person.id,
        ),
      ),
    }))
    .filter((person) => person.tags.length)
  const missing = tags.filter(
    (tag) => !engineers.some((person) => person.tags.includes(tag)),
  )
  return { engineers, missing, complete: missing.length === 0 }
}

export function phaseCoverageQuota(required) {
  const count = [...new Set(required || [])].length
  return count >= 5 ? Math.ceil(count / 2) : count
}

function combinations(values, size, visit, start = 0, selected = []) {
  if (selected.length === size) return visit(selected)
  for (let index = start; index <= values.length - (size - selected.length); index++) {
    const result = combinations(values, size, visit, index + 1, [...selected, values[index]])
    if (result) return result
  }
  return undefined
}

// For large phases, prefer complete coverage with two engineers, then three.
// If neither team can cover every tag, retain the best two-person team that meets
// the half-coverage quota, then try three. Qualification-equivalent candidates
// are interchangeable for coverage, so keep the best ranked candidate per scope.
export function allocatePhaseCoverage(required, candidates) {
  const tags = [...new Set(required || [])]
  if (tags.length < 5) return allocate(tags, candidates)

  const profiles = new Map()
  for (const person of candidates) {
    const profile = tags.filter(tag => person.qualifiedTags.includes(tag))
    if (!profile.length) continue
    const key = tags.map(tag => profile.includes(tag) ? "1" : "0").join("")
    if (!profiles.has(key)) profiles.set(key, person)
  }
  const ranked = [...profiles.values()]
  const bestTeam = size => {
    let best
    combinations(ranked, size, team => {
      const result = allocate(tags, team)
      const covered = tags.length - result.missing.length
      if (!best || covered > best.covered) best = { ...result, covered }
      return undefined
    })
    return best
  }
  for (const size of [2, 3]) {
    if (ranked.length < size) continue
    const full = bestTeam(size)
    if (full?.complete) return full
  }

  const quota = phaseCoverageQuota(tags)
  for (const size of [2, 3, 1]) {
    if (ranked.length < size) continue
    const best = bestTeam(size)
    if (best?.covered >= quota) return best
  }
  const best = bestTeam(Math.min(3, ranked.length))
  return best || { engineers: [], missing: tags, complete: false, covered: 0 }
}
