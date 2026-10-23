export const STANDARD_PHASE_ACTIVITIES = Object.freeze([
  Object.freeze({ code: "work_inspection", title: "Activity/Work Inspection Checklist", weight: 10 }),
  Object.freeze({ code: "inspection_testing", title: "Inspection and Testing Records", weight: 10 }),
  Object.freeze({ code: "method_statement", title: "Method Statement", weight: 10 }),
]);
export const MOBILIZATION_ACTIVITIES = Object.freeze([
  Object.freeze({ code: "site_possession", title: "Site Possession and Existing Conditions Verification", weight: 10 }),
  Object.freeze({ code: "site_logistics", title: "Temporary Facilities and Site Logistics Readiness", weight: 10 }),
  Object.freeze({ code: "safety_readiness", title: "Safety and Emergency Readiness", weight: 10 }),
  Object.freeze({ code: "kickoff_deployment", title: "Project Kickoff and Initial Deployment Confirmation", weight: 10 }),
]);
export const CLOSEOUT_ACTIVITIES = Object.freeze([
  Object.freeze({ code: "punch_list_closure", title: "Final Inspection and Punch-List Closure", weight: 10 }),
  Object.freeze({ code: "commissioning_acceptance", title: "Final Testing and Commissioning Acceptance", weight: 10 }),
  Object.freeze({ code: "handover_training", title: "Handover Information and Owner Training Completion", weight: 10 }),
  Object.freeze({ code: "final_turnover", title: "Site Restoration and Final Turnover Acceptance", weight: 10 }),
]);
export function standardActivities(position, count) {
  if (!Number.isInteger(position) || position < 0 || position >= count) return [];
  return position === 0 ? MOBILIZATION_ACTIVITIES : position === count - 1 ? CLOSEOUT_ACTIVITIES : STANDARD_PHASE_ACTIVITIES;
}
