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

// Minimum specialty coverage for every phase: at least half of the unique required
// tags, rounded up (1→1, 2→1, 3→2, 4→2, 5→3, 6→3). Full coverage is still preferred.
export function phaseCoverageQuota(required) {
  const count = [...new Set(required || [])].length
  return Math.ceil(count / 2)
}

export const MAX_ENGINEERS_PER_PHASE = 3 // Historical allocation policy.
export const SETUP_ENGINEER_LIMIT = 3

export function recommendedSitePms(size, complexity) {
  const sizePoints = ["Small", "Medium", "Large"].indexOf(size)
  const complexityPoints = ["Low", "Moderate", "High"].indexOf(complexity)
  if (sizePoints < 0 || complexityPoints < 0) return null
  return Math.min(3, Math.max(1, sizePoints + complexityPoints))
}

// Prefer uncovered, explicitly requested scopes, then other uncovered work.
// Keep the incoming eligibility ranking for ties.
export function recommendPhaseEngineer(required, candidates, additional = [], target = 1) {
  const engineers = [], covered = new Set(), selected = new Set()
  const tags = [...new Set([...additional, ...required])]
  while (engineers.length < Math.min(SETUP_ENGINEER_LIMIT,target)) {
    let best, highest = -1
    for (const person of candidates) {
      if (selected.has(person.id)) continue
      const priority = tag => covered.has(tag) ? 0 : additional.includes(tag) ? 10 : 1
      const owned = tags.filter(tag => person.qualifiedTags.includes(tag))
        .sort((a,b) => priority(b)-priority(a)).slice(0,3)
      const score = owned.reduce((sum,tag) => sum + priority(tag),0)
      if (owned.length && score > highest) {
        best = {id:person.id,tags:owned}
        highest = score
      }
    }
    if (!best) break
    engineers.push(best)
    selected.add(best.id)
    best.tags.forEach(tag => covered.add(tag))
  }
  const missing = required.filter(tag => !covered.has(tag))
  return {engineers, missing, covered:required.length-missing.length,
    complete:missing.length===0, quota:1, quotaMet:engineers.length>0}
}

function combinations(values, size, visit, start = 0, selected = []) {
  if (selected.length === size) return visit(selected)
  for (let index = start; index <= values.length - (size - selected.length); index++) {
    const result = combinations(values, size, visit, index + 1, [...selected, values[index]])
    if (result) return result
  }
  return undefined
}

// Every phase is staffed by at most three engineers. The smallest team that covers
// every tag wins; otherwise the team covering the most tags, which the caller then
// judges against the half-coverage quota. Qualification-equivalent candidates are
// interchangeable for coverage, so keep the best ranked candidate per scope.
export function allocatePhaseCoverage(required, candidates) {
  const tags = [...new Set(required || [])]
  const quota = phaseCoverageQuota(tags)
  const empty = { engineers: [], missing: tags, complete: tags.length === 0, covered: 0, quota, quotaMet: quota === 0 }
  if (!tags.length) return empty

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
  let best
  for (let size = 1; size <= Math.min(MAX_ENGINEERS_PER_PHASE, ranked.length); size++) {
    const team = bestTeam(size)
    if (team && (!best || team.covered > best.covered)) best = team
    if (best?.complete) break
  }
  if (!best) return empty
  return { ...best, quota, quotaMet: best.covered >= quota }
}
