// Project scope policy shared by intake validation and the browser preview.
export const MIXED_USE_USES = Object.freeze([
  { code: "residential", label: "Residential spaces" },
  { code: "retail", label: "Retail / commercial spaces" },
  { code: "office", label: "Office spaces" },
  { code: "hotel", label: "Hotel / hospitality" },
]);
export const MIXED_USE_FEATURES = Object.freeze([
  { code: "podium", label: "Podium" }, { code: "tower", label: "Tower" },
  { code: "curtainWall", label: "Curtain-wall façade" }, { code: "landscaping", label: "Landscaping" },
]);
export const defaultMixedUseScope = () => ({ version: 1, uses: ["residential", "retail"],
  features: { podium: true, tower: true, curtainWall: true, landscaping: true }, basis: "", confirmed: false });

export function mixedUsePhaseReview(scope) {
  const has = use => scope.uses.includes(use);
  const row = (name, disciplines, included = true, reason = "", required = false) => ({ name, disciplines, included, reason: included && !required ? "" : reason, required });
  return [
    row("Mobilization", ["Civil", "Geotechnical"], true, "", true),
    row("Design", ["Civil", "Structural", "Mechanical", "Electrical", "Plumbing", "Acoustic"], true, "", true),
    row("Foundation", ["Geotechnical", "Structural"], true, "", true),
    row("Podium Structure", ["Structural", "Civil"], scope.features.podium, "No podium in the proposed design."),
    row("Tower Structure", ["Structural"], scope.features.tower, "No tower in the proposed design."),
    ...(!scope.features.tower ? [row("Structure", ["Structural", "Civil"], true, "General building structure remains covered.", true)] : []),
    row(scope.features.curtainWall ? "Envelope / Curtain Wall" : "Envelope", ["Structural", "Civil"], true,
      scope.features.curtainWall ? "" : "Curtain wall not applicable; building enclosure remains covered.", true),
    row("MEP Rough-In", ["Mechanical", "Electrical", "Plumbing", "Fire Protection"], true, "", true),
    row("Fire & Life Safety", ["Fire Protection", "Electrical"], true, "", true),
    row("Retail/Commercial Fit-Out", ["Interior/Finishes", "Acoustic", "Electrical"], has("retail"), "No retail/commercial space selected."),
    row("Office Fit-Out", ["Interior/Finishes", "Acoustic", "Electrical"], has("office"), "No office space selected."),
    row("Hotel Fit-Out", ["Interior/Finishes", "Plumbing", "Electrical", "Fire Protection"], has("hotel"), "No hotel/hospitality use selected."),
    row("Residential Fit-Out", ["Interior/Finishes", "Plumbing", "Electrical"], has("residential"), "No residential use selected."),
    row(scope.features.landscaping ? "Landscape & Site Works" : "Site Works", scope.features.landscaping ? ["Landscape", "Civil"] : ["Civil"], true,
      scope.features.landscaping ? "" : "Landscaping not applicable; access, drainage and site works remain covered.", true),
    row("Closeout", ["Civil", "Fire Protection", "Interior/Finishes"], true, "", true),
  ];
}
export function mixedUseScopeError(scope, requireConfirmation = true) {
  if (!scope || typeof scope !== "object" || scope.version !== 1 || !Array.isArray(scope.uses) ||
      scope.uses.length < 2 || new Set(scope.uses).size !== scope.uses.length ||
      scope.uses.some(use => !MIXED_USE_USES.some(option => option.code === use))) return "Select at least two different supported building uses for Mixed-Use.";
  if (!scope.features || MIXED_USE_FEATURES.some(feature => typeof scope.features[feature.code] !== "boolean") ||
      Object.keys(scope.features).some(code => !MIXED_USE_FEATURES.some(feature => feature.code === code))) return "Review all construction features.";
  if (typeof scope.basis !== "string" || scope.basis.trim().length < 20 || scope.basis.trim().length > 2000) return "Describe the scope basis and non-applicable work in 20–2,000 characters.";
  if (requireConfirmation && scope.confirmed !== true) return "Confirm the proposed scope and professional review requirement.";
  return "";
}
export function normalizeMixedUseScope(scope) {
  const error = mixedUseScopeError(scope);
  if (error) throw new Error(error);
  const result = { version: 1, uses: MIXED_USE_USES.filter(use => scope.uses.includes(use.code)).map(use => use.code),
    features: Object.fromEntries(MIXED_USE_FEATURES.map(feature => [feature.code, scope.features[feature.code]])),
    basis: scope.basis.trim(), confirmed: true };
  const review = mixedUsePhaseReview(result);
  return { ...result, phases: review.filter(phase => phase.included).map(phase => phase.name),
    notApplicable: review.filter(phase => !phase.included).map(({name, reason}) => ({name, reason})) };
}
