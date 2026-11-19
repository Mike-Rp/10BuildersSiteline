export function matchingInquiryTags(assignedTags: string[] | undefined, eligibleTags: string[]): string[]

export function selectInquiryLead(
  phases: string[],
  team: { stage: string; user_id: string | null; assigned_disciplines?: string[]; engineers?: { user_id: string; assigned_disciplines?: string[] }[] }[],
  experienceById: ReadonlyMap<string, number>,
  eligibleTagsFor: (stage: string, id: string) => string[],
): { stage: string; id: string; years: number; tags: string[] } | null
