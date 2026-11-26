import { MAX_INQUIRY_FLOORS, MAX_INQUIRY_AREA } from "../Thesis-Backend/src/domain/inquiry-assessment.js"

export default function FloorAreaReview({ area, floors, lot }: { area: number; floors: number; lot?: number }) {
  const error = floors > MAX_INQUIRY_FLOORS ? `Enter no more than ${MAX_INQUIRY_FLOORS} floors. This exceeds the supported application range.`
    : area > MAX_INQUIRY_AREA || (lot !== undefined && lot > MAX_INQUIRY_AREA) ? "The area exceeds the supported input range. Please review your measurements."
    : lot !== undefined && lot > 0 && floors > 0 && area > lot * floors ? "Total floor area must not exceed the lot area multiplied by the number of floors."
    : ""
  if (error) return <div className="floor-area-review needs-review" role="alert"><strong>{error}</strong></div>
  if (lot !== undefined && (!Number.isFinite(lot) || lot <= 0)) return null
  if (!Number.isFinite(area) || area <= 0 || !Number.isInteger(floors) || floors < 1) return null
  const average = area / floors
  const unusual = average < 1
  const formatted = average.toLocaleString("en-PH", { maximumSignificantDigits: 4 })
  return <div className={`floor-area-review${unusual ? " needs-review" : ""}`}>
    <p aria-live="polite"><strong>Average floor area: {formatted} m² per floor</strong></p>
    {unusual && <>
      <p role="status">The total floor area appears too small for {floors} {floors === 1 ? "floor" : "floors"}. Please review the total floor area and floor count.</p>
      <small>Averages below 1 m² per floor trigger a data-entry review. This is not a minimum building-area requirement.</small>
      <label className="inquiry-check"><input key={`${area}:${floors}`} type="checkbox" required />
        I have reviewed the floor count and total floor area and confirm these values.
      </label>
    </>}
  </div>
}
