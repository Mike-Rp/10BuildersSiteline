// Capacity-limited bipartite matching: a required area gets exactly one owner,
// and an engineer receives at most three areas in a phase. Augmenting paths avoid
// losing a valid team when the first engineer shares another engineer's only tag.
export function allocatePhaseCoverage(required, candidates) {
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
