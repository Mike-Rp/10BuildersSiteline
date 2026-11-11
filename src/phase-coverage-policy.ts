export const phaseCoverageQuota = (tags: string[]) => Math.ceil(new Set(tags).size / 2)
