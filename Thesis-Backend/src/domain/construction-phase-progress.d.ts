export type ConstructionPhaseStatus = "Not Started" | "Ongoing" | "Pending Approval" | "Completed" | "On Hold"
export type ConstructionActivity = { code: string; required: boolean; status: string; approvalValid: boolean }
export function constructionPhaseProgress(position: number, count: number, items?: ConstructionActivity[], options?: { onHold?: boolean; started?: boolean }): {
  required: number; approved: number; status: ConstructionPhaseStatus; complete: boolean; onHold: boolean
}
