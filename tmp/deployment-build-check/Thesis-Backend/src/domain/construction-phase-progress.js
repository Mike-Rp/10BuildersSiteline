import { standardActivities } from "./standard-phase-checklist.js";

// Checklist identity, never a reported count or percentage, establishes credit.
// Additional legacy mandatory documents remain completion gates.
export function constructionPhaseProgress(position, count, items = [], { onHold = false, started = false } = {}) {
  const standards = standardActivities(position, count);
  const validApproval = item => item.status === "approved" && item.approvalValid === true;
  const requiredItems = items.filter(item => item.required === true);
  const matches = standards.map(standard => requiredItems.filter(item => item.code === standard.code));
  const approved = matches.filter(rows => rows.length === 1 && validApproval(rows[0])).length;
  const submitted = item => validApproval(item) || item.status === "pending";
  const complete = standards.length > 0 && approved === standards.length && requiredItems.every(validApproval);
  const pending = standards.length > 0 && matches.every(rows => rows.length === 1 && submitted(rows[0])) && requiredItems.every(submitted);
  const begun = started || items.some(item => item.status && item.status !== "missing");
  const status = onHold ? "On Hold" : complete ? "Completed" : pending ? "Pending Approval" : begun ? "Ongoing" : "Not Started";
  return { required: standards.length, approved, status, complete: complete && !onHold, onHold };
}
