export const technicalOptions = ["Standard construction", "Several specialized systems", "Extensive specialized systems"];
export const arrangementOptions = ["Sequential phases", "Partially overlapping phases", "Highly concurrent phases"];
export const MIN_INQUIRY_DURATION_DAYS = 45;
export const MAX_INQUIRY_FLOORS = 32767;

const positiveArea = value => (typeof value === "number" || typeof value === "string") &&
  Number.isFinite(Number(value)) && Number(value) > 0;

export function normalizeFloorMeasurements(input, floorCount) {
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

export function inquirySize(details) {
  const { small, medium } = planningRules[details.project_type];
  const [lot, floor] = [Number(details.lot_area), Number(details.floor_area_sqm)];
  if (lot <= small[0] && floor <= small[1]) return "Small";
  if (lot <= medium[0] && floor <= medium[1]) return "Medium";
  return "Large";
}

export function assessInquiry(details, start, end, technical, arrangement) {
  const size = inquirySize(details);
  const typePoints = { Residential: 1, Commercial: 2, "Mixed-Use": 3 }[details.project_type];
  const sizePoints = { Small: 1, Medium: 2, Large: 3 }[size];
  const floorPoints = details.floor_count >= 10 ? 3 : details.floor_count >= 4 ? 2 : 1;
  const score = typePoints + sizePoints + floorPoints +
    (technicalOptions.indexOf(technical) + 1) + (arrangementOptions.indexOf(arrangement) + 1);
  const complexity = score <= 7 ? "Low" : score <= 11 ? "Moderate" : "High";
  const durationMultiplier = { Low: 0.85, Moderate: 1, High: 1.30 }[complexity];
  const rate = planningRules[details.project_type].rate;
  const planningDays = Math.ceil((Number(details.floor_area_sqm) * rate +
    20 * (Number(details.floor_count) - 1)) * durationMultiplier);
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
