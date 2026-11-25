export const technicalOptions = ["Standard construction", "Several specialized systems", "Extensive specialized systems"];
export const arrangementOptions = ["Sequential phases", "Partially overlapping phases", "Highly concurrent phases"];
export const MIN_INQUIRY_DURATION_DAYS = 45;
export const MAX_INQUIRY_FLOORS = 32767;

const positiveArea = value => (typeof value === "number" || typeof value === "string") &&
  Number.isFinite(Number(value)) && Number(value) > 0;

export function normalizeFloorMeasurements(input, floorCount, lotArea) {
  if (!input || !Number.isInteger(floorCount) || floorCount < 1 || floorCount > MAX_INQUIRY_FLOORS) return null;
  let measurements, total;
  if (input.mode === "same" && positiveArea(input.areaPerFloor)) {
    measurements = { mode: "same", areaPerFloor: Number(input.areaPerFloor) };
    total = measurements.areaPerFloor * floorCount;
  } else if (input.mode === "individual" && Array.isArray(input.areas) && input.areas.length === floorCount &&
    Array.from(input.areas).every(positiveArea)) {
    measurements = { mode: "individual", areas: input.areas.map(Number) };
    total = measurements.areas.reduce((sum, area) => sum + area, 0);
  }
  if (lotArea !== undefined && (!positiveArea(lotArea) || !measurements ||
    (measurements.mode === "same" ? measurements.areaPerFloor > Number(lotArea)
      : measurements.areas.some(area => area > Number(lotArea))))) return null;
  // Avoid carrying floating-point noise from decimal area inputs into classification and duration.
  return Number.isFinite(total) && total > 0 ? { measurements, total: Number(total.toPrecision(15)) } : null;
}

export function intakeSize(floorArea, floors) {
  if (floorArea >= 50000 || floors >= 31) return "Large";
  if (floorArea >= 15000 || floors >= 30) return "Medium";
  return "Small";
}

const planningRules = {
  Residential: { small: [200, 150], medium: [500, 350], rate: 0.75 },
  Commercial: { small: [300, 250], medium: [1000, 750], rate: 0.95 },
  "Mixed-Use": { small: [300, 300], medium: [1000, 1000], rate: 1.10 },
};
const overlapDurationFactors = [1, 0.9, 0.8];
const complexityForScore = score => score <= 7 ? "Low" : score <= 11 ? "Moderate" : "High";
const complexityDurationFactors = { Low: 0.85, Moderate: 1, High: 1.30 };
const projectCostRates = {
  Residential: [24000, 28000],
  Commercial: [28000, 34000],
  "Mixed-Use": [30000, 36000],
};
const projectCostFactors = { Low: 0.90, Moderate: 1, High: 1.20 };

export function inquiryCostEstimate(details, complexity) {
  if (!Object.hasOwn(projectCostRates, details.project_type) ||
      !Object.hasOwn(projectCostFactors, complexity) || !positiveArea(details.floor_area_sqm)) return null;
  const [lowRate, highRate] = projectCostRates[details.project_type];
  const area = Number(details.floor_area_sqm);
  const factor = projectCostFactors[complexity];
  const minimum = Math.ceil(Number((area * lowRate * factor).toPrecision(15)));
  const maximum = Math.ceil(Number((area * highRate * factor).toPrecision(15)));
  return Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum) ? { minimum, maximum } : null;
}

export function inquirySize(details) {
  const { small, medium } = planningRules[details.project_type];
  const [lot, floor] = [Number(details.lot_area), Number(details.floor_area_sqm)];
  if (lot <= small[0] && floor <= small[1]) return "Small";
  if (lot <= medium[0] && floor <= medium[1]) return "Medium";
  return "Large";
}

export function inquiryAssessmentBasis(details, technical, arrangement) {
  const size = inquirySize(details);
  const typePoints = { Residential: 1, Commercial: 2, "Mixed-Use": 3 }[details.project_type];
  const sizePoints = { Small: 1, Medium: 2, Large: 3 }[size];
  const floorPoints = details.floor_count >= 10 ? 3 : details.floor_count >= 4 ? 2 : 1;
  const technicalPoints = technicalOptions.indexOf(technical) + 1;
  const sequentialScore = typePoints + sizePoints + floorPoints + technicalPoints + 1;
  const overlapLevel = Math.max(0, arrangementOptions.indexOf(arrangement));
  const overlapPoints = overlapLevel + 1;
  // Overlap adds coordination complexity and reduces elapsed time from the sequential baseline.
  const baselineComplexity = complexityForScore(sequentialScore);
  const complexityFactor = complexityDurationFactors[baselineComplexity];
  const overlapFactor = overlapDurationFactors[overlapLevel];
  const { rate, medium } = planningRules[details.project_type];
  return { size, typePoints, sizePoints, floorPoints, technicalPoints, overlapPoints,
    baselineComplexity, complexityFactor, overlapFactor, rate, medium,
    extraFloorDays: 20 * (Number(details.floor_count) - 1) };
}

export function assessInquiry(details, start, end, technical, arrangement) {
  const basis = inquiryAssessmentBasis(details, technical, arrangement);
  const { size, typePoints, sizePoints, floorPoints, technicalPoints, overlapPoints } = basis;
  const score = typePoints + sizePoints + floorPoints + technicalPoints + overlapPoints;
  const complexity = complexityForScore(score);
  const durationMultiplier = basis.complexityFactor * basis.overlapFactor;
  const planningDays = Math.ceil((Number(details.floor_area_sqm) * basis.rate + basis.extraFloorDays) * durationMultiplier);
  const finish = new Date(Date.parse(start) + planningDays * 86400000);
  return {
    size, score, technical, arrangement,
    complexity, planningDays, durationMultiplier,
    durationDays: (Date.parse(end) - Date.parse(start)) / 86400000,
    suggestedEnd: finish.getUTCFullYear() <= 9999 ? finish.toISOString().slice(0, 10) : null,
  };
}

export function earliestInquiryCompletion(start, estimate) {
  if (!estimate.suggestedEnd) return null;
  const minimum = new Date(Date.parse(start) + MIN_INQUIRY_DURATION_DAYS * 86400000);
  if (!(minimum.getUTCFullYear() <= 9999)) return null;
  const minimumDate = minimum.toISOString().slice(0, 10);
  return estimate.suggestedEnd > minimumDate ? estimate.suggestedEnd : minimumDate;
}

export function inquiryAssessmentReady(details, workflow) {
  if (workflow?.assessment) return true;
  const review = workflow?.review;
  if (!review || !workflow.budget) return false;
  const estimate = assessInquiry(details, review.start, review.end,
    review.technical ?? technicalOptions[0], review.arrangement ?? arrangementOptions[0]);
  const cost = inquiryCostEstimate(details, estimate.complexity);
  if (!cost || workflow.budget < cost.minimum) return false;
  const minimum = earliestInquiryCompletion(review.start, estimate);
  return !!minimum && review.end >= minimum;
}
