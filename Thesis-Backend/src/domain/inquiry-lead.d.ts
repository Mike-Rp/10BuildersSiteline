export function selectInquiryLead(
  phases: string[],
  team: { stage: string; user_id: string | null; engineers?: { user_id: string }[] }[],
  experienceById: ReadonlyMap<string, number>,
): { stage: string; id: string; years: number } | null
