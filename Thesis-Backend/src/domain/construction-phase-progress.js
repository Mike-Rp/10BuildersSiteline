import { standardActivities } from "./standard-phase-checklist.js";

// Checklist identity, never a reported count or percentage, establishes credit.
// Additional legacy mandatory documents remain completion gates.
export function constructionPhaseProgress(position, count, items = [], { onHold = false, started = false } = {}) {
  const owners = [...new Set(items.map(item => item.workspaceUserId).filter(Boolean))];
  if (owners.length > 1) {
    const groups = owners.map(owner => constructionPhaseProgress(position,count,
      items.filter(item => item.workspaceUserId === owner),{onHold,started}));
    const complete = groups.every(group => group.complete);
    return { required: groups.reduce((n,g)=>n+g.required,0), approved: groups.reduce((n,g)=>n+g.approved,0),
      complete, onHold, status: onHold ? "On Hold" : complete ? "Completed" : groups.every(g=>["Completed","Pending Approval"].includes(g.status)) ? "Pending Approval" : groups.some(g=>g.status!=="Not Started") ? "Ongoing" : "Not Started" };
  }
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
