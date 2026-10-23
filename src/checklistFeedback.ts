import type { ChecklistItem } from "./model.ts"

/**
 * What a Site PM sees under a checklist activity. Three different notes, never mixed up:
 *  - rejection: the Office PM's reason, shown only while the evidence is rejected and waits for a corrected upload
 *  - rework: the reason behind a rework decision (its own status and wording)
 *  - submission: the note the Site PM wrote when uploading the evidence
 */
export function checklistFeedback(
  item: Pick<ChecklistItem, "status" | "reviewNote" | "reworkReason" | "submissionNote">,
) {
  return {
    rejection: item.status === "missing" ? item.reviewNote || undefined : undefined,
    rework: item.reworkReason || undefined,
    submission: item.submissionNote || undefined,
  }
}
