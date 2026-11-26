// Configurable product planning assumption; not a zoning determination.
export const PLANNING_SITE_OCCUPANCY = 0.7;
export function footprintError(lot, footprint, total, required = false) {
  if (footprint === undefined || footprint === null || footprint === "")
    return required ? "Enter the ground-floor footprint." : "";
  const value = Number(footprint);
  if (!Number.isFinite(value) || value <= 0) return "Enter a positive ground-floor footprint.";
  // Round down so the displayed cap and accepted boundary agree.
  const cap = Math.floor(Number(lot) * PLANNING_SITE_OCCUPANCY * 100 + 1e-8) / 100;
  if (!Number.isFinite(cap) || cap <= 0) return "Enter a valid lot area first.";
  if (value > cap) return `Ground-floor footprint must not exceed ${cap.toLocaleString("en-PH")} m² (70% of the lot under the planning cap).`;
  if (Number.isFinite(Number(total)) && Number(total) > 0 && value > Number(total))
    return "Total floor area must include at least the ground-floor footprint.";
  return "";
}
