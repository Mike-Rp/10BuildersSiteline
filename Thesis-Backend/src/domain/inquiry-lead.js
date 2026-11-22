export function matchingInquiryTags(assignedTags, eligibleTags) {
  if (!Array.isArray(assignedTags) || !assignedTags.length || !assignedTags.every(tag => eligibleTags.includes(tag))) return []
  return [...new Set(assignedTags)]
}

// The first included phase supplies the lead. Experience ranks its eligible
// assignees, with account ID breaking ties.
export function selectInquiryLead(phases, team, experienceById, eligibleTagsFor) {
  const stage = phases[0]
  if (!stage) return null
  const entry = team.find(row => row?.stage === stage)
  if (!entry) return null
  const assignments = entry.engineers?.length ? entry.engineers : [entry]
  let lead = null
  for (const person of assignments.filter(person => person.user_id).sort((a, b) => a.user_id.localeCompare(b.user_id))) {
    const id = person.user_id
    const tags = matchingInquiryTags(person.assigned_disciplines, eligibleTagsFor(stage, id))
    if (!tags.length) continue
    const years = experienceById.get(id) ?? 0
    if (!lead || years > lead.years) lead = { stage, id, years, tags }
  }
  return lead
}
