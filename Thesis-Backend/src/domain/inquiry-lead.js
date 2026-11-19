export function matchingInquiryTags(assignedTags, eligibleTags) {
  if (!Array.isArray(assignedTags) || !assignedTags.length || !assignedTags.every(tag => eligibleTags.includes(tag))) return []
  return [...new Set(assignedTags)]
}

// Phase order breaks experience ties, then account ID breaks ties within a phase.
export function selectInquiryLead(phases, team, experienceById, eligibleTagsFor) {
  let lead = null
  for (const stage of phases) {
    const entry = team.find(row => row?.stage === stage)
    if (!entry) continue
    const assignments = entry.engineers?.length ? entry.engineers : [entry]
    for (const person of assignments.filter(person => person.user_id).sort((a, b) => a.user_id.localeCompare(b.user_id))) {
      const id = person.user_id
      const tags = matchingInquiryTags(person.assigned_disciplines, eligibleTagsFor(stage, id))
      if (!tags.length) continue
      const years = experienceById.get(id) ?? 0
      if (!lead || years > lead.years) lead = { stage, id, years, tags }
    }
  }
  return lead
}
