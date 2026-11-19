// Phase order breaks experience ties, then account ID breaks ties within a phase.
export function selectInquiryLead(phases, team, experienceById) {
  let lead = null
  for (const stage of phases) {
    const entry = team.find(row => row?.stage === stage)
    if (!entry) continue
    const ids = entry.engineers?.length
      ? entry.engineers.map(person => person.user_id)
      : [entry.user_id]
    for (const id of ids.filter(Boolean).sort()) {
      const years = experienceById.get(id) ?? 0
      if (!lead || years > lead.years) lead = { stage, id, years }
    }
  }
  return lead
}
