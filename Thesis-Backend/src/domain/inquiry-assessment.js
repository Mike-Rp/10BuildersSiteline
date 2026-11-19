export const technicalOptions = ["Standard construction", "Several specialized systems", "Extensive specialized systems"];
export const arrangementOptions = ["Sequential phases", "Partially overlapping phases", "Highly concurrent phases"];

export function intakeSize(floorArea, floors) {
  if (floorArea >= 50000 || floors >= 31) return "Large";
  if (floorArea >= 15000 || floors >= 30) return "Medium";
  return "Small";
}

export function assessInquiry(details, estimate, start, end, technical, arrangement) {
  const size = estimate.size ?? intakeSize(Number(details.floor_area_sqm), Number(details.floor_count));
  const typePoints = { Residential: 1, Commercial: 2, "Mixed-Use": 3 }[details.project_type];
  const sizePoints = { Small: 1, Medium: 2, Large: 3 }[size];
  const floorPoints = details.floor_count >= 10 ? 3 : details.floor_count >= 4 ? 2 : 1;
  const score = typePoints + sizePoints + floorPoints +
    (technicalOptions.indexOf(technical) + 1) + (arrangementOptions.indexOf(arrangement) + 1);
  return {
    size, score, technical, arrangement,
    complexity: score <= 7 ? "Low" : score <= 11 ? "Moderate" : "High",
    durationDays: (Date.parse(end) - Date.parse(start)) / 86400000,
    suggestedEnd: estimate.end,
  };
}
