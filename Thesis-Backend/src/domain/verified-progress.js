// Shared by the API and browser. Inputs are project snapshots, never reported percentages.
const unavailable = reason => ({ earned: null, total: null, percentage: null, reason });
const validId = id => typeof id === "string" && id.trim().length > 0;
const validValue = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const result = (earned, total) => Number.isFinite(earned) && Number.isFinite(total) && total > 0
  ? { earned, total, percentage: earned / total * 100, reason: null }
  : unavailable("Required activity totals are invalid.");

export function activityEarned(activity) {
  if (!activity || typeof activity !== "object") return null;
  if (activity.required === false) return 0;
  if (activity.required !== true || !validId(activity.id) || !validValue(activity.weight)) return null;
  return activity.status === "approved" && activity.approvalValid !== false ? activity.weight : 0;
}

export function phaseProgress(phase) {
  if (!phase || !validId(phase.id) || phase.configured !== true || !Array.isArray(phase.activities)) {
    return unavailable("Required phase scope is not configured.");
  }
  const seen = new Set();
  let earned = 0, total = 0;
  for (const activity of phase.activities) {
    if (!activity || !validId(activity.id) || seen.has(activity.id)) return unavailable("Activity scope contains missing or duplicate identifiers.");
    seen.add(activity.id);
    if (activity.required === false) continue;
    const value = activityEarned(activity);
    if (value === null) return unavailable("A required activity has an invalid value or required flag.");
    earned += value;
    total += activity.weight;
  }
  return result(earned, total);
}

export function projectProgress(phases, expectedPhaseIds) {
  if (!Array.isArray(phases) || !Array.isArray(expectedPhaseIds) || !expectedPhaseIds.length ||
      expectedPhaseIds.some(id => !validId(id)) || new Set(expectedPhaseIds).size !== expectedPhaseIds.length) {
    return unavailable("Complete project phase scope is unavailable.");
  }
  const ids = phases.map(phase => phase?.id);
  if (ids.length !== expectedPhaseIds.length || new Set(ids).size !== ids.length || ids.some(id => !expectedPhaseIds.includes(id))) {
    return unavailable("Project phase scope is missing, duplicated, or inconsistent.");
  }
  const activities = new Set();
  let earned = 0, total = 0;
  for (const phase of phases) {
    const progress = phaseProgress(phase);
    if (progress.reason) return unavailable(progress.reason);
    for (const activity of phase.activities) {
      if (activities.has(activity.id)) return unavailable("An activity appears in more than one phase.");
      activities.add(activity.id);
    }
    earned += progress.earned;
    total += progress.total;
  }
  return result(earned, total);
}

// Preview only. Confirmation/withdrawal authorization is implemented separately.
export function reworkImpact(phases, expectedPhaseIds, affectedActivityIds) {
  const before = projectProgress(phases, expectedPhaseIds);
  if (before.reason) return { before, after: before, loss: null, phases: [], reason: before.reason };
  if (!Array.isArray(affectedActivityIds) || affectedActivityIds.some(id => !validId(id))) {
    return { before, after: unavailable("Affected activity identifiers are invalid."), loss: null, phases: [], reason: "Affected activity identifiers are invalid." };
  }
  const affected = new Set(affectedActivityIds);
  const known = new Set(phases.flatMap(phase => phase.activities.map(activity => activity.id)));
  if ([...affected].some(id => !known.has(id))) {
    return { before, after: unavailable("An affected activity is outside the project scope."), loss: null, phases: [], reason: "An affected activity is outside the project scope." };
  }
  const corrected = phases.map(phase => ({ ...phase, activities: phase.activities.map(activity =>
    affected.has(activity.id) ? { ...activity, status: "rework_required" } : activity) }));
  const after = projectProgress(corrected, expectedPhaseIds);
  const withdrawn = before.earned - after.earned;
  return { before, after, loss: withdrawn / before.total * 100, reason: null,
    phases: phases.map((phase, index) => {
      const prior = phaseProgress(phase), next = phaseProgress(corrected[index]);
      return { id: phase.id, before: prior, after: next, loss: (prior.earned - next.earned) / prior.total * 100 };
    }) };
}
