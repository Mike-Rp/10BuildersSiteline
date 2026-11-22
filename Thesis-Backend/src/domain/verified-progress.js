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

// Foundation counts for a fixed share of the whole project; every other phase shares the rest in
// proportion to its required checklist weight. Only projects configured after this rule carry the flag.
export const FOUNDATION_WEIGHTING = "foundation_15";
export const FOUNDATION_PROJECT_WEIGHT = 15;
const isFoundation = phase => typeof phase?.name === "string" && phase.name.trim().toLowerCase() === "foundation";

// Project points (out of 100) each phase is worth, or null when the project uses the plain pooled calculation.
export function phaseProjectWeights(phases, expectedPhaseIds, weighting) {
  if (weighting !== FOUNDATION_WEIGHTING || !Array.isArray(phases) || !Array.isArray(expectedPhaseIds)) return null;
  const scope = phases.filter(phase => expectedPhaseIds.includes(phase?.id));
  const foundation = scope.filter(isFoundation);
  if (foundation.length !== 1) return null;
  const others = scope.filter(phase => !isFoundation(phase));
  const totals = others.map(phase => phaseProgress(phase).total);
  if (totals.some(total => total === null)) return null;
  const pool = totals.reduce((sum, total) => sum + total, 0);
  const weights = new Map();
  weights.set(foundation[0].id, others.length ? FOUNDATION_PROJECT_WEIGHT : 100);
  others.forEach((phase, index) => weights.set(phase.id, pool > 0 ? (100 - FOUNDATION_PROJECT_WEIGHT) * totals[index] / pool : 0));
  return weights;
}

// Project points gained or lost per activity point earned or withdrawn in one phase.
export function projectPointsPerActivityPoint(phases, expectedPhaseIds, weighting, phaseId) {
  const weights = phaseProjectWeights(phases, expectedPhaseIds, weighting);
  if (!weights || !weights.has(phaseId)) return 1;
  const phase = phases.find(row => row.id === phaseId);
  const total = phase ? phaseProgress(phase).total : null;
  return total ? weights.get(phaseId) / total : 1;
}

const snap = value => { const rounded = Number(value.toFixed(9)); return Math.abs(rounded - Math.round(rounded)) < 1e-9 ? Math.round(rounded) : rounded; };

export function projectProgress(phases, expectedPhaseIds, options = {}) {
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
  const weights = phaseProjectWeights(phases, expectedPhaseIds, options.weighting);
  if (weights) {
    // Weighted points out of 100. A fully verified project is exactly 100, never 99.999...
    let points = 0;
    for (const phase of phases) {
      const progress = phaseProgress(phase);
      points += weights.get(phase.id) * progress.earned / progress.total;
    }
    return result(snap(points), 100);
  }
  return result(earned, total);
}

// Preview only. Confirmation/withdrawal authorization is implemented separately.
export function reworkImpact(phases, expectedPhaseIds, affectedActivityIds, options = {}) {
  const before = projectProgress(phases, expectedPhaseIds, options);
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
  const after = projectProgress(corrected, expectedPhaseIds, options);
  const withdrawn = before.earned - after.earned;
  return { before, after, loss: withdrawn / before.total * 100, reason: null,
    phases: phases.map((phase, index) => {
      const prior = phaseProgress(phase), next = phaseProgress(corrected[index]);
      return { id: phase.id, before: prior, after: next, loss: (prior.earned - next.earned) / prior.total * 100 };
    }) };
}
